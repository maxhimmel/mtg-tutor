import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import {
  BUCKET_LABELS,
  DECK_SPEED,
  DECK_SPEED_BUCKETS,
  type DeckSpeedBucket,
  type DeckSpeedResult,
  gradeDeckSpeedGuess,
  scoreDeckSpeedRun,
} from "@mtg-tutor/core";
import { renderManaCost } from "../../core/ui/format.js";
import { spinner } from "../../core/ui/spinner.js";

// The deck-speed drill, in a terminal.
//
// One card, and what kind of deck wants it: ends it early, neither, or goes
// long. The question, the gate and the grade all live in
// `core/drills/deckSpeed.ts` -- this is a way of asking, and so is the web's.
//
// WHAT A TERMINAL DOES WELL HERE is the reveal's ruler. It is one number on one
// axis with an error bar, which is four lines of monospace and needs no layout.
//
// It sends no `drill_*` event, because there is no PostHog in this process and
// never has been -- so a run taken here is invisible to the funnels, exactly as
// the CLI's review quiz is. What it is NOT invisible to is the measurement those
// runs are for: every answer is written through `drills.answers.record`, so a
// run here moves the same history the web reads, deals the same cards forward
// and feeds the same panel on /stats.

type Run = Awaited<ReturnType<typeof deal>>;
type Question = Run["questions"][number];

const deal = (convex: ConvexHttpClient, setCode: string) =>
  convex.query(api.drills.deckSpeed.deal, { setCode, today: today() });

/**
 * The calendar day, which the query takes rather than reads.
 *
 * A Convex query may not read the wall clock -- it is not re-run when time
 * advances -- so the caller sends it. UTC, matching the day the answer rows are
 * stamped with, so "an earlier day" means the same thing on both sides.
 */
const today = () => new Date().toISOString().slice(0, 10);

/** Turns, signed, in the direction a reader thinks about them. */
const turns = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

/**
 * Which set to quiz on: `--set`, else the one you drafted last, else the newest.
 *
 * Same fallback as the archetype quiz and for the same reason: this reads a
 * set's statistics and nothing of yours, so it works on an account with no
 * drafts, and defaulting to "your most recent draft" would hide that.
 */
async function chooseSet(convex: ConvexHttpClient, argv: string[]): Promise<string | null> {
  const flag = argv.indexOf("--set");
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];

  const sets = await convex.query(api.sets.list, {});
  if (sets.length === 0) return null;

  const known = new Set(sets.map((s) => s.code));
  const recent = await convex.query(api.draft.recentSets, {});
  return recent.find((r) => known.has(r.setCode))?.setCode ?? sets[0].code;
}

export async function runDeckSpeed(
  convex: ConvexHttpClient,
  argv: string[] = [],
): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" How fast is this card's deck? ")));

  const setCode = await chooseSet(convex, argv);
  if (!setCode) {
    p.outro("No sets ingested yet, so there is nothing to be quizzed on.");
    return;
  }

  for (;;) {
    const spin = spinner();
    spin.start(`Reading how long ${setCode.toUpperCase()} games ran`);
    const run = await deal(convex, setCode);
    spin.stop(
      run.questions.length > 0
        ? `${run.questions.length} card${run.questions.length === 1 ? "" : "s"} measured against their own colors`
        : "",
    );

    if (run.questions.length === 0) {
      p.outro(nothing(run, setCode));
      return;
    }

    const results = await play(convex, setCode, run);
    // "Nothing is recorded" used to be true and is not: every question answered
    // before the walk-away is already written, which is the point -- it will not
    // be dealt back tomorrow. Saying otherwise would be a promise the store
    // cannot keep, and the kind of line that survives a change by not being
    // read.
    if (!results) {
      p.cancel("Left mid-run. The answers you gave are kept.");
      return;
    }

    report(results);

    const again = await p.confirm({
      message: `Another ${run.questions.length}?`,
      initialValue: false,
    });
    if (p.isCancel(again) || !again) break;
  }

  p.outro(pc.green("That is the run."));
}

/**
 * Why there is nothing to ask, in the set's own terms.
 *
 * Three causes and three sentences, because a named cause is worth printing only
 * when it is the right one. `untimed` is the state every set is in until it has
 * been re-ingested, and saying "this set is thin" about it would be a lie the
 * player could act on.
 */
function nothing(run: Run, setCode: string): string {
  const set = setCode.toUpperCase();
  // The one that is not bad news, and it gets its own sentence for that reason:
  // "nothing to ask" and "you have been through all of it" read the same and are
  // opposite things to be told.
  if (run.mute === "answered") {
    return `You have been through all ${run.quizzable} cards ${set} can ask about, and nothing is waiting to come back. Try --set on another; anything you misread here returns a day later.`;
  }
  if (run.mute === "unbuilt") return `${set} has no statistics yet. Nothing to ask.`;
  if (run.mute === "unrated") {
    return `17Lands never recorded what colours ${set}'s decks were, so there is nothing to measure a card against. That will not change.`;
  }
  if (run.mute === "untimed") {
    return `${set}'s statistics were built before game length was measured. It comes back the next time this set's data is refreshed.`;
  }
  if (run.mute === "unmeasured") {
    return `No card in ${set} is measured sharply enough to ask about. That is the set, not a bug.`;
  }
  return `${set} has nothing to ask.`;
}

/** Null when the player walked away, which is not a score of zero. */
async function play(
  convex: ConvexHttpClient,
  setCode: string,
  run: Run,
): Promise<DeckSpeedResult[] | null> {
  const results: DeckSpeedResult[] = [];
  // One id per question per run, which is what lets a row say whether a second
  // answer is a retry or the same card coming round again. See schema.ts.
  const sitting = `cli:${Date.now()}`;

  for (const [i, question] of run.questions.entries()) {
    p.note(card(question), `${i + 1}/${run.questions.length}`);

    // Fast, neither, slow -- in that order every time, because the order IS the
    // axis. Shuffling three answers that sit on a line would make the drill
    // about reading the options rather than about reading the card, which is
    // the opposite of the archetype quiz's problem and needs the opposite fix.
    const chosen = await p.select({
      message: `What kind of deck plays ${question.card.name}?`,
      options: DECK_SPEED_BUCKETS.map((b) => ({ value: b, label: BUCKET_LABELS[b] })),
    });
    if (p.isCancel(chosen)) return null;

    const guess = chosen as DeckSpeedBucket;
    const result = gradeDeckSpeedGuess(question, guess);
    results.push(result);

    // Awaited here where the web fires and forgets, and the difference is what
    // each client can do about a failure. The browser has a reveal on screen
    // already and must not blank it; a terminal has nothing rendered yet and can
    // simply say the answer was not kept, which is better than dealing the card
    // back tomorrow with no explanation.
    await convex
      .mutation(api.drills.answers.record, {
        drill: "deckSpeed",
        setCode,
        name: question.card.name,
        answered: guess,
        correct: question.answer,
        sigmas: question.sigmas,
        // How far past its gate the question sat, which is what a band is drawn
        // on. Error bars alone cannot say it: each drill's bar moves, and
        // neither the deck count nor the set's spread is on a stored answer.
        margin: question.margin,
        attemptId: `${sitting}:${i}`,
      })
      .catch(() => p.log.warn("That answer was not recorded, so the card may come back."));

    p.note(reveal(question, run.formatTurns, run.worthSaying), head(result, question));
  }

  return results;
}

/**
 * The card, and nothing that answers the question.
 *
 * No win rate and no turn count. The rules text is in because what a card DOES
 * is the whole of what a person is meant to reason from -- a wrath reads as a
 * wrath, and that is the skill.
 */
function card(question: Question): string {
  const c = question.card;
  return [
    `${pc.bold(c.name)}  ${pc.dim(renderManaCost(c.manaCost))}`,
    pc.dim(c.typeLine),
    "",
    c.oracleText || pc.dim("(no rules text)"),
  ].join("\n");
}

const head = (result: DeckSpeedResult, question: Question) => {
  const answer = BUCKET_LABELS[question.answer];
  return result.correct ? pc.green(`✓ ${answer}`) : pc.red(`✗ ${answer}`);
};

/**
 * Where the card sits, drawn on the axis it was measured on.
 *
 * BOTH ENDS OF THE SCALE ARE PRINTED and the middle band is drawn rather than
 * described, because the whole claim is a comparison: this card's games against
 * the games of decks in the same colors. A bar with no zero on it would be a
 * number floating free of what it is a difference from.
 *
 * The band is the decision band -- `width` error bars either side of flat -- so
 * a card whose bar overlaps it IS the middle answer, and the picture cannot
 * disagree with the verdict.
 */
function reveal(
  question: Question,
  formatTurns: number | undefined,
  worthSaying: number,
): string {
  const WIDTH = 41;
  const half = DECK_SPEED.width * question.se;
  // One scale for every card in a run, wide enough to hold this card and its
  // error bar and always containing flat.
  const span = Math.max(Math.abs(question.resid) + half, worthSaying, half) * 1.15;
  const at = (v: number) =>
    Math.max(0, Math.min(WIDTH - 1, Math.round(((v + span) / (2 * span)) * (WIDTH - 1))));

  const zero = at(0);
  // The decision width, so "does the span reach the rule" answers the z test.
  const lo = at(question.resid - half);
  const hi = at(question.resid + half);
  const mid = at(question.resid);

  const track = Array.from({ length: WIDTH }, (_, i) => {
    if (i === mid) return pc.bold("●");
    if (i >= lo && i <= hi) return "─";
    if (i === zero) return pc.dim("│");
    return pc.dim("·");
  }).join("");

  const band = Array.from({ length: WIDTH }, (_, i) =>
    i >= at(-worthSaying) && i <= at(worthSaying) ? pc.dim("▁") : " ",
  ).join("");

  return [
    `${pc.dim("sooner")}${" ".repeat(WIDTH - 12)}${pc.dim("longer")}`,
    track,
    band,
    "",
    `${turns(question.resid)} turns against other decks in its colors, ` +
      `± ${question.se.toFixed(2)} over ${question.n.toLocaleString()} games.`,
    pc.dim(
      `The shaded band is too close to flat for this set to call. ` +
        (formatTurns ? `A game in this set runs ${formatTurns.toFixed(1)} turns.` : ""),
    ),
  ].join("\n");
}

/**
 * What the run said, in the drill's own three mistakes.
 *
 * The tally is the point rather than the score: `saw-difference` dominating means a
 * person is reading opinions into flat cards, which is a different lesson from
 * `backwards`, and a single percentage would hide which one they are having.
 */
function report(results: readonly DeckSpeedResult[]): void {
  const score = scoreDeckSpeedRun(results);
  const count = (kind: DeckSpeedResult["mistake"]) =>
    results.filter((r) => r.mistake === kind).length;

  const lines = [
    `${pc.bold(`${score.read}/${score.answered}`)} read.`,
  ];
  const sawSpeed = count("saw-difference");
  const sawNone = count("saw-none");
  const backwards = count("backwards");
  if (sawSpeed) lines.push(`${sawSpeed} × read a plan into a card that has none.`);
  if (sawNone) lines.push(`${sawNone} × called a real one neither.`);
  if (backwards) lines.push(`${backwards} × the wrong way round.`);

  p.note(lines.join("\n"), "The run");
}

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
// Like the other two drills this sends no `drill_*` event: a run writes nothing,
// so there is no mutation for a capture to ride on, and the web's numbers are
// the whole measurement. Stated rather than quietly true.

type Run = Awaited<ReturnType<typeof deal>>;
type Question = Run["questions"][number];

const deal = (convex: ConvexHttpClient, setCode: string, skip: number) =>
  convex.query(api.drills.deckSpeed.deal, { setCode, skip });

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

  let skip = 0;
  for (;;) {
    const spin = spinner();
    spin.start(`Reading how long ${setCode.toUpperCase()} games ran`);
    const run = await deal(convex, setCode, skip);
    spin.stop(
      run.questions.length > 0
        ? `${run.questions.length} card${run.questions.length === 1 ? "" : "s"} measured against their own colours`
        : "",
    );

    if (run.questions.length === 0) {
      p.outro(nothing(run, setCode, skip));
      return;
    }

    const results = await play(run);
    if (!results) {
      p.cancel("Left mid-run. Nothing is recorded either way.");
      return;
    }

    report(results);

    if (run.nextSkip >= run.quizzable) {
      p.outro(`That is every card ${setCode.toUpperCase()} can be asked about. Try --set on another.`);
      return;
    }

    const again = await p.confirm({
      message: `Another ${run.questions.length}?`,
      initialValue: false,
    });
    if (p.isCancel(again) || !again) break;
    skip = run.nextSkip;
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
function nothing(run: Run, setCode: string, skip: number): string {
  const set = setCode.toUpperCase();
  if (run.mute === "unbuilt") return `${set} has no statistics yet. Nothing to ask.`;
  if (run.mute === "untimed") {
    return `${set}'s statistics were built before game length was measured. A re-ingest fills it in.`;
  }
  if (run.mute === "unmeasured") {
    return `No card in ${set} is measured sharply enough to ask about. That is the set, not a bug.`;
  }
  return skip > 0
    ? `That is every card ${set} can be asked about.`
    : `${set} has nothing to ask.`;
}

/** Null when the player walked away, which is not a score of zero. */
async function play(run: Run): Promise<DeckSpeedResult[] | null> {
  const results: DeckSpeedResult[] = [];

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
    p.note(reveal(question, run.formatTurns), head(result, question));
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
 * the games of decks in the same colours. A bar with no zero on it would be a
 * number floating free of what it is a difference from.
 *
 * The band is the decision band -- `width` error bars either side of flat -- so
 * a card whose bar overlaps it IS the middle answer, and the picture cannot
 * disagree with the verdict.
 */
function reveal(question: Question, formatTurns: number | undefined): string {
  const WIDTH = 41;
  const half = DECK_SPEED.width * question.se;
  // One scale for every card in a run, wide enough to hold this card and its
  // error bar and always containing flat.
  const span = Math.max(Math.abs(question.resid) + half, half * 1.5) * 1.15;
  const at = (v: number) =>
    Math.max(0, Math.min(WIDTH - 1, Math.round(((v + span) / (2 * span)) * (WIDTH - 1))));

  const zero = at(0);
  const lo = at(question.resid - question.se);
  const hi = at(question.resid + question.se);
  const mid = at(question.resid);

  const track = Array.from({ length: WIDTH }, (_, i) => {
    if (i === mid) return pc.bold("●");
    if (i >= lo && i <= hi) return "─";
    if (i === zero) return pc.dim("│");
    return pc.dim("·");
  }).join("");

  const band = Array.from({ length: WIDTH }, (_, i) =>
    i >= at(-half) && i <= at(half) ? pc.dim("▁") : " ",
  ).join("");

  return [
    `${pc.dim("sooner")}${" ".repeat(WIDTH - 12)}${pc.dim("longer")}`,
    track,
    band,
    "",
    `${turns(question.resid)} turns against other ${" "}decks in its colours, ` +
      `± ${question.se.toFixed(2)} over ${question.n.toLocaleString()} games.`,
    pc.dim(
      `The shaded band is where the data cannot tell it from flat. ` +
        (formatTurns ? `A game in this set runs ${formatTurns.toFixed(1)} turns.` : ""),
    ),
  ].join("\n");
}

/**
 * What the run said, in the drill's own three mistakes.
 *
 * The tally is the point rather than the score: `saw-speed` dominating means a
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
  const sawSpeed = count("saw-speed");
  const sawNone = count("saw-none");
  const backwards = count("backwards");
  if (sawSpeed) lines.push(`${sawSpeed} × read a plan into a card that has none.`);
  if (sawNone) lines.push(`${sawNone} × called a real one neither.`);
  if (backwards) lines.push(`${backwards} × the wrong way round.`);

  p.note(lines.join("\n"), "The run");
}

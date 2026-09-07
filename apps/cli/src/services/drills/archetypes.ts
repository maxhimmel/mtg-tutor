import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import {
  ARCHETYPE_QUIZ,
  DECK_NAMES,
  SAME,
  decisionBand,
  gradeArchetypeGuess,
  rangeThreshold,
  scoreArchetypeRun,
  type ArchetypeResult,
} from "@mtg-tutor/core";
import { renderManaCost } from "../../core/ui/format.js";
import { spinner } from "../../core/ui/spinner.js";

// The archetype quiz, in a terminal.
//
// Same run as the web's: one card, the two decks that disagree most about it,
// and a table of every deck once you have answered. Nothing here decides
// anything the web does not -- the question, the gate and the grade are all in
// `core/drills/archetypes.ts`, and both clients are a way of asking.
//
// THE ONE THING A TERMINAL DOES BETTER is the reveal. The whole table is four
// to ten rows of a name and a number, which is a shape a terminal draws without
// apology and a browser has to find room for.
//
// Like the misses drill, this sends no `drill_*` event: a run writes nothing,
// so there is no mutation for a capture to ride, and the web's numbers are the
// whole funnel. What this is NOT invisible to is the measurement those runs are
// for: every answer is written through `drills.answers.record`, so a run here
// moves the same history the web reads, deals the same cards forward and feeds
// the same panel on /stats.

type Run = Awaited<ReturnType<typeof deal>>;
type Question = Run["questions"][number];

const deal = (convex: ConvexHttpClient, setCode: string) =>
  convex.query(api.drills.archetypes.deal, { setCode, today: today() });

/**
 * The calendar day, which the query takes rather than reads.
 *
 * A Convex query may not read the wall clock -- it is not re-run when time
 * advances -- so the caller sends it. UTC, matching the day the answer rows are
 * stamped with, so "an earlier day" means the same thing on both sides.
 */
const today = () => new Date().toISOString().slice(0, 10);

const points = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}pp`;
const deckName = (colors: string) => `${DECK_NAMES[colors] ?? colors} (${colors})`;

/**
 * Which set to quiz on: `--set`, else the one you drafted last, else the newest.
 *
 * The fallback matters more here than anywhere else in the CLI. This drill
 * reads a set's statistics and nothing of yours, so it is the one thing in
 * `practice` that works on an account with no drafts on it -- and defaulting to
 * "your most recent draft" would have made it look like it did not.
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

export async function runArchetypes(
  convex: ConvexHttpClient,
  argv: string[] = [],
): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" Which deck wants it? ")));

  const setCode = await chooseSet(convex, argv);
  if (!setCode) {
    p.outro("No sets ingested yet, so there is nothing to be quizzed on.");
    return;
  }

  for (;;) {
    const spin = spinner();
    spin.start(`Reading what ${setCode.toUpperCase()} decks did`);
    const run = await deal(convex, setCode);
    spin.stop(
      run.questions.length > 0
        ? `${run.questions.length} card${run.questions.length === 1 ? "" : "s"} the decks disagree about`
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
      p.cancel("Left mid-run. What you answered before that is kept.");
      return;
    }

    report(results, run.questions.length);

    const again = await p.confirm({
      message: `Another ${run.questions.length}?`,
      initialValue: false,
    });
    if (p.isCancel(again) || !again) break;
  }

  p.outro(pc.green("That is the run."));
}

/** Null when the player walked away, which is not a score of zero. */
async function play(
  convex: ConvexHttpClient,
  setCode: string,
  run: Run,
): Promise<ArchetypeResult[] | null> {
  const results: ArchetypeResult[] = [];
  // One id per question per run, which is what lets a row say whether a second
  // answer is a retry or the same card coming round again. See schema.ts.
  const sitting = `cli:${Date.now()}`;

  for (const [i, question] of run.questions.entries()) {
    p.note(card(question), `${i + 1}/${run.questions.length}`);

    // Sorted by colour string so the answer is never the first option twice in
    // a row -- a run whose answer is always at the top is a run about noticing
    // that. The web orders the same way and says the same thing.
    const options = [
      ...[question.wants, question.spurns]
        .sort((a, b) => a.localeCompare(b))
        .map((colors) => ({ value: colors, label: deckName(colors) })),
      // Last rather than first, and it is the right answer most of the time.
      // A person who never reaches for it is who this drill is for.
      { value: SAME, label: "Neither — the same card in both" },
    ];

    const chosen = await p.select({
      message: `Which deck wanted ${question.card.name}?`,
      options,
    });
    if (p.isCancel(chosen)) return null;
    // `select` widens its value to unknown through the options array; the
    // options are built from two colour strings three lines up.
    const guess = chosen as string;

    const result = gradeArchetypeGuess(question, guess);
    results.push(result);

    // Awaited here where the web fires and forgets, and the difference is what
    // each client can do about a failure. The browser has a reveal on screen
    // already and must not blank it; a terminal has nothing rendered yet and can
    // simply say the answer was not kept, which is better than dealing the card
    // back tomorrow with no explanation.
    await convex
      .mutation(api.drills.answers.record, {
        drill: "archetypes",
        setCode,
        name: question.card.name,
        answered: guess,
        // The answer as this question was asked. `separated` is what decides
        // whether there is a deck to name at all.
        correct: question.separated ? question.wants : SAME,
        sigmas: question.sigmas,
        attemptId: `${sitting}:${i}`,
      })
      .catch(() => p.log.warn("That answer was not recorded, so the card may come back."));

    p.note(reveal(question, result, guess), head(result, question));
  }

  return results;
}

/**
 * The card, and nothing that answers the question.
 *
 * No win rate and no deck rates -- the trap this drill is for is answering
 * "which of these decks is better", and any number printed here would be a
 * thumb on that scale. The rules text is in because what a card DOES is the
 * whole of what a person is meant to reason from.
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

const head = (result: ArchetypeResult, question: Question) => {
  const answer = question.separated
    ? `${deckName(question.wants)} wanted it`
    : "neither — the same card in both";
  return result.correct ? pc.green(`✓ ${answer}`) : pc.red(`✗ ${answer}`);
};

/**
 * Every deck, not just the two that were asked about.
 *
 * The grade uses the ends because they are the only pair the data can separate;
 * the rows between them are real numbers it cannot put in order, and dropping
 * them would leave a person believing the answer was a ranking.
 */
function reveal(question: Question, result: ArchetypeResult, guess: string): string {
  const k = question.decks.length;
  const rate = ARCHETYPE_QUIZ.falsePositive;
  const needed = rangeThreshold(k, rate);
  const band = (sd: number) => decisionBand(sd, k, rate);

  // One scale for every row, always containing zero -- a lift is a claim about
  // beating what that deck does anyway, so the line it is measured from has to
  // be on the chart.
  const lo = Math.min(0, ...question.decks.map((d) => d.lift - band(d.sd)));
  const hi = Math.max(0, ...question.decks.map((d) => d.lift + band(d.sd)));
  const span = hi - lo || 1;
  const WIDTH = 34;
  const at = (v: number) => Math.round(((v - lo) / span) * (WIDTH - 1));

  const width = Math.max(...question.decks.map((d) => deckName(d.colors).length));

  const rows = question.decks.map((deck) => {
    const half = band(deck.sd);
    // The band as a run of dashes with the estimate on it, and the deck's own
    // rate as a pipe. Two bands that touch are exactly the line between a
    // difference and none -- see `decisionBand`, which is sized for that.
    const cells = Array.from({ length: WIDTH }, () => " ");
    cells[at(0)] = pc.dim("│");
    for (let i = at(deck.lift - half); i <= at(deck.lift + half); i++) {
      if (i >= 0 && i < WIDTH && cells[i] === " ") cells[i] = pc.dim("─");
    }
    cells[at(deck.lift)] = "●";

    const line =
      `  ${deckName(deck.colors).padEnd(width)}  ${cells.join("")}  ` +
      `${points(deck.lift).padStart(7)}  ${pc.dim(`${deck.n.toLocaleString()} games`)}`;

    if (question.separated && deck.colors === question.wants) return pc.green(line);
    if (deck.colors === guess) return pc.red(line);
    return line;
  });

  const lines = [...rows, ""];

  if (result.mistake === "stronger-deck") {
    lines.push(
      pc.dim(
        `${DECK_NAMES[guess] ?? guess} wins more games than ${DECK_NAMES[question.wants] ?? question.wants} does — but not\n` +
          "because of this card. What a deck wants and what a deck wins are two\n" +
          "different questions, and this one is the first.",
      ),
      "",
    );
  }

  // What the gap needed to be, and why it was that. The bar is not a constant:
  // it is set by how many decks were in the running, because the widest gap
  // among k noisy figures is wide even when every deck wants the card the same.
  lines.push(
    `  widest gap ${pc.bold(question.sigmas.toFixed(1))} error bars` +
      `   ·   needed ${pc.bold(needed.toFixed(1))} for ${k} decks` +
      `   ·   head to head ${rangeThreshold(2, rate).toFixed(1)}`,
    "",
    pc.dim(
      `${DECK_NAMES[question.wants] ?? question.wants} did not just beat ${DECK_NAMES[question.spurns] ?? question.spurns} — it came out top of ${k}. Pick the\n` +
        `best and worst of ${k} figures this noisy and they land about ${needed.toFixed(1)} error bars\n` +
        "apart even when every deck wants the card the same, so that is the bar.\n" +
        "The band is how much of each figure is guesswork at that many games.",
    ),
  );

  return lines.join("\n");
}

function report(results: ArchetypeResult[], served: number): void {
  const score = scoreArchetypeRun(results);
  p.note(
    [
      `${pc.bold(`${score.read}/${score.answered}`)} read right`,
      "",
      `${pc.green("read")}     ${score.read}  called it right`,
      `${pc.red("misread")}  ${score.misread}  called it wrong`,
    ].join("\n"),
    `This run of ${served}`,
  );
}

/**
 * An empty run, which has three different meanings.
 *
 * The same three the web separates, for the same reason: one "nothing here"
 * across all of them says the app is broken to somebody who has done nothing
 * wrong. The first is notes issue #8 and is the whole reason this says the set
 * code out loud.
 */
function nothing(run: Run, setCode: string): string {
  const code = setCode.toUpperCase();
  // The one that is not bad news, and it gets its own sentence for that reason:
  // "nothing to ask" and "you have been through all of it" read the same and are
  // opposite things to be told.
  if (run.mute === "answered") {
    return (
      `You have been through all ${run.quizzable} of ${code}'s questions, and nothing is\n` +
      "waiting to come back. Try --set on another; anything you misread here returns a day later."
    );
  }
  if (run.mute === "unrated") {
    return (
      `${code} never recorded what colours its decks were, so there is no way to know\n` +
      "which deck wanted a card. It is the only set with that hole. Try --set on another."
    );
  }
  // A pipeline step that has not run is not a fact about the set, and must not
  // borrow the sentence above -- somebody would go and check 17Lands.
  if (run.mute === "unbuilt") {
    return (
      `${code} has no statistics stored yet. Nothing is wrong with the set; the\n` +
      "numbers this drill reads have not been built for it. Try --set on another."
    );
  }
  return `${code} has no mono-coloured cards with enough games to ask about. Try --set on another.`;
}

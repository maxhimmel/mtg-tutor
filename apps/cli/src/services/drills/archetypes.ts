import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import {
  DECK_NAMES,
  gradeArchetypeGuess,
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
// whole measurement. Stated rather than quietly true.

type Run = Awaited<ReturnType<typeof deal>>;
type Question = Run["questions"][number];

const deal = (convex: ConvexHttpClient, setCode: string, skip: number) =>
  convex.query(api.drills.archetypes.deal, { setCode, skip });

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

  let skip = 0;
  for (;;) {
    const spin = spinner();
    spin.start(`Reading what ${setCode.toUpperCase()} decks did`);
    const run = await deal(convex, setCode, skip);
    spin.stop(
      run.questions.length > 0
        ? `${run.questions.length} card${run.questions.length === 1 ? "" : "s"} the decks disagree about`
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

    report(results, run.questions.length);

    if (run.nextSkip >= run.quizzable) {
      p.outro(`That is every question ${setCode.toUpperCase()} has. Try --set on another.`);
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

/** Null when the player walked away, which is not a score of zero. */
async function play(run: Run): Promise<ArchetypeResult[] | null> {
  const results: ArchetypeResult[] = [];

  for (const [i, question] of run.questions.entries()) {
    p.note(card(question), `${i + 1}/${run.questions.length}`);

    // Sorted by colour string so the answer is never the first option twice in
    // a row -- a run whose answer is always at the top is a run about noticing
    // that. The web orders the same way and says the same thing.
    const options = [question.wants, question.spurns]
      .sort((a, b) => a.localeCompare(b))
      .map((colors) => ({ value: colors, label: deckName(colors) }));

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

const head = (result: ArchetypeResult, question: Question) =>
  result.correct
    ? pc.green(`✓ ${deckName(question.wants)} wanted it`)
    : pc.red(`✗ ${deckName(question.wants)} wanted it`);

/**
 * Every deck, not just the two that were asked about.
 *
 * The grade uses the ends because they are the only pair the data can separate;
 * the rows between them are real numbers it cannot put in order, and dropping
 * them would leave a person believing the answer was a ranking.
 */
function reveal(question: Question, result: ArchetypeResult, guess: string): string {
  const width = Math.max(...question.decks.map((d) => deckName(d.colors).length));

  const rows = question.decks.map((deck) => {
    const name = deckName(deck.colors).padEnd(width);
    const line = `  ${name}  ${points(deck.lift).padStart(7)}  ${pc.dim(
      `${deck.n.toLocaleString()} games`,
    )}`;
    if (deck.colors === question.wants) return pc.green(line);
    if (deck.colors === guess) return pc.red(line);
    return line;
  });

  const lines = [...rows, ""];

  if (result.tookStrongerDeck) {
    lines.push(
      pc.dim(
        `${DECK_NAMES[guess] ?? guess} wins more games than ${DECK_NAMES[question.wants] ?? question.wants} does — but not\n` +
          "because of this card. What a deck wants and what a deck wins are two\n" +
          "different questions, and this one is the first.",
      ),
      "",
    );
  }

  lines.push(
    pc.dim(
      "Each figure is how much better the deck did with this card in hand than it did\n" +
        `in general. The two ends are ${question.sigmas.toFixed(1)} standard errors apart; the rows\n` +
        "between them the data cannot put in order.",
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
      `${pc.green("read")}     ${score.read}  named the deck that wanted the card`,
      `${pc.red("misread")}  ${score.misread}  named the other one`,
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
function nothing(run: Run, setCode: string, skip: number): string {
  const code = setCode.toUpperCase();
  if (run.mute) {
    return (
      `${code} never recorded what colours its decks were, so there is no way to know\n` +
      "which deck wanted a card. It is the only set with that hole. Try --set on another."
    );
  }
  if (skip > 0) {
    return `That is all ${run.quizzable} of ${code}'s questions. Try --set on another.`;
  }
  return (
    `No card in ${code} has two decks that disagree about it by more than the data's\n` +
    "own margin, so there is nothing here worth asking. Try --set on another."
  );
}

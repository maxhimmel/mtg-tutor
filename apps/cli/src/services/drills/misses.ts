import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import {
  byCurve,
  deckColors,
  gradeMiss,
  manaCurve,
  scoreMissRun,
  tally,
  type MissResult,
} from "@mtg-tutor/core";
import { pickCard } from "../../core/ui/cardPicker.js";
import { curveLine, renderManaCost } from "../../core/ui/format.js";
import { spinner } from "../../core/ui/spinner.js";

// The misses drill, in a terminal.
//
// Same run as the web's: the packs you got wrong, dealt back one at a time,
// with no sign of which card you took until you have answered. The pack comes
// up blind -- `pickCard`'s win rates are most of the answer -- and the deck as
// it stood goes above it, because the question is which card served THAT deck
// and not which card is strongest.
//
// The one thing the CLI cannot do here is report. A run writes nothing, so
// there is no mutation for a capture to ride on and no drill event is sent from
// this side; the web's numbers are the whole measurement. Stated rather than
// quietly true -- it is the same gap the CLI's review quiz already has.

type Run = Awaited<ReturnType<typeof deal>>;
type Question = Run["questions"][number];

const deal = (convex: ConvexHttpClient, skip: number) =>
  convex.query(api.drills.misses.deal, { skip });

const points = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}pp`;

const ageInDays = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

export async function runMisses(convex: ConvexHttpClient): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" Take the pick back ")));

  let skip = 0;
  for (;;) {
    const spin = spinner();
    spin.start("Finding the ones you got wrong");
    const run = await deal(convex, skip);
    spin.stop(
      run.questions.length > 0
        ? `${run.questions.length} pack${run.questions.length === 1 ? "" : "s"} to take again`
        : "",
    );

    if (run.questions.length === 0) {
      p.outro(nothing(run, skip));
      return;
    }

    const results = await play(run);
    if (!results) {
      p.cancel("Left mid-run. Nothing is recorded either way.");
      return;
    }

    report(results, run.questions.length);

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
async function play(run: Run): Promise<MissResult[] | null> {
  const results: MissResult[] = [];

  for (const [i, question] of run.questions.entries()) {
    p.note(deckPanel(question), `Your deck then · ${ageInDays(question.draftedAt)}d ago`);

    const guess = await pickCard(
      question.pack,
      `${i + 1}/${run.questions.length} · P${question.packNo}P${question.pickNo} — which card was this deck's pick?`,
      // The list prints a GIH win rate beside every name, and the drill is
      // asking a question that number mostly answers.
      { blind: true },
    );
    if (!guess) return null;

    const result = gradeMiss(question, guess.name);
    results.push(result);
    p.note(reveal(question, result, guess.name), head(question, result));
  }

  return results;
}

/**
 * The deck the question is about, above the pack rather than beside it.
 *
 * A terminal has no second column, and this is not decoration to drop when the
 * room runs out: the answer is the card that best served this deck, so without
 * it the drill is asking which card is strongest -- a different question.
 *
 * The same three things the web draws in its sidebar, said the way a terminal
 * says them: what it is committed to, when it can play, and what is in it. The
 * curve goes through the build screen's own `curveLine` rather than a second
 * one written here, and the cards are sorted `byCurve` because that is the
 * order every deck list in this app is read in.
 */
function deckPanel(question: Question): string {
  const pool = question.pool;
  if (pool.length === 0) {
    return `${question.setCode.toUpperCase()} · your first pick of that draft — every colour still open`;
  }

  const colors = tally([...pool], (c) => [...c.colors])
    .map(([color, n]) => `${color}${n}`)
    .join(" ");
  const curve = manaCurve(pool).map((bucket) => bucket.cards.length);

  return [
    `${deckColors(pool) || "—"} · ${pool.length} cards · ${colors}`,
    curveLine(curve),
    "",
    ...[...pool]
      .sort(byCurve)
      .map((c) => `  ${c.name} ${pc.dim(renderManaCost(c.manaCost))}`),
  ].join("\n");
}

const head = (question: Question, result: MissResult) =>
  result.outcome === "fixed"
    ? pc.green(`✓ P${question.packNo}P${question.pickNo} — you would take it now`)
    : result.outcome === "stood"
      ? pc.yellow(`= P${question.packNo}P${question.pickNo} — same call, twice`)
      : pc.red(`✗ P${question.packNo}P${question.pickNo}`);

function reveal(question: Question, result: MissResult, guess: string): string {
  const lines = [
    `The pick:      ${pc.bold(question.gradedName)}  ${pc.dim(points(question.gap))}`,
    `You took now:  ${guess}`,
    `You took then: ${question.tookName}`,
  ];

  if (result.outcome === "stood") {
    lines.push("");
    lines.push(
      pc.dim(
        "Standing by a pick the grade docked is worth something on its own — it is a\n" +
          "disagreement with the data rather than a slip.",
      ),
    );
  }
  if (result.tookRawBest) {
    lines.push("");
    lines.push(
      pc.dim(
        `${guess} is the strongest card in the pack on raw win rate. This is the gap\n` +
          "between the best card and the best card for you.",
      ),
    );
  }
  return lines.join("\n");
}

function report(results: MissResult[], served: number): void {
  const score = scoreMissRun(results);
  p.note(
    [
      `${pc.bold(`${score.fixed}/${score.answered}`)} you would now take back`,
      "",
      `${pc.green("fixed")}        ${score.fixed}  took the card the deck wanted`,
      `${pc.yellow("stood by it")}  ${score.stood}  made the same call again`,
      `${pc.red("missed again")} ${score.missed}  changed your mind, still not it`,
    ].join("\n"),
    `This run of ${served}`,
  );
}

/**
 * An empty run, which has four different meanings.
 *
 * Same four the web screen separates, for the same reason: one "nothing here"
 * across all of them tells somebody who has done everything right that the app
 * is broken.
 */
function nothing(run: Run, skip: number): string {
  if (skip > 0) return "That is all of them. Take another draft and this fills back up.";
  if (run.drafts === 0) {
    return "No finished drafts yet — this deals back packs from those. Try: mtg-tutor draft <set>";
  }
  if (run.unavailable > 0) {
    return `Every miss worth asking about comes from a set that has been re-ingested since, and its packs hold cards the set no longer has (${run.unavailable}). Newer drafts will fill this.`;
  }
  return `Nothing worth asking about in your last ${run.drafts} drafts. That is the good version of an empty screen.`;
}

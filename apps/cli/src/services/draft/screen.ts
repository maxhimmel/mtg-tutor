import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  COACH,
  CURVE_TOP,
  DECK,
  byCurve,
  cardValue,
  decksAgree,
  explainPick,
  hydrate,
  hydrateScore,
  isDecisionPick,
  textIndex,
} from "@mtg-tutor/core";
import type { Card, PickScore } from "@mtg-tutor/core";
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { gradeColor, pct } from "../../core/ui/format.js";
import { pickFromPack } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";
import { CoachQuotaExceeded, streamCoach } from "../../core/tutor/coach.js";
import { buildTheForty, managePiles } from "./deck.js";
import { humanError } from "../../core/ui/humanError.js";

// The draft loop drives the deployment: the engine, the bots and the scoring all
// live in Convex, and this only renders. That is the point -- a feature added
// for the web app is already here.
export async function runDraft(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  setCode: string,
  format: string,
) {
  p.intro(pc.bgCyan(pc.black(` Draft: ${setCode.toUpperCase()} — ${format} `)));

  let state = await convex.query(api.draft.state, { sessionId });

  // The board carries only what the engine deals in; the rules text and art are
  // read once here and joined below. Same split the web app works to, and the
  // reason a pick no longer drags the whole set across the wire.
  const text = textIndex(await convex.query(api.sets.cardText, { setCode, format }));

  while (!state.complete) {
    const pack = hydrate(state.pack, text).sort((a, b) => cardValue(b) - cardValue(a));
    // The pool as two numbers rather than one, so the pile a card was sent to is
    // visible from the screen that sent it there.
    const header =
      `Pack ${state.packNo} · Pick ${state.pickNo}` +
      `  (${pack.length} cards · deck ${state.pool.length - state.sideboard.length}` +
      (state.sideboard.length ? ` · sideboard ${state.sideboard.length})` : ")");

    const choice = await pickFromPack(pack, header);
    if (!choice) {
      p.cancel(`Draft abandoned. Resume it any time: mtg-tutor draft --resume ${sessionId}`);
      return;
    }

    // Editing the split does not pass the pack, so the same pick comes back
    // around. Which is the point: you look at what you have, then decide.
    if (choice.kind === "piles") {
      state = {
        ...state,
        sideboard: await managePiles(
          convex,
          sessionId,
          hydrate(state.pool, text),
          state.sideboard,
        ),
      };
      continue;
    }

    const result = await convex.mutation(api.draft.pick, {
      sessionId,
      cardName: choice.card.name,
      // Said as the card is taken rather than corrected afterwards, so the
      // tallies the coach reads never briefly count a card the player already
      // knew they would not play.
      bench: choice.bench,
    });

    await showPickFeedback(
      sessionId,
      result.pickIndex,
      hydrateScore(result.score as PickScore, text),
      result.signal,
      pack.length,
    );

    state = {
      ...state,
      complete: result.complete,
      packNo: result.packNo,
      pickNo: result.pickNo,
      pack: result.pack,
      pool: result.pool,
      sideboard: result.sideboard,
    };
  }

  await finishDraft(convex, sessionId);
}

async function showPickFeedback(
  sessionId: Id<"draftSessions">,
  pickIndex: number,
  score: PickScore<Card>,
  signal: string | undefined,
  cardsInPack: number,
) {
  // Three states, not two. A pick inside the error bars scores 100 and is not a
  // miss, but it did not top the pack either -- calling it "best pick" would be
  // as wrong as showing it a rank, and the rank is what it used to show.
  const head =
    `${gradeColor(score.grade)} ${pc.bold(String(score.score))}/100` +
    (score.isBest
      ? pc.green("  ✓ best pick")
      : score.indistinguishable
        ? pc.green("  ✓ nothing measurably better")
        : pc.dim(`  (rank ${score.rankInPack})`));

  // The tail of a pack is forced, so it gets the deterministic explanation and
  // no LLM call. The web app makes this adjustable; the CLI has no settings
  // store, so it uses the shared default.
  const coachable = isDecisionPick(cardsInPack, COACH.minPackCards);

  if (coachable && (await streamCoaching(sessionId, pickIndex, head))) return;

  const lines = explainPick(score);
  if (signal) lines.push(pc.cyan(signal));
  p.note(lines.join("\n"), head);
}

// Module-level, so it survives across the picks of one `mtg-tutor draft` run and
// resets when the process does -- which is the granularity that matters, since
// the quota it describes is per day.
let quotaWarned = false;

// Streams the coach's reply to stdout under the numeric grade. Returns true if
// it printed something (so the caller skips the deterministic fallback), false
// if it produced nothing or failed before any output.
async function streamCoaching(
  sessionId: Id<"draftSessions">,
  pickIndex: number,
  head: string,
): Promise<boolean> {
  const spin = spinner();
  spin.start("Coach is reading the board");
  let started = false;

  try {
    for await (const chunk of streamCoach(sessionId, pickIndex)) {
      if (!started) {
        spin.stop(head);
        process.stdout.write(pc.dim("  Coach: "));
        started = true;
      }
      process.stdout.write(chunk);
    }
  } catch (e) {
    if (started) {
      process.stdout.write("\n");
      return true; // partial coaching already shown — don't double up
    }
    spin.stop(head);
    // Said once per draft when it is the quota, because it will be true for
    // every remaining pick and forty-five copies of the same sentence is worse
    // than none. Everything else can vary pick to pick, so it still reports.
    if (e instanceof CoachQuotaExceeded) {
      if (!quotaWarned) {
        quotaWarned = true;
        p.log.warn(e.message);
      }
      return false;
    }
    p.log.warn(`AI coaching unavailable (${humanError(e)}).`);
    return false;
  }

  if (!started) {
    spin.stop(head);
    return false;
  }
  process.stdout.write("\n");
  return true;
}

/**
 * The end of a draft: build the forty, then read the verdict on it.
 *
 * Exported because a draft can be left between those two steps -- the picks are
 * all made and stored, and the deck is not built -- and `--resume` on a finished
 * session lands here rather than telling the player it is too late.
 */
export async function finishDraft(convex: ConvexHttpClient, sessionId: Id<"draftSessions">) {
  let results = await convex.query(api.draft.results, { sessionId });

  if (!results.build) {
    p.note(
      "Forty-five cards. Forty slots. Cut what you are not playing and decide how much land\n" +
        "the rest wants. The suggested build and your grade are behind the lock.",
      "Draft complete",
    );
    if (!(await buildTheForty(convex, sessionId, results.pool, results.sideboard))) {
      p.cancel(
        "Deck not built. Your picks are saved — finish it any time: " +
          `mtg-tutor draft --resume ${sessionId}`,
      );
      return;
    }
    // Re-read rather than patched in: locking the deck in is what puts the
    // suggestion and the diff on the wire in the first place.
    results = await convex.query(api.draft.results, { sessionId });
  }

  showResults(results);
}

type Results = FunctionReturnType<typeof api.draft.results>;

// Two curves on one axis, bucketed by the turn a spell comes down on -- the same
// buckets the build screen counted, so the shape you were watching is the shape
// being compared.
function curveDiff(built: number[], suggested: number[]): string {
  const turn = (i: number) => (i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : `${i + 1}`);
  const row = (label: string, counts: number[]) =>
    `  ${label.padEnd(10)}${counts.map((n, i) => `${turn(i)}:${n}`.padEnd(6)).join("")}`;
  return [row("Yours", built), row("Suggested", suggested)].join("\n");
}

function showResults(results: Results) {
  const { summary, deck, diff, mistakes, ratedCardCount } = results;

  // Both of these are stored together and the query returns them together, so
  // one present and the other missing is not a state that exists. Narrowed
  // rather than assumed, because the type says it could be.
  if (!deck || !diff) {
    p.log.error("The deck was locked in but the suggestion did not come back with it.");
    return;
  }

  const agreed = decksAgree(diff);
  const landLine = deck.nonbasicLands.length
    ? `${deck.nonbasicLands.length} drafted lands, +${deck.basicLands} basics`
    : `+${deck.basicLands} basics`;

  p.note(
    (agreed
      ? pc.green("The same forty, card for card.")
      : `${pc.bold(String(diff.shared))} of your ${DECK.size} match the suggested build.`) +
      "\n" +
      pc.dim(
        "The suggestion is what the card values and this format's price on a third color\n" +
          "come to. It is an argument, not an answer.",
      ) +
      "\n\n" +
      `Overall score: ${pc.bold(summary.overallScore.toFixed(1))}/100\n` +
      `Best-pick accuracy: ${pc.bold((summary.accuracy * 100).toFixed(0))}%`,
    "Deck locked in",
  );

  if (!agreed) {
    const side = (title: string, cards: Card[]) =>
      [
        pc.bold(title),
        ...(cards.length
          ? cards.map((c) => `  ${c.name} ${pc.dim(pct(c.gihWinRate))}`)
          : [pc.dim("  Nothing.")]),
      ].join("\n");

    p.note(
      [
        side("Only in your build", diff.onlyBuilt),
        "",
        side("Only in the suggestion", diff.onlySuggested),
      ].join("\n"),
      `${diff.onlyBuilt.length + diff.onlySuggested.length} cards apart`,
    );
  }

  p.note(
    [
      curveDiff(diff.curve.built, diff.curve.suggested),
      "",
      `  Lands      yours ${diff.lands.built}  ·  suggested ${diff.lands.suggested}`,
      `  Colors     yours ${diff.colors.built.join("") || "—"}  ·  ` +
        `suggested ${diff.colors.suggested.join("") || "—"}`,
    ].join("\n"),
    "Shape",
  );

  p.note(
    [...deck.spells, ...deck.nonbasicLands]
      .sort(byCurve)
      .map((c) => `  ${c.name} ${pc.dim(pct(c.gihWinRate))}`)
      .join("\n"),
    `The suggested build — ${deck.colors.join("") || "splashy"}, ${landLine}`,
  );

  if (ratedCardCount === 0) {
    // Without 17Lands data every card scores off its rarity baseline, so a pick
    // can rarely be "wrong" and the score is close to meaningless. Say so rather
    // than let a 97/100 imply a good draft.
    p.log.warn(
      "This set has no 17Lands win rates, so every card was scored on its rarity " +
        "baseline alone. The score above is not a meaningful measure of your picks, " +
        "and the missed-picks list needs win rates to explain a miss, so it stays empty.",
    );
  }

  if (mistakes.length) {
    p.note(
      mistakes
        .map(
          (m) =>
            `P${m.packNo}P${m.pickNo}: took ${m.picked.name} (${pct(m.picked.gihWinRate)}) over ${m.best.name} (${pct(m.best.gihWinRate)})`,
        )
        .join("\n"),
      "Biggest missed picks",
    );
  }

  p.outro(
    pc.green(
      `Recorded (${summary.colorPair || "—"}). ` +
        `Run "mtg-tutor stats" to track progress, or "mtg-tutor review" to go through it pick by pick.`,
    ),
  );
}

import * as p from "@clack/prompts";
import pc from "picocolors";
import { cardValue, explainPick } from "@mtg-tutor/core";
import type { Card, PickScore } from "@mtg-tutor/core";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { gradeColor, pct } from "../../core/ui/format.js";
import { pickCard } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";
import { streamCoach } from "../../core/tutor/coach.js";

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

  while (!state.complete) {
    const pack = [...state.pack].sort((a, b) => cardValue(b) - cardValue(a));
    const header =
      `Pack ${state.packNo} · Pick ${state.pickNo}` +
      `  (${pack.length} cards · pool ${state.pool.length})`;

    const picked = await pickCard(pack as Card[], header);
    if (!picked) {
      p.cancel(`Draft abandoned. Resume it any time: mtg-tutor draft --resume ${sessionId}`);
      return;
    }

    const result = await convex.mutation(api.draft.pick, {
      sessionId,
      cardName: picked.name,
    });

    await showPickFeedback(sessionId, result.pickIndex, result.score as PickScore, result.signal);

    state = {
      ...state,
      complete: result.complete,
      packNo: result.packNo,
      pickNo: result.pickNo,
      pack: result.pack,
      pool: result.pool,
    };
  }

  await showResults(convex, sessionId);
}

async function showPickFeedback(
  sessionId: Id<"draftSessions">,
  pickIndex: number,
  score: PickScore,
  signal: string | undefined,
) {
  const head =
    `${gradeColor(score.grade)} ${pc.bold(String(score.score))}/100` +
    (score.isBest ? pc.green("  ✓ best pick") : pc.dim(`  (rank ${score.rankInPack})`));

  if (await streamCoaching(sessionId, pickIndex, head)) return;

  const lines = explainPick(score);
  if (signal) lines.push(pc.cyan(signal));
  p.note(lines.join("\n"), head);
}

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
    p.log.warn(`AI coaching unavailable (${e instanceof Error ? e.message : String(e)}).`);
    return false;
  }

  if (!started) {
    spin.stop(head);
    return false;
  }
  process.stdout.write("\n");
  return true;
}

async function showResults(convex: ConvexHttpClient, sessionId: Id<"draftSessions">) {
  const results = await convex.query(api.draft.results, { sessionId });
  const { summary, deck, mistakes, ratedCardCount } = results;

  const deckLines = deck.spells
    .slice(0, 23)
    .map((c) => `  ${c.name} ${pc.dim(pct(c.gihWinRate))}`)
    .join("\n");

  p.note(
    `Overall score: ${pc.bold(summary.overallScore.toFixed(1))}/100\n` +
      `Best-pick accuracy: ${pc.bold((summary.accuracy * 100).toFixed(0))}%\n` +
      `Suggested deck (${deck.colors.join("") || "splashy"}, +${deck.lands} lands):\n${deckLines}`,
    "Draft complete",
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

  const save = await p.confirm({ message: "Save this draft to your stats?" });
  if (!p.isCancel(save) && save) {
    await convex.mutation(api.draft.save, { sessionId, saved: true });
    p.outro(pc.green(`Saved (${summary.colorPair || "—"}). Run "mtg-tutor stats" to track progress.`));
  } else {
    p.outro("Not saved.");
  }
}

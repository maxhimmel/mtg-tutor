import * as p from "@clack/prompts";
import pc from "picocolors";
import { buildPickContext, cardValue, DraftEngine, explainPick, mulberry32, newSeed, suggestDeck } from "@mtg-tutor/core";
import type { Card, RecordedPick, SetData } from "@mtg-tutor/core";
import { gradeColor, pct } from "../../core/ui/format.js";
import { pickCard } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";
import { ANTHROPIC } from "../../core/config.js";
import { streamGroundedReply } from "../../core/tutor/tutor.js";
import { saveDraft } from "../../core/db/db.js";

export async function runDraft(set: SetData, format: string) {
  const seed = newSeed();
  const engine = new DraftEngine(set, mulberry32(seed));
  p.intro(pc.bgCyan(pc.black(` Draft: ${set.code.toUpperCase()} — ${format} `)));

  while (!engine.isComplete()) {
    const pack = [...engine.currentPack].sort((a, b) => cardValue(b) - cardValue(a));
    const header =
      `Pack ${engine.packNo} · Pick ${engine.pickNo}` +
      `  (${pack.length} cards · pool ${engine.humanPool.length})`;

    const picked = await pickCard(pack, header);
    if (!picked) {
      p.cancel("Draft abandoned.");
      return;
    }

    const rec = engine.humanPick(picked);
    await showPickFeedback(rec, engine.humanPool);
  }

  await showResults(engine.history, engine, set, format, seed);
}

async function showPickFeedback(rec: RecordedPick, pool: Card[]) {
  const { score } = rec;
  const head =
    `${gradeColor(score.grade)} ${pc.bold(String(score.score))}/100` +
    (score.isBest ? pc.green("  ✓ best pick") : pc.dim(`  (rank ${score.rankInPack})`));

  // Preferred path: grounded AI coaching, streamed live. Falls back to the
  // deterministic explanation if it's disabled or the API call fails outright.
  if (ANTHROPIC.enabled && (await streamCoaching(rec, pool, head))) return;

  const lines = explainPick(score);
  if (rec.signal) lines.push(pc.cyan(rec.signal));
  p.note(lines.join("\n"), head);
}

// Streams the coach's reply to stdout under the numeric grade. Returns true if
// it printed something (so the caller skips the deterministic fallback), false
// if it produced nothing or failed before any output.
async function streamCoaching(rec: RecordedPick, pool: Card[], head: string): Promise<boolean> {
  const spin = spinner();
  spin.start("Coach is reading the board");
  let started = false;
  try {
    for await (const chunk of streamGroundedReply(buildPickContext(rec, pool))) {
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
      return true; // partial coaching already shown — don't double up with the fallback
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
  if (rec.signal) p.log.info(pc.cyan(rec.signal));
  return true;
}

async function showResults(history: RecordedPick[], engine: DraftEngine, set: SetData, format: string, seed: number) {
  const avg = history.reduce((s, h) => s + h.score.score, 0) / history.length;
  const acc = (history.filter((h) => h.score.isBest).length / history.length) * 100;

  const deck = suggestDeck(engine.humanPool);
  const deckLines = deck.spells
    .slice(0, 23)
    .map((c) => `  ${c.name} ${pc.dim(pct(c.gihWinRate))}`)
    .join("\n");

  p.note(
    `Overall score: ${pc.bold(avg.toFixed(1))}/100\n` +
      `Best-pick accuracy: ${pc.bold(acc.toFixed(0))}%\n` +
      `Suggested deck (${deck.colors.join("") || "splashy"}, +${deck.lands} lands):\n${deckLines}`,
    "Draft complete",
  );

  const mistakes = history
    .filter((h) => !h.score.isBest && h.picked.gihWinRate != null && h.score.best.gihWinRate != null)
    .sort((a, b) => (b.score.best.gihWinRate! - b.picked.gihWinRate!) - (a.score.best.gihWinRate! - a.picked.gihWinRate!))
    .slice(0, 5);
  if (mistakes.length) {
    p.note(
      mistakes
        .map(
          (m) =>
            `P${m.packNo}P${m.pickNo}: took ${m.picked.name} (${pct(m.picked.gihWinRate)}) over ${m.score.best.name} (${pct(m.score.best.gihWinRate)})`,
        )
        .join("\n"),
      "Biggest missed picks",
    );
  }

  const save = await p.confirm({ message: "Save this draft to your stats?" });
  if (!p.isCancel(save) && save) {
    const { id, summary } = saveDraft(set.code, format, history, engine.humanPool, new Date().toISOString(), seed);
    p.outro(pc.green(`Saved draft #${id} (${summary.colorPair || "—"}). Run "mtg-tutor stats" to track progress.`));
  } else {
    p.outro("Not saved.");
  }
}

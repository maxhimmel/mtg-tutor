import * as p from "@clack/prompts";
import pc from "picocolors";
import type { SetData } from "../../core/model/card.js";
import { DraftEngine, type RecordedPick } from "./engine.js";
import { cardValue } from "../../core/scoring/value.js";
import { gradeColor, pct } from "../../core/ui/format.js";
import { pickCard } from "../../core/ui/cardPicker.js";
import { explainPick } from "../../core/scoring/explain.js";
import { suggestDeck } from "./deck.js";
import { saveDraft } from "../../core/db/db.js";

export async function runDraft(set: SetData, format: string) {
  const engine = new DraftEngine(set);
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
    showPickFeedback(rec);
  }

  await showResults(engine.history, engine, set, format);
}

function showPickFeedback(rec: RecordedPick) {
  const { score } = rec;
  const head = `${gradeColor(score.grade)} ${pc.bold(String(score.score))}/100` + (score.isBest ? pc.green("  ✓ best pick") : pc.dim(`  (rank ${score.rankInPack})`));
  const lines = explainPick(score);
  if (rec.signal) lines.push(pc.cyan(rec.signal));
  p.note(lines.join("\n"), head);
}

async function showResults(history: RecordedPick[], engine: DraftEngine, set: SetData, format: string) {
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
    const { id, summary } = saveDraft(set.code, format, history, engine.humanPool, new Date().toISOString());
    p.outro(pc.green(`Saved draft #${id} (${summary.colorPair || "—"}). Run "mtg-tutor stats" to track progress.`));
  } else {
    p.outro("Not saved.");
  }
}

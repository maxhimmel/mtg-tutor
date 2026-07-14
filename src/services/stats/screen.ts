import * as p from "@clack/prompts";
import pc from "picocolors";
import Table from "cli-table3";
import { overall, recentDrafts, scoreByPackNo, scoreByPickNo, topMistakes } from "./report.js";
import { pct } from "../../core/ui/format.js";

function bar(v: number, max = 100, width = 20): string {
  const n = Math.round((v / max) * width);
  return pc.cyan("█".repeat(n)) + pc.dim("░".repeat(Math.max(0, width - n)));
}

export function showStats() {
  const o = overall();
  p.intro(pc.bgMagenta(pc.black(" Draft Stats ")));

  if (o.drafts === 0) {
    p.outro("No drafts saved yet. Run a draft first: mtg-tutor draft <set>");
    return;
  }

  p.log.message(
    `${pc.bold(String(o.drafts))} drafts · ${pc.bold(String(o.totalPicks))} picks\n` +
      `Avg pick score: ${pc.bold(o.avgScore.toFixed(1))}/100\n` +
      `Best-pick accuracy: ${pc.bold((o.avgAccuracy * 100).toFixed(0))}%`,
  );

  const recent = recentDrafts(10);
  const t = new Table({ head: ["#", "Date", "Set", "Colors", "Score", "Acc"].map((h) => pc.cyan(h)) });
  for (const r of recent) {
    t.push([
      r.id,
      r.created_at.slice(0, 10),
      r.set_code.toUpperCase(),
      r.color_pair || "—",
      r.overall_score.toFixed(1),
      `${(r.accuracy * 100).toFixed(0)}%`,
    ]);
  }
  p.log.message(pc.bold("Recent drafts\n") + t.toString());

  const byPack = scoreByPackNo();
  p.log.message(
    pc.bold("Avg score by pack\n") +
      byPack.map((r) => `  Pack ${r.pack_no}  ${bar(r.avg_score)} ${r.avg_score.toFixed(1)}`).join("\n"),
  );

  const byPick = scoreByPickNo();
  const early = byPick.filter((r) => r.pick_no <= 5);
  const late = byPick.filter((r) => r.pick_no >= 11);
  const mean = (rows: { avg_score: number }[]) =>
    rows.length ? rows.reduce((s, r) => s + r.avg_score, 0) / rows.length : 0;
  p.log.message(
    pc.bold("Early vs late picks\n") +
      `  Picks 1-5:   ${bar(mean(early))} ${mean(early).toFixed(1)}\n` +
      `  Picks 11+:   ${bar(mean(late))} ${mean(late).toFixed(1)}`,
  );

  const mistakes = topMistakes(8);
  if (mistakes.length) {
    const mt = new Table({ head: ["Where", "Took", "GIH", "Should've", "GIH"].map((h) => pc.cyan(h)) });
    for (const m of mistakes) {
      mt.push([
        `P${m.pack_no}P${m.pick_no}`,
        m.picked_name,
        pct(m.picked_gih),
        m.best_name,
        pct(m.best_gih),
      ]);
    }
    p.log.message(pc.bold("Biggest recurring mistakes\n") + mt.toString());
  }

  p.outro("Keep drafting to sharpen these numbers.");
}

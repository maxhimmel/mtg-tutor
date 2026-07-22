import * as p from "@clack/prompts";
import pc from "picocolors";
import Table from "cli-table3";
import { fetchOverview, type Overview } from "./report.js";
import { pct } from "../../core/ui/format.js";

function bar(v: number, max = 100, width = 20): string {
  const n = Math.round((v / max) * width);
  return pc.cyan("█".repeat(n)) + pc.dim("░".repeat(Math.max(0, width - n)));
}

export async function showStats() {
  p.intro(pc.bgMagenta(pc.black(" Draft Stats ")));

  let data: Overview;
  try {
    data = await fetchOverview();
  } catch (e) {
    p.log.error(e instanceof Error ? e.message : String(e));
    return;
  }

  const { overall, recent, byPackNo, byPickNo, topMistakes, truncated, replayedDrafts } = data;

  if (overall.drafts === 0) {
    p.outro("No drafts saved yet. Run a draft first: mtg-tutor draft <set>");
    return;
  }

  p.log.message(
    `${pc.bold(String(overall.drafts))} drafts · ${pc.bold(String(overall.totalPicks))} picks\n` +
      `Avg pick score: ${pc.bold(overall.avgScore.toFixed(1))}/100\n` +
      `Best-pick accuracy: ${pc.bold((overall.avgAccuracy * 100).toFixed(0))}%`,
  );

  if (truncated) {
    p.log.warn("Showing your most recent drafts only — older ones are outside this window.");
  }

  const t = new Table({ head: ["Date", "Set", "Colors", "Score", "Acc"].map((h) => pc.cyan(h)) });
  for (const r of recent) {
    t.push([
      r.createdAt.slice(0, 10),
      r.setCode.toUpperCase(),
      r.colorPair || "—",
      r.overallScore.toFixed(1),
      `${(r.accuracy * 100).toFixed(0)}%`,
    ]);
  }
  p.log.message(pc.bold("Recent drafts\n") + t.toString());

  // The per-pick breakdowns need replay, which needs the set still ingested.
  // A draft whose set has since been replaced counts in the totals above but
  // contributes no detail here, so say what the breakdown is actually built on.
  if (replayedDrafts === 0) {
    p.log.warn("No per-pick detail available — the sets these drafts used are no longer ingested.");
    p.outro("Keep drafting to sharpen these numbers.");
    return;
  }
  if (replayedDrafts < overall.drafts) {
    p.log.warn(
      `Breakdowns below cover ${replayedDrafts} of ${overall.drafts} drafts — the rest used sets that are no longer ingested.`,
    );
  }

  p.log.message(
    pc.bold("Avg score by pack\n") +
      byPackNo
        .map((r) => `  Pack ${r.packNo}  ${bar(r.avgScore)} ${r.avgScore.toFixed(1)}`)
        .join("\n"),
  );

  const early = byPickNo.filter((r) => r.pickNo <= 5);
  const late = byPickNo.filter((r) => r.pickNo >= 11);
  const mean = (rows: { avgScore: number }[]) =>
    rows.length ? rows.reduce((s, r) => s + r.avgScore, 0) / rows.length : 0;
  p.log.message(
    pc.bold("Early vs late picks\n") +
      `  Picks 1-5:   ${bar(mean(early))} ${mean(early).toFixed(1)}\n` +
      `  Picks 11+:   ${bar(mean(late))} ${mean(late).toFixed(1)}`,
  );

  if (topMistakes.length) {
    const mt = new Table({
      head: ["Where", "Set", "Took", "GIH", "Should've", "GIH"].map((h) => pc.cyan(h)),
    });
    for (const m of topMistakes.slice(0, 8)) {
      mt.push([
        `P${m.packNo}P${m.pickNo}`,
        m.setCode.toUpperCase(),
        m.pickedName,
        pct(m.pickedGih),
        m.bestName,
        pct(m.bestGih),
      ]);
    }
    p.log.message(pc.bold("Biggest recurring mistakes\n") + mt.toString());
  }

  p.outro("Keep drafting to sharpen these numbers.");
}

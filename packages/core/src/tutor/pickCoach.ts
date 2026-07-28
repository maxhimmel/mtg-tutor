import type { Card } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import { colorLabel, describeCard, pct, statLine } from "./cardLine.js";

// Renders a single draft pick into a compact prompt for the coach. Pure string
// work (no SDK), so a future web frontend can reuse it as-is.

function summarizePool(pool: Card[]): string {
  if (pool.length === 0) return "  (empty — this is your first pick)";
  const groups = new Map<string, string[]>();
  for (const c of pool) {
    const key = colorLabel(c);
    const list = groups.get(key) ?? [];
    list.push(c.name);
    groups.set(key, list);
  }
  return [...groups]
    .map(([label, names]) => `  ${label}: ${names.join(", ")}`)
    .join("\n");
}

export function buildPickContext(rec: RecordedPick, pool: Card[]): string {
  const { picked, score, pack } = rec;

  const passed = pack
    .filter((c) => c.name !== picked.name)
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0))
    .slice(0, 4)
    .map((c) => `  - ${describeCard(c)}\n    ${statLine(c)}`)
    .join("\n");

  const verdict = score.isBest
    ? `${score.score}/100 (${score.grade}) — you took the statistically best card.`
    : `${score.score}/100 (${score.grade}), rank ${score.rankInPack} of ${pack.length}. ` +
      `Best by the numbers: ${score.best.name} (GIH WR ${pct(score.best.gihWinRate)}).`;

  return [
    `Situation: Pack ${rec.packNo}, Pick ${rec.pickNo}.`,
    "",
    `Your pool so far (${pool.length} cards):`,
    summarizePool(pool),
    "",
    `You picked: ${describeCard(picked)}`,
    `  ${statLine(picked)}`,
    "",
    `Data verdict: ${verdict}`,
    "",
    // Null rather than "" so dropping an empty pack list does not also drop the
    // blank lines above -- each entry now spans two lines, and run together they
    // read as one block instead of five labelled sections.
    passed ? `Other cards in the pack:\n${passed}` : null,
    "",
    "Coach this pick.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

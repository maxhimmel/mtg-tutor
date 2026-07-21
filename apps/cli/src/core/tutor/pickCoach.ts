import type { Card, ColorCode } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";

// Renders a single draft pick into a compact prompt for the coach. Pure string
// work (no SDK), so a future web frontend can reuse it as-is.

const COLOR_NAMES: Record<ColorCode, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const pct = (v?: number) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function colorLabel(c: Card): string {
  if (c.colors.length === 0) return "Colorless";
  if (c.colors.length > 1) return c.colors.map((col) => COLOR_NAMES[col]).join("/");
  return COLOR_NAMES[c.colors[0]];
}

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
    .map((c) => `${c.name} (${colorLabel(c)}, GIH WR ${pct(c.gihWinRate)})`)
    .join("; ");

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
    `You picked: ${picked.name} — ${picked.cmc} mana, ${colorLabel(picked)}, ${picked.typeLine}. ` +
      `GIH WR ${pct(picked.gihWinRate)}.`,
    "",
    `Data verdict: ${verdict}`,
    passed ? `Other cards in the pack: ${passed}.` : "",
    "",
    "Coach this pick.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

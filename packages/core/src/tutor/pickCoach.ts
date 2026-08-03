import type { Card, PoolCard } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import { colorLabel, describeCard, pct, statLine } from "./cardLine.js";
import { type Pivot, commitmentLine, pivotLines, situationLine } from "./situation.js";

// Renders a single draft pick into a compact prompt for the coach. Pure string
// work (no SDK), so a future web frontend can reuse it as-is.

function summarizePool(pool: readonly PoolCard[]): string {
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

// Writes cards into a prompt, so it wants them whole: describeCard names the
// mana value and type line, and statLine reads the numbers that sit beside a
// win rate. Hydrated from the text table before it gets here.
//
// `poolBefore` is what the player is building; `benched` is what they drafted
// and then set aside. Splitting them is the whole point of a sideboard taken
// during a draft: a speculative red rare the player has since given up on
// should stop counting as a red commitment, and should stop being the thing the
// next pick is judged against.
export function buildPickContext(
  rec: RecordedPick<Card>,
  poolBefore: readonly PoolCard[],
  benched: readonly PoolCard[] = [],
  pivots: readonly Pivot[] = [],
): string {
  const { picked, score, pack } = rec;
  // The pool the player is looking at includes what they just took; the
  // commitments they were judged against do not. Both come from `poolBefore` so
  // the two cannot drift apart.
  const pool = [...poolBefore, picked];

  const passed = pack
    .filter((c) => c.name !== picked.name)
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0))
    .slice(0, 4)
    .map((c) => `  - ${describeCard(c)}\n    ${statLine(c)}`)
    .join("\n");

  const verdict = score.isBest
    ? `${score.score}/100 (${score.grade}) — you took the statistically best card.`
    : `${score.score}/100 (${score.grade}), rank ${score.rankInPack} of ${pack.length}. ` +
      `Best by the numbers: ${score.rawBest.name} (GIH WR ${pct(score.rawBest.gihWinRate)}).`;

  return [
    situationLine(rec.packNo, rec.pickNo, pack.length),
    commitmentLine(poolBefore, picked),
    pivotLines(pivots),
    "",
    `Your pool so far (${pool.length} cards):`,
    summarizePool(pool),
    "",
    // Only when there is one. An empty sideboard is the normal case and a line
    // saying so would be a rule the model has to hold for nothing.
    benched.length > 0
      ? `Sideboard (${benched.length} cards) — drafted, then set aside. The player is NOT ` +
        `building with these, so do not count them toward their colors or their curve:\n` +
        `${summarizePool(benched)}\n`
      : null,
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

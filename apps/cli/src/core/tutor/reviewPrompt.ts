import type { Card, ColorCode } from "../model/card.js";
import type { StoredPick } from "../model/review.js";

// Pure string builders for the review feature (no SDK). Siblings to pickCoach.ts,
// reusable by a future web frontend. Unlike live coaching, review asks for a
// structured verdict (context-best + divergence lesson + narrative) and frames
// the whole draft with archetype/signal bookends.

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
  if (pool.length === 0) return "  (empty — this is the first pick)";
  const groups = new Map<string, string[]>();
  for (const c of pool) {
    const key = colorLabel(c);
    const list = groups.get(key) ?? [];
    list.push(c.name);
    groups.set(key, list);
  }
  return [...groups].map(([label, names]) => `  ${label}: ${names.join(", ")}`).join("\n");
}

// Full pack, ranked by data — the "your options" panel (shallow permutations).
function listPack(pick: StoredPick): string {
  return [...pick.pack]
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0))
    .map((c) => {
      const tags = [colorLabel(c), `GIH ${pct(c.gihWinRate)}`];
      if (c.name === pick.picked.name) tags.push("YOU TOOK THIS");
      if (c.name === pick.bestName) tags.push("raw-power best");
      return `  - ${c.name} (${tags.join(", ")})`;
    })
    .join("\n");
}

// Context for a single reviewed pick. The player's pool is what they had BEFORE
// this pick, so "context-best" is judged against their commitments at the time.
export function buildReviewContext(pick: StoredPick, poolBefore: Card[]): string {
  return [
    `Situation: Pack ${pick.packNo}, Pick ${pick.pickNo}.`,
    "",
    `Pool before this pick (${poolBefore.length} cards):`,
    summarizePool(poolBefore),
    "",
    `They took: ${pick.picked.name} — ${pick.picked.cmc} mana, ${colorLabel(pick.picked)}, ${pick.picked.typeLine}. GIH WR ${pct(pick.picked.gihWinRate)}.`,
    "",
    `The raw-power best (highest 17Lands win rate available): ${pick.bestName}.`,
    "",
    "Full pack, strongest-first:",
    listPack(pick),
    "",
    "Judge the CONTEXT-BEST pick — the card that best serves this player's deck given",
    "their pool and the signals, which may differ from the raw-power best. Then explain",
    "the divergence (or agreement) and coach the pick.",
  ].join("\n");
}

// Opening + closing archetype/signal frame for the whole draft. `pool` is the
// final pool; colorPairWinRates is 17Lands archetype data keyed like "WU".
export function buildDraftFrame(
  phase: "open" | "close",
  pool: Card[],
  colorPairWinRates: Map<string, number>,
): string {
  const archetypes = [...colorPairWinRates]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pair, wr]) => `  ${pair}: ${pct(wr)}`)
    .join("\n");

  const shared = [
    `Final pool (${pool.length} cards):`,
    summarizePool(pool),
    "",
    "Set archetype win rates (17Lands, best-first):",
    archetypes || "  (no archetype data)",
  ].join("\n");

  if (phase === "open") {
    return [
      shared,
      "",
      "Give a 2-3 sentence OPENING read for reviewing this draft: what archetype the",
      "player ended up in, and which lane looked open that they could have contested.",
    ].join("\n");
  }
  return [
    shared,
    "",
    "Give a 3-4 sentence CLOSING signal-reading recap: when a color started flowing,",
    "whether a pivot was ever on, and the single biggest habit to work on next draft.",
  ].join("\n");
}

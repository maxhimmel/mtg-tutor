import type { Card, PoolCard } from "../model/card.js";
import type { StoredPick } from "../model/review.js";
import { colorLabel, describeCard, pct, statLine } from "./cardLine.js";
import { commitmentLine, situationLine } from "./situation.js";

// Pure string builders for the review feature (no SDK). Siblings to pickCoach.ts,
// reusable by a future web frontend. Unlike live coaching, review asks for a
// structured verdict (context-best + divergence lesson + narrative) and frames
// the whole draft with archetype/signal bookends.

function summarizePool(pool: readonly PoolCard[]): string {
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
      const marks = [
        c.name === pick.picked.name ? "YOU TOOK THIS" : "",
        c.name === pick.bestName ? "raw-power best" : "",
      ].filter(Boolean);
      const head = marks.length ? `${describeCard(c)}  [${marks.join(", ")}]` : describeCard(c);
      return `  - ${head}\n    ${statLine(c)}`;
    })
    .join("\n");
}

// Context for a single reviewed pick. The player's pool is what they had BEFORE
// this pick, so "context-best" is judged against their commitments at the time.
//
// `benched` is what they had set aside BY this pick, which is the same split the
// live coach gets -- a review that counted cards the player had already given up
// on would judge the pick against a deck they were not building.
export function buildReviewContext(
  pick: StoredPick,
  poolBefore: readonly PoolCard[],
  benched: readonly PoolCard[] = [],
): string {
  return [
    situationLine(pick.packNo, pick.pickNo, pick.pack.length),
    commitmentLine(poolBefore, pick.picked),
    "",
    `Pool before this pick (${poolBefore.length} cards):`,
    summarizePool(poolBefore),
    "",
    benched.length > 0
      ? `Sideboard by this point (${benched.length} cards) — drafted, then set aside. The ` +
        `player was NOT building with these, so do not count them toward their colors or ` +
        `their curve:\n${summarizePool(benched)}\n`
      : null,
    `They took: ${describeCard(pick.picked)}`,
    `  ${statLine(pick.picked)}`,
    "",
    `The raw-power best (highest 17Lands win rate available): ${pick.bestName}.`,
    "",
    "Full pack, strongest-first:",
    listPack(pick),
    "",
    "Judge the CONTEXT-BEST pick — the card that best serves this player's deck given",
    "their pool and the signals, which may differ from the raw-power best. Then explain",
    "the divergence (or agreement) and coach the pick.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Opening + closing archetype/signal frame for the whole draft. `pool` is the
// final pool; colorPairWinRates is 17Lands archetype data keyed like "WU".
export function buildDraftFrame(
  phase: "open" | "close",
  pool: readonly PoolCard[],
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

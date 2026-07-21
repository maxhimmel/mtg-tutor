import { loadSetData, ratedCardCount } from "../src/core/data/setdata.js";
import { cardValue, DraftEngine, normalizeName } from "@mtg-tutor/core";
import { fetchCardRatings } from "../src/core/data/seventeenlands.js";

const set = process.argv[2] ?? "fdn";

const data = await loadSetData(set);
console.log(
  `Set ${data.code}: ${data.cards.length} cards, ${ratedCardCount(data)} with 17L data`,
);

// Matching diagnostic: which 17Lands names failed to match a Scryfall card?
const ratings = await fetchCardRatings(set);
const scryNames = new Set(data.cards.map((c) => normalizeName(c.name)));
const unmatched = ratings.filter((r) => (r.ever_drawn_game_count ?? 0) > 50 && !scryNames.has(normalizeName(r.name)));
console.log(`17L entries: ${ratings.length}; unmatched-with-data samples: ${unmatched.slice(0, 12).map((r) => r.name).join(" | ")}`);
console.log(
  `pools -> C:${data.pools.common.length} U:${data.pools.uncommon.length} R:${data.pools.rare.length} M:${data.pools.mythic.length}`,
);
console.log(`color pairs -> ${[...data.colorPairWinRates].map(([k, v]) => `${k}:${(v * 100).toFixed(1)}%`).join(" ")}`);

// Auto-draft: always take the highest-value card (should score ~100 each).
const engine = new DraftEngine(data);
const seen = new Set<string>();
let dupes = 0;
let sum = 0;
while (!engine.isComplete()) {
  const pack = engine.currentPack;
  const best = [...pack].sort((a, b) => cardValue(b) - cardValue(a))[0];
  const rec = engine.humanPick(best);
  sum += rec.score.score;
  const key = `${rec.picked.name}#${rec.packNo}.${rec.pickNo}`;
  if (seen.has(rec.picked.name)) dupes++;
  seen.add(rec.picked.name);
}

console.log(`\npicks: ${engine.history.length} (expected ${engine.totalPicks()})`);
console.log(`unique cards drafted: ${seen.size}, duplicate-name picks: ${dupes}`);
console.log(`avg score taking the best each time: ${(sum / engine.history.length).toFixed(1)} (expect ~100)`);
console.log(`pool size: ${engine.humanPool.length}`);

const p1p1 = engine.history[0];
console.log(`\nP1P1 pack size: ${p1p1.pack.length}, picked: ${p1p1.picked.name} (${p1p1.score.grade})`);

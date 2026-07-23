// Cross-checks a built artifact against the 17Lands card-data API, which is a
// full-population aggregate of the same underlying data our public-dataset
// sample is drawn from -- so it is an ideal oracle for "did we compute this
// right", even though the app no longer uses it at runtime.
//
//   node scripts/validate-set-stats.mjs SOS TradDraft
//
// The API is a TESTING dependency only. Runtime scoring reads our own setStats;
// this script is how we stay honest about it. Exits non-zero if agreement drops
// below the threshold, so it can guard CI or a pre-seed check.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = "mtg-tutor/0.1 (draft-trainer)";

const [setArg, formatArg] = process.argv.slice(2);
if (!setArg) {
  console.error("usage: validate-set-stats.mjs <setCode> [format]");
  process.exit(1);
}
const setCode = setArg.toLowerCase();
const format = formatArg ?? "PremierDraft";

// Below this, a metric definition is probably wrong rather than just noisy.
const MIN_SPEARMAN = 0.85;

const artifactPath = resolve(HERE, "..", "data", `${setCode}.${format}.json`);
let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch {
  console.error(`No artifact at ${artifactPath}. Run build-set-stats first.`);
  process.exit(1);
}

const res = await fetch(
  `https://www.17lands.com/api/card_data?expansion=${setCode.toUpperCase()}&event_type=${format}`,
  { headers: { "User-Agent": UA, Accept: "application/json" } },
);
if (!res.ok) {
  console.error(`17Lands API ${res.status} for ${setCode.toUpperCase()}/${format}`);
  process.exit(1);
}
const api = new Map(
  (await res.json()).data
    .filter((c) => c.ever_drawn_win_rate != null)
    .map((c) => [c.name, c.ever_drawn_win_rate]),
);

const ours = new Map(
  artifact.cards.filter((c) => c.gihWr != null).map((c) => [c.name, c.gihWr]),
);

const shared = [...ours.keys()].filter((n) => api.has(n)).sort();
if (shared.length < 20) {
  console.error(`Only ${shared.length} cards rated by both; too few to validate.`);
  process.exit(1);
}

// Spearman rank correlation: agreement on ORDERING, which is what scoring needs.
function spearman(names, a, b) {
  const rankBy = (map) => {
    const sorted = [...names].sort((x, y) => map.get(y) - map.get(x));
    return new Map(sorted.map((n, i) => [n, i]));
  };
  const ra = rankBy(a);
  const rb = rankBy(b);
  const n = names.length;
  let sum = 0;
  for (const nm of names) sum += (ra.get(nm) - rb.get(nm)) ** 2;
  return 1 - (6 * sum) / (n * (n * n - 1));
}
const rho = spearman(shared, ours, api);

const deltas = shared.map((n) => ours.get(n) - api.get(n)).sort((x, y) => x - y);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanDelta = mean(deltas);

// Top-10 agreement: how many of the API's best 10 are in ours.
const topN = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const apiTop = new Set(topN(api, 10));
const ourTop = topN(ours, 10);
const topOverlap = ourTop.filter((n) => apiTop.has(n)).length;

// Cards where we most disagree, as a place to look if something is off.
const worst = shared
  .map((n) => ({ n, d: ours.get(n) - api.get(n) }))
  .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
  .slice(0, 5);

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`${setCode.toUpperCase()} / ${format} — artifact vs 17Lands API`);
console.log(`  cards rated by both: ${shared.length}`);
console.log(`  Spearman (ordering): ${rho.toFixed(4)}  [floor ${MIN_SPEARMAN}]`);
console.log(`  top-10 overlap:      ${topOverlap}/10`);
console.log(`  mean WR delta:       ${(meanDelta * 100 >= 0 ? "+" : "") + (meanDelta * 100).toFixed(2)}pts (ours vs API; our sample runs hot)`);
console.log(`  delta spread:        ${pct(deltas[0])} .. ${pct(deltas[deltas.length - 1])}`);
console.log(`  largest disagreements:`);
for (const { n, d } of worst) console.log(`    ${(d >= 0 ? "+" : "") + pct(d)}  ${n}`);

if (rho < MIN_SPEARMAN) {
  console.error(`\nFAIL: ordering correlation ${rho.toFixed(4)} below ${MIN_SPEARMAN}.`);
  process.exit(1);
}
console.log(`\nOK: our numbers track the API within tolerance.`);

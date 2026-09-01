// How far apart real drafters are, which is the prior the drafter fit assumes.
//
//   pnpm measure-tau [--sets fdn,dsk,...] [--format TradDraft] [--pod table3]
//                    [--per-mille 1000] [--json out.json]
//
// WHAT IS BEING MEASURED
//
// `dialStep` shrinks a drafter toward the pod by `tau`, and every interval and
// every draft count `fit-drafter` reports moves with it. Phase 0 ran at 0.35
// because a number was needed, and 0.35 came from nowhere.
//
// `tau` is the standard deviation of theta across real drafters. The 17Lands
// draft datasets are tens of thousands of them, cached in `datasets/`, and
// `table3` was fitted on that exact population -- so this is not a guess that
// needs validating, it is a quantity the data already contains.
//
// AND THE POPULATION IS ITS OWN SECOND KNOWN ANSWER
//
// Because `table3` was fitted on these drafters, their POOLED theta is 1 by
// construction. So this prints it, unshrunk, before it prints anything else. A
// pooled theta that is not 1 does not mean drafters are unusual -- it means
// `dialPicksFrom` and `fit-bot-policy`'s own walk disagree about the same rows,
// which is the failure that would otherwise reach a player's screen as a
// confident number. `fit-drafter` checks the estimator against simulated
// drafters; this checks the row walk against real ones.
//
// A CAVEAT THAT DOES NOT GO AWAY
//
// These drafters sat at tables of real humans. The app's players sit at tables
// of pods, and `bench-packs` measures the difference: mean absolute survival
// error against a real wheel runs 0.27-0.41 across sets. `openness` is computed
// over packs somebody else passed, so its distribution is not identical in the
// two settings and a tau measured here is being carried across that gap. It is
// the best available number by a wide margin and it is not a perfect one.

import { ConvexHttpClient } from "convex/browser";
import { writeFileSync } from "node:fs";
import {
  DIAL_BUNDLES,
  FITTED_POLICIES,
  dialCurvature,
  dialPicksFrom,
  dialStep,
  drafterFromCurvature,
  fitTau,
  marginalGain,
  poolCurvature,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const ALL_SETS =
  "blb,dft,dmu,dsk,ecl,eoe,fdn,ktk,lci,mh3,mkm,mom,neo,otj,snc,sos,tdm,woe".split(",");

const setCodes = flag("sets", ALL_SETS.join(",")).split(",").filter(Boolean);
const format = flag("format", "TradDraft");
const pod = flag("pod", "table3");
// Per mille of drafters kept, spread evenly through each file rather than taken
// from the front -- the same reason `fit-bot-policy` samples this way. A prefix
// of the file is a slice of when the drafts were played.
const perMille = Number(flag("per-mille", 1000));
const jsonOut = flag("json");
const log = (...a) => console.error(...a);

const baseline = FITTED_POLICIES[pod];
if (!baseline) {
  throw new Error(`no such pod: ${pod}. One of ${Object.keys(FITTED_POLICIES).join(", ")}.`);
}

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const ids = DIAL_BUNDLES.map((b) => b.id);
const pad = (s, w) => String(s).padEnd(w);
const num = (n, places = 3) => (n < 0 ? "" : " ") + n.toFixed(places);

const perSet = [];
const everyone = [];
const trophies = [];

for (const setCode of setCodes) {
  const cache = await draftPicks({ client, api, setCode, format, log });
  const curvatures = [];
  let kept = 0;

  for (const draft of cache.drafts) {
    if ((draft.index * perMille) % 1000 >= perMille) continue;
    kept++;
    // In pack-and-pick order, which `dialPicksFrom` needs and the cache does not
    // promise -- it hands rows back in file order. Same sort `walkDraft` does,
    // and for the same reason: `draftProgress` and the memory both read the
    // sequence, so an unsorted draft is a drafter with a scrambled memory.
    const rows = cache
      .rows(draft)
      .sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
    const curvature = dialCurvature(dialPicksFrom(rows, baseline));
    if (curvature.picks === 0) continue;
    curvatures.push(curvature);
    everyone.push(curvature);
    if (draft.wins === 3) trophies.push(curvature);
  }

  const pooled = poolCurvature(curvatures);
  // Effectively unshrunk: over this many picks the prior is a rounding error,
  // and this is the line that says whether the walk agrees with the fit.
  const population = dialStep(pooled, 1000);
  const fit = fitTau(curvatures);

  perSet.push({
    setCode,
    drafters: curvatures.length,
    kept,
    picks: pooled.picks,
    population: population.theta,
    populationSe: population.se,
    tau: fit.tau,
  });

  log(
    `  ${setCode}: ${curvatures.length.toLocaleString()} drafters, ` +
      `${pooled.picks.toLocaleString()} picks, tau ${fit.tau.toFixed(3)}`,
  );
}

// ------------------------------------------------------------------- report

console.log("");
console.log("IS THE POPULATION WHERE THE POD SAYS IT IS");
console.log(`pooled theta per set, unshrunk, as "value+-1.96se". ${pod} was fitted`);
console.log("on these drafters, so a well-determined dial has to come back at 1.");
console.log("anything else is the row walk disagreeing with the fit rather than a");
console.log("fact about drafters -- and a dial whose interval is wider than 1 is");
console.log("saying the pooled solve cannot see it either, which is what `rare`");
console.log("and `removal` do at any sample size.");
console.log("");
const band = (t, se) => `${num(t, 2)}+-${(1.96 * se).toFixed(2)}`;
console.log(`  ${pad("set", 6)} ${pad("drafters", 9)} ${ids.map((i) => pad(i, 13)).join(" ")}`);
for (const s of perSet) {
  console.log(
    `  ${pad(s.setCode, 6)} ${pad(s.drafters.toLocaleString(), 9)} ` +
      s.population.map((t, b) => pad(band(t, s.populationSe[b]), 13)).join(" "),
  );
}

const pooledAll = poolCurvature(everyone);
const populationAll = dialStep(pooledAll, 1000);
console.log("");
console.log(
  `  ${pad("ALL", 6)} ${pad(everyone.length.toLocaleString(), 9)} ` +
    populationAll.theta.map((t, b) => pad(band(t, populationAll.se[b]), 13)).join(" "),
);

console.log("");
console.log("HOW FAR APART DRAFTERS ARE");
console.log("tau maximising the marginal likelihood over each population.");
console.log("");
console.log(`  ${pad("population", 20)} ${pad("drafters", 10)} tau`);
for (const s of perSet) {
  console.log(`  ${pad(s.setCode, 20)} ${pad(s.drafters.toLocaleString(), 10)} ${s.tau.toFixed(3)}`);
}

const all = fitTau(everyone);
const trophy = trophies.length > 0 ? fitTau(trophies) : null;
console.log("");
console.log(
  `  ${pad("every drafter", 20)} ${pad(all.drafters.toLocaleString(), 10)} ${all.tau.toFixed(3)}`,
);
if (trophy) {
  console.log(
    `  ${pad("3-0 drafters", 20)} ${pad(trophy.drafters.toLocaleString(), 10)} ` +
      trophy.tau.toFixed(3),
  );
}

// The shape of the objective around the answer, because a flat maximum is a tau
// that was not really measured and the point estimate would not say so.
console.log("");
console.log("AND HOW SHARPLY, over every drafter -- a flat curve here is a tau");
console.log("that the data did not really choose.");
console.log("");
const best = everyone.reduce((sum, c) => sum + marginalGain(c, all.tau), 0);
for (const tau of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 1.0]) {
  const gain = everyone.reduce((sum, c) => sum + marginalGain(c, tau), 0);
  const loss = best - gain;
  console.log(`  tau ${pad(tau.toFixed(2), 6)} ${pad((-loss).toFixed(0), 10)} below the best`);
}

// What one real drafter looks like at the measured tau, which is the thing a
// panel would be printing. Reported as a spread rather than a mean: the mean is
// 1 by construction and says nothing about whether anybody is distinguishable.
console.log("");
console.log("WHAT ONE REAL DRAFTER LOOKS LIKE AT THE MEASURED TAU");
console.log("share of drafters whose relative dial clears 1 at 95%, over one");
console.log("draft -- which is what a person has after their first.");
console.log("");
const called = new Array(DIAL_BUNDLES.length).fill(0);
let sharpUnder = 0;
for (const c of everyone) {
  const fit = drafterFromCurvature(c, all.tau);
  for (let b = 0; b < DIAL_BUNDLES.length; b++) {
    if (Math.abs(fit.relative[b] - 1) > 1.96 * fit.relativeSe[b]) called[b]++;
  }
  if (fit.sharpness < 1) sharpUnder++;
}
console.log(`  ${ids.map((i) => pad(i, 8)).join(" ")}`);
console.log(called.map((c) => pad(`${((c / everyone.length) * 100).toFixed(0)}%`, 8)).join(" "));
console.log("");
console.log(
  `  ${((sharpUnder / everyone.length) * 100).toFixed(0)}% of drafters pick less sharply than the pod`,
);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        pod,
        format,
        perMille,
        perSet,
        all: { tau: all.tau, drafters: all.drafters, population: populationAll.theta },
        trophy: trophy ? { tau: trophy.tau, drafters: trophy.drafters } : null,
      },
      null,
      2,
    ),
  );
  log(`wrote ${jsonOut}`);
}

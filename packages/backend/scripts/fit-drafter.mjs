// Can this thing measure a drafter at all? Asked where the answer is known.
//
//   pnpm fit-drafter [--set fdn] [--format TradDraft] [--pod table3]
//                    [--drafters 100] [--drafts 1,3,5,10] [--tau 0.35]
//                    [--seed 1] [--json out.json]
//
// WHY THIS RUNS ON BOTS AND NOT ON PEOPLE
//
// A per-drafter fit will always return six numbers. Nothing about getting an
// answer back says the answer means anything, and there is no way to tell from a
// real player's readout -- their true dials are not written down anywhere, so
// every estimate looks equally plausible and a completely broken estimator would
// produce a confident, readable, wrong panel that nobody could falsify.
//
// A pod's dials ARE written down. `table3` is theta = 1 by definition, and
// `dialledWeights` deals a drafter at any other theta using the app's own
// scorer. So this simulates drafters whose answers are known, hands their picks
// to the estimator, and reports what came back. Everything the feature would
// claim about a person is claimed here first about somebody whose truth is on
// the previous line.
//
// WHAT IT IS FOR, IN ORDER
//
//   1. WHICH DIALS EXIST. A bundle a pack cannot move is not a weak measurement,
//      it is no measurement, and it reads on screen exactly like "you are
//      average at this". `bundleSpread` prices every bundle against real packs
//      before any of them reaches a person.
//
//   2. HOW OFTEN IT CRIES WOLF. The pod itself is in the subject list, at
//      theta = 1. Every dial this estimator calls different on that drafter is a
//      false positive, and the rate has to be read before any true positive is
//      believed.
//
//   3. HOW MANY DRAFTS. The empty state is "N more drafts" and N has to be a
//      number rather than a guess: the draft count at which a drafter who really
//      is different stops overlapping the pod.
//
//   4. WHETHER ONE NEWTON STEP IS ENOUGH. If it is, a draft's whole contribution
//      is twenty-seven numbers and nothing re-reads a pick row. If it is not,
//      the storage design changes, and it is much cheaper to learn that here
//      than after a schema.
//
//   5. WHETHER THE SHARK AXIS IS REPRESENTABLE. `sharks3` differs from `table3`
//      on essentially one coefficient, and it is not obvious a BUNDLED model can
//      express that difference -- `value` moves one way and `valueOpen` the
//      other, and they share a bundle. If the estimator cannot tell a shark from
//      the field, the most interesting thing this feature could say is not
//      sayable, and that is worth knowing before it is promised.
//
// NO DEPLOYMENT. Cards come off `datasets/` and the committed artifact, the same
// way `bench-packs` gets them, so this is repeatable and needs nothing running.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BotMemory,
  DIAL_BUNDLES,
  DraftEngine,
  FITTED_POLICIES,
  NEUTRAL_DIALS,
  botRng,
  buildSetData,
  bundleSpread,
  dealDraft,
  dialCurvature,
  dialPicksFrom,
  dialStep,
  dialledWeights,
  draftProgress,
  fitDials,
  fitSharpness,
  poolCurvature,
  policyScore,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { engineCards } from "./lib/engineCards.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const pod = flag("pod", "table3");
const drafters = Number(flag("drafters", 100));
const draftCounts = flag("drafts", "1,3,5,10").split(",").map(Number);
// The prior width. NOT measured yet -- it is a claim about how far real drafters
// sit from the field, which needs a pass over the 17Lands drafts. Until then it
// is stated on the command line and printed above every number it shaped, so no
// reading here can be mistaken for one that did not depend on it.
const tau = Number(flag("tau", 0.35));
const seed0 = Number(flag("seed", 1));
const jsonOut = flag("json");
const log = (...a) => console.error(...a);

const baseline = FITTED_POLICIES[pod];
if (!baseline) {
  throw new Error(`no such pod: ${pod}. One of ${Object.keys(FITTED_POLICIES).join(", ")}.`);
}

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;
const cards = await engineCards(client, api, setCode, format, log);
const artifact = JSON.parse(
  readFileSync(resolve(HERE, "..", "data", `${setCode}.${format}.json`), "utf8"),
);
const set = buildSetData(setCode, cards, artifact.colorWinRates, artifact.packComposition);

const maxDrafts = Math.max(...draftCounts);
log(
  `${setCode}/${format}: ${cards.length} cards, against ${pod}, tau ${tau}, ` +
    `${drafters} drafters x ${maxDrafts} drafts each`,
);

// ------------------------------------------------------------------ simulation

// mulberry32 again rather than Math.random, so a run is a run: every number
// below is reproducible from --seed, which is what makes a surprising recovery
// figure worth chasing instead of worth re-running.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The one piece of the engine's pick loop this file restates, and it restates
// nothing else: the policy comes from core and so does the memory. Gumbel-max IS
// softmax sampling, so a drafter dealt this way is drawn from exactly the
// likelihood the estimator assumes -- which is the point. A drafter generated
// some other way would have the estimator measuring the mismatch as well.
const gumbel = (u) => -Math.log(-Math.log(Math.min(1 - 1e-12, Math.max(1e-12, u))));

/**
 * One draft, seat 0 played by `weights` and the other seven by the pod.
 *
 * Returns rows in the shape a stored draft has them, so the harness and the
 * eventual reader of `draftPicks` hand `dialPicksFrom` the same thing.
 */
function simulateWithWeights(weights, seed) {
  const engine = new DraftEngine(dealDraft(set, seed), botRng(seed), pod);
  const noise = rng((seed ^ 0x5bf03635) >>> 0);
  const memory = new BotMemory();
  const rows = [];

  while (!engine.isComplete()) {
    const pack = engine.currentPack;
    if (pack.length === 0) break;
    const progress = draftProgress(rows.length, engine.totalPicks());

    let best = pack[0];
    let bestScore = -Infinity;
    for (const card of pack) {
      const s = policyScore(card, memory, progress, weights, pack.length) + gumbel(noise());
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }

    rows.push({ pack: [...pack], picked: best });
    // After the scoring loop, never before it, exactly as `Bot.pick` does. The
    // drafter's own memory is separate from the engine's seats: the engine keeps
    // no BotMemory for seat 0, which is precisely the gap this fills.
    memory.see(pack);
    memory.take(best);
    engine.humanPick(best);
  }

  return rows;
}

// A dialled drafter is an ordinary policy with rescaled weights, so there is one
// simulator here rather than two. See `dialledWeights`.
const simulateDraft = (theta, seed) => simulateWithWeights(dialledWeights(theta, baseline), seed);

const picksOf = (rows) => dialPicksFrom(rows, baseline);

// --------------------------------------------------------------- the subjects

// Each drafter exaggerates ONE dial, plus the pod as the null and two drafters
// who differ only in how decisive they are.
//
// One axis at a time is the hardest case for a correlated model and the easiest
// to read: if `power` comes back high whenever `table` was the one that moved,
// the two do not separate and no panel should draw them apart. The sizes are
// deliberately large -- 1.5x and 0.5x -- because this run asks whether an effect
// is VISIBLE at all, and one the estimator cannot see at 1.5x it will not see at
// 1.1x.
const dialAt = (id, value) =>
  NEUTRAL_DIALS.map((n, b) => (DIAL_BUNDLES[b].id === id ? value : n));

const SUBJECTS = [
  { name: "the pod itself", theta: [...NEUTRAL_DIALS], moved: null },
  ...DIAL_BUNDLES.flatMap((bundle) => [
    { name: `${bundle.id} x1.5`, theta: dialAt(bundle.id, 1.5), moved: bundle.id },
    { name: `${bundle.id} x0.5`, theta: dialAt(bundle.id, 0.5), moved: bundle.id },
  ]),
  { name: "half as decisive", theta: NEUTRAL_DIALS.map(() => 0.5), moved: "*" },
  { name: "twice as decisive", theta: NEUTRAL_DIALS.map(() => 2), moved: "*" },
];

const pad = (s, w) => String(s).padEnd(w);
const num = (n, places = 2) => (n < 0 ? "" : " ") + n.toFixed(places);

// ------------------------------------------- 1. which dials a pack can move

log("");
log("simulating packs to price the bundles...");

const spreadPicks = [];
for (let d = 0; d < 30; d++) {
  spreadPicks.push(...picksOf(simulateDraft(NEUTRAL_DIALS, seed0 + 90000 + d)));
}
const spread = bundleSpread(spreadPicks.map((p) => p.bundles));

console.log("");
console.log("HOW MUCH EACH BUNDLE MOVES A PACK");
console.log("mean within-pack sd of the bundle's contribution, in logit units.");
console.log("a bundle that cannot move a pack cannot be dialled, and reads on");
console.log("screen exactly like a drafter who is average at it.");
console.log("");
for (let b = 0; b < DIAL_BUNDLES.length; b++) {
  const bar = "#".repeat(Math.max(0, Math.round(spread[b] * 8)));
  console.log(`  ${pad(DIAL_BUNDLES[b].id, 9)} ${spread[b].toFixed(3)}  ${bar}`);
}

// ------------------------------------------------- 2-4. recovery, by subject

/** Per drafter: one curvature per draft, plus the raw picks for the full fit. */
function drafterCurvatures(theta, drafterIndex) {
  const curvatures = [];
  const picks = [];
  for (let d = 0; d < maxDrafts; d++) {
    const seed = (seed0 + drafterIndex * 1000 + d) >>> 0;
    const rows = simulateDraft(theta, seed);
    const p = picksOf(rows);
    picks.push(p);
    curvatures.push(dialCurvature(p));
  }
  return { curvatures, picks };
}

const results = [];
const stepGap = [];

for (const subject of SUBJECTS) {
  log(`  ${subject.name}...`);
  const byCount = new Map(
    draftCounts.map((c) => [
      c,
      {
        theta: new Array(DIAL_BUNDLES.length).fill(0),
        se: new Array(DIAL_BUNDLES.length).fill(0),
        called: new Array(DIAL_BUNDLES.length).fill(0),
        covered: new Array(DIAL_BUNDLES.length).fill(0),
        sharpness: 0,
        sharpnessSe: 0,
      },
    ]),
  );

  for (let i = 0; i < drafters; i++) {
    const { curvatures, picks } = drafterCurvatures(subject.theta, i);

    for (const count of draftCounts) {
      const fit = dialStep(poolCurvature(curvatures.slice(0, count)), tau);
      const bucket = byCount.get(count);
      for (let b = 0; b < DIAL_BUNDLES.length; b++) {
        bucket.theta[b] += fit.theta[b];
        bucket.se[b] += fit.se[b];
        // Different from the pod, at the width the panel would draw.
        if (Math.abs(fit.theta[b] - 1) > 1.96 * fit.se[b]) bucket.called[b]++;
        // And whether the truth is inside that interval, which is the property
        // an interval is FOR -- a tight one in the wrong place is worse than a
        // wide one.
        if (Math.abs(fit.theta[b] - subject.theta[b]) <= 1.96 * fit.se[b]) bucket.covered[b]++;
      }
      const sharp = fitSharpness(picks.slice(0, count).flat(), tau);
      bucket.sharpness += sharp.theta[0];
      bucket.sharpnessSe += sharp.se[0];
    }

    // The step against the iterated fit, on the largest window, for a subset --
    // this is the expensive comparison and it only has to be measured, not
    // averaged to three places.
    if (i < 20) {
      const all = picks.flat();
      const step = dialStep(poolCurvature(curvatures), tau);
      const full = fitDials(all, tau);
      for (let b = 0; b < DIAL_BUNDLES.length; b++) {
        stepGap.push(Math.abs(step.theta[b] - full.theta[b]));
      }
    }
  }

  results.push({
    subject: subject.name,
    truth: subject.theta,
    moved: subject.moved,
    byCount: Object.fromEntries(
      [...byCount].map(([count, b]) => [
        count,
        {
          theta: b.theta.map((t) => t / drafters),
          se: b.se.map((s) => s / drafters),
          called: b.called.map((c) => c / drafters),
          covered: b.covered.map((c) => c / drafters),
          sharpness: b.sharpness / drafters,
          sharpnessSe: b.sharpnessSe / drafters,
        },
      ]),
    ),
  });
}

// ------------------------------------------------------------------- report

const ids = DIAL_BUNDLES.map((b) => b.id);

console.log("");
console.log("WHAT THE ESTIMATOR SAYS ABOUT DRAFTERS WHOSE ANSWER IS KNOWN");
console.log(`mean fitted theta over ${drafters} drafters, tau ${tau}. truth in brackets.`);
console.log("");
console.log(`  ${pad("subject", 20)} ${pad("n", 3)} ${ids.map((i) => pad(i, 8)).join(" ")}  sharp`);

for (const r of results) {
  for (const count of draftCounts) {
    const b = r.byCount[count];
    const row = b.theta.map((t, i) => pad(num(t), 8)).join(" ");
    console.log(
      `  ${pad(count === draftCounts[0] ? r.subject : "", 20)} ${pad(count, 3)} ${row}  ${num(b.sharpness)}`,
    );
  }
  console.log(`  ${pad("truth", 20)} ${pad("", 3)} ${r.truth.map((t) => pad(num(t), 8)).join(" ")}`);
  console.log("");
}

console.log("HOW OFTEN A DIAL IS CALLED DIFFERENT FROM THE POD");
console.log("share of drafters whose 95% interval excludes 1. on the pod itself");
console.log("this is the false-positive rate and nothing else here means");
console.log("anything until it is small.");
console.log("");
console.log(`  ${pad("subject", 20)} ${pad("n", 3)} ${ids.map((i) => pad(i, 8)).join(" ")}`);
for (const r of results) {
  for (const count of draftCounts) {
    const b = r.byCount[count];
    console.log(
      `  ${pad(count === draftCounts[0] ? r.subject : "", 20)} ${pad(count, 3)} ` +
        b.called.map((c) => pad(`${(c * 100).toFixed(0)}%`, 8)).join(" "),
    );
  }
}

console.log("");
console.log("HOW OFTEN THE INTERVAL CONTAINS THE TRUTH");
console.log("should sit near 95%. below it the intervals are too tight to print;");
console.log("far above it the shrinkage is paying for its safety in width.");
console.log("");
console.log(`  ${pad("subject", 20)} ${pad("n", 3)} ${ids.map((i) => pad(i, 8)).join(" ")}`);
for (const r of results) {
  for (const count of draftCounts) {
    const b = r.byCount[count];
    console.log(
      `  ${pad(count === draftCounts[0] ? r.subject : "", 20)} ${pad(count, 3)} ` +
        b.covered.map((c) => pad(`${(c * 100).toFixed(0)}%`, 8)).join(" "),
    );
  }
}

stepGap.sort((a, b) => a - b);
console.log("");
console.log("ONE NEWTON STEP AGAINST THE ITERATED FIT");
console.log(`|step - full| over ${stepGap.length} dials at ${maxDrafts} drafts:`);
console.log(
  `  median ${stepGap[Math.floor(stepGap.length / 2)].toFixed(4)}   ` +
    `p95 ${stepGap[Math.floor(stepGap.length * 0.95)].toFixed(4)}   ` +
    `worst ${stepGap[stepGap.length - 1].toFixed(4)}`,
);
console.log("");
console.log("if the worst is small beside the intervals above, a draft can be");
console.log("stored as its curvature -- twenty-seven numbers -- and no read ever");
console.log("touches a pick row again.");

// -------------------------------------------------- 5. is a shark expressible

// Not a dial vector: `sharks3` is a different fitted policy, and whether the
// bundled model can express the difference at all is the question. If it cannot,
// the one thing this feature could say that a player would most want to hear --
// where you sit against a drafter who goes 3-0 -- is not sayable.
const sharkPod = pod.replace("table", "sharks");
if (FITTED_POLICIES[sharkPod]) {
  log("");
  log(`simulating drafters playing ${sharkPod} against ${pod}...`);

  const sharkTheta = new Array(DIAL_BUNDLES.length).fill(0);
  const sharkCalled = new Array(DIAL_BUNDLES.length).fill(0);
  const count = maxDrafts;

  for (let i = 0; i < drafters; i++) {
    const curvatures = [];
    for (let d = 0; d < count; d++) {
      const seed = (seed0 + 500000 + i * 1000 + d) >>> 0;
      const rows = simulateWithWeights(FITTED_POLICIES[sharkPod], seed);
      curvatures.push(dialCurvature(picksOf(rows)));
    }
    const fit = dialStep(poolCurvature(curvatures), tau);
    for (let b = 0; b < DIAL_BUNDLES.length; b++) {
      sharkTheta[b] += fit.theta[b] / drafters;
      if (Math.abs(fit.theta[b] - 1) > 1.96 * fit.se[b]) sharkCalled[b] += 1 / drafters;
    }
  }

  console.log("");
  console.log(`A ${sharkPod.toUpperCase()} DRAFTER, MEASURED AGAINST ${pod.toUpperCase()}`);
  console.log(`at ${count} drafts. the two policies differ on essentially one`);
  console.log("coefficient, and the bundles may or may not be able to hold it.");
  console.log("");
  console.log(`  ${pad("", 12)} ${ids.map((i) => pad(i, 8)).join(" ")}`);
  console.log(`  ${pad("theta", 12)} ${sharkTheta.map((t) => pad(num(t), 8)).join(" ")}`);
  console.log(
    `  ${pad("called", 12)} ` +
      sharkCalled.map((c) => pad(`${(c * 100).toFixed(0)}%`, 8)).join(" "),
  );
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ setCode, format, pod, tau, drafters, draftCounts, spread, results }, null, 2),
  );
  log(`wrote ${jsonOut}`);
}

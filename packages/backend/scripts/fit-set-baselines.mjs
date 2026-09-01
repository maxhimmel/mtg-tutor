// A set's own zero, fitted, and the held-out check that it is worth having.
//
//   pnpm fit-set-baselines [--sets ...] [--format TradDraft] [--pod table3]
//                          [--players 4000] [--drafts 1,2,3,5,10] [--emit]
//
// WHAT THIS IS FOR
//
// `measure-tau` turned up that the average drafter of one set sits a long way
// from `table3` -- `power` at 0.30 in ktk and 1.46 in blb -- and that the spread
// of those offsets across sets is 0.28, 0.14, 0.07 and 0.11 on the four live
// dials, against a between-drafter tau of 0.229. A player measured against the
// pod therefore carries a fact about the SET they drafted, at up to the size of
// the thing being read.
//
// The correction is one vector per set. What this script has to establish is
// whether it works, and the only way to ask that is with a player whose truth is
// known -- so it builds one out of real drafters.
//
// THE SYNTHETIC PLAYER, AND WHY IT IS THE RIGHT NULL
//
// A player here is k real drafters, each from a DIFFERENT set, pooled as though
// they were one person's k drafts. That is exactly the app's situation, and
// their truth is written down: a randomly chosen drafter is average for their
// set by construction, so a player made of them is average, and a correct
// estimator should call them different about 5% of the time. Anything above
// that is the set effect surviving.
//
// The same players are also built from ONE set, which is the case where a global
// baseline's error cannot cancel at all and is what somebody grinding a single
// format looks like.
//
// FITTED ON ONE HALF AND CHECKED ON THE OTHER
//
// The baselines and the players must not come from the same drafters. Measured
// on the drafters it was fitted to, a baseline removes their average by
// construction and this script would report a triumph it had arranged. Trap #6.

import { ConvexHttpClient } from "convex/browser";
import {
  DIAL_BUNDLES,
  DRAFTER_TAU,
  FITTED_POLICIES,
  addCurvature,
  dialCurvature,
  dialPicksFrom,
  dialStep,
  drafterFromCurvature,
  emptyCurvature,
  poolCurvature,
  rebaseCurvature,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const ALL_SETS =
  "blb,dft,dmu,dsk,ecl,eoe,fdn,ktk,lci,mh3,mkm,mom,neo,otj,snc,sos,tdm,woe".split(",");

const setCodes = flag("sets", ALL_SETS.join(",")).split(",").filter(Boolean);
const format = flag("format", "TradDraft");
const pod = flag("pod", "table3");
const players = Number(flag("players", 4000));
const draftCounts = flag("drafts", "1,2,3,5,10").split(",").map(Number);
const tau = Number(flag("tau", DRAFTER_TAU));
const emit = has("emit");
const log = (...a) => console.error(...a);

const baseline = FITTED_POLICIES[pod];
if (!baseline) {
  throw new Error(`no such pod: ${pod}. One of ${Object.keys(FITTED_POLICIES).join(", ")}.`);
}

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const ids = DIAL_BUNDLES.map((b) => b.id);
const pad = (s, w) => String(s).padEnd(w);
const num = (n, places = 2) => (n < 0 ? "" : " ") + n.toFixed(places);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- collection

/** Per set: the half the baseline is fitted on, and the half it is checked on. */
const fitted = new Map();
const held = new Map();

for (const setCode of setCodes) {
  const cache = await draftPicks({ client, api, setCode, format, log });
  const forFit = [];
  const forCheck = [];

  for (const draft of cache.drafts) {
    const rows = cache.rows(draft).sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
    const curvature = dialCurvature(dialPicksFrom(rows, baseline));
    if (curvature.picks === 0) continue;
    // Alternating rather than a prefix: a prefix of the file is a slice of when
    // the drafts were played, and the two halves have to be the same population
    // in every way except which one fitted the baseline.
    (draft.index % 2 === 0 ? forFit : forCheck).push(curvature);
  }

  const population = dialStep(poolCurvature(forFit), 1000).theta;
  fitted.set(setCode, { population, drafters: forFit.length });
  held.set(setCode, forCheck);
  log(
    `  ${setCode}: ${forFit.length.toLocaleString()} fitted, ` +
      `${forCheck.length.toLocaleString()} held out, baseline ` +
      population.map((t) => t.toFixed(2)).join(" "),
  );
}

// ------------------------------------------------------------------- the check

/** k drafts, each a real drafter, drawn from `pool` of set codes. */
function buildPlayer(draw, codes, k) {
  let raw = emptyCurvature(DIAL_BUNDLES.length);
  let corrected = emptyCurvature(DIAL_BUNDLES.length);

  for (let i = 0; i < k; i++) {
    const setCode = codes[Math.floor(draw() * codes.length) % codes.length];
    const bucket = held.get(setCode);
    if (!bucket || bucket.length === 0) return null;
    const curvature = bucket[Math.floor(draw() * bucket.length) % bucket.length];
    raw = addCurvature(raw, curvature);
    corrected = addCurvature(corrected, rebaseCurvature(curvature, fitted.get(setCode).population));
  }

  return { raw, corrected };
}

function calledRates(k, spread) {
  const draw = rng(7001 + k * 131 + (spread ? 0 : 977));
  const rawCalled = new Array(DIAL_BUNDLES.length).fill(0);
  const fixCalled = new Array(DIAL_BUNDLES.length).fill(0);
  let built = 0;

  for (let p = 0; p < players; p++) {
    // Different sets each draft, or the same set every draft -- the two ends of
    // what a real history looks like.
    const codes = spread
      ? [...setCodes].sort(() => draw() - 0.5).slice(0, Math.max(k, 1))
      : [setCodes[Math.floor(draw() * setCodes.length) % setCodes.length]];
    const player = buildPlayer(draw, codes, k);
    if (!player) continue;
    built++;

    const before = drafterFromCurvature(player.raw, tau);
    const after = drafterFromCurvature(player.corrected, tau);
    for (let b = 0; b < DIAL_BUNDLES.length; b++) {
      if (Math.abs(before.relative[b] - 1) > 1.96 * before.relativeSe[b]) rawCalled[b]++;
      if (Math.abs(after.relative[b] - 1) > 1.96 * after.relativeSe[b]) fixCalled[b]++;
    }
  }

  return {
    built,
    raw: rawCalled.map((c) => c / built),
    corrected: fixCalled.map((c) => c / built),
  };
}

// ------------------------------------------------------------------- report

console.log("");
console.log("A PLAYER WHO IS AVERAGE, CALLED DIFFERENT ANYWAY");
console.log("each player is k real drafters pooled as one person's k drafts, all");
console.log("held out of the baselines. every one of them is average for their");
console.log("set by construction, so the honest rate is about 5% -- anything");
console.log("above that is the set showing through as if it were the person.");
console.log("");

const rows = [];
for (const spread of [true, false]) {
  console.log(spread ? "  drafts in DIFFERENT sets" : "  drafts all in ONE set");
  console.log(`  ${pad("n", 4)} ${pad("", 10)} ${ids.map((i) => pad(i, 8)).join(" ")}`);
  for (const k of draftCounts) {
    const r = calledRates(k, spread);
    rows.push({ spread, k, ...r });
    const line = (label, values) =>
      `  ${pad(k, 4)} ${pad(label, 10)} ` +
      values.map((v) => pad(`${(v * 100).toFixed(0)}%`, 8)).join(" ");
    console.log(line("against pod", r.raw));
    console.log(line("against set", r.corrected));
  }
  console.log("");
}

console.log("HOW FAR THE BASELINES SIT FROM THE POD");
console.log("");
console.log(`  ${pad("set", 6)} ${ids.map((i) => pad(i, 8)).join(" ")}`);
for (const setCode of setCodes) {
  console.log(
    `  ${pad(setCode, 6)} ` +
      fitted.get(setCode).population.map((t) => pad(num(t), 8)).join(" "),
  );
}

if (emit) {
  console.log("");
  console.log("// Paste into core. Fitted by `pnpm fit-set-baselines --emit`.");
  console.log(`export const DIAL_BASELINES: Record<string, readonly number[]> = {`);
  for (const setCode of setCodes) {
    const values = fitted.get(setCode).population.map((t) => t.toFixed(4));
    console.log(`  ${setCode}: [${values.join(", ")}],`);
  }
  console.log("};");
}

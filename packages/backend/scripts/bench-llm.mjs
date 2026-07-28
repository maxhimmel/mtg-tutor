// What one draft costs in tokens, and whether the advice survived the saving.
//
//   pnpm --filter @mtg-tutor/backend bench-llm [--set fdn] [--seed 42]
//                                              [--limit N] [--update-baseline]
//
// Drives a real draft through the real endpoints -- the same /coach stream a
// browser opens and the same review actions the walkthrough calls -- then reads
// back the usage rows that draft produced and scores the answers it collected.
//
// Two halves, and only one of them needs a model:
//
//   Tokens. Input size, call frequency and the cache split are pure functions of
//   the prompt builders and the coach gate, so they are not sampled -- every
//   pick of the fixture is measured, and the totals are exact.
//
//   Accuracy. Cannot be computed without real generations, and its metrics are
//   rates: an invented-citation rate, a divergence rate. One pick cannot
//   estimate a rate and three cannot tell 100% from 67%. That, not the token
//   side, is what sets the sample size at one full draft.
//
// The comparison is paired: --seed pins the deal and the policy below always
// takes the highest-value card, so baseline and candidate see byte-identical
// prompts and the diff is per-pick rather than between two different drafts.
//
// A full run spends ~92 model calls against whatever LLM_PROVIDER the deployment
// is set to. Baselines are stored per provider and are never comparable across
// providers: Groq reports no cache signal at all and tokenizes differently, so a
// Groq baseline is valid for output length, frequency and accuracy, and says
// nothing about what a saving is worth in money.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  COACH,
  canonicalName,
  cardNamePattern,
  cardValue,
  isDecisionPick,
  loadPrinciples,
  splitCitations,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const setCode = flag("set", "fdn");
const seed = Number(flag("seed", 42));
// Caps how many picks get coached and reviewed. For proving the harness works
// without spending a full draft -- a --limit run is NOT a valid benchmark, and
// the report says so.
const limit = Number(flag("limit", Infinity));
const minPackCards = Number(flag("min-pack-cards", COACH.minPackCards));

const url = process.env.CONVEX_URL;
const site = process.env.CONVEX_SITE_URL;
if (!url || !site) {
  throw new Error("CONVEX_URL / CONVEX_SITE_URL missing -- run `convex dev --once` first.");
}

const token = await accessToken();
const client = new ConvexHttpClient(url);
client.setAuth(token);

const principles = loadPrinciples();

// ---------------------------------------------------------------- drive a draft

const stored = await client.query(api.sets.get, { setCode });
if (!stored) throw new Error(`Set "${setCode}" is not ingested.`);

const namesInSet = stored.cards.map((c) => c.name);
const setNamePattern = cardNamePattern(namesInSet);

const sessionId = await client.mutation(api.draft.start, { setCode, seed });
console.log(`set ${setCode}, seed ${seed}, session ${sessionId}`);
if (limit !== Infinity) console.log(`--limit ${limit}: NOT a valid benchmark run\n`);

/** Streams /coach for one pick. Returns null when the gate declined it (204). */
async function coach(pickIndex) {
  const res = await fetch(`${site}/coach`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, pickIndex, minPackCards }),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`/coach returned ${res.status}: ${await res.text()}`);
  return await res.text();
}

// Always take the highest-value card, so the pick sequence is a pure function of
// the deal and two runs of the same seed send the same prompts.
const picks = [];
let state = await client.query(api.draft.state, { sessionId });

while (!state.complete) {
  const pack = state.pack;
  const picked = [...pack].sort((a, b) => cardValue(b) - cardValue(a))[0];
  const poolBefore = state.pool.map((c) => c.name);

  const result = await client.mutation(api.draft.pick, { sessionId, cardName: picked.name });
  picks.push({
    // The server's own index for this pick, rather than a count kept here --
    // it is what /coach and review.verdict key on.
    pickIndex: result.pickIndex,
    packNames: pack.map((c) => c.name),
    poolNames: [...poolBefore, picked.name],
    cardsInPack: pack.length,
    bestName: result.score.best.name,
  });

  state = { complete: result.complete, pack: result.pack, pool: result.pool };
}
console.log(`drafted ${picks.length} picks`);

// Coaching is requested pick by pick, exactly as a player's board does it.
const coached = [];
for (const pick of picks.slice(0, limit)) {
  if (!isDecisionPick(pick.cardsInPack, minPackCards)) continue;
  const text = await coach(pick.pickIndex);
  if (text !== null) coached.push({ ...pick, text });
}
console.log(`coached ${coached.length} picks`);

// Decision picks only, which is what the walkthrough and the CLI's breakdown
// ask for: there is nothing to review about a pick that had one card in it.
const verdicts = [];
for (const pick of picks.slice(0, limit)) {
  if (!isDecisionPick(pick.cardsInPack, minPackCards)) continue;
  const verdict = await client.action(api.review.verdict, {
    sessionId,
    pickIndex: pick.pickIndex,
  });
  verdicts.push({ ...pick, verdict });
}
console.log(`reviewed ${verdicts.length} picks`);

const frames = [];
for (const phase of ["open", "close"]) {
  frames.push({ phase, text: await client.action(api.review.frame, { sessionId, phase }) });
}
console.log(`framed ${frames.length} phases\n`);

// ------------------------------------------------------------------- the tokens

const usage = await client.query(api.metrics.forSession, { sessionId });
if (usage.length === 0) {
  throw new Error(
    "No usage rows for this session. Nothing recorded what these calls cost -- " +
      "the instrumentation is not working, which is the one thing this measures.",
  );
}

const sum = (rows, field) => rows.reduce((n, r) => n + (r[field] ?? 0), 0);

const byArea = {};
for (const area of ["coach", "verdict", "frame"]) {
  const rows = usage.filter((r) => r.area === area);
  if (rows.length === 0) continue;
  byArea[area] = {
    calls: rows.length,
    // The deterministic quantity. inputTokens excludes whatever was served from
    // cache, so the surface a prompt actually presents is the three summed --
    // and unlike the split between them, that total does not move between runs.
    inputSurface:
      sum(rows, "inputTokens") + sum(rows, "cacheReadTokens") + sum(rows, "cacheWriteTokens"),
    inputTokens: sum(rows, "inputTokens"),
    cacheReadTokens: sum(rows, "cacheReadTokens"),
    cacheWriteTokens: sum(rows, "cacheWriteTokens"),
    outputTokens: sum(rows, "outputTokens"),
    truncated: rows.filter((r) => r.finishReason === "length").length,
    unattributed: rows.filter((r) => !r.userId).length,
  };
}

// --------------------------------------------------------------- the accuracy

const key = (name) => canonicalName(name).toLowerCase();

/** Set cards this answer names that were neither in the pack nor in the pool. */
function offTopicNames(text, pick) {
  if (!setNamePattern) return [];
  const allowed = new Set([...pick.packNames, ...pick.poolNames].map(key));
  // Rebuilt from .source rather than the regex itself: cardNamePattern leaves
  // `g` off deliberately, and re-flagging without `u` would break its \p{L}
  // boundaries rather than fail loudly.
  const named = new Set(text.match(new RegExp(setNamePattern.source, "gu")) ?? []);
  return [...named].filter((n) => !allowed.has(key(n)));
}

let citedTotal = 0;
let inventedTotal = 0;
let densitySum = 0;
let emptyAnswers = 0;
let offTopic = 0;

// Distinct principles reached for across the WHOLE run, which density cannot
// see. Density counts citations per answer; this counts how much of the corpus
// the coach can actually use. The two come apart under the cheapest-looking
// saving there is: condense every principle to its id plus a one-liner, keeping
// all 66 ids, and ~80% of the system prompt goes away while density, invented
// rate and divergence all hold -- the model still cites [EVAL-02], it just no
// longer knows why EVAL-02 says what it does. What gives that away is the coach
// falling back on the handful of one-liners that stayed actionable and ignoring
// the rest, which is a drop here and nowhere else.
const distinctPrinciples = new Set();

for (const { text, ...pick } of coached) {
  if (text.trim() === "") emptyAnswers++;
  const { principles: cited, invented } = splitCitations(text, principles);
  citedTotal += cited.length + invented.length;
  inventedTotal += invented.length;
  densitySum += cited.length;
  for (const p of cited) distinctPrinciples.add(p.id);
  offTopic += offTopicNames(text, pick).length;
}

for (const { verdict, ...pick } of verdicts) {
  if (!verdict) continue;
  const { principles: cited, invented } = splitCitations(verdict.narrative, principles);
  citedTotal += cited.length + invented.length;
  inventedTotal += invented.length;
  for (const p of cited) distinctPrinciples.add(p.id);
  offTopic += offTopicNames(verdict.narrative, pick).length;
}

const answered = verdicts.filter((v) => v.verdict);
// Refused server-side when the model named a card that was not in the pack, so
// this is the hallucination rate on the one field that cannot be defaulted.
const refusedVerdicts = verdicts.length - answered.length;
const diverged = answered.filter((v) => key(v.verdict.contextBestName) !== key(v.bestName));

const accuracy = {
  coachedCalls: coached.length,
  emptyAnswers,
  offTopicCardNames: offTopic,
  citationsTotal: citedTotal,
  inventedCitations: inventedTotal,
  inventedCitationRate: citedTotal === 0 ? 0 : inventedTotal / citedTotal,
  citationDensity: coached.length === 0 ? 0 : densitySum / coached.length,
  distinctPrinciples: distinctPrinciples.size,
  corpusSize: principles.principles.length,
  verdictsAsked: verdicts.length,
  refusedVerdicts,
  divergenceRate: answered.length === 0 ? 0 : diverged.length / answered.length,
  emptyFrames: frames.filter((f) => !f.text || f.text.trim() === "").length,
};

// ----------------------------------------------------------------- the report

const provider = usage[0].provider;
const model = usage[0].model;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

console.log(`provider ${provider}, model ${model}\n`);
console.log("area     calls   input  cache_r  cache_w   output   surface");
for (const [area, a] of Object.entries(byArea)) {
  console.log(
    `${area.padEnd(8)} ${String(a.calls).padStart(4)} ${String(a.inputTokens).padStart(7)} ` +
      `${String(a.cacheReadTokens).padStart(8)} ${String(a.cacheWriteTokens).padStart(8)} ` +
      `${String(a.outputTokens).padStart(8)} ${String(a.inputSurface).padStart(9)}`,
  );
}

const totalSurface = Object.values(byArea).reduce((n, a) => n + a.inputSurface, 0);
const totalOutput = Object.values(byArea).reduce((n, a) => n + a.outputTokens, 0);
console.log(`\ntotal input surface ${totalSurface}, output ${totalOutput}`);
if (totalSurface > 0 && Object.values(byArea).every((a) => a.cacheReadTokens === 0)) {
  console.log("no cache signal from this provider -- these totals cannot price anything");
}

console.log("\naccuracy");
console.log(`  empty answers          ${accuracy.emptyAnswers} / ${accuracy.coachedCalls}`);
console.log(`  off-topic card names   ${accuracy.offTopicCardNames}`);
console.log(
  `  invented citations     ${accuracy.inventedCitations} / ${accuracy.citationsTotal}` +
    ` (${pct(accuracy.inventedCitationRate)})`,
);
console.log(`  citations per answer   ${accuracy.citationDensity.toFixed(2)}`);
console.log(
  `  distinct principles    ${accuracy.distinctPrinciples} of ${accuracy.corpusSize}`,
);
console.log(`  refused verdicts       ${accuracy.refusedVerdicts} / ${accuracy.verdictsAsked}`);
console.log(`  context-best diverged  ${pct(accuracy.divergenceRate)}`);
console.log(`  empty frames           ${accuracy.emptyFrames}`);

const truncated = Object.values(byArea).reduce((n, a) => n + a.truncated, 0);
const unattributed = Object.values(byArea).reduce((n, a) => n + a.unattributed, 0);
console.log(`  truncated answers      ${truncated}`);
console.log(`  rows missing a userId  ${unattributed}`);

// ------------------------------------------------------------------- baselines

const dir = new URL("../bench/", import.meta.url);
const file = new URL(`baseline.${setCode}.${seed}.${provider}.json`, dir);
const record = { setCode, seed, provider, model, minPackCards, areas: byArea, accuracy };

if (limit !== Infinity) {
  console.log("\n--limit run: baseline neither written nor compared.");
  process.exit(0);
}

if (has("update-baseline")) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nwrote baseline ${file.pathname.split("/").pop()}`);
  process.exit(0);
}

if (!existsSync(file)) {
  console.log("\nNo baseline for this (set, seed, provider). Re-run with --update-baseline.");
  process.exit(0);
}

const base = JSON.parse(readFileSync(file, "utf8"));
const failures = [];
const notes = [];

// Deterministic, so any drift is real and worth the exact comparison. A band
// here would only hide the thing this exists to catch.
for (const [area, a] of Object.entries(byArea)) {
  const b = base.areas[area];
  if (!b) {
    failures.push(`${area}: no baseline entry`);
    continue;
  }
  if (a.calls !== b.calls) failures.push(`${area}: ${b.calls} calls -> ${a.calls}`);
  if (a.inputSurface !== b.inputSurface) {
    const delta = a.inputSurface - b.inputSurface;
    failures.push(
      `${area}: input surface ${b.inputSurface} -> ${a.inputSurface} (${delta > 0 ? "+" : ""}${delta})`,
    );
  }
  // Model-dependent, so a band rather than equality.
  if (b.outputTokens > 0 && Math.abs(a.outputTokens - b.outputTokens) / b.outputTokens > 0.2) {
    failures.push(`${area}: output ${b.outputTokens} -> ${a.outputTokens} (>20%)`);
  }
  // Depends on how fast the calls happened to land inside the cache TTL, not on
  // anything in the code, so it is reported and never asserted.
  if (a.cacheWriteTokens !== b.cacheWriteTokens) {
    notes.push(`${area}: cache writes ${b.cacheWriteTokens} -> ${a.cacheWriteTokens}`);
  }
}

// Two different questions, so two different helpers. An invariant is never
// allowed to be non-zero whatever the baseline said -- reporting those as
// "3 -> 1" would read as a regression when it is an improvement, and would
// quietly bless a baseline that was recorded broken.
const invariant = (label, actual) => {
  if (actual > 0) failures.push(`${label}: ${actual} (must be 0)`);
};
const regression = (label, before, after, worse) => {
  if (worse) failures.push(`${label}: ${before} -> ${after}`);
};

invariant("empty answers", accuracy.emptyAnswers);
invariant("empty frames", accuracy.emptyFrames);
invariant("truncated answers", truncated);

regression(
  "refused verdicts",
  base.accuracy.refusedVerdicts,
  accuracy.refusedVerdicts,
  accuracy.refusedVerdicts > base.accuracy.refusedVerdicts,
);
regression(
  "off-topic card names",
  base.accuracy.offTopicCardNames,
  accuracy.offTopicCardNames,
  accuracy.offTopicCardNames > base.accuracy.offTopicCardNames,
);
regression(
  "invented citation rate",
  pct(base.accuracy.inventedCitationRate),
  pct(accuracy.inventedCitationRate),
  accuracy.inventedCitationRate > base.accuracy.inventedCitationRate + 0.02,
);
regression(
  "citation density",
  base.accuracy.citationDensity.toFixed(2),
  accuracy.citationDensity.toFixed(2),
  accuracy.citationDensity < base.accuracy.citationDensity * 0.85,
);
// The guard against condensing the corpus rather than cutting it. Keeping every
// id while stripping the depth behind it leaves density flat -- the coach still
// cites -- but narrows what it can find to say, and that shows up here.
regression(
  "distinct principles used",
  base.accuracy.distinctPrinciples,
  accuracy.distinctPrinciples,
  accuracy.distinctPrinciples < base.accuracy.distinctPrinciples * 0.85,
);
// Both directions are degradation: toward 1 the coach stopped reasoning about
// the pool and is echoing the data verdict it was handed, toward 0 it is
// guessing. Neither shows up as a token regression.
regression(
  "divergence rate",
  pct(base.accuracy.divergenceRate),
  pct(accuracy.divergenceRate),
  Math.abs(accuracy.divergenceRate - base.accuracy.divergenceRate) > 0.15,
);

console.log("");
for (const note of notes) console.log(`note: ${note}`);
if (failures.length === 0) {
  console.log("matches baseline.");
  process.exit(0);
}
for (const f of failures) console.log(`REGRESSION ${f}`);
process.exit(1);

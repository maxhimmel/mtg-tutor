// What one draft costs in tokens, and whether the advice survived the saving.
//
//   pnpm --filter @mtg-tutor/backend bench-llm [--set fdn] [--seed 42]
//                                              [--area coach,verdict,frame]
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
// A full run writes two things. The baseline holds the numbers and is the gate.
// The transcript -- run.<set>.<format>.<seed>.<provider>.json -- holds those same
// numbers plus every answer that produced them, because llmUsage stores counts
// and nothing else keeps the prose: once this process exits, what the coach
// actually said is gone. `pnpm bench-report` renders one or two transcripts into
// a page. A saving is accepted by reading that page, not by reading the diff.
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
// Carried explicitly rather than left to draft.start's default, which is
// PremierDraft -- the web app reads each set's own format off sets.list for the
// same reason, and nothing is ingested under the default.
const format = flag("format", "TradDraft");
const seed = Number(flag("seed", 42));
// Caps how many picks get coached and reviewed. For proving the harness works
// without spending a full draft -- a --limit run is NOT a valid benchmark, and
// the report says so.
const limit = Number(flag("limit", Infinity));
const minPackCards = Number(flag("min-pack-cards", COACH.minPackCards));

// Which prompts to spend on. Unlike --limit, a partial run IS a valid
// measurement -- of the areas it covers. Tuning the verdict prompt does not need
// thirty coach calls, and paying for them means a daily token allowance buys
// fewer iterations of the thing actually being changed.
const ALL_AREAS = ["coach", "verdict", "frame"];
const areasRun = flag("area", ALL_AREAS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const unknownArea = areasRun.find((a) => !ALL_AREAS.includes(a));
if (unknownArea) {
  throw new Error(`Unknown --area "${unknownArea}". Choose from: ${ALL_AREAS.join(", ")}.`);
}
if (areasRun.length === 0) throw new Error("--area needs at least one of: " + ALL_AREAS.join(", "));
const partial = areasRun.length < ALL_AREAS.length;
const willRun = (area) => areasRun.includes(area);

const url = process.env.CONVEX_URL;
const site = process.env.CONVEX_SITE_URL;
if (!url || !site) {
  throw new Error("CONVEX_URL / CONVEX_SITE_URL missing -- run `convex dev --once` first.");
}

// Renewed as the run goes, not just at startup. A WorkOS access token is good
// for about five minutes and a full run takes twice that, so a run that
// authenticated once died on the last query with every model call already paid
// for. accessToken() only touches the network when expiry is close, so calling
// this before each call is free the rest of the time.
let token = await accessToken();
const client = new ConvexHttpClient(url);
client.setAuth(token);

async function freshToken() {
  const next = await accessToken();
  if (next !== token) {
    token = next;
    client.setAuth(token);
  }
  return token;
}

const principles = loadPrinciples();

// ---------------------------------------------------------------- drive a draft

const stored = await client.query(api.sets.get, { setCode, format });
if (!stored) {
  // Says what IS available rather than only what is not: the usual cause is a
  // format mismatch, not a missing set, and the two read identically otherwise.
  const available = await client.query(api.sets.list, {});
  throw new Error(
    `Set "${setCode}" is not ingested for format "${format}". Available: ` +
      available.map((s) => `${s.code}/${s.format}`).join(", "),
  );
}

const namesInSet = stored.cards.map((c) => c.name);
const setNamePattern = cardNamePattern(namesInSet);

const sessionId = await client.mutation(api.draft.start, { setCode, format, seed });
console.log(`set ${setCode}/${format}, seed ${seed}, session ${sessionId}`);
if (limit !== Infinity) console.log(`--limit ${limit}: NOT a valid benchmark run\n`);

/** Streams /coach for one pick. Returns null when the gate declined it (204). */
async function coach(pickIndex) {
  const res = await fetch(`${site}/coach`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await freshToken()}`,
    },
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
  await freshToken();
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

// A call that throws is recorded and stepped over rather than ending the run.
// A full run is ~80 paid calls; letting the last one abort the first 79 throws
// away the measurement AND the money, and "one pick errored" is itself a
// finding worth reporting rather than a reason to have nothing to report.
const callErrors = [];
const attempt = async (label, fn) => {
  try {
    return await fn();
  } catch (e) {
    callErrors.push(`${label}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    return undefined;
  }
};

if (partial) console.log(`--area ${areasRun.join(",")}: measuring those areas only`);

// Coaching is requested pick by pick, exactly as a player's board does it.
const coached = [];
if (willRun("coach")) {
  for (const pick of picks.slice(0, limit)) {
    if (!isDecisionPick(pick.cardsInPack, minPackCards)) continue;
    await freshToken();
    const text = await attempt(`coach p${pick.pickIndex}`, () => coach(pick.pickIndex));
    if (text) coached.push({ ...pick, text });
  }
  console.log(`coached ${coached.length} picks`);
}

// Decision picks only, which is what the walkthrough and the CLI's breakdown
// ask for: there is nothing to review about a pick that had one card in it.
const verdicts = [];
if (willRun("verdict")) {
  for (const pick of picks.slice(0, limit)) {
    if (!isDecisionPick(pick.cardsInPack, minPackCards)) continue;
    await freshToken();
    const verdict = await attempt(`verdict p${pick.pickIndex}`, () =>
      client.action(api.review.verdict, { sessionId, pickIndex: pick.pickIndex }),
    );
    verdicts.push({ ...pick, verdict: verdict ?? null });
  }
  console.log(`reviewed ${verdicts.length} picks`);
}

const frames = [];
if (willRun("frame")) {
  for (const phase of ["open", "close"]) {
    await freshToken();
    const text = await attempt(`frame ${phase}`, () =>
      client.action(api.review.frame, { sessionId, phase }),
    );
    frames.push({ phase, text: text ?? null });
  }
  console.log(`framed ${frames.length} phases`);
}
console.log("");

// ------------------------------------------------------------------- the tokens

await freshToken();
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
// Deliberately NOT called "refused". A null verdict has two causes that look
// identical from here -- the model named a card outside the pack and the server
// refused it, or the model returned nothing usable at all -- and merging them
// under a name that implies the first would overstate what this measures. The
// deployment log distinguishes them; this counts that either happened.
const unansweredVerdicts = verdicts.length - answered.length;
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
  unansweredVerdicts,
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
console.log(`  unanswered verdicts    ${accuracy.unansweredVerdicts} / ${accuracy.verdictsAsked}`);
console.log(`  context-best diverged  ${pct(accuracy.divergenceRate)}`);
console.log(`  empty frames           ${accuracy.emptyFrames}`);

const truncated = Object.values(byArea).reduce((n, a) => n + a.truncated, 0);
const unattributed = Object.values(byArea).reduce((n, a) => n + a.unattributed, 0);
// Broken down by area, because the fix differs per area: a truncated verdict
// means the JSON was cut mid-object, a truncated frame means maxTokens is too
// low for the prose it was asked for. A bare total says neither.
const truncatedWhere = Object.entries(byArea)
  .filter(([, a]) => a.truncated > 0)
  .map(([area, a]) => `${area} ${a.truncated}`)
  .join(", ");
console.log(`  truncated answers      ${truncated}${truncatedWhere ? ` (${truncatedWhere})` : ""}`);
console.log(`  rows missing a userId  ${unattributed}`);
console.log(`  call errors            ${callErrors.length}`);
for (const e of callErrors.slice(0, 5)) console.log(`    ${e}`);
if (callErrors.length > 5) console.log(`    ...and ${callErrors.length - 5} more`);

// ------------------------------------------------------------------- baselines

const dir = new URL("../bench/", import.meta.url);
// A partial run gets its own baseline rather than merging into the full one.
// Both sides then measure the same areas, which is what makes every metric --
// including the blended ones -- comparable again. Canonical order, so
// --area frame,coach and --area coach,frame are the same baseline.
const areaTag = partial ? `.${ALL_AREAS.filter((a) => areasRun.includes(a)).join("+")}` : "";
const stem = `${setCode}.${format}.${seed}.${provider}${areaTag}`;
const file = new URL(`baseline.${stem}.json`, dir);
const runFile = new URL(`run.${stem}.json`, dir);
const runBaselineFile = new URL(`run.${stem}.baseline.json`, dir);
const record = {
  setCode,
  format,
  callErrors: callErrors.length,
  seed,
  provider,
  model,
  minPackCards,
  // What this run is entitled to say anything about. Read back on comparison:
  // several accuracy metrics are computed across more than one area, and
  // comparing those against a baseline that covered different ground reports
  // drift that is an artifact of the flag rather than of the prompt.
  areasRun,
  areas: byArea,
  accuracy,
};

if (limit !== Infinity) {
  console.log("\n--limit run: baseline neither written nor compared.");
  process.exit(0);
}

// ----------------------------------------------------------------- transcript

// The record above says a saving happened; only the answers say what it cost.
// They are written together because a token delta with no prose beside it
// cannot be accepted or rejected -- and the prose exists nowhere else. llmUsage
// stores counts, so once this process exits the generations are gone.
const costOf = (area, id) => {
  const rows = usage.filter(
    (r) => r.area === area && (area === "frame" ? r.phase === id : r.pickIndex === id),
  );
  // Last wins. A retried call leaves two rows, and the second is the one whose
  // answer was kept.
  const row = rows[rows.length - 1];
  if (!row) return null;
  return {
    surface: (row.inputTokens ?? 0) + (row.cacheReadTokens ?? 0) + (row.cacheWriteTokens ?? 0),
    inputTokens: row.inputTokens ?? 0,
    cacheReadTokens: row.cacheReadTokens ?? 0,
    cacheWriteTokens: row.cacheWriteTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    finishReason: row.finishReason,
    ms: row.ms,
  };
};

const coachByPick = new Map(coached.map((c) => [c.pickIndex, c]));
const verdictByPick = new Map(verdicts.map((v) => [v.pickIndex, v]));

const transcript = {
  ...record,
  picks: [...new Set([...coachByPick.keys(), ...verdictByPick.keys()])]
    .sort((a, b) => a - b)
    .map((pickIndex) => {
      const pick = coachByPick.get(pickIndex) ?? verdictByPick.get(pickIndex);
      const reviewed = verdictByPick.get(pickIndex);
      return {
        pickIndex,
        cardsInPack: pick.cardsInPack,
        bestName: pick.bestName,
        packNames: pick.packNames,
        coach: coachByPick.has(pickIndex)
          ? { text: coachByPick.get(pickIndex).text, cost: costOf("coach", pickIndex) }
          : null,
        verdict: reviewed
          ? { answer: reviewed.verdict, cost: costOf("verdict", pickIndex) }
          : null,
      };
    }),
  frames: frames.map((f) => ({ phase: f.phase, text: f.text, cost: costOf("frame", f.phase) })),
};

mkdirSync(dir, { recursive: true });
writeFileSync(runFile, `${JSON.stringify(transcript, null, 2)}\n`);
console.log(`\nwrote run ${runFile.pathname.split("/").pop()}`);

if (has("update-baseline")) {
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  // The reference prose, versioned beside the reference numbers. Without this
  // twin, accepting a saving would move the numbers forward and leave the next
  // comparison with nothing to read against.
  writeFileSync(runBaselineFile, `${JSON.stringify(transcript, null, 2)}\n`);
  console.log(`wrote baseline ${file.pathname.split("/").pop()}`);
  console.log(`wrote baseline run ${runBaselineFile.pathname.split("/").pop()}`);
  process.exit(0);
}

if (!existsSync(file)) {
  console.log("\nNo baseline for this (set, seed, provider). Re-run with --update-baseline.");
  process.exit(0);
}

const base = JSON.parse(readFileSync(file, "utf8"));
const failures = [];
const notes = [];
// Baselines written before --area existed described a full run.
const baseAreas = base.areasRun ?? ALL_AREAS;
const skipped = [];

// Which areas an accuracy metric is computed from. The blended three are the
// reason this table exists: citations and principle ids are counted across coach
// AND verdict answers, so a coach-only run scores lower on all of them for no
// reason but the flag. Comparing those against a full baseline would report a
// regression that the prompt did not cause -- and reporting a phantom regression
// once is enough to stop the gate being trusted.
const SCOPE = {
  "truncated answers": ALL_AREAS,
  "unanswered verdicts": ["verdict"],
  "divergence rate": ["verdict"],
  "citation density": ["coach"],
  "off-topic card names": ["coach", "verdict"],
  "invented citation rate": ["coach", "verdict"],
  "distinct principles used": ["coach", "verdict"],
};

const comparedAreas = areasRun.filter((a) => baseAreas.includes(a));

/**
 * Whether a metric means the same thing on both sides.
 *
 * The question is NOT "did this run collect every area the metric reads" -- that
 * would reject a coach-only run against a coach-only baseline, where distinct
 * principles is counted over coach answers on both sides and is perfectly
 * comparable. The question is whether the two runs computed it over the same
 * areas. Same areas, same population, same meaning.
 */
const sameScope = (scope) => {
  const mine = scope.filter((a) => areasRun.includes(a));
  const theirs = scope.filter((a) => baseAreas.includes(a));
  return mine.length > 0 && mine.length === theirs.length && mine.every((a) => theirs.includes(a));
};

const scoped = (label, check) => {
  // Truncation is a per-area count summed after the fact, so it stays comparable
  // over whatever the two runs have in common rather than needing a full match.
  if (label === "truncated answers") {
    if (comparedAreas.length > 0) return check();
    skipped.push(`${label} (this run and the baseline share no areas)`);
    return;
  }
  if (sameScope(SCOPE[label])) return check();
  const side = (areas) => SCOPE[label].filter((a) => areas.includes(a)).join("+") || "nothing";
  skipped.push(`${label} (counted over ${side(areasRun)} here, ${side(baseAreas)} in the baseline)`);
};

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

// A call that errored produced no measurement, so a run carrying any of them
// is not comparable to one that did not, whatever the rest of the numbers say.
invariant("call errors", callErrors.length);
invariant("empty answers", accuracy.emptyAnswers);
invariant("empty frames", accuracy.emptyFrames);

// Compared against the baseline rather than asserted at zero, unlike the
// invariants above. Those are all currently zero and must stay there; this one
// is not -- claude-sonnet-5 overruns the verdict budget on about one pick in
// six, which is a known defect with a fix that belongs in the prompt, not in a
// bigger ceiling. An invariant nothing can satisfy makes every run red, and a
// permanently red gate stops being read. This still catches it getting worse.
// Summed over the areas BOTH runs covered, rather than over each file's whole
// areas map. A verdict-only run against a full baseline would otherwise be
// charged with the coach and frame truncations it never went looking for.
scoped("truncated answers", () => {
  const baseTruncated = comparedAreas.reduce((n, k) => n + (base.areas[k]?.truncated ?? 0), 0);
  const ranTruncated = comparedAreas.reduce((n, k) => n + (byArea[k]?.truncated ?? 0), 0);
  regression("truncated answers", baseTruncated, ranTruncated, ranTruncated > baseTruncated);
});
scoped("unanswered verdicts", () =>
  regression(
    "unanswered verdicts",
    base.accuracy.unansweredVerdicts,
    accuracy.unansweredVerdicts,
    accuracy.unansweredVerdicts > base.accuracy.unansweredVerdicts,
  ),
);
scoped("off-topic card names", () =>
  regression(
    "off-topic card names",
    base.accuracy.offTopicCardNames,
    accuracy.offTopicCardNames,
    accuracy.offTopicCardNames > base.accuracy.offTopicCardNames,
  ),
);
scoped("invented citation rate", () =>
  regression(
    "invented citation rate",
    pct(base.accuracy.inventedCitationRate),
    pct(accuracy.inventedCitationRate),
    accuracy.inventedCitationRate > base.accuracy.inventedCitationRate + 0.02,
  ),
);
scoped("citation density", () =>
  regression(
    "citation density",
    base.accuracy.citationDensity.toFixed(2),
    accuracy.citationDensity.toFixed(2),
    accuracy.citationDensity < base.accuracy.citationDensity * 0.85,
  ),
);
// The guard against condensing the corpus rather than cutting it. Keeping every
// id while stripping the depth behind it leaves density flat -- the coach still
// cites -- but narrows what it can find to say, and that shows up here.
scoped("distinct principles used", () =>
  regression(
    "distinct principles used",
    base.accuracy.distinctPrinciples,
    accuracy.distinctPrinciples,
    accuracy.distinctPrinciples < base.accuracy.distinctPrinciples * 0.85,
  ),
);
// Both directions are degradation: toward 1 the coach stopped reasoning about
// the pool and is echoing the data verdict it was handed, toward 0 it is
// guessing. Neither shows up as a token regression.
scoped("divergence rate", () =>
  regression(
    "divergence rate",
    pct(base.accuracy.divergenceRate),
    pct(accuracy.divergenceRate),
    Math.abs(accuracy.divergenceRate - base.accuracy.divergenceRate) > 0.15,
  ),
);

console.log("");
for (const note of notes) console.log(`note: ${note}`);
// Said out loud rather than left to inference. A partial run that printed only
// "matches baseline" would read as a clean bill of health for the whole system
// when most of it was never asked.
for (const s of skipped) console.log(`not compared: ${s}`);
if (failures.length === 0) {
  console.log(partial ? `matches baseline for ${areasRun.join(", ")}.` : "matches baseline.");
  process.exit(0);
}
for (const f of failures) console.log(`REGRESSION ${f}`);
process.exit(1);

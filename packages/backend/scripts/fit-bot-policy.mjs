// Fits a bot pick policy to real human drafters.
//
//   pnpm fit-bot-policy [--sets fdn,dsk,woe] [--format TradDraft]
//                       [--train-per-mille 50] [--test-per-mille 100] [--tier all|strong]
//                       [--epochs 300] [--drop openness,opennessLate]
//                       [--shape turn|lane] [--out weights.json] [--refresh]
//
// WHAT IS BEING FITTED
//
// A conditional logit over the pack. For each real pick, the candidates are the
// cards that were on offer and the label is the one taken; the model scores each
// candidate as a dot product of `policyFeatures` and maximises the log-likelihood
// of the human's choice. Convex, seven parameters, no dependencies.
//
// That shape is chosen because it is what a bot already does: score every card,
// take the best. So the fitted thing IS the policy, not a model of it that then
// has to be approximated.
//
// ONE GLOBAL FIT, POOLED ACROSS SETS
//
// Not one per set, for two reasons. A brand-new set has no 17Lands data at all
// and is exactly where this app is most useful (decision #9) -- a per-set fit
// would leave those with nothing. And weights that live in core as constants
// need no schema, no table, no bandwidth and no artifact growth, where per-set
// weights need all four.
//
// FEATURES COME FROM CORE, DELIBERATELY
//
// `policyFeatures` is imported rather than restated. If this file computed its
// own, the weights would be fitted against something no bot ever sees, and both
// halves would keep working while the whole exercise measured nothing.
//
// THE SPLIT MATCHES bench-bots EXACTLY
//
// Same FNV-1a over draft_id, same held-out fifth, so the accuracy this prints
// and the accuracy bench-bots prints are about the same drafts. Fitting on the
// held-out fifth would make every number here a lie in the flattering direction.
//
// THE PACKS COME OFF DISK, THE FEATURES NEVER DO
//
// First run per set streams the dataset and writes `datasets/picks.*.bin`; every
// run after it reads that instead, which is the difference between fifteen
// minutes and seconds. Only the DEAL is cached -- what was on offer and what was
// taken. Feature rows are recomputed here on every run, deliberately: they are
// the thing being iterated on, and a cache of them would go stale exactly when
// somebody edits POLICY_FEATURES, silently, against columns that no longer mean
// what their names say. See lib/draftCache.mjs.

import { ConvexHttpClient } from "convex/browser";
import { writeFileSync } from "node:fs";
import {
  BotMemory,
  CURVE_TOP,
  POLICY_FEATURES,
  deckNeeds,
  draftProgress,
  policyFeatures,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const has = (name) => process.argv.includes(`--${name}`);
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const format = flag("format", "TradDraft");
const setCodes = flag("sets", "fdn").split(",").filter(Boolean);
// Per mille of TRAINING drafts to keep, spread evenly over the file. Bounds
// memory -- every kept pick holds ~10 candidates x 7 features -- without letting
// the sample correlate with when the draft was played.
const trainPerMille = Number(flag("train-per-mille", 50));
// And of the held-out fifth. Kept whole in the first version, which is fine for
// one set and fatal for eighteen: every pick holds ~11 candidates x 7 features,
// so a full held-out fifth across the library is over a billion numbers and the
// run dies on `Invalid array length` two thirds of the way in. A tenth of the
// fifth is still ~15k picks a set, far more than an accuracy to 0.1pp needs.
const testPerMille = Number(flag("test-per-mille", 100));
const tier = flag("tier", "all");
const epochs = Number(flag("epochs", 300));
const outPath = flag("out");
// Feature names to hold at zero, for asking whether a term earns its place.
const dropped = new Set((flag("drop", "") || "").split(",").filter(Boolean));
const log = (...a) => console.error(...a);

// ---------------------------------------------------------------- shape probes
//
// WHAT SHAPE DOES THE FIT WANT ALONG THIS AXIS, BEFORE ANYBODY PICKS A FORMULA
//
// Every interaction term in `POLICY_FEATURES` is a guess about a shape as well
// as about an axis, and the two failures are not the same. `valueOpen` cost
// three fits by getting the AXIS wrong -- confidence resets every pack and
// `progress` climbs across all 42 picks, so no weight could express it. What
// found that was not another ablation but fitting a free multiplier per stage of
// the draft and reading the answer off it, and that measurement was thrown away
// afterwards and has had to be re-derived here.
//
// So this is that diagnostic, kept. A probe replaces one shipped term with a
// bank of INDICATORS over the axis it claims to vary on, and the fitted weights
// are the shape -- a ramp, a step, or nothing, without anybody having asserted
// which in advance. It answers a question an ablation cannot: `--drop` says
// whether a term is worth having, and this says whether it is the right term.
//
// A probed fit is a MEASUREMENT AND NOT A CANDIDATE POLICY. The indicators are
// deliberately more parameters than anything that should ship -- nine free
// numbers where a shipped model has one -- so its held-out accuracy is an upper
// bound on what the axis could pay, not a policy to fit and store.
//
// READ THE DIFFERENCES, NOT THE LEVELS. A conditional logit is invariant to
// anything added to every candidate in a pack, so a bank of indicators covering
// every card is identified only up to a constant. The gradient along that
// direction is exactly zero and the weights stay balanced around it, which makes
// the differences meaningful and the absolute heights arbitrary.
//
// AND DO NOT ABLATE A BANK ONE COLUMN AT A TIME. That follows from the same
// invariance and it is not obvious: `--shape turn --ablate` prices all seven of
// its columns at +0.00pp while the bank as a whole is worth +0.45pp. Nothing is
// broken. The columns PARTITION the pack, so removing one lets the other six
// re-level and re-express every difference that mattered -- the ablation drops a
// column without dropping any information. To price a bank, compare it against a
// plain run; to price one column, drop the rest with `--drop` and see whether
// what is left still pays.
//
// A probe reads one card at a `Pick`: the memory as the drafter had it, where
// the draft had got to, and whatever the bank chose to work out once for the
// whole pack. That last part is `shared`, and it exists because the deck-shape
// bank asks what the pool is short of -- an O(pool) question that must be
// answered per pick and not per candidate.
const SHAPES = {
  // CURVE-01 and CURVE-03 say a Limited deck wants seven-plus cards at 1-2 mana
  // and five-or-fewer at 5+, which is a claim about a preference over the curve
  // that no shipped feature carries at all. One indicator per curve bucket, the
  // same 1..CURVE_TOP partition the deck chart and `deckNeeds` already count in,
  // so the shape comes back in the app's own buckets rather than in a new one.
  //
  // Nothing is dropped: the question is what curve preference is LEFT once raw
  // win rate, the lane and openness have been paid, which is exactly the part a
  // `cheapness` feature would be claiming to add.
  //
  // LANDS GET THEIR OWN COLUMN, and they have to. `curveTurn` floors at one, so
  // every land in the Play Booster land slot is a `turn` of 1 -- 40% of the
  // turn-1 cards on both fdn and dsk -- and every other reader of this field
  // drops them first: `manaCurve` leaves them out of the chart, `deckNeeds`
  // filters them before it counts, `fitOf` refuses to argue about them. Left in,
  // the one bucket a `cheapness` feature exists to speak for would be a blend of
  // "a one-drop spell" and "a dual land", which are not the same pick and are
  // not taken at the same time.
  turn: {
    drop: [],
    probes: [
      ...Array.from({ length: CURVE_TOP }, (_, i) => ({
        label: `turn${i + 1}${i + 1 === CURVE_TOP ? "+" : ""}`,
        value: (card) => (card.role !== "land" && card.turn === i + 1 ? 1 : 0),
      })),
      { label: "land", value: (card) => (card.role === "land" ? 1 : 0) },
    ],
  },
  // Whether a drafter answers to the deck they are actually holding.
  //
  // `deckNeeds` is the whole of what this app thinks a Limited deck is short of
  // -- creatures by DECK-06, removal by DECK-08, the cheap half of the curve by
  // CURVE-01, and a top end that has stopped being a need and become a cost by
  // CURVE-03 -- and the pick scorer already grades a person against it. Nothing
  // has ever checked whether real drafters visibly do.
  //
  // MAIN EFFECT AND INTERACTION TOGETHER, because they are separate claims and
  // only the second one is `creatureNeed`. "Humans take bodies above their win
  // rate" is a fact about cards; "humans take a body WHEN THEY ARE SHORT of
  // bodies" is a fact about attention, and a bank carrying only the interaction
  // would credit the first to the second. If the paired weights come back with a
  // live main effect and a dead interaction, the answer is that drafters have a
  // standing preference and are not counting.
  //
  // `deckNeeds` is imported rather than restated. It is the same function, over
  // the same fields, that decides what the tiebreak may argue -- so a finding
  // here is about the rule the app ships and not about a paraphrase of it.
  //
  // The pool it is asked about is the DRAFTER'S OWN, rebuilt pick by pick by the
  // same `BotMemory` the fit feeds: `memory.take(picked)` is the human's card,
  // so this reads a real deck taking shape and not a bot's.
  need: {
    drop: [],
    perPick: (at) => deckNeeds(at.memory.pool, at.picksMade, at.totalPicks),
    probes: [
      { label: "body", value: (c) => (c.role === "creature" || c.role === "evasion" ? 1 : 0) },
      {
        label: "bodyShort",
        value: (c, at) =>
          at.shared.creatures && (c.role === "creature" || c.role === "evasion") ? 1 : 0,
      },
      { label: "removal", value: (c) => (c.role === "removal" ? 1 : 0) },
      { label: "removalShort", value: (c, at) => (at.shared.removal && c.role === "removal" ? 1 : 0) },
      { label: "cheap", value: (c) => (c.role !== "land" && c.turn <= 2 ? 1 : 0) },
      {
        label: "cheapShort",
        value: (c, at) => (at.shared.cheap && c.role !== "land" && c.turn <= 2 ? 1 : 0),
      },
      { label: "top", value: (c) => (c.role !== "land" && c.turn >= 5 ? 1 : 0) },
      {
        label: "topFull",
        value: (c, at) => (at.shared.toppedOut && c.role !== "land" && c.turn >= 5 ? 1 : 0),
      },
    ],
  },
  // `laneFitLate` is `laneFit * progress`: a linear ramp from nothing at P1P1 to
  // everything at the last pick. The principles describe a STEP instead --
  // SIG-01/02 say the first few picks are expendable and to commit around pick
  // five, SIG-11 says the plan is settled by the middle of pack 2, and SIG-12
  // says pack 2 is where you stop switching. A ramp still climbing through pack
  // 3 and a step that plateaus mid-pack-2 are different claims and the data can
  // separate them.
  //
  // Both lane terms come out, so the nine indicators carry the whole lane effect
  // and each weight reads directly as "what a point of `laneFit` is worth at
  // this stage". Leaving the main effect in would make the bank collinear with
  // it and split the same quantity across two places.
  //
  // Thirds of a pack, three packs: the same partition the sharpness probe used,
  // so the two shapes are readable side by side.
  //
  // `packNo` and `pickNo` come off the 17Lands file 0-BASED and are stored raw
  // (draftCache transcribes and decides nothing), so the arithmetic here is too.
  // Getting that wrong costs nothing loud: every indicator would simply be zero
  // for a pack that never matches, the fit would converge, and the shape would
  // come back flat and be believed.
  lane: {
    drop: ["laneFit", "laneFitLate"],
    probes: [0, 1, 2].flatMap((packNo) =>
      ["early", "mid", "late"].map((third, t) => ({
        label: `P${packNo + 1}${third}`,
        value: (card, at) =>
          at.packNo === packNo && Math.min(2, Math.floor(at.pickNo / 5)) === t
            ? at.memory.laneFit(card)
            : 0,
      })),
    ),
  },
};

const shapeName = flag("shape");
if (shapeName !== undefined && !(shapeName in SHAPES)) {
  throw new Error(`--shape must be one of ${Object.keys(SHAPES).join(", ")}`);
}
const shape = shapeName ? SHAPES[shapeName] : { drop: [], probes: [] };
for (const name of shape.drop) dropped.add(name);
// Refused rather than documented as unwise. A probe bank is over-parameterised
// on purpose, so its weights are a picture of an axis and never a pod -- and a
// `weights.json` naming columns no `policyFeatures` produces is a file that
// could only mislead whoever picked it up next.
if (shapeName && outPath) throw new Error("--shape is a measurement; it cannot be written with --out");

/** Every column in the fit, shipped then probed, in weight-vector order. */
const FEATURE_NAMES = [...POLICY_FEATURES, ...shape.probes.map((p) => p.label)];
const F = FEATURE_NAMES.length;

if (tier !== "all" && tier !== "strong") throw new Error(`--tier must be all or strong`);

// Re-reads the datasets rather than the cached packs, for when 17Lands has
// published more drafts.
const refresh = has("refresh");

// Optional on purpose. Card data is cached in `datasets/` by `cache-cards`, so
// a fifteen-minute run needs no deployment at all -- see lib/engineCards.mjs for
// why that is not a convenience.
const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

function fnv(draftId) {
  let h = 0x811c9dc5;
  for (let i = 0; i < draftId.length; i++) {
    h ^= draftId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Same split as bench-bots.mjs. Kept as a copy of four lines rather than a
// shared import, because the two scripts must agree FOREVER and a shared helper
// that someone "improves" changes the meaning of every stored number.
const heldOut = (draftId) => fnv(draftId) % 5 === 0;

/**
 * Which training drafts to keep, spread across the whole file.
 *
 * The first version of this took training drafts until it had enough picks, and
 * that is a sampling bug with a visible symptom: it scored WORSE on train than
 * on held-out, which is backwards. These files are ordered by `draft_time`, so
 * "the first N drafts" is release week -- an unsolved format, drafted by people
 * who have not seen the cards, which is a different distribution from the one
 * the held-out fifth averages over.
 *
 * A different slice of the hash than the split above, so keeping fewer drafts
 * does not correlate with which fifth a draft landed in.
 */
const keepForTraining = (draftId) => (fnv(draftId) >>> 8) % 1000 < trainPerMille;
const keepForTest = (draftId) => (fnv(draftId) >>> 8) % 1000 < testPerMille;

// ---------------------------------------------------------------- collection

// Flat, because 360k picks x ~10 candidates x 7 features is 100MB as Float32 and
// several times that as objects.
const train = { feat: [], size: [], chosen: [] };
const test = { feat: [], size: [], chosen: [] };

let totalDrafts = 0;
let skippedTier = 0;

/** One drafter's 42 rows, walked in order so the memory is built like a bot's. */
function walkDraft(rows, into) {
  rows.sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
  const memory = new BotMemory();
  const totalPicks = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const { pack, picked, packNo, pickNo } = rows[i];
    // A pick naming a card the ingested pool does not have. Rare (83 of 149k on
    // fdn) and unrecoverable, and it must not silently become "chose index 0".
    if (!picked || pack.length < 2) {
      memory.see(pack);
      if (picked) memory.take(picked);
      continue;
    }

    const progress = draftProgress(i, totalPicks);
    const chosen = pack.indexOf(picked);
    if (chosen >= 0) {
      // Where this pick is, for the probes. `picksMade` is the pool's own size
      // rather than `i`, because a row the pool could not resolve was skipped
      // above without taking anything -- so the two drift apart on exactly the
      // drafts where a need would be miscounted.
      const at = {
        memory,
        progress,
        packSize: pack.length,
        packNo,
        pickNo,
        picksMade: memory.pool.length,
        totalPicks,
      };
      // Once per pick, never per candidate: the deck-shape bank asks what the
      // pool is short of, which is O(pool) and identical for all 14 cards.
      at.shared = shape.perPick ? shape.perPick(at) : undefined;

      for (const card of pack) {
        // The shipped row comes from core, never restated here -- weights fitted
        // against a local copy of `policyFeatures` would be weights no bot ever
        // sees. Probe columns are appended AFTER it, so a probed run and a plain
        // run agree column for column on everything they share.
        const f = policyFeatures(card, memory, progress, pack.length);
        for (let k = 0; k < POLICY_FEATURES.length; k++) into.feat.push(f[k]);
        for (const probe of shape.probes) into.feat.push(probe.value(card, at));
      }
      into.size.push(pack.length);
      into.chosen.push(chosen);
    }

    // The order the engine uses: score the pack, THEN record having seen it, so
    // openness never includes the pack the features were just computed against.
    memory.see(pack);
    memory.take(picked);
  }
}

for (const setCode of setCodes) {
  const cache = await draftPicks({ client, api, setCode, format, refresh, log });
  const before = train.size.length;

  for (const draft of cache.drafts) {
    // `rank` is published but comes back empty on these files, so the strong
    // tier is defined by the record instead: a 3-0 drafter. Same signal
    // build-set-stats already uses for trophyPickRate, and unambiguous where a
    // rank bucket would need a threshold nobody can justify.
    if (tier === "strong" && draft.wins !== 3) {
      skippedTier++;
      continue;
    }

    const isTest = heldOut(draft.id);
    if (!(isTest ? keepForTest(draft.id) : keepForTraining(draft.id))) continue;

    walkDraft(cache.rows(draft), isTest ? test : train);
    totalDrafts++;
  }

  log(`${setCode}: ${train.size.length - before} training picks`);
}

if (train.size.length === 0) throw new Error("no training picks collected");
log(
  `collected ${train.size.length.toLocaleString()} train / ` +
    `${test.size.length.toLocaleString()} test picks from ${totalDrafts.toLocaleString()} drafts`,
);
if (skippedTier) log(`${skippedTier.toLocaleString()} drafts skipped by --tier ${tier}`);

const trainFeat = Float64Array.from(train.feat);
const testFeat = Float64Array.from(test.feat);

// ---------------------------------------------------------------- the fit

// Scaled, not centred -- though centring would be free. Subtracting a constant
// from one feature across every candidate shifts every score in the pack by the
// same amount, and softmax is invariant to that, so only the SPREAD matters. The
// features run from ~0.1 (value) to 1 (the indicators), and a single step size
// across that range either crawls on one or diverges on another.
const scale = new Float64Array(F).fill(1);
{
  const n = trainFeat.length / F;
  for (let k = 0; k < F; k++) {
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = trainFeat[i * F + k];
      sum += x;
      sumSq += x * x;
    }
    const sd = Math.sqrt(Math.max(1e-12, sumSq / n - (sum / n) ** 2));
    scale[k] = sd;
  }
}

// A dropped feature is scaled to infinity rather than skipped in the loops, so
// the ablation runs the identical arithmetic on identical data and the only
// thing that changed is the feature.
const live = FEATURE_NAMES.map((f) => !dropped.has(f));

// A column that never varies cannot move the fit, and it does not announce
// itself: the gradient along it is exactly zero, so the weight stays at zero,
// the run converges, and the term reports as worth nothing. That is
// indistinguishable from the honest answer, which is what makes it worth a
// throw -- a probe indexed off the wrong base, or a feature reading a field the
// cached cards do not carry, would both arrive here as a confident flat shape.
for (let k = 0; k < F; k++) {
  if (!live[k] || scale[k] > 1e-6) continue;
  throw new Error(
    `${FEATURE_NAMES[k]} is constant across all ${(trainFeat.length / F).toLocaleString()} ` +
      `candidate rows, so nothing can be fitted to it. It would otherwise come back as a ` +
      `weight of zero, which reads the same as a term that earns nothing.`,
  );
}

for (const f of dropped) {
  if (!FEATURE_NAMES.includes(f)) throw new Error(`--drop names no such feature: ${f}`);
}
if (dropped.size) log(`dropped: ${[...dropped].join(", ")}`);

/** Negative mean log-likelihood, and the gradient, on scaled features. */
function evaluate(data, feat, w, grad, mask) {
  let nll = 0;
  let correct = 0;
  let at = 0;
  if (grad) grad.fill(0);

  for (let s = 0; s < data.size.length; s++) {
    const size = data.size[s];
    let max = -Infinity;
    let bestIdx = 0;
    const scores = new Float64Array(size);

    for (let j = 0; j < size; j++) {
      let z = 0;
      for (let k = 0; k < F; k++) if (mask[k]) z += w[k] * (feat[(at + j) * F + k] / scale[k]);
      scores[j] = z;
      if (z > max) {
        max = z;
        bestIdx = j;
      }
    }

    let denom = 0;
    for (let j = 0; j < size; j++) {
      scores[j] = Math.exp(scores[j] - max);
      denom += scores[j];
    }

    const c = data.chosen[s];
    nll -= Math.log(Math.max(1e-300, scores[c] / denom));
    if (bestIdx === c) correct++;

    if (grad) {
      for (let j = 0; j < size; j++) {
        const p = scores[j] / denom;
        const coeff = j === c ? p - 1 : p;
        for (let k = 0; k < F; k++)
          if (mask[k]) grad[k] += coeff * (feat[(at + j) * F + k] / scale[k]);
      }
    }
    at += size;
  }

  const n = data.size.length;
  if (grad) for (let k = 0; k < F; k++) grad[k] /= n;
  return { nll: nll / n, accuracy: correct / n };
}

const LR = 0.5;
const MOMENTUM = 0.9;

/** Gradient descent with momentum, on whichever features `mask` leaves live. */
function fit(mask, verbose) {
  const w = new Float64Array(F);
  const grad = new Float64Array(F);
  const velocity = new Float64Array(F);

  for (let epoch = 1; epoch <= epochs; epoch++) {
    const { nll } = evaluate(train, trainFeat, w, grad, mask);
    for (let k = 0; k < F; k++) {
      if (!mask[k]) continue;
      velocity[k] = MOMENTUM * velocity[k] - LR * grad[k];
      w[k] += velocity[k];
    }
    if (verbose && (epoch % 50 === 0 || epoch === 1)) {
      log(`  epoch ${epoch}: train nll ${nll.toFixed(4)}`);
    }
  }
  return w;
}

log(`fitting ${F} weights over ${epochs} epochs...`);
const w = fit(live, true);

// Back onto raw features, which is what a bot will hand it.
const weights = Array.from(w, (v, k) => (live[k] ? v / scale[k] : 0));

const trainFinal = evaluate(train, trainFeat, w, null, live);
const testFinal = test.size.length ? evaluate(test, testFeat, w, null, live) : null;

// ---------------------------------------------------------------- ablation

// Whether each term earns its place, refitting from the SAME collected data --
// so the comparison is about the feature and not about which drafts got sampled.
// A term that cannot move the held-out number does not belong in the score, for
// the reason decision #8 gives for leaving IWD out of `contextValue`.
if (has("ablate") && testFinal) {
  console.log();
  console.log("ablation -- held-out top-1 with one term held at zero");
  console.log(`  ${"(none)".padEnd(14)} ${(testFinal.accuracy * 100).toFixed(2)}%`);
  for (let k = 0; k < F; k++) {
    if (!live[k]) continue;
    const mask = live.map((v, i) => v && i !== k);
    const ablated = evaluate(test, testFeat, fit(mask, false), null, mask);
    const delta = (testFinal.accuracy - ablated.accuracy) * 100;
    console.log(
      `  ${FEATURE_NAMES[k].padEnd(14)} ${(ablated.accuracy * 100).toFixed(2)}%   ` +
        `costs ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}pp`,
    );
  }
}

console.log();
console.log(`tier ${tier}, sets ${setCodes.join(",")}/${format}`);
console.log(
  `train ${train.size.length.toLocaleString()} picks -- nll ${trainFinal.nll.toFixed(4)}, ` +
    `top-1 ${(trainFinal.accuracy * 100).toFixed(1)}%`,
);
if (testFinal) {
  console.log(
    `test  ${test.size.length.toLocaleString()} picks -- nll ${testFinal.nll.toFixed(4)}, ` +
      `top-1 ${(testFinal.accuracy * 100).toFixed(1)}%`,
  );
}
console.log();
console.log("weights (on raw features)");
for (let k = 0; k < F; k++) {
  console.log(`  ${FEATURE_NAMES[k].padEnd(14)} ${weights[k].toFixed(4)}`);
}

if (outPath) {
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        tier,
        sets: setCodes,
        format,
        features: [...FEATURE_NAMES],
        weights,
        trainPicks: train.size.length,
        testPicks: test.size.length,
        trainAccuracy: trainFinal.accuracy,
        testAccuracy: testFinal?.accuracy ?? null,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${outPath}`);
}

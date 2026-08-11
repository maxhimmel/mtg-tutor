// Fits a bot pick policy to real human drafters.
//
//   pnpm fit-bot-policy [--sets fdn,dsk,woe] [--format TradDraft]
//                       [--train-per-mille 50] [--test-per-mille 100] [--tier all|strong]
//                       [--epochs 300] [--drop openness,opennessLate]
//                       [--out weights.json]
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

import { ConvexHttpClient } from "convex/browser";
import { writeFileSync } from "node:fs";
import {
  BotMemory,
  POLICY_FEATURES,
  draftProgress,
  normalizeName,
  policyFeatures,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { lines, splitRow } from "./lib/csv.mjs";
import { engineCards } from "./lib/engineCards.mjs";

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

const F = POLICY_FEATURES.length;

if (tier !== "all" && tier !== "strong") throw new Error(`--tier must be all or strong`);

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
function walkDraft(rows, byName, into) {
  rows.sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
  const memory = new BotMemory();
  const totalPicks = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const { pack, pickedName } = rows[i];
    const picked = byName.get(pickedName);
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
      for (const card of pack) {
        const f = policyFeatures(card, memory, progress);
        for (let k = 0; k < F; k++) into.feat.push(f[k]);
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
  const cards = await engineCards(client, api, setCode, format, log);
  const byName = new Map();
  for (const card of cards) byName.set(normalizeName(card.name), card);

  let header = null;
  let packCols = [];
  let iDraft = -1;
  let iPack = -1;
  let iPickNo = -1;
  let iPick = -1;
  let iWins = -1;

  let currentId = null;
  let buffer = [];
  const before = train.size.length;

  const flush = () => {
    if (buffer.length === 0) return;
    const isTest = heldOut(currentId);
    if (!(isTest ? keepForTest(currentId) : keepForTraining(currentId))) {
      buffer = [];
      return;
    }
    walkDraft(buffer, byName, isTest ? test : train);
    totalDrafts++;
    buffer = [];
  };

  for await (const line of lines({ kind: "draft", setCode, format, log })) {
    if (!header) {
      header = splitRow(line);
      iDraft = header.indexOf("draft_id");
      iPack = header.indexOf("pack_number");
      iPickNo = header.indexOf("pick_number");
      iPick = header.indexOf("pick");
      iWins = header.indexOf("event_match_wins");
      for (let i = 0; i < header.length; i++) {
        if (!header[i].startsWith("pack_card_")) continue;
        const card = byName.get(normalizeName(header[i].slice("pack_card_".length)));
        if (card) packCols.push([i, card]);
      }
      continue;
    }

    const row = splitRow(line);
    const draftId = row[iDraft];
    if (draftId !== currentId) {
      flush();
      currentId = draftId;
    }

    // `rank` is published but comes back empty on these files, so the strong
    // tier is defined by the record instead: a 3-0 drafter. Same signal
    // build-set-stats already uses for trophyPickRate, and unambiguous where a
    // rank bucket would need a threshold nobody can justify.
    if (tier === "strong" && row[iWins] !== "3") {
      skippedTier++;
      continue;
    }

    const pack = [];
    for (const [i, card] of packCols) {
      const n = row[i];
      if (n && n !== "0") pack.push(card);
    }
    buffer.push({
      packNo: Number(row[iPack]),
      pickNo: Number(row[iPickNo]),
      pack,
      pickedName: normalizeName(row[iPick] ?? ""),
    });
  }
  flush();

  log(`${setCode}: ${train.size.length - before} training picks`);
}

if (train.size.length === 0) throw new Error("no training picks collected");
log(
  `collected ${train.size.length.toLocaleString()} train / ` +
    `${test.size.length.toLocaleString()} test picks from ${totalDrafts.toLocaleString()} drafts`,
);
if (skippedTier) log(`${skippedTier.toLocaleString()} rows skipped by --tier ${tier}`);

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
const live = POLICY_FEATURES.map((f) => !dropped.has(f));
for (const f of dropped) {
  if (!POLICY_FEATURES.includes(f)) throw new Error(`--drop names no such feature: ${f}`);
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
      `  ${POLICY_FEATURES[k].padEnd(14)} ${(ablated.accuracy * 100).toFixed(2)}%   ` +
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
  console.log(`  ${POLICY_FEATURES[k].padEnd(14)} ${weights[k].toFixed(4)}`);
}

if (outPath) {
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        tier,
        sets: setCodes,
        format,
        features: [...POLICY_FEATURES],
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

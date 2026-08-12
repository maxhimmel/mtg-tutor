// How human-like the draft bots actually are, measured against real human picks.
//
//   pnpm bench-bots [--set fdn] [--format TradDraft] [--draft path.csv.gz]
//                   [--limit 20000] [--json out.json]
//
// THE GATE ON `human-bots`, AND WHY IT EXISTS
//
// Nothing in this repo has ever measured whether bots draft WELL. `corpus.test`
// measures that they draft IDENTICALLY, which is a different thing and is the
// only thing anyone has needed until now. So before fitting a policy to 438k
// human picks, this answers the question that says whether that is worth doing:
// how often does the shipped bot already take the card the human took?
//
// The 17Lands draft dataset is one row per pick, carrying the pack that was on
// offer (`pack_card_*`), the pool the drafter was holding (`pool_*`) and what
// they took (`pick`). That is a labelled decision, which is exactly what a pick
// policy is a model of.
//
// WHAT IS BEING COMPARED
//
//   random   the floor -- computed exactly as mean(1/packSize), not sampled
//   greedy   always the highest cardValue, which is what every script's fixture
//            policy does and what the bots reduce to with no colour commitment
//   legacy   the shipped bot: botScore = cardValue + colorBias, taken off
//            @mtg-tutor/core so this measures the policy rather than a copy of
//            it (measurement trap #5)
//
// Legacy's noise is deliberately excluded. It is +-0.005 uniform, carries no
// information, and can only lower agreement -- so leaving it out reads the
// shipped bot at its best case, which is the direction a gate should be wrong in.
//
// HOW TO READ `table` AGAINST `table~`, WHICH IS THE WHOLE POINT
//
// `table~` scores far lower and is not worse. Two independent draws from a
// distribution p agree with probability sum(p^2); an argmax matches a draw from
// p with probability max(p). So if the fit is anywhere near calibrated:
//
//   table~   estimates how often TWO HUMANS given the same pack and pool would
//            pick the same card as each other
//   table    estimates the CEILING for any deterministic policy on this data --
//            no fixed rule can beat "always guess the mode"
//
// That is the ceiling this file went looking for with `crowd` and did not find.
// It says most of the gap to 100% is human disagreement rather than headroom,
// and it is why the pod samples: seven seats all playing the mode is a table
// that cannot disagree, which no real pod does.
//
// THE ONE LEAK, AND WHICH WAY IT POINTS
//
// `cardValue` is not innocent of this dataset. Its unrated/thin-sample branch
// carries an ALSA nudge (scoring/value.ts) and ALSA is derived from these very
// `pick_number` columns, so `greedy` and `legacy` already know a little about
// the answer. The nudge is clamped to +-0.02 in win-rate units and only applies
// to cards under 200 games, so it is small -- but it flatters the BASELINE,
// which means a fitted policy beating these numbers has beaten them fairly.
//
// THE SPLIT IS BY DRAFT, NEVER BY ROW
//
// Reported on the held-out fifth so these numbers stay comparable to whatever a
// fitted policy scores later. Splitting by row would put pick 3 of a draft in
// train and pick 4 in test, and a policy conditioned on the pool would be
// reading its own training data back.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync } from "node:fs";
import {
  BotMemory,
  FITTED_POLICIES,
  botScore,
  cardValue,
  draftProgress,
  mulberry32,
  normalizeName,
  policyScore,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { lines, splitRow } from "./lib/csv.mjs";
import { engineCards } from "./lib/engineCards.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const localDraft = flag("draft");
const limit = Number(flag("limit", 0));
const jsonOut = flag("json");
const log = (...a) => console.error(...a);

// ---------------------------------------------------------------- the set

// The ENGINE half of the set, with `value` as ingest settled it -- the number
// the bots actually pick by. Recomputing it here from the committed artifact was
// the alternative and is not sound: only 6 of the 18 artifacts carry
// `packCards`, and none carries rarity or type line, so every unrated card's
// value would have to be guessed.
//
// The deployment is OPTIONAL, because `cache-cards` snapshots this to
// `datasets/` once. See lib/engineCards.mjs for why a sweep that streams for a
// quarter of an hour must not also need a backend up for a quarter of an hour.
const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const cards = await engineCards(client, api, setCode, format, log);
const byName = new Map();
for (const card of cards) byName.set(normalizeName(card.name), card);
log(`${cards.length} cards`);

// ---------------------------------------------------------------- the split

// FNV-1a over the draft id. Deterministic, so two runs and two policies see the
// same held-out drafts without anything being written down.
function fnv(draftId) {
  let h = 0x811c9dc5;
  for (let i = 0; i < draftId.length; i++) {
    h ^= draftId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const heldOut = (draftId) => fnv(draftId) % 5 === 0;

// ---------------------------------------------------------------- the policies

// HOW FAR CONSENSUS ALONE GETS YOU. Not a candidate, and not a ceiling.
//
// "41.9%" answers nothing on its own -- two humans handed the same pack do not
// always agree either, so some of the gap to 100% is irreducible. `crowd` ranks
// by the card's observed pick rate when seen (`taken/seen` off the committed
// artifact): the modal human choice, with no pool and no pick number in it.
//
// It reads counts aggregated over the WHOLE dataset, held-out drafts included,
// so it has seen the answers and no fitted policy is allowed to use it.
//
// It was added expecting a ceiling and is not one, and WHICH WAY IT FALLS
// DEPENDS ON THE SET -- which was itself worth learning, because the first
// reading of this was taken from fdn alone and generalised:
//
//   fdn  legacy 46.8  crowd 44.5     dsk  legacy 44.9  crowd 43.4
//   woe  legacy 40.0  crowd 43.6     mkm  legacy 41.8  crowd 43.4
//
// So on a set with legible card quality the colour lane beats consensus, and on
// a harder one consensus beats the shipped bot outright. `crowd` is roughly flat
// across all four (43-45) while `legacy` swings 40-47, which says the old bot is
// the thing that varies: it is only as good as `cardValue` is legible.
//
// Read it per pick number rather than in aggregate. At P1P1 there is no pool, so
// `legacy` IS `greedy` and `crowd` wins by ~17pp on fdn -- the cleanest statement
// available of the gap between what wins games and what humans take.
const artifact = JSON.parse(
  readFileSync(new URL(`../data/${setCode}.${format}.json`, import.meta.url), "utf8"),
);
const pickRate = new Map();
for (const c of artifact.cards) {
  if (c.seen > 0) pickRate.set(normalizeName(c.name), c.taken / c.seen);
}

// Each takes the pack and the memory built from the drafter's pool, and returns
// the card it would take. `random` is absent on purpose: its expected accuracy
// is 1/packSize exactly, so it is accumulated rather than played.
const POLICIES = {
  greedy: (pack) => {
    let best = pack[0];
    for (const c of pack) if (cardValue(c) > cardValue(best)) best = c;
    return best;
  },
  legacy: (pack, memory) => {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const c of pack) {
      const s = botScore(c, memory);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  },
  crowd: (pack) => {
    let best = pack[0];
    let bestRate = -Infinity;
    for (const c of pack) {
      const r = pickRate.get(normalizeName(c.name)) ?? 0;
      if (r > bestRate) {
        bestRate = r;
        best = c;
      }
    }
    return best;
  },
  // The fitted policy at its argmax: the single most likely human pick. This is
  // the number comparable with everything above it.
  table: (pack, memory, progress) => {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const c of pack) {
      const s = policyScore(c, memory, progress, FITTED_POLICIES.table);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  },
  // And what actually ships: a draw from the fitted distribution, which is how
  // seven seats come to disagree the way seven people do.
  //
  // It scores LOWER than `table` by construction and that is not a regression --
  // top-1 agreement rewards always guessing the mode, and a pod where every seat
  // guesses the mode is the thing sampling exists to avoid. The gap between the
  // two rows IS the human disagreement the model measured.
  "table~": (pack, memory, progress, rng) => {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const c of pack) {
      const u = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
      const s =
        policyScore(c, memory, progress, FITTED_POLICIES.table) - Math.log(-Math.log(u));
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  },
};

// ---------------------------------------------------------------- the sweep

const names = Object.keys(POLICIES);
const hits = new Map(names.map((n) => [n, 0]));
const byPick = new Map(); // pickNumber -> {rows, random, ...policy hits}
let rows = 0;
let randomExpected = 0;
let unmatched = 0;
let skippedNoPick = 0;
let drafts = 0;

let header = null;
let packCols = [];
let iDraft = -1;
let iPack = -1;
let iPickNo = -1;
let iPick = -1;

let currentDraft = null;
let buffer = [];

// Keyed by pack AND pick, because `pick_number` restarts at 0 in every pack.
// Bucketing on it alone folds P1P1 -- the one decision in the draft made with no
// pool at all, and so the only place a context-free policy is playing fair --
// into P2P1 and P3P1, where the drafter is 14 and 28 cards committed.
const bucket = (packNo, pickNo) => {
  const key = `${packNo}.${pickNo}`;
  let b = byPick.get(key);
  if (!b) {
    b = { packNo, pickNo, rows: 0, random: 0, ...Object.fromEntries(names.map((n) => [n, 0])) };
    byPick.set(key, b);
  }
  return b;
};

/**
 * One drafter's rows, in order, scored by every policy.
 *
 * Walked as a trajectory rather than row by row, which the first version did:
 * `pool_*` says what the drafter had TAKEN and nothing says what they had SEEN,
 * so a row-at-a-time reading leaves `openness` at zero forever and quietly
 * measures the fitted policy with its signal term switched off.
 *
 * The memory is therefore accumulated exactly the way a bot's is, in the same
 * order `Bot.pick` uses -- score, then see, then take.
 */
function walkDraft(rowsOfDraft) {
  rowsOfDraft.sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
  const memory = new BotMemory();
  // Seeded per draft so the sampled policy is reproducible run to run, and does
  // not correlate across drafters.
  const rng = mulberry32(fnv(rowsOfDraft[0].draftId));

  for (let i = 0; i < rowsOfDraft.length; i++) {
    const { pack, picked, packNo, pickNo } = rowsOfDraft[i];
    if (!picked) {
      memory.see(pack);
      continue;
    }
    if (pack.length < 2) {
      memory.see(pack);
      memory.take(picked);
      continue;
    }

    const progress = draftProgress(i, rowsOfDraft.length);
    const b = bucket(packNo, pickNo);
    rows++;
    b.rows++;
    randomExpected += 1 / pack.length;
    b.random += 1 / pack.length;

    for (const name of names) {
      if (POLICIES[name](pack, memory, progress, rng) === picked) {
        hits.set(name, hits.get(name) + 1);
        b[name]++;
      }
    }

    memory.see(pack);
    memory.take(picked);
  }
  if (rows % 100_000 < rowsOfDraft.length) log(`  ${rows.toLocaleString()} picks scored...`);
}

const started = Date.now();

const flush = () => {
  if (buffer.length === 0) return;
  if (heldOut(currentDraft)) {
    drafts++;
    walkDraft(buffer);
  }
  buffer = [];
};

for await (const line of lines({ kind: "draft", setCode, format, localPath: localDraft, log })) {
  if (!header) {
    header = splitRow(line);
    iDraft = header.indexOf("draft_id");
    iPack = header.indexOf("pack_number");
    iPickNo = header.indexOf("pick_number");
    iPick = header.indexOf("pick");
    if (iPickNo < 0 || iPick < 0 || iDraft < 0) {
      throw new Error("not a 17Lands draft dataset");
    }
    // Resolved once. Per row this is an array walk over precomputed indices
    // rather than a scan of 586 column names.
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (!h.startsWith("pack_card_")) continue;
      const card = byName.get(normalizeName(h.slice("pack_card_".length)));
      if (card) packCols.push([i, card]);
    }
    log(`${packCols.length} pack columns joined`);
    continue;
  }

  const row = splitRow(line);
  const draftId = row[iDraft];
  if (draftId !== currentDraft) {
    flush();
    currentDraft = draftId;
    if (limit && drafts > limit) break;
  }

  const name = row[iPick] ?? "";
  const picked = byName.get(normalizeName(name));
  if (!picked) {
    if (name) unmatched++;
    else skippedNoPick++;
  }

  // The pack as it was offered. A count above 1 is two copies of the same card,
  // which changes nothing about the decision -- the deterministic policies are
  // functions of the card, so a duplicate can only tie with itself.
  const pack = [];
  for (const [i, card] of packCols) {
    const n = row[i];
    if (n && n !== "0") pack.push(card);
  }

  buffer.push({
    draftId,
    packNo: Number(row[iPack]),
    pickNo: Number(row[iPickNo]),
    pack,
    picked,
  });
}
flush();

// ---------------------------------------------------------------- report

if (rows === 0) throw new Error("no rows scored -- wrong set, or nothing joined");

const pct = (n) => `${((n / rows) * 100).toFixed(1)}%`;
const secs = ((Date.now() - started) / 1000).toFixed(0);

console.log();
console.log(`${setCode}/${format} -- ${rows.toLocaleString()} held-out picks from ${drafts.toLocaleString()} drafts (${secs}s)`);
if (unmatched) console.log(`${unmatched.toLocaleString()} picks named a card not in the ingested pool`);
if (skippedNoPick) console.log(`${skippedNoPick.toLocaleString()} rows had no pick`);
console.log();
console.log("top-1 agreement with the human pick");
console.log(`  random  ${pct(randomExpected)}   (exact, not sampled)`);
for (const name of names) {
  const note = name === "crowd" ? "   <- consensus only, and has seen the answers" : "";
  console.log(`  ${name.padEnd(7)} ${pct(hits.get(name))}${note}`);
}

console.log();
console.log("by pack and pick (P1P1 is the only decision made with no pool)");
console.log(`  seat     rows      random   ${names.map((n) => n.padEnd(8)).join("")}`);
const ordered = [...byPick.values()].sort(
  (a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo,
);
for (const b of ordered) {
  const p = (n) => `${((n / b.rows) * 100).toFixed(1)}%`.padEnd(8);
  const seat = `P${b.packNo + 1}P${b.pickNo + 1}`;
  console.log(
    `  ${seat.padEnd(6)} ${String(b.rows).padStart(8)}  ${p(b.random)} ` +
      names.map((n) => p(b[n])).join(""),
  );
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        setCode,
        format,
        rows,
        drafts,
        random: randomExpected / rows,
        policies: Object.fromEntries(names.map((n) => [n, hits.get(n) / rows])),
        bySeat: Object.fromEntries(
          [...byPick.entries()].map(([k, b]) => [
            k,
            {
              packNo: b.packNo,
              pickNo: b.pickNo,
              rows: b.rows,
              random: b.random / b.rows,
              ...Object.fromEntries(names.map((n) => [n, b[n] / b.rows])),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonOut}`);
}

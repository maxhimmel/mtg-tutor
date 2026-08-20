// How often does the scorer nominate a card the drafter's deck cannot play?
//
//   node scripts/diagnose-offcolour.mjs
//   node scripts/diagnose-offcolour.mjs fdn dsk --drafts 4000
//
// WHAT THIS EXISTS TO SETTLE
//
// notes.md issues #4 and #18 are the same report twice: a black land held up
// against a nine-card UG pool at P2P1, and a green frog held up against a
// finished deck at P3P9. Both are `contextBest` naming a card that the deck on
// screen was never going to play, and neither is visible in any number the app
// collects -- the grade, the accuracy and the backtest all read as healthy while
// the advice reads as nonsense.
//
// `backtest-scoring` cannot answer this and says so in its own header: trophy
// pick rate carries no archetype, so it runs at zero commitment, which is
// exactly where the colour terms vanish. What is needed instead is a pool, and
// real pools are what `datasets/` holds.
//
// THE MEASUREMENT, AND WHY IT IS SHAPED THIS WAY
//
// Human rate first, ours beside it -- trap #7's lesson, learned when a bot
// policy beat every aggregate in the harness while passing bombs at twice the
// human rate. An off-colour rate on its own is not a verdict: some genuinely
// correct picks are off-colour, early picks especially, and a scorer that never
// nominated one would be broken in the other direction. The claim only becomes
// legible against what drafters actually do with the same pack.
//
// So this reports, per pack, the share of picks where the card was off the
// deck's committed colours -- for the human, and for whatever `contextValue`
// currently ranks first. The gap between those two columns IS the bug.
//
// `isOnColor` and the context itself are imported rather than reimplemented, on
// purpose. A harness that defined "off-colour" for itself would be measuring a
// rule the app does not run, and the two would drift the first time one moved.
// The context comes from `packScoringContext`, the same call the mutation makes,
// for the same reason: this file spent its first life building a ctx by hand and
// it went stale the moment the colour rule moved underneath it.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not fit anything, and nothing here is a target. The human column is a
// constraint in exactly the sense trap #1 describes: it can catch a wrong shape
// -- a scorer nominating off-colour cards at P3 when nobody does -- and it
// cannot say what the right magnitude is. Chasing the human rate to zero
// difference would be fitting to drafter behaviour again.
//
// It also asks the network nothing. Both halves are on disk already: the set
// stats artifact is committed, and the packs are the `datasets/` cache that
// `human-bots` left behind.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cardValue, contextValue, isOnColor, packScoringContext } from "@mtg-tutor/core";
import { draftPicks } from "./lib/draftCache.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");

const argv = process.argv.slice(2);
// A flag's VALUE is not a set code, and reading it as one printed "500: no
// stats artifact" on the first run.
const taken = new Set();
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  if (at < 0 || !argv[at + 1]) return fallback;
  taken.add(at).add(at + 1);
  return Number(argv[at + 1]);
};
const DRAFTS = flag("drafts", 2000);
const only = argv.filter((a, i) => !a.startsWith("--") && !taken.has(i));
const FORMAT = "TradDraft";

// Every set with both halves cached. A set whose packs have never been built
// would spend a quarter of an hour streaming a CSV on a run somebody expects to
// take seconds, so a missing cache is skipped and named rather than filled.
const SETS = only.length
  ? only
  : ["fdn", "dsk", "woe", "blb", "mkm", "otj", "lci", "mh3"];

/**
 * The per-card context the pick path would have, out of the committed artifact.
 *
 * `archWr` is assembled from the flat `archetypes` rows because that is the
 * shape `setCardContext` stores and therefore the shape `archDelta` reads. `se`
 * is recomputed here rather than read: the artifact carries `gihN` and `gihWr`,
 * and one standard error on a proportion is sqrt(p(1-p)/n) -- the same formula
 * ingest settles, close enough that a difference would be a bug in one of them.
 */
function contextIndex(doc) {
  const byName = new Map();
  const at = (name) => {
    let entry = byName.get(name);
    if (!entry) {
      entry = {};
      byName.set(name, entry);
    }
    return entry;
  };

  for (const c of doc.cards) {
    const entry = at(c.name);
    entry.iwd = c.iwd;
    entry.maindeckRate = c.maindeckRate;
    entry.speed = c.ohWr != null && c.gdWr != null ? c.ohWr - c.gdWr : undefined;
    if (c.gihWr != null && c.gihN > 0) {
      entry.se = Math.sqrt((c.gihWr * (1 - c.gihWr)) / c.gihN);
    }
  }
  for (const a of doc.archetypes ?? []) {
    const entry = at(a.name);
    entry.archWr ??= {};
    entry.archWr[a.colors] = a.wr;
  }
  return byName;
}

/** A card is off-colour when the deck has colours and this card meets none. */
const offColour = (committed, card) => !isOnColor(committed, card.colors);

function blank() {
  return { picks: 0, humanOff: 0, oursOff: 0, gapSum: 0, gapN: 0, penaltySum: 0, penaltyN: 0, commitSum: 0 };
}

function tally(bucket, { humanOff, oursOff, gap, penalty, commit }) {
  bucket.picks++;
  bucket.commitSum += commit;
  if (humanOff) bucket.humanOff++;
  if (oursOff) {
    bucket.oursOff++;
    if (gap != null) {
      bucket.gapSum += gap;
      bucket.gapN++;
    }
  }
  if (penalty != null) {
    bucket.penaltySum += penalty;
    bucket.penaltyN++;
  }
}

const pct = (n, d) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : "--");

async function run(setCode) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(DATA, `${setCode}.${FORMAT}.json`), "utf8"));
  } catch {
    console.log(`${setCode}: no stats artifact in data/, skipped`);
    return null;
  }

  const archetypes = (doc.colorWinRates ?? []).filter((c) => /^[WUBRG]+$/.test(c.colors));
  if (archetypes.length === 0) {
    console.log(`${setCode}: artifact carries no colour win rates, skipped`);
    return null;
  }
  const contexts = contextIndex(doc);
  const contextFor = (card) => contexts.get(card.name);

  let cache;
  try {
    cache = await draftPicks({ client: null, api: null, setCode, format: FORMAT });
  } catch (err) {
    console.log(`${setCode}: ${err.message.split("\n")[0]}, skipped`);
    return null;
  }

  const packs = [blank(), blank(), blank()];
  const all = blank();

  for (const draft of cache.drafts.slice(0, DRAFTS)) {
    const rows = cache.rows(draft);
    // A drafter's own picks, in order, are the only pool this needs -- the same
    // reconstruction `poolFromLastPick` does from a stored row, one pick at a
    // time. Rows whose card the ingested pool does not carry are skipped rather
    // than guessed at, and they leave a hole in the pool exactly as a missing
    // pick would.
    // WHOLE CARDS, not `{name, colors}`. The first version of this pushed the
    // `PoolCard` projection a stored row carries, which `committedColors` is
    // happy with and `commitment` is not: it weights the share by `cardValue`,
    // so a pool of projections totals zero value, returns a zero share, and
    // pins commitment at 0 for the entire draft. Every colour term is scaled by
    // that number, so the harness measured a scorer with its colour half
    // switched off and reported it as the scorer's own behaviour -- trap #9, in
    // the instrument rather than in the app. `committed` is asserted non-zero
    // below for exactly that reason.
    const pool = [];
    for (const row of rows) {
      const ctx = packScoringContext(pool, pool.length, rows.length, archetypes, contextFor);
      const committed = ctx.colors;
      const commit = ctx.commitment;

      if (row.picked && row.pack.length > 1 && committed.size > 0) {

        let best = null;
        let bestOn = null;
        for (const card of row.pack) {
          const scored = contextValue(card, ctx).value;
          if (!best || scored > best.scored) best = { card, scored };
          if (!offColour(committed, card) && (!bestOn || scored > bestOn.scored)) {
            bestOn = { card, scored };
          }
        }

        const oursOff = offColour(committed, best.card);
        // What the colour terms actually charged the card we nominated, in win
        // rate points. Every colour term, which for a fortnight it was not: the
        // filter named `splash` and `archetype` and predated `off-color`, so the
        // number under the table was the charge MINUS the term the table exists
        // to measure. `trust` is the only one excluded, because it is about the
        // win rate rather than about the colour.
        const penalty = oursOff
          ? contextValue(best.card, ctx)
              .terms.filter((t) => t.label !== "trust")
              .reduce((a, t) => a + t.delta, 0)
          : null;

        const entry = {
          commit,
          humanOff: offColour(committed, row.picked),
          oursOff,
          gap: oursOff && bestOn ? best.scored - bestOn.scored : null,
          penalty,
        };
        tally(all, entry);
        const bucket = packs[Math.min(2, row.packNo)];
        if (bucket) tally(bucket, entry);
      }

      if (row.picked) pool.push(row.picked);
    }
  }

  return { setCode, packs, all };
}

const rows = [];
for (const setCode of SETS) {
  const result = await run(setCode);
  if (result) rows.push(result);
}

if (rows.length === 0) {
  console.log("\nNothing to measure. `pnpm cache-cards` fills datasets/ for a set.\n");
  process.exit(0);
}

// Human first in every pair, which is the point of the layout: the eye should
// land on what drafters do before it lands on what we do.
console.log(
  `\n${"set".padEnd(6)} ${"picks".padStart(7)}   ` +
    ["P1", "P2", "P3", "all"].map((p) => `${p} human / ours`.padStart(17)).join("  "),
);

const columns = (r) =>
  [...r.packs, r.all]
    .map((b) => `${pct(b.humanOff, b.picks)} / ${pct(b.oursOff, b.picks)}`.padStart(17))
    .join("  ");

// Every colour term is multiplied by commitment, so a run where it never leaves
// zero is measuring nothing and must not be allowed to print a table that looks
// like it did. This is the check trap #9 asks for -- "if this input were
// missing, would anything say so?" -- and it exists because the first version of
// this file failed exactly here and reported the result as a finding.
const commitPeak = Math.max(...rows.map((r) => r.all.commitSum / Math.max(1, r.all.picks)));
if (!(commitPeak > 0.01)) {
  console.error(
    `\nMean commitment is ${commitPeak.toFixed(4)} across every set, so the colour\n` +
      `terms this measures were all scaled to nothing. The pool is reaching\n` +
      `\`commitment\` without values on its cards. Refusing to print a table.\n`,
  );
  process.exit(1);
}

for (const r of rows) {
  console.log(`${r.setCode.padEnd(6)} ${String(r.all.picks).padStart(7)}   ${columns(r)}`);
}

const pooled = rows.reduce(
  (acc, r) => {
    for (const key of ["picks", "humanOff", "oursOff", "gapSum", "gapN", "penaltySum", "penaltyN", "commitSum"]) {
      acc.all[key] += r.all[key];
    }
    for (let i = 0; i < 3; i++) {
      acc.packs[i].picks += r.packs[i].picks;
      acc.packs[i].humanOff += r.packs[i].humanOff;
      acc.packs[i].oursOff += r.packs[i].oursOff;
      acc.packs[i].commitSum += r.packs[i].commitSum;
    }
    return acc;
  },
  { all: blank(), packs: [blank(), blank(), blank()] },
);

console.log(`${"pooled".padEnd(6)} ${String(pooled.all.picks).padStart(7)}   ${columns(pooled)}`);

console.log(
  `\ncommitment, mean per pack: ` +
    pooled.packs
      .map((b, i) => `P${i + 1} ${(b.commitSum / Math.max(1, b.picks)).toFixed(2)}`)
      .join("  "),
);
console.log(
  `\nWhen we name an off-colour card it beats the best on-colour card by ` +
    `${((pooled.all.gapSum / Math.max(1, pooled.all.gapN)) * 100).toFixed(2)}pp,\n` +
    `after the colour terms charged it ` +
    `${((pooled.all.penaltySum / Math.max(1, pooled.all.penaltyN)) * 100).toFixed(2)}pp.\n`,
);
console.log(
  "The human column is a constraint, never a target -- see trap #1. A scorer\n" +
    "tuned until the two columns match has learned to predict drafters, not to\n" +
    "judge cards. What it can catch is a SHAPE: ours climbing where theirs falls.\n",
);

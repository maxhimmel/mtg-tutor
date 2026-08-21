// Whether the packs a pod passes look like the packs a real table passes.
//
//   pnpm bench-packs [--set sos] [--format TradDraft] [--pods table2,table3]
//                    [--drafts 400] [--temps 1,0.6,0.4] [--json out.json]
//
// WHY THIS EXISTS, AND WHY `bench-bots` COULD NOT HAVE FOUND IT
//
// `bench-bots` asks how often a pod takes the card the human took. That is a
// question about ONE decision in isolation, and a pod can score well on it while
// dealing packs nobody would believe -- which is exactly what happened. Two
// screenshots, two different mechanisms, neither visible in a top-1 number:
//
//   sos P2P10   Moseo, Vein's New Dean still in the pack at pick 10.
//               Real alsa 0.98 -- it is never in a pack after pick 1. Its gih
//               win rate is 0.6277, which ranks it 164th of 346, so the pod
//               believed it was filler. The RANKING was wrong.
//   mh3 P1P8    Subtlety still in the pack at pick 8. The pod ranks it 11th of
//               294 and passed it seven times anyway. The ranking was right and
//               the SAMPLING was wrong.
//
// A pick-accuracy metric is blind to both, because both are statements about
// what happens to a card over the eight seats it is passed through, and top-1
// never looks past one seat. So this measures the pack instead of the pick.
//
// WHAT IS COMPARED: SURVIVAL, NOT PRESENCE
//
// For every card, `seen[c][k]` counts the packs that still held it at pick k.
// Dividing by the packs observed at pick k gives a share, and dividing THAT by
// the card's own share at pick 1 gives survival: of the packs this card was
// opened in, what fraction still hold it at pick k.
//
// Normalising by the card's own pick-1 share is what makes the two sides
// comparable at all. Our pack model deals a card at its observed opened-rate but
// not exactly -- bonus sheets in particular are dealt evenly where the real
// sheet is rarity-weighted -- so raw presence differs for reasons that have
// nothing to do with the bots. Survival divides that out: it asks only how long
// a card lasts once it is in a pack, which is the question about the pod.
//
// THE 17LANDS SIDE IS A REAL EIGHT-HUMAN TABLE
//
// Arena Traditional Draft pods are eight humans, and the dataset logs one seat's
// view of them: `pack_card_*` is the pack as it reached that seat, at every one
// of 42 picks. So the wheel in this data was produced by seven real drafters
// passing to an eighth. That is the ground truth a pod is trying to reproduce,
// and it needs no model of anything.
//
// AND IT IS NOT A FIT TARGET BY ACCIDENT
//
// `policy.ts` refuses a temperature on the grounds that any value but 1 would be
// "a number with no derivation behind it". This is the derivation. The curve
// below is not top-1 accuracy and was not used to fit a single coefficient, so
// choosing one scalar to match it is a real out-of-sample claim rather than the
// fit grading its own homework. See `--temps`.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Bot, DRAFT, botRng, buildSetData, dealDraft, draftProgress } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const setCode = flag("set", "sos");
const format = flag("format", "TradDraft");
const pods = flag("pods", "table2").split(",");
const temps = flag("temps", "").split(",").filter(Boolean).map(Number);
const ranks = flag("ranks", "shipped").split(",");
const drafts = Number(flag("drafts", 400));
const jsonOut = flag("json");
const log = (...a) => console.error(...a);

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const cache = await draftPicks({ client, api, setCode, format, log });
const artifact = JSON.parse(
  readFileSync(resolve(HERE, "..", "data", `${setCode}.${format}.json`), "utf8"),
);
const set = buildSetData(setCode, cache.cards, artifact.colorWinRates, artifact.packComposition);

// The pick a real table takes a card at, off the committed artifact. Used only
// to CLASSIFY cards into the bomb bucket below -- both sides are classified by
// the same real numbers, so the bucket means the same thing in both columns.
const realAlsa = new Map(
  artifact.cards.filter((c) => c.alsa != null).map((c) => [c.name, c.alsa]),
);
// "A card a real table takes inside the first pick and a half." Not a rarity:
// half the cards that qualify in sos are not rares, and a third of the rares do
// not qualify. What is being measured is what humans DO with the card.
const BOMB_ALSA = 1.5;
const isBomb = (card) => (realAlsa.get(card.name) ?? 99) <= BOMB_ALSA;

// ---------------------------------------------------------------- rankings

// A CANDIDATE ORDERING, PRICED BEFORE IT IS BUILT.
//
// `--ranks` reorders what the bots think cards are worth WITHOUT changing the
// distribution of those numbers: the shipped values are handed out again, in the
// candidate's order, to the same cards. Only the ranking moves.
//
// That is the whole point. The fitted coefficients are on the scale of
// `cardValue` -- `valueOpen` is 43.6 -- so feeding in a raw maindeck rate would
// change the logit spread as well as the order, and the run would price two
// things at once. Rank-remapping isolates the question this file is asking,
// which is whether the pod is ranking cards the way a table does.
//
// Cards the candidate has no number for keep their shipped value untouched, so
// the permutation stays inside the subset the candidate can speak about.
const RANKINGS = {
  // The control.
  shipped: null,
  // The oracle, and not a candidate: it IS the pick order this file measures
  // against, so it marks how much of the gap a ranking could close at best.
  // `bench-bots` forbids a fitted policy from reading draft-dataset aggregates
  // over the answers, and this is the most flagrant one there is.
  alsa: (c) => (c.alsa != null ? -c.alsa : null),
  // Of the times a card was taken, how often it made the deck. Conditioned on
  // being taken, so it says nothing about how EARLY -- a card nobody takes can
  // still maindeck at 1.0. That is what makes it usable where `alsa` is not.
  maindeck: (c) => c.maindeckRate ?? null,
  // Improvement when drawn: the within-deck contrast that is supposed to undo
  // the deck-quality confound in raw win rate. Measured, and it is worse.
  iwd: (c) => c.iwd ?? null,
  // What a pick actually asks -- will this make my deck, and how much does it
  // win when it does -- as the product of the two halves rather than only the
  // second. Centred at the format baseline so a card that maindecks always and
  // wins nothing is not rewarded for the first half alone.
  both: (c) =>
    c.maindeckRate != null && c.gihWr != null ? c.maindeckRate * (c.gihWr - 0.5) : null,
};

function ranked(name) {
  const key = RANKINGS[name];
  if (key === undefined) throw new Error(`unknown --ranks "${name}"; try ${Object.keys(RANKINGS).join(", ")}`);
  if (key === null) return cache.cards;

  const score = new Map();
  for (const row of artifact.cards) {
    const s = key(row);
    if (s != null) score.set(row.name, s);
  }
  const movable = cache.cards.filter((c) => c.slot !== "land" && score.has(c.name));
  const values = movable.map((c) => c.value).sort((a, b) => b - a);
  const order = [...movable].sort((a, b) => score.get(b.name) - score.get(a.name));
  const remap = new Map(order.map((c, i) => [c.name, values[i]]));
  return cache.cards.map((c) => (remap.has(c.name) ? { ...c, value: remap.get(c.name) } : c));
}

// ---------------------------------------------------------------- counting

// `seen[name][k]` packs still holding the card at pick k; `packs[k]` packs
// observed at pick k; `bombPacks[k]` those holding at least one bomb.
function tally() {
  return { seen: new Map(), packs: [], bombPacks: [] };
}

function observe(t, pickNo, pack) {
  t.packs[pickNo] = (t.packs[pickNo] ?? 0) + 1;
  let bomb = false;
  for (const card of pack) {
    let row = t.seen.get(card.name);
    if (!row) t.seen.set(card.name, (row = []));
    row[pickNo] = (row[pickNo] ?? 0) + 1;
    if (isBomb(card)) bomb = true;
  }
  if (bomb) t.bombPacks[pickNo] = (t.bombPacks[pickNo] ?? 0) + 1;
}

/** Survival by pick, over the cards in `names`, weighted by pick-1 appearances. */
function survival(t, names, maxPick) {
  const out = [];
  for (let k = 1; k <= maxPick; k++) {
    let held = 0;
    let opened = 0;
    for (const name of names) {
      const row = t.seen.get(name);
      if (!row?.[1]) continue;
      // Per-pick normalisation first: more packs are observed at pick 1 than at
      // pick 14 in the real data, because a drafter who quits mid-pack still
      // logged their early rows.
      held += ((row[k] ?? 0) / (t.packs[k] || 1)) * row[1];
      opened += (row[1] / (t.packs[1] || 1)) * row[1];
    }
    out.push(opened > 0 ? held / opened : 0);
  }
  return out;
}

/** Mean pick number over every pack-instance the card was still in. */
function meanSeenPick(t, name) {
  const row = t.seen.get(name);
  if (!row) return null;
  let n = 0;
  let sum = 0;
  for (let k = 1; k < row.length; k++) {
    const w = (row[k] ?? 0) / (t.packs[k] || 1);
    n += w;
    sum += w * k;
  }
  return n > 0 ? sum / n : null;
}

// ---------------------------------------------------------------- the real table

const real = tally();
let realDrafts = 0;
for (const draft of cache.drafts) {
  realDrafts++;
  for (const row of cache.rows(draft)) observe(real, row.pickNo, row.pack);
}
const maxPick = real.packs.length - 1;

// ---------------------------------------------------------------- a pod

function simulate(pod, temperature, rank) {
  // Rebuilt per ranking rather than per run: the pools hold the card objects the
  // deal hands to the bots, so a remapped value has to reach them through here.
  const dealtSet = buildSetData(setCode, ranked(rank), artifact.colorWinRates, artifact.packComposition);
  const t = tally();
  for (let s = 0; s < drafts; s++) {
    const seed = 90000 + s;
    const deal = dealDraft(dealtSet, seed);
    const rng = botRng(seed);
    const bots = Array.from({ length: DRAFT.seats }, () => new Bot(pod, rng, undefined, temperature));
    for (let round = 0; round < deal.rounds.length; round++) {
      const packSize = deal.rounds[round][0].length;
      let hands = deal.rounds[round].map((cards) => [...cards]);
      for (let pickNo = 1; pickNo <= packSize; pickNo++) {
        const progress = draftProgress(
          round * packSize + pickNo - 1,
          packSize * deal.rounds.length,
        );
        for (let seat = 0; seat < DRAFT.seats; seat++) {
          observe(t, pickNo, hands[seat]);
          const picked = bots[seat].pick(hands[seat], progress);
          hands[seat] = hands[seat].filter((c) => c !== picked);
        }
        // Pack 1 and 3 pass left, pack 2 passes right -- the engine's rule, and
        // the reason a bot's `see` history is the one a real seat would have.
        const passLeft = (round + 1) % 2 === 1;
        hands = Array.from({ length: DRAFT.seats }, (_, j) =>
          passLeft
            ? hands[(j - 1 + DRAFT.seats) % DRAFT.seats]
            : hands[(j + 1) % DRAFT.seats],
        );
      }
    }
  }
  return t;
}

// ---------------------------------------------------------------- reporting

const bombs = set.cards.filter(isBomb).map((c) => c.name);
const rated = set.cards.filter((c) => c.slot !== "land" && realAlsa.has(c.name)).map((c) => c.name);

function bombPresence(t) {
  const out = [];
  for (let k = 1; k <= maxPick; k++) out.push((t.bombPacks[k] ?? 0) / (t.packs[k] || 1));
  return out;
}

function error(t) {
  // Mean absolute error in "the pick a card is still being seen at", over every
  // card the real data has an opinion about. One number for a whole set.
  let n = 0;
  let sum = 0;
  for (const name of rated) {
    const a = meanSeenPick(real, name);
    const b = meanSeenPick(t, name);
    if (a == null || b == null) continue;
    n++;
    sum += Math.abs(a - b);
  }
  return n ? sum / n : NaN;
}

const pct = (xs) => xs.map((x) => (x * 100).toFixed(0).padStart(4)).join("");
const results = [];

console.log(`${setCode}/${format}: ${realDrafts.toLocaleString()} real drafts, ${drafts} simulated`);
console.log(`${bombs.length} cards a real table takes by pick ${BOMB_ALSA} (alsa <= ${BOMB_ALSA})\n`);

const runs = [];
for (const pod of pods)
  for (const rank of ranks)
    for (const temperature of temps.length ? temps : [undefined]) {
      const label =
        pod +
        (rank === "shipped" ? "" : `/${rank}`) +
        (temperature === undefined ? "" : `@t${temperature}`);
      runs.push({ pod, rank, temperature, label });
    }

const pad = Math.max(6, ...runs.map((r) => r.label.length + 1));
const header = `${" ".repeat(pad)}${Array.from({ length: maxPick }, (_, i) => String(i + 1).padStart(4)).join("")}`;
console.log("SURVIVAL of those cards, % of the packs that opened one that still hold it");
console.log(header);
console.log(`${"real".padEnd(pad)}${pct(survival(real, bombs, maxPick))}`);

for (const run of runs) {
  run.tally = simulate(run.pod, run.temperature, run.rank);
  console.log(`${run.label.padEnd(pad)}${pct(survival(run.tally, bombs, maxPick))}`);
}

console.log("\nP(the pack still holds one of them) by pick");
console.log(header);
console.log(`${"real".padEnd(pad)}${pct(bombPresence(real))}`);
for (const run of runs) console.log(`${run.label.padEnd(pad)}${pct(bombPresence(run.tally))}`);

console.log("\nmean |simulated - real| over the pick a card is still being seen at");
for (const run of runs) {
  const e = error(run.tally);
  results.push({ ...run, tally: undefined, error: e });
  console.log(`  ${run.label.padEnd(14)} ${e.toFixed(3)} picks`);
}

// The cards a pod holds longest against the real table. Where the remaining
// error actually is, rather than an average that hides it.
const worst = runs.length === 1 ? runs[0] : null;
if (worst) {
  const rows = rated
    .map((name) => ({
      name,
      real: meanSeenPick(real, name),
      sim: meanSeenPick(worst.tally, name),
    }))
    .filter((r) => r.real != null && r.sim != null)
    .sort((a, b) => b.sim - b.real - (a.sim - a.real));
  console.log(`\n${worst.label}: held longest past the real table`);
  console.log("  simSeen realSeen   diff  alsa   name");
  for (const r of rows.slice(0, 12))
    console.log(
      `  ${r.sim.toFixed(2).padStart(7)} ${r.real.toFixed(2).padStart(8)} ${(r.sim - r.real).toFixed(2).padStart(6)}  ${String(realAlsa.get(r.name)).padEnd(5)} ${r.name}`,
    );
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ setCode, format, drafts, realDrafts, bombs: bombs.length, results }, null, 2),
  );
  log(`wrote ${jsonOut}`);
}

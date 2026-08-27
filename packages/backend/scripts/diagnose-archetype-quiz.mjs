// How many questions the archetype quiz can actually ask, and at what gate.
//
//   node scripts/diagnose-archetype-quiz.mjs [--set fdn] [--verbose]
//   node scripts/diagnose-archetype-quiz.mjs --calibrate [--draws 2000000]
//
// WHY THIS EXISTS
//
// The drill asks "which of these two decks wants this card", and the reason it
// asks that rather than the question notes Ideas #1 wrote down -- "which
// archetype does this card belong to" -- is a number this script prints. The
// idea as written is a quiz whose answers are mostly noise; narrowed to two
// decks and gated against the right null it has 335 real questions, and 17 of
// the 25 sets with archetype data hold a full run.
//
// It is committed rather than thrown away because `ARCHETYPE_QUIZ.falsePositive`
// is a setting somebody will want to move, and moving it should be an argument
// with this table rather than with a memory of it. Trap #22: an instrument
// beside a threshold measures the setting, not whether the setting is right --
// so what this prints is the whole curve, and the rate is chosen by reading it.
//
// `--calibrate` regenerates `RANGE_CRITICAL` in core, which is the other half of
// the same discipline. That table is what makes the gate honest -- best minus
// worst is a range over k decks and the widest gap among many noisy numbers is
// wide even when nothing is there -- and a table nobody can reproduce is a
// magic number with a comment on it.
//
// WHAT IT READS, AND THE ONE THING IT HAS TO BORROW
//
// The committed artifacts in data/ hold everything the derivation needs except
// card COLOURS, which come from Scryfall at ingest and are never written into a
// stats artifact. The app checks them, so a run of this that did not would
// count questions the app will not ask.
//
// It is not a small correction and DUAL LANDS are why. A land is colourless and
// gets played in exactly the decks its colours serve, so the archetype table
// alone reads it as a mono-coloured card with strong opinions -- and because
// those opinions are real, lands land near the TOP of the ranking. Before this
// read colours, the sharpest question in five sets was a land.
//
// So colours come from `datasets/cards.<set>.<format>.json`, the same cache
// `bench-bots` and `fit-bot-policy` read, which carries the real `colors` off
// the set's pool. `datasets/` is gitignored, so a fresh clone has none of it:
// a set with no cache falls back to the archetype-table inference and is marked
// with a `~`, and its number is a CEILING rather than a count.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHETYPE_QUIZ,
  archetypeQuestions,
  normalizeName,
  sharedColor,
} from "@mtg-tutor/core";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const RATES = ["0.10", "0.05", "0.01"];
const ONLY = arg("--set", null);
const VERBOSE = process.argv.includes("--verbose");

// Regenerate the null-range table. Box-Muller rather than a dependency, and the
// same `(max - min) / sqrt(2)` that `separation` computes -- two independent
// unit variances sum to two, so the divisor is not a fudge.
if (process.argv.includes("--calibrate")) {
  const draws = Number(arg("--draws", "2000000"));
  const gauss = () => {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  };

  console.log(`\nNull range over ${draws.toLocaleString()} draws. Paste into RANGE_CRITICAL.\n`);
  for (let k = 2; k <= 10; k++) {
    const seps = new Float64Array(draws);
    for (let i = 0; i < draws; i++) {
      let hi = -Infinity;
      let lo = Infinity;
      for (let j = 0; j < k; j++) {
        const x = gauss();
        if (x > hi) hi = x;
        if (x < lo) lo = x;
      }
      seps[i] = (hi - lo) / Math.SQRT2;
    }
    seps.sort();
    const q = (p) => seps[Math.floor((1 - p) * draws)].toFixed(2);
    console.log(`  ${k}: { "0.10": ${q(0.1)}, "0.05": ${q(0.05)}, "0.01": ${q(0.01)} },`);
  }
  // k=2 must come out at 1.96: with nothing to maximise over the range test is
  // the ordinary two-sided z-test, so that row is the table checking itself.
  console.log("\nThe k=2 row must read 1.96 at 0.05, or the simulation is wrong.");
  process.exit(0);
}

/**
 * Real colours off the cached pool, or the inference if there is no cache.
 *
 * The returned flag is what the table prints a `~` from. A count taken without
 * colours is not wrong so much as answering a slightly different question, and
 * a table that did not say which rows those were would be inviting somebody to
 * read the two as one number.
 */
function colorsFor(set) {
  const cache = join(DATA, "..", "..", "..", "datasets", `cards.${set.setCode}.${set.format}.json`);
  if (existsSync(cache)) {
    const cards = JSON.parse(readFileSync(cache, "utf8"));
    const byName = new Map(cards.map((c) => [normalizeName(c.name), c.colors.join("")]));
    return { exact: true, colorOf: (name) => byName.get(normalizeName(name)) };
  }
  return {
    exact: false,
    colorOf: (name) =>
      sharedColor(set.archetypes.filter((r) => r.name === name).map((r) => r.colors)),
  };
}

const rows = [];
let mute = 0;

for (const file of readdirSync(DATA).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  if (ONLY && set.setCode !== ONLY) continue;

  // A set with no archetype table cannot ask anything at all, and saying so is
  // half the point of running this -- notes issue #8 is a set that degrades in
  // silence, and this is the surface that stops it being silent.
  if (!set.archetypes?.length || !set.colorWinRates?.length) {
    rows.push({ code: set.setCode, mute: true });
    mute++;
    continue;
  }

  const { exact, colorOf } = colorsFor(set);
  const counts = RATES.map(
    (falsePositive) =>
      archetypeQuestions(set.archetypes, set.colorWinRates, colorOf, {
        minDecks: ARCHETYPE_QUIZ.minDecks,
        falsePositive,
      }).length,
  );

  const shipped = archetypeQuestions(set.archetypes, set.colorWinRates, colorOf, ARCHETYPE_QUIZ);
  rows.push({ code: set.setCode, counts, shipped, exact });
}

const pad = (v, w) => String(v).padStart(w);

console.log(
  `\nQuestions per set, by the rate at which a card whose decks agree is asked` +
    ` about anyway.\nminDecks ${ARCHETYPE_QUIZ.minDecks}; the width each rate buys is per deck count, see RANGE_CRITICAL.\n`,
);
console.log(`set     ${RATES.map((r) => pad(`${Number(r) * 100}%`, 7)).join("")}   run of ${ARCHETYPE_QUIZ.runLength}?`);

const totals = RATES.map(() => 0);
let short = 0;
let live = 0;
let approximate = 0;

for (const row of rows) {
  if (row.mute) {
    console.log(`${row.code.padEnd(7)}   — no archetype data, cannot be quizzed`);
    continue;
  }
  live++;
  row.counts.forEach((c, i) => (totals[i] += c));

  // The number that decides whether a set is offered at all. A set with four
  // questions is not a short run, it is a screen that deals the same four
  // cards to everyone forever.
  const fills = row.shipped.length >= ARCHETYPE_QUIZ.runLength;
  if (!fills) short++;

  if (!row.exact) approximate++;

  console.log(
    `${(row.code + (row.exact ? "" : "~")).padEnd(7)}${row.counts.map((c) => pad(c, 7)).join("")}   ${
      fills ? "yes" : `no — ${row.shipped.length}`
    }`,
  );
}

console.log(`\n${"total".padEnd(7)}${totals.map((t) => pad(t, 7)).join("")}`);
if (approximate > 0) {
  console.log(
    `\n~ ${approximate} set${approximate === 1 ? " has" : "s have"} no cached pool in datasets/, ` +
      `so colours are inferred and those counts are a ceiling.`,
  );
}
console.log(
  `\n${live} sets with archetype data, ${mute} without. ` +
    `At the shipped rate of ${Number(ARCHETYPE_QUIZ.falsePositive) * 100}%, ` +
    `${live - short} of ${live} can fill a run of ${ARCHETYPE_QUIZ.runLength}.`,
);

if (VERBOSE) {
  console.log("\nThe sharpest question in each set:\n");
  for (const row of rows) {
    if (row.mute || row.shipped.length === 0) continue;
    const q = row.shipped[0];
    const want = q.decks[0];
    const spurn = q.decks[q.decks.length - 1];
    const pp = (v) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}pp`;
    console.log(
      `${row.code.padEnd(5)} ${q.name.padEnd(30)} ${q.wants} ${pp(want.lift)} vs ` +
        `${q.spurns} ${pp(spurn.lift)}   ${q.sigmas.toFixed(1)}σ`,
    );
  }
}

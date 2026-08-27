// How many questions the archetype quiz can actually ask, and at what gate.
//
//   node scripts/diagnose-archetype-quiz.mjs [--sigmas 1.5,2,2.5,3]
//                                            [--set fdn] [--verbose]
//
// WHY THIS EXISTS
//
// The drill asks "which of these two decks wants this card", and the reason it
// asks that rather than the question notes Ideas #1 wrote down -- "which
// archetype does this card belong to" -- is a number this script prints. Naming
// the ONE deck that wants a card most clears two standard errors for 3.5% of
// cards. Naming which of two decks wants it more clears the same bar for 30.1%.
// The idea as written is a quiz whose answers are noise; narrowed to two decks
// it has 1,149 real questions.
//
// It is committed rather than thrown away because `ARCHETYPE_QUIZ.minSigmas` is
// a setting somebody will want to move, and moving it should be an argument
// with this table rather than with a memory of it. Trap #22: an instrument
// beside a threshold measures the setting, not whether the setting is right --
// so what this prints is the whole curve, and the choice of 2 is made by
// reading it.
//
// WHAT IT READS AND WHAT IT CANNOT
//
// The committed artifacts in data/, which is everything the derivation needs
// except one thing: card COLOURS, which come from Scryfall at ingest and are
// never written into a stats artifact. So this counts a card as mono-coloured
// when every deck it has a rate in shares exactly one colour, which is the same
// inference `sharedColor` makes and is where the app then checks the card's
// real colours and drops the ones that disagree.
//
// That makes every count here a CEILING. The overcount is colourless cards that
// happened to be played mostly in one colour's decks -- real, small, and in the
// direction that cannot hide a shortfall: a set this script says has 8
// questions does not have 20.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHETYPE_QUIZ, archetypeQuestions, sharedColor } from "@mtg-tutor/core";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};

const SIGMAS = arg("--sigmas", "1.5,2,2.5,3").split(",").map(Number);
const ONLY = arg("--set", null);
const VERBOSE = process.argv.includes("--verbose");

// The colour check the app makes and this cannot. Passing the inferred colour
// straight back through is what makes these counts a ceiling rather than a
// measurement -- see the header.
const inferredColor = (rates) => (name) => {
  const decks = rates.filter((r) => r.name === name).map((r) => r.colors);
  return sharedColor(decks);
};

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

  const colorOf = inferredColor(set.archetypes);
  const counts = SIGMAS.map(
    (minSigmas) =>
      archetypeQuestions(set.archetypes, set.colorWinRates, colorOf, {
        minDecks: ARCHETYPE_QUIZ.minDecks,
        minSigmas,
      }).length,
  );

  const shipped = archetypeQuestions(set.archetypes, set.colorWinRates, colorOf, ARCHETYPE_QUIZ);
  rows.push({ code: set.setCode, counts, shipped });
}

const pad = (v, w) => String(v).padStart(w);

console.log(`\nQuestions per set, by separation gate. minDecks ${ARCHETYPE_QUIZ.minDecks}.\n`);
console.log(`set     ${SIGMAS.map((s) => pad(`@${s}σ`, 7)).join("")}   run of ${ARCHETYPE_QUIZ.runLength}?`);

const totals = SIGMAS.map(() => 0);
let short = 0;
let live = 0;

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

  console.log(
    `${row.code.padEnd(7)}${row.counts.map((c) => pad(c, 7)).join("")}   ${
      fills ? "yes" : `no — ${row.shipped.length}`
    }`,
  );
}

console.log(`\n${"total".padEnd(7)}${totals.map((t) => pad(t, 7)).join("")}`);
console.log(
  `\n${live} sets with archetype data, ${mute} without. ` +
    `At the shipped gate of ${ARCHETYPE_QUIZ.minSigmas}σ, ${live - short} of ${live} can fill a run of ${ARCHETYPE_QUIZ.runLength}.`,
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

// What `margin` looks like in each drill, over every archived set.
//
// WHY IT IS COMMITTED. These numbers deleted a feature. A chart on /stats banded
// answers by how far past its own bar each question sat, and the measurement
// below is what showed it could not work: the archetype quiz's whole corpus is
// 242 separable questions with a median margin of 1.13 and a maximum of 2.39, so
// three bands split them 226/15/1 and the drawing was one dot beside two
// permanent zeroes. Deck speed spreads properly. A claim that expensive should
// be re-runnable by the next person rather than quoted from a commit message.
//
// IT ALSO SETTLES THE OTHER HALF: the two margins are not the same statistical
// event. Deck speed's is `min(|z| / width, |resid| / worthSaying)` and the
// effect-size leg binds it most of the time; the archetype quiz's is
// `sigmas / rangeThreshold(k)` with no effect-size leg at all, which is the
// Healer's Hawk inversion `deckSpeed.ts` records. Anything that pools, bands or
// draws them together is reading two quantities as one.
//
// Reads the committed artifacts under `data/` and the card lists under
// `datasets/`, so it needs no deployment and no network.

import { readdirSync, readFileSync } from "node:fs";
import {
  ARCHETYPE_QUIZ,
  DECK_SPEED,
  archetypeQuestions,
  deckSpeedBank,
} from "@mtg-tutor/core";

const STATS = new URL("../data/", import.meta.url);
const CARDS = new URL("../../../datasets/", import.meta.url);

/** The bands the deleted chart used, kept so the shape it drew stays checkable. */
const BANDS = [1, 1.5, 2];
const band = (m) => (m >= BANDS[2] ? 2 : m >= BANDS[1] ? 1 : 0);

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

function report(name, margins) {
  if (margins.length === 0) return console.log(`${name}: nothing measured`);
  const sorted = [...margins].sort((a, b) => a - b);
  const counts = [0, 0, 0];
  for (const m of margins) counts[band(m)]++;
  const pct = (n) => `${((100 * n) / margins.length).toFixed(1)}%`;
  console.log(
    `${name.padEnd(11)} n=${String(margins.length).padStart(5)}  ` +
      `p50=${quantile(sorted, 0.5).toFixed(2)}  p90=${quantile(sorted, 0.9).toFixed(2)}  ` +
      `max=${sorted.at(-1).toFixed(2)}`,
  );
  console.log(
    `            bands 1-1.5 / 1.5-2 / 2+ = ${counts.join(" / ")}  ` +
      `(${counts.map(pct).join(" / ")})`,
  );
}

const archetype = [];
const deckSpeed = [];
let boundByZ = 0;
let boundByEffect = 0;

for (const file of readdirSync(STATS).filter((f) => f.endsWith(".TradDraft.json"))) {
  const stats = JSON.parse(readFileSync(new URL(file, STATS), "utf8"));

  const decks = stats.colorWinRates ?? [];
  if (stats.archetypes?.length && decks.length) {
    // Colours and roles live on the card list rather than the statistics, and
    // without them every candidate is dropped -- which reads as a set with no
    // questions rather than as a missing file.
    let pool = new Map();
    try {
      const cards = JSON.parse(readFileSync(new URL(`cards.${file}`, CARDS), "utf8"));
      pool = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
    } catch {
      console.warn(`no card list for ${file}; its archetype questions are skipped`);
    }
    const cardFor = (name) => {
      const c = pool.get(name.toLowerCase());
      return c && { colors: (c.colors ?? []).join(""), role: c.role };
    };
    for (const q of archetypeQuestions(stats.archetypes, decks, cardFor, ARCHETYPE_QUIZ)) {
      if (q.separated) archetype.push(q.margin);
    }
  }

  if (stats.turnStats) {
    const bank = deckSpeedBank(stats.cards, DECK_SPEED);
    for (const q of bank.questions) {
      if (q.answer === "middle") continue;
      deckSpeed.push(q.margin);
      // Which of the two gates the margin actually came from. The archetype quiz
      // has no equivalent of the second one, which is the whole finding.
      const z = Math.abs(q.sigmas) / DECK_SPEED.width;
      const effect = Math.abs(q.resid) / bank.worthSaying;
      if (z <= effect) boundByZ++;
      else boundByEffect++;
    }
  }
}

report("ARCHETYPES", archetype);
report("DECK SPEED", deckSpeed);

const bound = boundByZ + boundByEffect;
console.log(
  `\ndeck speed's binding gate: z ${boundByZ} (${((100 * boundByZ) / bound).toFixed(1)}%), ` +
    `effect floor ${boundByEffect} (${((100 * boundByEffect) / bound).toFixed(1)}%)`,
);
console.log(
  "the archetype quiz has no effect-size gate, so none of its margins can be bound by one",
);

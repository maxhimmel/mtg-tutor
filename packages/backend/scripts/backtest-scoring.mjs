// Does the context score rank what winning drafters took better than the raw
// one does?
//
//   node scripts/backtest-scoring.mjs
//   node scripts/backtest-scoring.mjs fdn
//
// Ground truth is `trophyPickRate` -- the pick rate among drafters who went 3-0,
// computed by build-set-stats and read by nothing else. It is the only signal we
// hold that is about DECISIONS rather than outcomes, which is what a pick scorer
// is trying to get right.
//
// WHAT THIS CAN AND CANNOT SHOW.
//
// Trophy pick rate is aggregated over every 3-0 drafter with no archetype
// attached, so it says nothing about `archDelta` or `splashCost` -- both are
// pool-dependent and vanish at zero commitment, which is where this runs. Those
// two need no validation of this kind anyway: they are measured win rates
// carried through in their own units, not predictions about behaviour.
//
// What is left is the two card-intrinsic corrections, and they ARE predictions:
// that IWD carries something a win rate does not, and that a card people take
// and then do not play deserves less trust. A wrong sign on either would make
// the scorer worse in a way nothing else here would notice.
//
// Spearman, not Pearson: a scorer's job is to ORDER a pack, and the units it
// orders in are not the units a pick rate lives in.
//
// AND THE THING THIS CANNOT BE USED FOR.
//
// Do not fit weights against this number. Trophy pick rate and maindeck rate
// are both "what drafters DID with this card", and they know each other well:
// maindeck rate ALONE ranks trophy picks at rho 0.90, against 0.81 for the card
// value we are trying to improve. A weight search run against this objective
// duly found +0.12, which is not a better scorer -- it is a scorer that has
// learned to predict one behaviour from another.
//
// So this is a CONSTRAINT, not a target. It can catch a wrong sign or a wrong
// shape, which is what it was built for and what it immediately found. It
// cannot tell you a magnitude, and a term whose magnitude cannot be justified
// some other way does not belong in the score.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCardValue, contextValue, SCORING } from "@mtg-tutor/core";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function spearman(pairs) {
  const rank = (values) => {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    for (let i = 0; i < order.length; ) {
      // Average the rank over ties, or a block of equal values biases the
      // correlation by whatever order they happened to arrive in.
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const shared = (i + j) / 2;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = shared;
      i = j + 1;
    }
    return ranks;
  };

  const xs = rank(pairs.map((p) => p[0]));
  const ys = rank(pairs.map((p) => p[1]));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const files = readdirSync(DATA)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => only.length === 0 || only.some((o) => f.startsWith(o)));

console.log(`\n${"set".padEnd(6)} ${"n".padStart(5)}  ${"raw".padStart(7)}  ${"+trust".padStart(8)}  ${"context".padStart(8)}`);

const deltas = [];
for (const file of files) {
  const doc = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const archetypes = (doc.colorWinRates ?? []).filter((c) => /^[WUBRG]+$/.test(c.colors));

  // Cards a 3-0 drafter was actually offered often enough to have an opinion
  // about. The floor is the artifact's own; nothing is re-derived here.
  const judged = doc.cards.filter((c) => c.trophyPickRate != null && c.gihWr != null);
  if (judged.length < 30 || archetypes.length === 0) continue;

  const raw = [];
  const ctx = [];
  const trustOnly = [];
  for (const c of judged) {
    const card = {
      rarity: "common",
      gihWinRate: c.gihWr,
      gihGames: c.gihN,
      alsa: c.alsa,
      rarityBaseline: undefined,
      // Required since `computeCardValue` learned to recognise a basic land,
      // which reads the type line before anything else. This fixture predates
      // that and threw on every run: the artifact has no type lines, and it
      // needs none -- a basic land has no `gihWr` and is filtered out two lines
      // above, so the empty string is the honest answer rather than a stub.
      typeLine: "",
    };
    const value = computeCardValue(card);
    // Commitment zero: no colours, no pool, so the archetype and splash terms
    // are absent by construction and what remains is trust and IWD.
    const scored = contextValue(
      { name: c.name, colors: [], value },
      {
        colors: new Set(),
        commitment: 0,
        archetypes,
        contextFor: () => ({ iwd: c.iwd, maindeckRate: c.maindeckRate }),
      },
    );
    const only = (labels) =>
      value +
      scored.terms.filter((t) => labels.includes(t.label)).reduce((a, t) => a + t.delta, 0);

    raw.push([value, c.trophyPickRate]);
    ctx.push([scored.value, c.trophyPickRate]);
    trustOnly.push([only(["trust"]), c.trophyPickRate]);
  }

  const a = spearman(raw);
  const b = spearman(ctx);
  const t = spearman(trustOnly);
  deltas.push(b - a);
  const d = (x) => `${x - a >= 0 ? "+" : ""}${(x - a).toFixed(4)}`.padStart(8);
  console.log(
    `${file.split(".")[0].padEnd(6)} ${String(judged.length).padStart(5)}  ${a.toFixed(4).padStart(7)}  ${d(t)}  ${d(b)}`,
  );
}

const better = deltas.filter((d) => d > 0).length;
const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
console.log(
  `\n${better}/${deltas.length} sets improved, mean delta ${mean >= 0 ? "+" : ""}${mean.toFixed(4)}`,
);
console.log(`maindeckTrustFloor under test: ${SCORING.maindeckTrustFloor}`);
console.log(
  "reminder: a gain here is not proof of a better scorer -- maindeck rate alone\n" +
    "scores ~0.90 on this objective. See the note at the top of this file.\n",
);

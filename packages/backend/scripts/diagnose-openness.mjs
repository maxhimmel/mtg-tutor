// What `openness` actually varies with, since its fitted coefficient has two
// readings and an ablation cannot tell them apart.
//
//   node scripts/diagnose-openness.mjs [--set fdn] [--format TradDraft]
//                                      [--drafts 4000]
//
// WHY A VARIANCE DECOMPOSITION AND NOT ANOTHER FIT
//
// `opennessLate` carries a large NEGATIVE weight and prices at +1.12pp, the most
// valuable term in the policy. `policy.ts` reads that as one term carrying the
// whole shape of a feature worth nothing early and a great deal late. A second
// reading fits the same coefficient: if `openness` were mostly a statement about
// the SET -- how much quality each colour is printed with, identical for all
// eight seats -- then the coefficient would be a correction against `laneFit`
// rather than an opinion about signals.
//
// Refitting cannot separate those. It would return another coefficient with the
// same two readings. What separates them is where the feature's variance comes
// from, which is what this measures.
//
// WHAT IT FOUND, 2026-08-13, 4,000 drafts per set at both checkpoints
//
//              colour-explained     corr laneFit
//   fdn   openness   4.8% / 6.6%    +0.43 / +0.42
//   dsk   openness  12.6% / 21.1%   +0.46 / +0.46
//
// The set-constant reading is NOT supported, and it fails in an instructive way:
// the number is set-dependent and swings by a factor of four. fdn's colours are
// close to equally deep, so which colour an observation is about explains almost
// nothing; dsk's are not. A feature can only look like a set constant on a set
// that has one, so "openness is really the set's composition" is a claim that
// cannot hold across a library and does not.
//
// The collinearity IS there and is stable: `openness` and `laneFit` correlate
// around +0.44 on both sets at both checkpoints, which is the mechanism -- you
// take out of what you are shown, so what you have seen and what you have taken
// move together. That does not make `opennessLate` wrong. It means the pair is
// doing a job jointly, and it is why the obvious repair does not work.
//
// AND THE REPAIR THAT DID NOT WORK, MEASURED BEFORE IT WAS BELIEVED
//
// The principles define a signal more narrowly than `openness` does: SIG-03 says
// it is a card somebody PASSED you, SIG-04 that you read it from what is ABSENT,
// SIG-05 that the informative event is a good card arriving LATE. A feature
// built to that spec -- passed cards only, weighted by the complement of
// `packOpenness`, minus the drafter's own unweighted passed share so the set's
// composition divides out -- was implemented, fitted and ablated over
// fdn+dsk (75,646 train / 36,145 held-out picks):
//
//   shipped seven features                    52.5% held-out top-1
//   + signal + signalLate                     52.5%   (-0.04pp, +0.00pp ablated)
//   signal and signalLate INSTEAD of openness 51.4%   -1.1pp
//
// So the narrower, better-motivated feature earns nothing beside `openness` and
// is a full point worse in its place. Being closer to how a human describes
// signal-reading did not make it a better predictor of what humans pick, and
// `opennessLate` keeps its place on the strength of that rather than by default.
// The code is reverted; this is the record.
//
// MEASURED THROUGH THE PUBLIC API, NEVER REIMPLEMENTED
//
// Per-colour shares are read by asking `BotMemory` about a synthetic
// single-colour card, so this measures the shipped feature rather than a copy of
// it -- measurement trap #5, and the same reason `BotMemory` is split out of
// `Bot` at all.
//
// The checkpoints are ends of packs, where a real drafter is deciding whether to
// stay or pivot (SIG-07, SIG-11, SIG-12) -- so if a signal feature ever carries
// information, it carries it there.

import { ConvexHttpClient } from "convex/browser";
import { BotMemory } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const maxDrafts = Number(flag("drafts", 4000));
const log = (...a) => console.error(...a);

const COLORS = ["W", "U", "B", "R", "G"];
// The probe. `value` is never read -- both features are shares over the memory's
// own accumulators, and the card is used only for its colours.
const probe = (color) => ({ name: `probe-${color}`, colors: [color], value: 0.5 });
const PROBES = Object.fromEntries(COLORS.map((c) => [c, probe(c)]));

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const cache = await draftPicks({ client, api, setCode, format, log });
log(`${cache.cards.length} cards, ${cache.drafts.length.toLocaleString()} drafts`);

// ---------------------------------------------------------------- the walk

// One row per (drafter, colour, checkpoint). Flat, because every statistic below
// is a pass over it.
const obs = { end1: [], end2: [] };

let walked = 0;
for (const draft of cache.drafts) {
  if (walked >= maxDrafts) break;
  const rows = cache.rows(draft);
  if (rows.length < 30) continue;
  rows.sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
  walked++;

  const memory = new BotMemory();
  let lastPack = rows[0].packNo;

  for (const { pack, picked, packNo } of rows) {
    // Read BEFORE the first pick of the next pack, so a checkpoint describes a
    // drafter who has just finished one.
    if (packNo !== lastPack) {
      const at = lastPack === 0 ? "end1" : lastPack === 1 ? "end2" : null;
      if (at) {
        for (const c of COLORS) {
          obs[at].push({
            color: c,
            openness: memory.openness(PROBES[c]),
            laneFit: memory.laneFit(PROBES[c]),
          });
        }
      }
      lastPack = packNo;
    }

    // The order the engine uses, and the order both fitting harnesses use.
    memory.see(pack);
    if (picked) memory.take(picked);
  }
}

log(`walked ${walked.toLocaleString()} drafts`);

// ---------------------------------------------------------------- statistics

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const variance = (xs) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

// Share of total variance explained by which colour the observation is about --
// eta-squared, the one-way ANOVA statistic. High means the feature is mostly
// saying something every seat at the table already agrees on.
function explainedByColor(rows, key) {
  const all = rows.map((r) => r[key]);
  const total = variance(all);
  if (total === 0) return 0;
  const grand = mean(all);

  let between = 0;
  for (const c of COLORS) {
    const inColor = rows.filter((r) => r.color === c).map((r) => r[key]);
    if (inColor.length === 0) continue;
    between += (inColor.length / rows.length) * (mean(inColor) - grand) ** 2;
  }
  return between / total;
}

// SD across drafters within a colour, averaged over colours: what is left to be
// seat-specific once the set's own composition is held fixed.
function withinColorSpread(rows, key) {
  return mean(
    COLORS.map((c) => {
      const inColor = rows.filter((r) => r.color === c).map((r) => r[key]);
      return inColor.length > 1 ? Math.sqrt(variance(inColor)) : 0;
    }),
  );
}

function correlation(rows, a, b) {
  const xs = rows.map((r) => r[a]);
  const ys = rows.map((r) => r[b]);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

// ---------------------------------------------------------------- the report

const pct = (x) => `${(x * 100).toFixed(1)}%`;

for (const [at, label] of [
  ["end1", "end of pack 1"],
  ["end2", "end of pack 2"],
]) {
  const rows = obs[at];
  if (rows.length === 0) continue;

  console.log(
    `\n${setCode} ${format} — ${label}  (${rows.length.toLocaleString()} drafter-colours)`,
  );
  console.log(
    `  ${"feature".padEnd(10)} ${"colour-explained".padStart(17)} ` +
      `${"within-colour sd".padStart(17)} ${"corr laneFit".padStart(13)}`,
  );
  console.log(
    `  ${"openness".padEnd(10)} ${pct(explainedByColor(rows, "openness")).padStart(17)} ` +
      `${withinColorSpread(rows, "openness").toFixed(4).padStart(17)} ` +
      `${correlation(rows, "openness", "laneFit").toFixed(4).padStart(13)}`,
  );
}

console.log(
  [
    "",
    "colour-explained is how much of the variance is 'which colour is this' --",
    "a fact about the set, the same for all eight seats. It is small on a set",
    "with evenly deep colours and large on one without, so it cannot be read as",
    "a property of the feature. corr laneFit is the stable finding: what you",
    "have seen and what you have taken move together, which is why a repair",
    "that separates them does not help. See the header.",
    "",
  ].join("\n"),
);

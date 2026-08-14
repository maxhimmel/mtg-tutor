// How often the data cannot tell the top of a pack apart -- and what the grade
// charges people for it anyway.
//
//   node scripts/diagnose-margin.mjs [--set fdn] [--format TradDraft]
//                                    [--drafts 4000]
//
// TWO QUESTIONS, ONE MEASUREMENT
//
// `gapMargin` is one standard error on the difference between two 17Lands win
// rates. Everything downstream of it -- the verdict's "the data cannot tell
// these two apart", the challenge's `separable`, and the principle tiebreak --
// is gated on a band whose size nobody has ever counted. So:
//
//   BAND RATE      how often the best card in a pack has company inside its own
//                  error bars. This bounds how often the tiebreak can fire at
//                  all, and therefore whether it is a feature anybody will meet
//                  or a branch that runs twice a draft.
//
//   PHANTOM MISS   how often a player's pick is inside the margin of the
//                  context-best and is STILL graded as a miss. `scorePick` is
//                  `100 - gap * 750` with no reference to the margin, so a pick
//                  the app tells you is indistinguishable can lose a grade and a
//                  half on the same screen that says so. This counts them and
//                  adds up the points.
//
// WHAT STANDS IN FOR THE PLAYER
//
// The human's own pick, off the 17Lands draft dataset. Not a simulated one:
// the question is what the app would have said to a real drafter making real
// picks, and the picks are right there in the file.
//
// WHAT THIS CANNOT SEE
//
// `contextValue`, so the band is over raw `cardValue` alone. The cached cards
// carry no archetype context and the deck-fit terms vanish at zero commitment
// anyway; what this measures is the FLOOR on both rates, since a contextual
// score moves cards around inside a band without changing how wide it is.
//
// And it cannot run the tiebreak itself -- that needs mana values and type
// lines, which live on the text half of a card and not in `datasets/`. Band
// rate is the bound on it, which is the number worth having first.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { normalizeName } from "@mtg-tutor/core";
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

// The same constant `scorePick` grades with. Imported in spirit rather than in
// fact, because SCORING lives in core and this file only needs the one number.
const GAP_K = 750;

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;

const cache = await draftPicks({ client, api, setCode, format, log });

// The sample sizes behind each win rate, which is the whole of what a margin is
// made of. The engine's half of a card does not carry them -- they are on
// `CardText`, read only when a card is shown to somebody -- so they come off the
// committed artifact here.
const artifact = JSON.parse(
  readFileSync(new URL(`../data/${setCode}.${format}.json`, import.meta.url), "utf8"),
);
const stats = new Map();
for (const c of artifact.cards) {
  if (c.gihWr != null && c.gihN > 0) stats.set(normalizeName(c.name), { p: c.gihWr, n: c.gihN });
}

// sqrt(p(1-p)/n) per card; the difference of two carries the sum of their
// variances. Undefined when either card is unrated -- a rarity baseline has no
// sample to have error bars over, and saying nothing is honest where inventing
// a margin is not. Exactly `gapMargin`.
const variance = (card) => {
  const s = stats.get(normalizeName(card.name));
  return s ? (s.p * (1 - s.p)) / s.n : undefined;
};

function margin(a, b) {
  const va = variance(a);
  const vb = variance(b);
  return va == null || vb == null ? undefined : Math.sqrt(va + vb);
}

// ---------------------------------------------------------------- the sweep

let picks = 0;
let banded = 0; // the best card has company inside its own error bars
let bandTotal = 0; // cards in the band, summed, for a mean
let ratedPairs = 0; // picks where a margin could be computed at all
let phantom = 0; // graded a miss, inside the margin
let phantomPoints = 0; // points docked for those
let realMiss = 0;

let walked = 0;
for (const draft of cache.drafts) {
  if (walked >= maxDrafts) break;
  const rows = cache.rows(draft);
  if (rows.length < 30) continue;
  walked++;

  for (const { pack, picked } of rows) {
    // The same gate the app uses for a pick worth thinking about: the last few
    // cards of a pack are picking for you, and nothing grades them.
    if (!picked || pack.length < 5) continue;
    picks++;

    const ranked = [...pack].sort((a, b) => b.value - a.value);
    const best = ranked[0];

    let inBand = 1;
    for (const other of ranked.slice(1)) {
      const m = margin(best, other);
      if (m != null && best.value - other.value <= m) inBand++;
    }
    if (inBand > 1) banded++;
    bandTotal += inBand;

    if (picked.name === best.name) continue;

    const m = margin(best, picked);
    if (m == null) continue;
    ratedPairs++;

    const gap = best.value - picked.value;
    const docked = Math.min(100, Math.round(gap * GAP_K));
    if (gap <= m) {
      phantom++;
      phantomPoints += docked;
    } else {
      realMiss++;
    }
  }
}

log(`walked ${walked.toLocaleString()} drafts`);

// ---------------------------------------------------------------- the report

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

console.log(`
${setCode} ${format} -- ${picks.toLocaleString()} graded picks from ${walked.toLocaleString()} drafts

BAND RATE
  packs whose best card is inseparable from another   ${pct(banded, picks)}
  mean cards inside the band                          ${(bandTotal / picks).toFixed(2)}

PHANTOM MISSES  (of ${ratedPairs.toLocaleString()} picks where both cards are rated and the
                 player did not take the top card)
  inside the margin and graded a miss anyway          ${pct(phantom, ratedPairs)}
  outside it, a miss the data can actually see        ${pct(realMiss, ratedPairs)}
  mean points docked for a phantom miss               ${phantom ? (phantomPoints / phantom).toFixed(1) : "0"}
  points docked across the sweep                      ${phantomPoints.toLocaleString()}

The band rate bounds how often a principle tiebreak can fire. The phantom rate
is the grade charging somebody for a difference the same screen tells them the
data cannot see.
`);

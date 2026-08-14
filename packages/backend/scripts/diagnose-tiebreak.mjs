// How often a real drafter would actually SEE the principle tiebreak.
//
//   node scripts/diagnose-tiebreak.mjs --snapshot <dir> [--set fdn]
//                                      [--format TradDraft] [--drafts 2000]
//
// WHY THIS EXISTS AND WHY IT IS AWKWARD
//
// `diagnose-margin.mjs` says how often the top of a pack is inseparable -- 47%
// on fdn -- which BOUNDS the tiebreak but is not its rate. A band forming is not
// the same as a principle having anything to say about it: the cards in it may
// all be creatures, all cost the same, and meet the same needs, in which case
// `tiebreak` returns the card the float would have picked anyway and no sentence
// is written. The difference between those two numbers is the difference
// between a feature somebody meets and a branch that runs in silence.
//
// Measuring it needs mana values, type lines and rules text -- `detectRole` and
// the curve both read them -- and those live on `setCardText`, which is a
// deliberately separate table that `datasets/` does not cache. So this one wants
// a Convex snapshot export rather than the usual cached packs alone. That is not
// a nicety: without the text half every card looks like a two-drop with no type,
// every need reads the same, and the answer would be a confident zero.
//
// It runs the SHIPPED `challengeFor` against real human picks, with the pool
// reconstructed from the dataset, so what it counts is what a player would have
// been shown -- not a model of it.

import { readFileSync, readdirSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import {
  challengeFor,
  curveTurn,
  detectRole,
  isDecisionPick,
  normalizeName,
  packScoringContext,
  scorePick,
} from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { draftPicks } from "./lib/draftCache.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const snapshot = flag("snapshot");
const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const maxDrafts = Number(flag("drafts", 2000));
const log = (...a) => console.error(...a);

if (!snapshot) {
  console.error("--snapshot <dir> is required: an unzipped Convex export holding setCardText/.");
  process.exit(1);
}

// ---------------------------------------------------------------- the text half

const textByKey = new Map();
for (const line of readFileSync(`${snapshot}/setCardText/documents.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.code !== setCode || row.format !== format) continue;
  textByKey.set(row.key, row.text);
}
log(`${textByKey.size} text rows for ${setCode}`);
if (textByKey.size === 0) {
  console.error(`No setCardText rows for ${setCode}/${format} in that snapshot.`);
  process.exit(1);
}

// ---------------------------------------------------------------- the packs

const url = process.env.CONVEX_URL;
const client = url ? new ConvexHttpClient(url) : null;
const cache = await draftPicks({ client, api, setCode, format, log });

// The archetype table, so `contextValue` is the same expression the app runs
// rather than raw card value. Read off the committed artifact.
const artifact = JSON.parse(
  readFileSync(new URL(`../data/${setCode}.${format}.json`, import.meta.url), "utf8"),
);
const colorWinRates = artifact.colorWinRates ?? [];
const contextByKey = new Map();
// The sample sizes behind each win rate, which is the whole of what `gapMargin`
// is made of -- and the reason this file reads the artifact as well as the
// snapshot. A dev export taken before `gihWinRate` and `gihGames` moved onto
// CardText carries neither, so every margin comes back undefined, no band ever
// forms, and the sweep reports a confident zero for a feature that is working.
// It did exactly that once.
const ratedByKey = new Map();
for (const c of artifact.cards) {
  const key = normalizeName(c.name);
  contextByKey.set(key, {
    ...(c.iwd != null ? { iwd: c.iwd } : {}),
    ...(c.maindeckRate != null ? { maindeckRate: c.maindeckRate } : {}),
    // The error bars, which ingest settles onto the context row. `scorePick`
    // reads them through `marginBetween`, so leaving them out means no band ever
    // forms on the GRADE side and the parity count sits at zero while the
    // challenge side works perfectly -- which reads as "nothing to compare"
    // rather than as a broken rig.
    ...(c.gihWr != null && c.gihN > 0
      ? { se: Math.round(Math.sqrt((c.gihWr * (1 - c.gihWr)) / c.gihN) * 1e5) / 1e5 }
      : {}),
  });
  if (c.gihWr != null && c.gihN > 0) ratedByKey.set(key, { gihWinRate: c.gihWr, gihGames: c.gihN });
}

// Whole cards, the way the browser makes them: engine half joined to text half.
const index = { get: (name) => textByKey.get(normalizeName(name)) };
// `turn` and `role` come off the cached card, which is the whole of EngineCard
// since `engineCards.mjs` stopped projecting five fields by hand. Derived only
// when the cache predates them -- and LOUDLY, because a silent fallback here is
// how this sweep twice reported 0.0% for a feature that was working: cards with
// no role meet no need, every band ties, and the harness calls that an answer.
let derived = 0;
const shaped = (card, text) => {
  if (card.turn != null && card.role != null) return card;
  derived++;
  return {
    ...card,
    turn: curveTurn(text ?? card),
    role: detectRole(text ?? { oracleText: "", typeLine: "" }),
  };
};

const whole = (engineCards) =>
  engineCards.map((c) => {
    const text = index.get(c.name);
    const rated = ratedByKey.get(normalizeName(c.name)) ?? {};
    return text
      ? shaped({ ...text, ...rated, ...c }, text)
      : {
          ...c,
          ...rated,
          cmc: 2,
          manaCost: "",
          typeLine: "",
          oracleText: "",
          colorIdentity: c.colors,
          collectorNumber: "0",
        };
  });

// ---------------------------------------------------------------- the sweep

let decisions = 0; // picks the challenge ceremony would actually run on
let checked = 0; // picks where both the grade and the challenge preferred a card
let diverged = 0; // ...and named different ones. Must be zero.
let fired = 0; // a principle changed the challenger and wrote a sentence
const byPrinciple = new Map();
let missingText = 0;

let walked = 0;
for (const draft of cache.drafts) {
  if (walked >= maxDrafts) break;
  const rows = cache.rows(draft);
  if (rows.length < 30) continue;
  rows.sort((a, b) => a.packNo - b.packNo || a.pickNo - b.pickNo);
  walked++;

  const pool = [];
  for (const { pack, picked } of rows) {
    if (!picked) continue;

    // The same gate the ceremony uses. A pack down to its last few cards is
    // picking for you and is never challenged.
    if (isDecisionPick(pack.length, 5)) {
      const packCards = whole(pack);
      const proposed = packCards.find((c) => c.name === picked.name);
      if (!proposed) {
        missingText++;
      } else {
        decisions++;
        const maindeck = whole(pool);
        const ctx = packScoringContext(maindeck, pool.length, rows.length, colorWinRates, (c) =>
          contextByKey.get(normalizeName(c.name)),
        );
        // The needs ride the context now, so there is no second call to compare
        // against -- which is the point of the change this measures. Parity is
        // checked instead: the challenge and the GRADE must name the same card,
        // because both run one tiebreak over one set of needs.
        const challenge = challengeFor(packCards, proposed, ctx);
        const score = scorePick(packCards, proposed, maindeck, ctx);

        if (challenge) {
          if (challenge.reasons.length > 0) {
            fired++;
            const id = challenge.reasons[0].principle;
            byPrinciple.set(id, (byPrinciple.get(id) ?? 0) + 1);
          }
          // Both sides preferred a card, and it must be the same card.
          if (score.preferred && challenge.reasons.length > 0) {
            checked++;
            if (score.preferred.name !== challenge.challenger.name) diverged++;
          }
        }
      }
    }
    pool.push(picked);
  }
}

log(`walked ${walked.toLocaleString()} drafts${missingText ? `, ${missingText} picks with no text row` : ""}`);
if (derived > 0) {
  log(
    `WARNING: ${derived.toLocaleString()} cards had no stored turn/role and were derived here.\n` +
      `         Run 'pnpm cache-cards' after a re-ingest, or this measures a shape\n` +
      `         the app does not actually store.`,
  );
}

const pct = (n) => `${((100 * n) / decisions).toFixed(1)}%`;

console.log(`
${setCode} ${format} -- ${decisions.toLocaleString()} challenged picks from ${walked.toLocaleString()} drafts

  a principle wrote a sentence            ${String(fired).padStart(7)}  ${pct(fired)}

parity -- the grade and the challenge naming one card
  picks where both preferred a card       ${String(checked).padStart(7)}
  ...and they disagreed                   ${String(diverged).padStart(7)}  ${diverged === 0 ? "(as it must be)" : "*** DIVERGENCE ***"}

which principle decided, when one did`);
for (const [id, n] of [...byPrinciple].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(10)} ${String(n).padStart(7)}  ${((100 * n) / (fired || 1)).toFixed(1)}% of those`);
}
console.log();

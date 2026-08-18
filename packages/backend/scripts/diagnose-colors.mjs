// Whether every stored `colors` is still the colours you have to be in.
//
//   node scripts/diagnose-colors.mjs [--format TradDraft] [--set mh3]
//                                    [--examples 8]
//
// A REGRESSION CHECK, WHICH IS NOT WHAT IT WAS WRITTEN AS
//
// This began as a discovery tool and found three separate populations sitting
// in one empty array, at 4.08 affected cards per pack on mh3:
//
//   dfc     116 cards  Scryfall states `colors` per FACE on transform and
//                      modal_dfc and omits it on the card, so every
//                      double-faced card in the pool was colourless -- on mh3
//                      that was every planeswalker in the set.
//   devoid   27 cards  {1}{U} with `colors` [] is what devoid MEANS, and the
//                      drafter still cannot cast it off Swamps.
//   land    356 cards  No mana cost, ever. Its identity is the whole of what it
//                      commits you to.
//
// All three are fixed at ingest by `requiredColors` in mapping.ts, and all three
// now read zero. What the script is FOR now is noticing if that stops being
// true -- a new set, a Scryfall change, or an edit to the mapping. Run it after
// any ingest that matters.
//
// WHY IT RESTATES THE RULE INSTEAD OF IMPORTING IT
//
// A check that imports the code it is checking agrees with it by construction.
// `expectedColors` below is a deliberate second implementation, from the STORED
// fields rather than the Scryfall response, so the two can disagree. They are
// both four lines; keeping them in step by eye is cheaper than the coupling.
//
// THE ONE KNOWN NON-ZERO, AND IT IS NOT A BUG
//
// `other` holds 29 cards, 28 of them ADVENTURES and one Living End. Scryfall
// gives Callous Sell-Sword (`{1}{B} // {R}`) a top-level `colors` of ["B"] --
// the creature half only -- while its identity is ["B","R"]. We store what
// Scryfall says, so an adventure card reads as mono-coloured.
//
// That is consistent with the rule as stated: you CAN play it in mono-black and
// simply never cast the adventure. Whether a draft tutor should say so is a real
// question and not this script's to answer -- woe is the adventure set and
// carries 0.53 of these per pack, which is the number to weigh if anyone picks
// it up. Left visible here rather than filtered out, because a check that hides
// its known exceptions cannot tell you when one stops being known.
//
// WHAT THE PACK RATE COLUMN MEANS
//
// `packRate` is the share of observed packs a card appears in, so summing it
// over the affected cards is the expected number of affected cards PER PACK.
// A card with no `packRate` is counted at its slot's average rather than
// dropped, because a set ingested before that field existed still deals it.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const format = flag("format", "TradDraft");
const onlySet = flag("set", null);
const exampleCount = Number(flag("examples", 6));

const COLORS = ["W", "U", "B", "R", "G"];

// The colours a card is CAST with: every WUBRG letter that appears inside a mana
// symbol. Hybrid `{W/U}` and phyrexian `{W/P}` both count for their colour,
// which is what the drafter needs -- a hybrid card is castable off either half,
// and Scryfall already agrees on those, so they are not what this is looking for.
function castColors(manaCost) {
  const found = new Set();
  for (const symbol of manaCost?.match(/\{[^}]+\}/g) ?? []) {
    for (const c of COLORS) if (symbol.includes(c)) found.add(c);
  }
  return [...found];
}

const isLand = (typeLine) => /\bLand\b/.test((typeLine ?? "").split("//")[0]);
const same = (a, b) => a.length === b.length && [...a].sort().join("") === [...b].sort().join("");

/**
 * What `colors` SHOULD be, recomputed from the other stored fields.
 *
 * The same two rules as `requiredColors` in mapping.ts, deliberately restated
 * here rather than imported: this script's job is to disagree with the pipeline,
 * and a check that shares the code it is checking can only ever agree with it.
 * The two are small enough that keeping them in step by eye is cheaper than the
 * coupling -- and a divergence between them shows up here as a whole set going
 * red, not as silence.
 *
 * Reads the stored `manaCost`, which ingest has already resolved to the FRONT
 * face, so a transforming artifact costing {3} correctly expects nothing.
 */
function expectedColors(card) {
  if (isLand(card.typeLine)) return card.colorIdentity ?? [];
  return castColors(card.manaCost);
}

// Why this card's stored colours are not what its cost says, or null when they
// agree. A label rather than a taxonomy: each names a CAUSE, so a count against
// one of them points at the line that produced it.
const TWO_FACED = new Set(["transform", "modal_dfc", "double_faced_token", "reversible_card"]);

function classify(card) {
  const colors = card.colors ?? [];
  const expected = expectedColors(card);
  if (same(expected, colors)) return null;

  if (isLand(card.typeLine)) return "land";
  if (TWO_FACED.has(card.layout)) return "dfc";
  if (colors.length === 0) return "devoid";
  return "other";
}

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const sets = (await client.query(api.sets.list, {})).filter(
  (s) => s.format === format && (!onlySet || s.code === onlySet),
);

if (sets.length === 0) {
  console.error(`No ingested sets for format ${format}${onlySet ? ` and set ${onlySet}` : ""}.`);
  process.exit(1);
}

const KINDS = ["dfc", "devoid", "land", "other"];
const rows = [];
const examples = new Map(KINDS.map((k) => [k, []]));

for (const set of sets) {
  const doc = await client.query(api.sets.get, { setCode: set.code, format });
  if (!doc?.cards?.length) continue;

  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const perPack = Object.fromEntries(KINDS.map((k) => [k, 0]));
  let colorless = 0;

  // A missing `packRate` means the set predates the measurement, and those sets
  // deal every card in a slot evenly -- so the honest stand-in is one over the
  // number of cards sharing that slot, not zero and not one.
  const slotSizes = new Map();
  for (const c of doc.cards) slotSizes.set(c.slot, (slotSizes.get(c.slot) ?? 0) + 1);

  for (const card of doc.cards) {
    if ((card.colors ?? []).length === 0) colorless++;
    const kind = classify(card);
    if (!kind) continue;
    counts[kind]++;
    perPack[kind] += card.packRate ?? 1 / (slotSizes.get(card.slot) || doc.cards.length);
    const bucket = examples.get(kind);
    if (bucket.length < exampleCount) {
      bucket.push(`${set.code} ${card.name} — ${card.manaCost || "(no cost)"} → colors []`);
    }
  }

  rows.push({ code: set.code, total: doc.cards.length, colorless, counts, perPack });
}

const pct = (n, d) => (d === 0 ? "  0.0%" : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

console.log(`\n${format} — cards whose \`colors\` is not what they cost\n`);
console.log("set    cards  colorless      dfc   devoid     land    other   affected/pack");
const wrong = (r) => r.counts.dfc + r.counts.devoid + r.counts.land;
for (const r of rows.sort((a, b) => wrong(b) - wrong(a))) {
  const affected = KINDS.reduce((n, k) => n + r.perPack[k], 0);
  console.log(
    `${r.code.padEnd(5)} ${String(r.total).padStart(6)}  ${pct(r.colorless, r.total)}` +
      KINDS.map((k) => String(r.counts[k]).padStart(9)).join("") +
      `   ${affected.toFixed(2).padStart(6)}`,
  );
}

const totals = Object.fromEntries(
  KINDS.map((k) => [k, rows.reduce((n, r) => n + r.counts[k], 0)]),
);
const cards = rows.reduce((n, r) => n + r.total, 0);
console.log(
  `\n${rows.length} sets, ${cards} cards. ` +
    KINDS.map((k) => `${k} ${totals[k]} (${((100 * totals[k]) / cards).toFixed(1)}%)`).join(", "),
);

for (const kind of KINDS) {
  const bucket = examples.get(kind);
  if (bucket.length === 0) continue;
  console.log(`\n${kind}:`);
  for (const line of bucket) console.log(`  ${line}`);
}

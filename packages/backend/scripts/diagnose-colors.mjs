// What `EngineCard.colors` says a card costs, against what it actually costs.
//
//   node scripts/diagnose-colors.mjs [--format TradDraft] [--set mh3]
//                                    [--examples 8]
//
// ONE FIELD, THREE DIFFERENT REASONS IT IS EMPTY
//
// `colors` is Scryfall's `colors` copied through `mapping.ts` untouched, and
// Scryfall means something specific by it: the colour the card IS. Almost
// nothing in this repo wants that. `laneFit` wants the mana a drafter has to be
// able to SPEND; `committedColors` and the deck builder want what a card commits
// you TO. Sorting the empties apart is the whole point of this script, because
// the three have different causes and only one of them is a design question:
//
//   DFC          A BUG, and the largest of the three. Scryfall puts `colors` on
//                `card_faces` for `transform` and `modal_dfc` and omits it at
//                the top level entirely, so `asColorCodes(undefined)` is []. The
//                mapping already knows this about `mana_cost` one line below and
//                falls back to the face; `colors` never learned to. Every
//                double-faced card in every set is colourless to the engine --
//                which on mh3 is Ajani, Tamiyo, Sorin, Ral and Grist, the five
//                cards a drafter is most likely to build around.
//
//   DEVOID       mana cost {2}{B}, `colors` [] and correctly so -- the card IS
//                colourless by rule and is cast with black mana. Not a mapping
//                error; a question about which of the two a reader wanted.
//
//   LAND         `colors` [] and always will be -- a land has no mana cost --
//                while its colour identity is the whole of what it commits you
//                to. `deck.ts` already knows this and corrects for it in
//                `landFitsColors`; no other reader does.
//
// WHY THIS IS COUNTED BEFORE IT IS FIXED
//
// `colors` is on the ENGINE half, so it feeds `laneFit`, which feeds the bots,
// which decide what wheels. Changing it re-deals every draft and moves the
// feature values the fitted policies were fitted against. That is a
// POOL_REVISION bump and a refit, and it should be bought with a number rather
// than with the observation that the field is wrong -- which is true and says
// nothing about whether anybody meets it.
//
// So: how many cards, in which sets, and how often does a pack contain one.
//
// WHAT THE PACK RATE COLUMN MEANS
//
// `packRate` is the share of observed packs a card appears in, so summing it
// over the affected cards is the expected number of affected cards PER PACK --
// which is the number that says whether this is a curiosity or something a
// drafter meets every time they open one. A card with no `packRate` is counted
// as present at its slot's average rather than dropped, because a set ingested
// before that field existed still deals it.

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

const isLand = (typeLine) => /\bLand\b/.test(typeLine ?? "");
const same = (a, b) => a.length === b.length && [...a].sort().join("") === [...b].sort().join("");

// The layouts Scryfall gives two `card_faces` and no top-level `colors`. Stored
// only when it is not `normal`, which is why this can be asked of a card at all.
const TWO_FACED = new Set(["transform", "modal_dfc", "double_faced_token", "reversible_card"]);

// Which of the three gaps this card sits in, or null when `colors` is right.
function classify(card) {
  const cast = castColors(card.manaCost);
  const colors = card.colors ?? [];
  const identity = card.colorIdentity ?? [];

  if (isLand(card.typeLine)) {
    return identity.length > 0 && colors.length === 0 ? "land" : null;
  }
  // Checked before devoid, because a devoid DFC would otherwise be filed under
  // the design question when what it needs first is the mapping fixed.
  if (TWO_FACED.has(card.layout) && colors.length === 0) return "dfc";
  if (cast.length > 0 && colors.length === 0) return "devoid";
  // A card with no mana cost at all and a coloured identity -- the back of a
  // modal double-faced card, mostly. Not the same bug and not necessarily a bug,
  // but it is the third population living in `colors.length === 0` and counting
  // it is how we find out.
  if (cast.length === 0 && colors.length === 0 && identity.length > 0) return "costless";
  return same(cast, colors) ? null : "other";
}

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const sets = (await client.query(api.sets.list, {})).filter(
  (s) => s.format === format && (!onlySet || s.code === onlySet),
);

if (sets.length === 0) {
  console.error(`No ingested sets for format ${format}${onlySet ? ` and set ${onlySet}` : ""}.`);
  process.exit(1);
}

const KINDS = ["dfc", "devoid", "land", "costless", "other"];
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
console.log("set    cards  colorless      dfc   devoid     land costless    other   affected/pack");
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

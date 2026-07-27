// Checks that a set actually deals the packs its data claims it will.
//
//   node scripts/validate-pack-model.mjs MKM TradDraft
//   node scripts/validate-pack-model.mjs MKM TradDraft --prod
//   node scripts/validate-pack-model.mjs MKM TradDraft --packs 500000 --no-oracle
//
// The pipeline's failure mode is not a crash, it is a plausible-looking success.
// MKM once ingested "286 cards" with a bonus pool holding ten Special Guests
// instead of the fifty-card sheet the shapes were counted from: nothing threw,
// the set listed, and 11% of packs would have dealt the wrong card. Exit codes
// cannot see that. Dealing packs and counting them can.
//
// Three layers, cheapest first, each able to fail on its own:
//
//   1. the artifact alone      -- are the shapes internally coherent?
//   2. artifact vs deployment  -- can every card the shapes assume be dealt?
//   3. dealt packs             -- do the rates come out where they should?
//
// Plus an optional cross-check against MTGJSON, which publishes WotC's booster
// collation and shares no source with 17Lands. It is an oracle only, and a
// patchy one -- it carries an Arena booster model for well under half our sets
// -- so it asserts when it can and says so when it cannot. Same standing the
// 17Lands API has in validate-set-stats.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { buildSetData, makePack, mulberry32, packSizeFor } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = "mtg-tutor/0.1 (draft-trainer)";

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const noOracle = argv.includes("--no-oracle");
const packsArg = argv.indexOf("--packs");
const PACKS = packsArg >= 0 ? Number(argv[packsArg + 1]) : 200_000;
const positional = argv.filter((a, i) => !a.startsWith("--") && i !== packsArg + 1);
const [setArg, formatArg] = positional;

if (!setArg) {
  console.error(
    "usage: validate-pack-model.mjs <setCode> [format] [--prod] [--packs N] [--no-oracle]",
  );
  process.exit(1);
}
const setCode = setArg.toLowerCase();
const format = formatArg ?? "PremierDraft";

// A rate measured over PACKS samples wobbles; a wrong pool does not wobble, it
// moves by whole multiples. Wide enough never to cry wolf, tight enough that
// dealing a 50-card sheet as 10 cards cannot hide.
const RATE_TOLERANCE = 0.005;

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok    ${msg}`);
const skip = (msg) => {
  notes.push(msg);
  console.log(`  skip  ${msg}`);
};

const pct = (x) => `${(x * 100).toFixed(2)}%`;

// ------------------------------------------------------------------ artifact

const artifactPath = resolve(HERE, "..", "data", `${setCode}.${format}.json`);
let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch {
  console.error(`No artifact at ${artifactPath}. Run build-set-stats first.`);
  process.exit(1);
}

console.log(`${setCode.toUpperCase()} / ${format} — pack model`);
console.log("\nartifact");

const composition = artifact.packComposition;
if (!composition) {
  console.log("  skip  no packComposition; this set falls back to the fixed PACK constants");
  process.exit(0);
}

// The slots makePack knows how to fill. A shape naming anything else does not
// fail loudly at draft time -- makePack walks a fixed SLOT_ORDER and skips what
// it does not recognise, so the pack just comes out a card short.
const SLOTS = new Set(["common", "uncommon", "rare", "mythic", "bonus", "land"]);

const totalWeight = composition.shapes.reduce((n, s) => n + s.weight, 0);
const shapeRates = new Map();
const demand = new Map();
let badSlots = 0;
let badSizes = 0;

for (const shape of composition.shapes) {
  let size = 0;
  for (const [slot, n] of Object.entries(shape.slots)) {
    if (!SLOTS.has(slot)) badSlots++;
    size += n;
    shapeRates.set(slot, (shapeRates.get(slot) ?? 0) + shape.weight);
    demand.set(slot, Math.max(demand.get(slot) ?? 0, n));
  }
  if (size !== composition.size) badSizes++;
}

badSlots
  ? fail(`${badSlots} shape slot(s) name something makePack cannot fill`)
  : ok(`every shape slot is one makePack can fill`);
badSizes
  ? fail(`${badSizes} shape(s) do not sum to the declared pack size ${composition.size}`)
  : ok(`all ${composition.shapes.length} shapes sum to ${composition.size}`);

const packCards = artifact.packCards ?? [];
if (packCards.length === 0) {
  skip("artifact predates packCards; manifest checks need a rebuild");
} else {
  const supply = new Map();
  for (const c of packCards) supply.set(c.slot, (supply.get(c.slot) ?? 0) + 1);

  const starved = [...demand].filter(([slot, n]) => (supply.get(slot) ?? 0) < n);
  starved.length
    ? fail(
        `slot(s) with fewer cards than a shape asks for: ` +
          starved.map(([s, n]) => `${s} needs ${n}, has ${supply.get(s) ?? 0}`).join("; "),
      )
    : ok(
        `every slot has enough cards for the largest shape (` +
          [...demand].map(([s, n]) => `${s} ${n}/${supply.get(s) ?? 0}`).join(", ") +
          ")",
      );
}

// ---------------------------------------------------------------- deployment

// Same resolution ingest-sets uses, so --prod points at the same place.
function deploymentUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (fromEnv) return fromEnv;
  const args = ["convex", "env", "get", "CONVEX_CLOUD_URL"];
  if (prod) args.push("--prod");
  const url = execFileSync("npx", args, { cwd: resolve(HERE, ".."), encoding: "utf8" }).trim();
  if (!url.startsWith("http")) {
    throw new Error(`Could not resolve the Convex deployment URL (got: ${url || "empty"}).`);
  }
  return url;
}

console.log(`\ndeployment${prod ? " (production)" : ""}`);

const client = new ConvexHttpClient(deploymentUrl());
const doc = await client.query(api.sets.get, { setCode, format });

if (!doc) {
  fail(`set is not ingested — run seed-set-stats then ingest-sets`);
  report();
}

// Match names the way the rest of the pipeline does, so a card is not called
// missing over an accent or a split-card face.
const norm = (n) =>
  n
    .split("//")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const pooled = new Set(doc.cards.map((c) => norm(c.name)));
const missing = packCards.filter((c) => !pooled.has(norm(c.name)));

if (packCards.length) {
  missing.length
    ? fail(
        `${missing.length} pack card(s) the artifact declares are absent from the pool: ` +
          missing.slice(0, 8).map((c) => c.name).join(", ") +
          (missing.length > 8 ? ", …" : ""),
      )
    : ok(`all ${packCards.length} declared pack cards are in the pool`);
}

const set = buildSetData(doc.code, doc.cards, new Map(), doc.packComposition);
const poolSizes = Object.fromEntries(
  Object.entries(set.pools).map(([k, v]) => [k, v.length]),
);
console.log(`  pools: ${JSON.stringify(poolSizes)}`);

const empty = [...demand.keys()].filter((s) => (set.pools[s]?.length ?? 0) === 0);
empty.length
  ? fail(`shape(s) draw from empty pool(s): ${empty.join(", ")}`)
  : ok(`every slot a shape uses has a non-empty pool`);

// ------------------------------------------------------------- dealt packs

console.log(`\ndealt packs (${PACKS.toLocaleString()})`);

const rng = mulberry32(20260727);
const sizes = new Map();
const slotHits = new Map();
const seenCards = new Set();
let duplicates = 0;

// Which slot a dealt card came from, by the same rule buildSetData pooled it.
const slotOfCard = new Map();
for (const [slot, cards] of Object.entries(set.pools)) {
  for (const c of cards) slotOfCard.set(c.name, slot);
}

for (let i = 0; i < PACKS; i++) {
  const pack = makePack(set, rng);
  sizes.set(pack.length, (sizes.get(pack.length) ?? 0) + 1);
  if (new Set(pack.map((c) => c.name)).size !== pack.length) duplicates++;

  const inPack = new Set();
  for (const c of pack) {
    seenCards.add(c.name);
    const slot = slotOfCard.get(c.name);
    if (slot) inPack.add(slot);
  }
  for (const slot of inPack) slotHits.set(slot, (slotHits.get(slot) ?? 0) + 1);
}

const declared = packSizeFor(set);
sizes.size === 1 && sizes.has(declared)
  ? ok(`every pack dealt exactly ${declared} cards`)
  : fail(
      `pack sizes vary or miss the declared ${declared}: ` +
        JSON.stringify([...sizes].sort((a, b) => a[0] - b[0])),
    );

duplicates
  ? fail(`${duplicates} pack(s) dealt the same card twice`)
  : ok("no pack dealt the same card twice");

// The rates the shapes were counted from are the whole point of sampling
// observed composition; if what we deal drifts from them, the pools are wrong.
let drifted = 0;
for (const [slot, weight] of [...shapeRates].sort()) {
  const expected = weight / totalWeight;
  const actual = (slotHits.get(slot) ?? 0) / PACKS;
  const off = Math.abs(actual - expected);
  const line = `${slot.padEnd(9)} dealt ${pct(actual)}  artifact ${pct(expected)}`;
  if (off > RATE_TOLERANCE) {
    drifted++;
    console.log(`  FAIL  ${line}`);
  } else {
    console.log(`  ok    ${line}`);
  }
}
if (drifted) fail(`${drifted} slot(s) deal at a rate the artifact does not claim`);

// A card in a slot the packs actually use, that never gets dealt, is a card the
// drafter can never see. Slots no shape draws from are a different thing and not
// a fault: MKM pools five basics because Scryfall lists them, but its Arena
// boosters have no land slot, so they are correctly never dealt.
const used = [...demand.keys()];
const reachable = [...slotOfCard].filter(([, slot]) => used.includes(slot));
const unreachable = reachable.filter(([name]) => !seenCards.has(name));

unreachable.length
  ? fail(
      `${unreachable.length} pooled card(s) were never dealt in ${PACKS.toLocaleString()} packs: ` +
        unreachable.slice(0, 8).map(([n]) => n).join(", "),
    )
  : ok(`all ${reachable.length} cards in dealt slots are reachable`);

const idle = Object.entries(set.pools).filter(
  ([slot, cards]) => cards.length > 0 && !used.includes(slot),
);
for (const [slot, cards] of idle) {
  skip(`${cards.length} card(s) pooled in '${slot}', which no observed shape deals`);
}

// ------------------------------------------------------------------- oracle

// MTGJSON publishes WotC's booster collation. Nothing about it derives from
// 17Lands, so where both have an opinion, agreement is real evidence.
async function mtgjson(code) {
  const res = await fetch(`https://mtgjson.com/api/v5/${code.toUpperCase()}.json.gz`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  return JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).data;
}

if (!noOracle) {
  console.log("\nMTGJSON cross-check");
  const data = await mtgjson(setCode).catch(() => null);
  const boosters = data?.booster ?? {};
  // Our data is Arena draft data, so only an Arena booster model is comparable.
  // The paper model differs in ways that would read as failures -- MKM's paper
  // Play Booster carries a basic land its Arena counterpart does not.
  const type = Object.keys(boosters).find((k) => k.includes("arena"));

  if (!data) {
    skip("MTGJSON has no file for this set");
  } else if (!type) {
    skip(
      `MTGJSON has no Arena booster model for this set (has: ${Object.keys(boosters).join(", ") || "none"})`,
    );
  } else {
    const model = boosters[type];
    // A bonus sheet by our own rule: cards that are not part of the set. Reading
    // it off uuids rather than sheet names avoids guessing from labels that
    // change every set ("theList", "mysticalArchive", "enchantingTales").
    const own = new Set((data.cards ?? []).map((c) => c.uuid));
    const isBonusSheet = (name) => {
      const uuids = Object.keys(model.sheets[name]?.cards ?? {});
      return uuids.length > 0 && uuids.every((u) => !own.has(u));
    };
    const bonusSheets = Object.keys(model.sheets).filter(isBonusSheet);

    const bonusWeight = model.boosters
      .filter((b) => bonusSheets.some((s) => b.contents[s]))
      .reduce((n, b) => n + b.weight, 0);
    const theirRate = bonusWeight / model.boostersTotalWeight;
    const ourRate = (shapeRates.get("bonus") ?? 0) / totalWeight;

    const theirSize = bonusSheets.reduce(
      (n, s) => n + Object.keys(model.sheets[s].cards).length,
      0,
    );
    const ourSize = set.pools.bonus.length;

    console.log(`  booster model: ${type}, bonus sheet(s): ${bonusSheets.join(", ") || "none"}`);

    Math.abs(theirRate - ourRate) > RATE_TOLERANCE * 3
      ? fail(`bonus slot rate ${pct(ourRate)} vs MTGJSON ${pct(theirRate)}`)
      : ok(`bonus slot rate ${pct(ourRate)} vs MTGJSON ${pct(theirRate)}`);

    // Sizes can differ legitimately: MTGJSON counts the sheet as printed, we
    // count what 17Lands actually saw opened. A gap is worth a look, not a fail.
    theirSize === ourSize
      ? ok(`bonus pool ${ourSize} cards vs MTGJSON ${theirSize}`)
      : skip(`bonus pool ${ourSize} cards vs MTGJSON ${theirSize} — worth a look`);
  }
}

// ------------------------------------------------------------------- report

function report() {
  if (failures.length) {
    console.error(`\nFAIL: ${failures.length} problem(s)`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `\nOK: ${setCode.toUpperCase()} deals the packs its data claims` +
      (notes.length ? ` (${notes.length} check(s) skipped)` : ""),
  );
  process.exit(0);
}

report();

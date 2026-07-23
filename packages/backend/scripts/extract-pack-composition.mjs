// Derives a set's real booster shapes from a 17Lands draft dataset and prints
// the artifact `sets:storePackComposition` expects.
//
//   node scripts/extract-pack-composition.mjs <csv> <setCode> [> out.json]
//
// The CSV is one row per pick; rows with pick_number 0 are freshly opened packs,
// so their pack_card_* columns are an unpicked booster. Each card is classified
// by the slot it fills -- main-set rarity, bonus sheet, or basic land -- using
// Scryfall for rarity and set code. The result is the observed distribution of
// shapes, which is what makes generated packs match the real format: SOS packs
// span 66 shapes because Play Boosters have a wildcard slot, so no single fixed
// rarity mix describes them.
//
// Deliberately reads a local file. Pulling every set's dataset (90-206MB gzipped
// each) is a separate job from deriving one set's shapes.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [csvPath, setCode] = process.argv.slice(2);
if (!csvPath || !setCode) {
  console.error("usage: extract-pack-composition.mjs <draft_data.csv> <setCode>");
  process.exit(1);
}

const UA = "mtg-tutor/0.1 (draft-trainer)";
const log = (...a) => console.error(...a);

// Minimal CSV row splitter: these files quote only fields containing commas,
// and never embed quotes or newlines inside a field.
function splitRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (n) =>
  [...n.split("//")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()]
    .filter((c) => /[a-z0-9 ]/.test(c))
    .join("")
    .trim();

async function scryfall(query) {
  const out = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints`;
  while (url) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Scryfall ${res.status} for "${query}"`);
    const body = await res.json();
    out.push(...body.data);
    url = body.has_more ? body.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 90));
  }
  return out;
}

// Same rule ingestion uses: the set, plus anything Arena-legal released the same
// day, which is how bonus sheets ship.
async function cardIndex(code) {
  const set = await fetch(`https://api.scryfall.com/sets/${code}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  }).then((r) => r.json());

  const prints = [
    ...(await scryfall(`set:${code}`)),
    ...(set.released_at ? await scryfall(`game:arena date=${set.released_at} -set:${code}`) : []),
  ];

  const index = new Map();
  for (const c of prints) {
    const key = norm(c.name);
    if (index.has(key)) continue; // first print wins; main set is searched first
    const basic = /\bBasic\b/.test(c.type_line ?? "") && /\bLand\b/.test(c.type_line ?? "");
    index.set(key, {
      slot: basic ? "land" : c.set.toLowerCase() !== code.toLowerCase() ? "bonus" : c.rarity,
    });
  }
  return index;
}

const index = await cardIndex(setCode.toLowerCase());
log(`resolved ${index.size} cards for ${setCode}`);

const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
let header = null;
let packCols = null;
let pickNumberCol = null;
const shapes = new Map();
const unresolved = new Set();
let packs = 0;

for await (const line of rl) {
  if (!header) {
    header = splitRow(line);
    pickNumberCol = header.indexOf("pick_number");
    packCols = header
      .map((h, i) => [i, h])
      .filter(([, h]) => h.startsWith("pack_card_"))
      .map(([i, h]) => {
        const name = h.slice("pack_card_".length);
        const hit = index.get(norm(name));
        if (!hit) unresolved.add(name);
        return [i, hit?.slot ?? "unknown"];
      });
    if (pickNumberCol < 0 || packCols.length === 0) {
      throw new Error("CSV does not look like a 17Lands draft dataset");
    }
    continue;
  }

  const row = splitRow(line);
  if (row[pickNumberCol] !== "0") continue; // only freshly opened packs
  packs++;

  const counts = {};
  for (const [i, slot] of packCols) {
    const n = Number(row[i] || 0);
    if (n) counts[slot] = (counts[slot] ?? 0) + n;
  }
  const key = JSON.stringify(Object.entries(counts).sort());
  shapes.set(key, (shapes.get(key) ?? 0) + 1);
}

if (unresolved.size) {
  log(`WARNING: ${unresolved.size} pack cards unresolved: ${[...unresolved].slice(0, 8).join(", ")}`);
}
if (!packs) throw new Error("No packs found (no rows with pick_number 0)");

const parsed = [...shapes].map(([key, weight]) => ({
  slots: Object.fromEntries(JSON.parse(key)),
  weight,
}));
parsed.sort((a, b) => b.weight - a.weight);

const sizes = new Map();
for (const s of parsed) {
  const size = Object.values(s.slots).reduce((a, b) => a + b, 0);
  sizes.set(size, (sizes.get(size) ?? 0) + s.weight);
}
const size = [...sizes].sort((a, b) => b[1] - a[1])[0][0];

// A shape of a different length would deal a pack that ends the round early.
const offSize = parsed.filter(
  (s) => Object.values(s.slots).reduce((a, b) => a + b, 0) !== size,
);
if (offSize.length) {
  const dropped = offSize.reduce((n, s) => n + s.weight, 0);
  log(`dropping ${offSize.length} shapes (${dropped} packs) not of size ${size}`);
}

const composition = {
  size,
  shapes: parsed.filter((s) => Object.values(s.slots).reduce((a, b) => a + b, 0) === size),
};

log(`${packs} packs -> ${composition.shapes.length} shapes, size ${size}`);
const allSlots = [...new Set(composition.shapes.flatMap((s) => Object.keys(s.slots)))].sort();
for (const slot of allSlots) {
  const kept = composition.shapes.reduce((n, s) => n + s.weight, 0);
  const mean =
    composition.shapes.reduce((sum, s) => sum + (s.slots[slot] ?? 0) * s.weight, 0) / kept;
  const never = composition.shapes.filter((s) => !s.slots[slot]).reduce((n, s) => n + s.weight, 0);
  log(`  ${slot.padEnd(9)} mean ${mean.toFixed(2)}/pack, absent from ${((never / kept) * 100).toFixed(0)}%`);
}

console.log(JSON.stringify(composition));

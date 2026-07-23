// Derives a set's own draft statistics from the 17Lands public datasets and
// writes the artifact `sets:storeSetStats` + `sets:storePackComposition` expect.
//
//   node scripts/build-set-stats.mjs SOS TradDraft
//   node scripts/build-set-stats.mjs SOS TradDraft --draft ~/d.csv --game ~/g.csv
//   node scripts/build-set-stats.mjs SOS TradDraft --force   # skip availability gate
//
// Refuses a set whose draft and game datasets are not both published for the
// format -- see lib/datasets.mjs. The gate is skipped when both are given as
// local files, or with --force.
//
// The public datasets are the source 17Lands sanctions for outside use, and they
// carry things no API exposes: real pack contents, per-game decklists, and every
// human pick. 1.24GB of CSV reduces to a ~225KB artifact in about half a minute,
// so the raw files are build inputs -- streamed, never stored, never served.
//
// Only draft and game data are read. The replay dataset is larger than both
// combined and nothing here needs it; see notes.md Ideas #2.

import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAvailability, availabilityNote } from "./lib/datasets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = "mtg-tutor/0.1 (draft-trainer)";
const log = (...a) => console.error(...a);

const BOOLEAN_FLAGS = new Set(["force"]);
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const name = argv[i].slice(2);
    flags[name] = BOOLEAN_FLAGS.has(name) ? true : argv[++i];
  } else positional.push(argv[i]);
}
const flag = (name) => flags[name];
const setCode = (positional[0] ?? "").toLowerCase();
const format = positional[1] ?? "PremierDraft";
if (!setCode) {
  console.error(
    "usage: build-set-stats.mjs <setCode> <format> [--draft path] [--game path] [--out path] [--force]",
  );
  process.exit(1);
}

// ---------------------------------------------------------------- input

const s3 = (kind) =>
  `https://17lands-public.s3.amazonaws.com/analysis_data/${kind}_data/` +
  `${kind}_data_public.${setCode.toUpperCase()}.${format}.csv.gz`;

// Streams a dataset line by line, decompressing on the fly. A local path is used
// as-is so re-deriving does not re-download; without one we stream from S3 and
// keep nothing on disk.
async function* lines(kind, localPath) {
  let input;
  if (localPath) {
    log(`${kind}: reading ${localPath}`);
    input = createReadStream(localPath);
    if (localPath.endsWith(".gz")) input = input.pipe(createGunzip());
  } else {
    const url = s3(kind);
    log(`${kind}: streaming ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    input = Readable.fromWeb(res.body).pipe(createGunzip());
  }
  yield* createInterface({ input, crlfDelay: Infinity });
}

// These files quote only fields containing commas, and never embed a quote or
// newline inside a field.
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

// Must match normalizeName in @mtg-tutor/core, or names will not join.
const norm = (n) =>
  n
    .split("//")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

// ---------------------------------------------------------------- scryfall

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

// Same rule ingestion uses (see fetchScryfallPool): the set, plus anything
// Arena-legal released the same day, which is how bonus sheets ship.
async function slotIndex(code) {
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
    if (index.has(key)) continue; // first print wins; main set searched first
    const type = c.type_line ?? "";
    const basic = /\bBasic\b/.test(type) && /\bLand\b/.test(type);
    index.set(
      key,
      basic ? "land" : c.set.toLowerCase() !== code.toLowerCase() ? "bonus" : c.rarity,
    );
  }
  return index;
}

// ---------------------------------------------------------------- game data

// One pass yields every per-card rate 17Lands publishes, plus two things it does
// not: the same rates split by deck archetype, and card-pair win-rate lift.
//
// Basic lands are skipped entirely. They are in every deck of their color, so
// their per-card win rate is just the deck's, their archetype rows are noise
// ("Plains wins 65% in UG"), and they show up as spurious synergy partners. They
// are never scored, so dropping them here is pure signal -- and smaller.
async function readGameData(localPath, isBasic) {
  const stats = new Map();
  const archetypes = new Map();
  const pairN = new Map();
  const pairW = new Map();
  let header = null;
  let cols = null;
  let wonI = -1;
  let archI = -1;
  let games = 0;
  let wins = 0;

  const bump = (map, key, won) => {
    const e = map.get(key) ?? { n: 0, w: 0 };
    e.n++;
    e.w += won;
    map.set(key, e);
  };

  for await (const line of lines("game", localPath)) {
    if (!header) {
      header = splitRow(line);
      wonI = header.indexOf("won");
      archI = header.indexOf("main_colors");
      const by = new Map();
      header.forEach((h, i) => {
        for (const p of ["deck_", "opening_hand_", "drawn_", "tutored_"]) {
          if (h.startsWith(p)) {
            const name = h.slice(p.length);
            const e = by.get(name) ?? {};
            e[p] = i;
            by.set(name, e);
          }
        }
      });
      cols = [...by]
        .filter(([, e]) => e["deck_"] != null)
        .map(([name, e]) => [name, e["deck_"], e["opening_hand_"], e["drawn_"], e["tutored_"]]);
      if (wonI < 0 || cols.length === 0) throw new Error("not a 17Lands game dataset");
      continue;
    }

    const row = splitRow(line);
    const won = row[wonI] === "True" ? 1 : 0;
    const arch = row[archI] || "";
    games++;
    wins += won;

    const inDeck = [];
    for (const [name, d, o, dr, tu] of cols) {
      if (!row[d] || row[d] === "0") continue;
      if (isBasic(name)) continue;
      inDeck.push(name);

      const s =
        stats.get(name) ??
        { deckN: 0, deckW: 0, ohN: 0, ohW: 0, gdN: 0, gdW: 0, gihN: 0, gihW: 0, gndN: 0, gndW: 0 };
      s.deckN++;
      s.deckW += won;

      const oh = Number(row[o] || 0);
      const drawn = Number(row[dr] || 0) + Number(row[tu] || 0);
      if (oh) {
        s.ohN++;
        s.ohW += won;
      } else if (drawn) {
        s.gdN++;
        s.gdW += won;
      }
      if (oh || drawn) {
        s.gihN++;
        s.gihW += won;
        if (arch) bump(archetypes, `${name}|${arch}`, won);
      } else {
        s.gndN++;
        s.gndW += won;
      }
      stats.set(name, s);
    }

    // Co-occurrence, for win-rate lift between card pairs.
    for (let i = 0; i < inDeck.length; i++) {
      for (let j = i + 1; j < inDeck.length; j++) {
        const key = `${inDeck[i]}|${inDeck[j]}`;
        pairN.set(key, (pairN.get(key) ?? 0) + 1);
        if (won) pairW.set(key, (pairW.get(key) ?? 0) + 1);
      }
    }
  }

  return { stats, archetypes, pairN, pairW, games, wins };
}

// ---------------------------------------------------------------- draft data

// Pick-order stats, plus the observed pack shapes. Both come from the same rows,
// so this reads the largest dataset once.
async function readDraftData(localPath, slots) {
  const seen = new Map();
  const seenSum = new Map();
  const taken = new Map();
  const takenSum = new Map();
  const maindeck = new Map();
  const trophySeen = new Map();
  const trophyTaken = new Map();
  const shapes = new Map();
  const unresolved = new Set();

  let header = null;
  let packCols = null;
  let pickNoI = -1;
  let pickI = -1;
  let mdI = -1;
  let winsI = -1;
  let packs = 0;

  const add = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

  for await (const line of lines("draft", localPath)) {
    if (!header) {
      header = splitRow(line);
      pickNoI = header.indexOf("pick_number");
      pickI = header.indexOf("pick");
      mdI = header.indexOf("pick_maindeck_rate");
      winsI = header.indexOf("event_match_wins");
      packCols = header
        .map((h, i) => [h, i])
        .filter(([h]) => h.startsWith("pack_card_"))
        .map(([h, i]) => {
          const name = h.slice("pack_card_".length);
          const slot = slots.get(norm(name));
          if (!slot) unresolved.add(name);
          return [i, name, slot ?? "unknown"];
        });
      if (pickNoI < 0 || packCols.length === 0) throw new Error("not a 17Lands draft dataset");
      continue;
    }

    const row = splitRow(line);
    const pickNo = Number(row[pickNoI]);
    const trophy = row[winsI] === "3";
    const fresh = row[pickNoI] === "0";
    const counts = fresh ? {} : null;

    for (const [i, name, slot] of packCols) {
      const n = Number(row[i] || 0);
      if (!n) continue;
      add(seen, name);
      add(seenSum, name, pickNo);
      if (trophy) add(trophySeen, name);
      if (counts) counts[slot] = (counts[slot] ?? 0) + n;
    }
    if (counts) {
      packs++;
      const key = JSON.stringify(Object.entries(counts).sort());
      add(shapes, key);
    }

    const picked = row[pickI];
    if (picked) {
      add(taken, picked);
      add(takenSum, picked, pickNo);
      if (trophy) add(trophyTaken, picked);
      const rate = Number(row[mdI]);
      if (!Number.isNaN(rate) && row[mdI] !== "") add(maindeck, picked, rate);
    }
  }

  return {
    seen, seenSum, taken, takenSum, maindeck,
    trophySeen, trophyTaken, shapes, packs, unresolved,
  };
}

// ---------------------------------------------------------------- assemble

const round = (x, places = 4) => Number(x.toFixed(places));

function packComposition(shapes, packs) {
  const parsed = [...shapes].map(([key, weight]) => ({
    slots: Object.fromEntries(JSON.parse(key)),
    weight,
  }));
  parsed.sort((a, b) => b.weight - a.weight);

  const total = (s) => Object.values(s.slots).reduce((a, b) => a + b, 0);
  const sizes = new Map();
  for (const s of parsed) sizes.set(total(s), (sizes.get(total(s)) ?? 0) + s.weight);
  const size = [...sizes].sort((a, b) => b[1] - a[1])[0][0];

  const kept = parsed.filter((s) => total(s) === size);
  const dropped = packs - kept.reduce((n, s) => n + s.weight, 0);
  if (dropped) log(`  dropped ${dropped} packs whose shape was not size ${size}`);
  return { size, shapes: kept };
}

log(`building ${setCode.toUpperCase()} / ${format}`);

// Availability gate. We only ingest a set whose full public dataset exists for
// the format. Skipped when both datasets we read are supplied locally, since a
// local file is the caller asserting the data is in hand. `--force` overrides.
const allLocal = flag("draft") && flag("game");
if (!allLocal && !flag("force")) {
  const report = await checkAvailability(setCode, format);
  log(await availabilityNote(setCode, format, report));
  if (!report.available) process.exit(1);
}

const t0 = Date.now();

const slots = await slotIndex(setCode);
log(`resolved ${slots.size} cards from Scryfall`);

const isBasic = (name) => slots.get(norm(name)) === "land";
const game = await readGameData(flag("game"), isBasic);
log(`game: ${game.games} games, ${game.stats.size} cards (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const draft = await readDraftData(flag("draft"), slots);
log(`draft: ${draft.packs} packs, ${draft.shapes.size} shapes (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (draft.unresolved.size) {
  log(`  WARNING: ${draft.unresolved.size} unresolved: ${[...draft.unresolved].slice(0, 6).join(", ")}`);
}

const baseWinRate = game.wins / game.games;

// Sample floors. 17Lands suppresses its own win rates under 500 games in hand;
// we keep a lower bar but record `n` on everything so consumers can be stricter.
const MIN_GIH = 200;
const MIN_ARCHETYPE = 200;
const MIN_PAIR = 300;
const SYNERGY_PER_CARD = 8;

// Arrays rather than name-keyed objects: Convex applies field-name rules to
// object keys, and card names are arbitrary text.
const cards = [];
for (const [name, s] of game.stats) {
  const rate = (w, n) => (n > 0 ? round(w / n) : undefined);
  const gih = rate(s.gihW, s.gihN);
  const gnd = rate(s.gndW, s.gndN);
  cards.push({
    name,
    gihN: s.gihN,
    gihWr: s.gihN >= MIN_GIH ? gih : undefined,
    ohN: s.ohN,
    ohWr: s.ohN >= MIN_GIH ? rate(s.ohW, s.ohN) : undefined,
    gdN: s.gdN,
    gdWr: s.gdN >= MIN_GIH ? rate(s.gdW, s.gdN) : undefined,
    gndN: s.gndN,
    gndWr: s.gndN >= MIN_GIH ? gnd : undefined,
    // Improvement when drawn: how much having the card beats not having drawn it.
    // Independent of how good the decks that play it are, unlike raw GIH WR.
    iwd: gih != null && gnd != null && s.gihN >= MIN_GIH && s.gndN >= MIN_GIH
      ? round(gih - gnd)
      : undefined,
    deckN: s.deckN,
    deckWr: rate(s.deckW, s.deckN),
    alsa: draft.seen.has(name) ? round(draft.seenSum.get(name) / draft.seen.get(name), 2) : undefined,
    ata: draft.taken.has(name) ? round(draft.takenSum.get(name) / draft.taken.get(name), 2) : undefined,
    seen: draft.seen.get(name) ?? 0,
    taken: draft.taken.get(name) ?? 0,
    // How often a card that was taken actually made the deck. A high pick rate
    // with a low maindeck rate is a trap, which win rate alone cannot show.
    maindeckRate: draft.taken.has(name)
      ? round(draft.maindeck.get(name) / draft.taken.get(name))
      : undefined,
    // Pick rate among drafters who went 3-0, as a "what do winners take" signal.
    trophyPickRate:
      (draft.trophySeen.get(name) ?? 0) >= 100
        ? round((draft.trophyTaken.get(name) ?? 0) / draft.trophySeen.get(name))
        : undefined,
  });
}

const archetypes = [];
for (const [key, e] of game.archetypes) {
  if (e.n < MIN_ARCHETYPE) continue;
  const i = key.lastIndexOf("|");
  archetypes.push({ name: key.slice(0, i), colors: key.slice(i + 1), n: e.n, wr: round(e.w / e.n) });
}

// Lift, not raw pair win rate: two strong cards win together because they are
// strong, so subtract what each independently predicts and keep the remainder.
const soloWr = new Map();
for (const [name, s] of game.stats) if (s.gihN > 0) soloWr.set(name, s.gihW / s.gihN);

const byCard = new Map();
for (const [key, n] of game.pairN) {
  if (n < MIN_PAIR) continue;
  const i = key.indexOf("|");
  const a = key.slice(0, i);
  const b = key.slice(i + 1);
  const wa = soloWr.get(a);
  const wb = soloWr.get(b);
  if (wa == null || wb == null) continue;
  const lift = round((game.pairW.get(key) ?? 0) / n - (wa + wb) / 2);
  for (const [self, other] of [[a, b], [b, a]]) {
    if (!byCard.has(self)) byCard.set(self, []);
    byCard.get(self).push({ partner: other, lift, n });
  }
}
const synergies = [];
for (const [name, list] of byCard) {
  list.sort((x, y) => y.lift - x.lift);
  synergies.push({ name, partners: list.slice(0, SYNERGY_PER_CARD) });
}

const artifact = {
  setCode,
  format,
  games: game.games,
  baseWinRate: round(baseWinRate),
  cards,
  archetypes,
  synergies,
  packComposition: packComposition(draft.shapes, draft.packs),
};

const out = flag("out") ?? resolve(HERE, "..", "data", `${setCode}.${format}.json`);
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(artifact);
writeFileSync(out, json);

log("");
log(`wrote ${out}`);
log(`  ${(json.length / 1024).toFixed(0)}KB · ${cards.length} cards · base WR ${round(baseWinRate, 3)}`);
log(`  ${archetypes.length} archetype splits · ${synergies.length} cards with synergies`);
log(`  pack: size ${artifact.packComposition.size}, ${artifact.packComposition.shapes.length} shapes`);
log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s total`);

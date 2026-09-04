// Derives a set's own draft statistics from the 17Lands public datasets and
// writes the artifact `sets:storeSetStats` expects (pack composition included).
//
//   node scripts/build-set-stats.mjs SOS TradDraft
//   node scripts/build-set-stats.mjs SOS TradDraft --draft ~/d.csv --game ~/g.csv
//   node scripts/build-set-stats.mjs SOS TradDraft --force   # skip availability gate
//
// The set's pack columns in the draft dataset are the authoritative list of what
// its boosters contain. Scryfall is asked about those names -- first in bulk by
// set and release day, then by exact name for whatever that misses -- and is
// never asked to guess membership on its own. A name that still cannot be
// slotted fails the build (--allow-unresolved treats it as a bonus-sheet card),
// because an artifact with an unplaceable slot cannot be seeded.
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

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAvailability, availabilityNote } from "./lib/datasets.mjs";
import { lines as streamDataset, splitRow } from "./lib/csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = "mtg-tutor/0.1 (draft-trainer)";
const log = (...a) => console.error(...a);

const BOOLEAN_FLAGS = new Set(["force", "allow-unresolved"]);
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
    "usage: build-set-stats.mjs <setCode> <format> [--draft path] [--game path] [--out path]" +
      " [--force] [--allow-unresolved]",
  );
  process.exit(1);
}

// ---------------------------------------------------------------- input

const lines = (kind, localPath) => streamDataset({ kind, setCode, format, localPath, log });

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

// `unique` is the caller's call. Pool crawls want `prints`, so a bonus-sheet
// printing keeps its own rarity rather than collapsing into the main set's. The
// by-name lookup wants `cards`: one row per card, already the Arena-legal
// printing, which is the one whose set code and rarity belong in the artifact.
async function scryfall(query, unique = "prints") {
  const out = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=${unique}`;
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

// The slots makePack knows how to fill (SLOT_ORDER in core/src/draft/pack.ts).
// A pack card that cannot be placed in one of these is a build failure: the
// Convex validator would reject the artifact, and widening it would instead make
// makePack skip the slot and quietly deal short packs.
const SLOTS = new Set(["common", "uncommon", "rare", "mythic", "bonus", "land"]);

// Which slot a printing fills. The same rule ingestion applies when it rebuilds
// the pools (see isBonusSheet): a card whose own set differs from the set being
// drafted came off a bonus sheet, whatever that sheet is called.
function slotOf(print, code) {
  const type = print.type_line ?? "";
  if (/\bBasic\b/.test(type) && /\bLand\b/.test(type)) return "land";
  return print.set.toLowerCase() !== code.toLowerCase() ? "bonus" : print.rarity;
}

const indexPrints = (index, prints, code) => {
  for (const c of prints) {
    const key = norm(c.name);
    if (index.has(key)) continue; // first print wins; main set searched first
    index.set(key, { slot: slotOf(c, code), setCode: c.set.toLowerCase() });
  }
  return index;
};

// Same rule ingestion uses (see fetchScryfallPool): the set, plus anything
// Arena-legal released the same day, which is how bonus sheets ship.
//
// This is a fast path, not the last word. It answers "what shipped on release
// day", which is only a proxy for "what can appear in this set's boosters" --
// MKM's Arena packs carry a 50-card List sheet of printings from 2005-2017 that
// no same-day query can reach. resolveByName picks up whatever it misses.
async function slotIndex(code) {
  const set = await fetch(`https://api.scryfall.com/sets/${code}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  }).then((r) => r.json());

  const prints = [
    ...(await scryfall(`set:${code}`)),
    ...(set.released_at ? await scryfall(`game:arena date=${set.released_at} -set:${code}`) : []),
  ];

  return indexPrints(new Map(), prints, code);
}

// Scryfall caps a query's length, and these are OR-ed exact names.
const NAMES_PER_QUERY = 20;

// Resolves pack cards the release-day query could not see, by asking Scryfall
// about names we already have rather than asking it to guess membership.
// `unique=cards` with `game:arena` returns the Arena-legal printing -- which is
// the one whose set code and rarity we want, and is often decades older than the
// set being drafted. Names come from 17Lands' pack columns, which are the
// authoritative list of what was actually opened.
async function resolveByName(names, code) {
  const index = new Map();
  for (let i = 0; i < names.length; i += NAMES_PER_QUERY) {
    const chunk = names.slice(i, i + NAMES_PER_QUERY);
    const q = `game:arena (${chunk.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ")})`;
    indexPrints(index, await scryfall(q, "cards"), code);
    if (i + NAMES_PER_QUERY < names.length) await new Promise((r) => setTimeout(r, 90));
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
  const colorRecord = new Map(); // main_colors -> {n, w}, the archetype's own win rate
  const pairN = new Map();
  const pairW = new Map();
  // How long the game ran, kept as sufficient statistics rather than as games.
  //
  // The number the drill wants is a card's mean game length MINUS the mean for
  // the colours it was played in, and the baselines are only known once the pass
  // ends. Holding every game to subtract afterwards would cost hundreds of
  // thousands of rows; holding a count, a sum and a sum of squares per (card,
  // colours) costs about eight thousand entries and yields the residual and its
  // standard error exactly. `turnsByColors` is the same three numbers per
  // colour combination over all games, which is what the baselines come from.
  const turnsByColors = new Map();
  const cardTurns = new Map(); // `${name}|${colors}` -> {n, sum, sq}
  let header = null;
  let cols = null;
  let wonI = -1;
  let archI = -1;
  let turnsI = -1;
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
      // Absent in no dataset we have read, but a set that published one without
      // it should write no speed at all rather than a column of zeros.
      turnsI = header.indexOf("num_turns");
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
    if (arch) bump(colorRecord, arch, won);

    // Basics are dropped from the per-card loop below by `isBasic`, and must NOT
    // be dropped here: a baseline is per game rather than per card, and skipping
    // games would change what every residual is taken against.
    const turns = turnsI < 0 ? NaN : Number(row[turnsI]);
    const timed = arch !== "" && Number.isFinite(turns);
    if (timed) {
      const t = turnsByColors.get(arch) ?? { n: 0, sum: 0, sq: 0 };
      t.n++;
      t.sum += turns;
      t.sq += turns * turns;
      turnsByColors.set(arch, t);
    }

    const inDeck = [];
    for (const [name, d, o, dr, tu] of cols) {
      if (!row[d] || row[d] === "0") continue;
      if (isBasic(name)) continue;
      inDeck.push(name);

      if (timed) {
        const key = `${name}|${arch}`;
        const ct = cardTurns.get(key) ?? { n: 0, sum: 0, sq: 0 };
        ct.n++;
        ct.sum += turns;
        ct.sq += turns * turns;
        cardTurns.set(key, ct);
      }

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

  return {
    stats,
    archetypes,
    colorRecord,
    pairN,
    pairW,
    games,
    wins,
    ...deckSpeed(turnsByColors, cardTurns),
  };
}

// A colour combination needs this many games before its mean is a baseline worth
// subtracting; below it the mean is noise, and every card played in those decks
// would carry that noise into its own residual.
const MIN_BASELINE_GAMES = 200;
// And a card needs this many before its residual is worth a standard error.
const MIN_SPEED_GAMES = 400;

/**
 * How much longer or shorter a card's games ran than its own colours' games did.
 *
 * WHY A RESIDUAL AND NOT A MEAN
 *
 * Game length is a joint outcome of both decks, so a card's raw mean says as much
 * about the format and about the colour pair it lives in as about the card.
 * Subtracting the mean for the colours the card was actually played in divides
 * both of those out. Measured across 25 sets it recovers what Limited players
 * already say from data carrying no labels: equipment and one-drops at the fast
 * end, wraths and mass removal at the slow.
 *
 * IT IS NOT WIN RATE WEARING A DIFFERENT HAT, which is the check that matters --
 * an axis that turned out to be the grade again would be worth nothing beside the
 * grade a pick already gets. Correlation against gihWr comes back at +0.088,
 * consistent with the 0.022 already recorded for `speed` in docs/rulings.md.
 *
 * AND IT IS NOT `speed`, WHICH ALREADY EXISTS. That field is ohWr - gdWr, set in
 * convex/sets.ts, and it asks when in a game a card is best FOR YOU. This asks
 * how long the game runs when the card is in the deck. Correlated against each
 * other they come back at -0.28 over 252 fdn cards and -0.29 over 269 woe cards:
 * the right sign, about a tenth of the variance shared, and neither can stand in
 * for the other.
 *
 * THE ARITHMETIC, since it is done from sufficient statistics rather than from
 * games. For a card played in colours c with n_c games, sum s_c and sum of
 * squares q_c, against baselines b_c:
 *
 *   mean residual = (Σ s_c - Σ n_c·b_c) / N
 *   E[residual²]  = (Σ q_c - 2·Σ b_c·s_c + Σ n_c·b_c²) / N
 *
 * which gives the variance, and the standard error is its root over N. Exact --
 * this is algebra rather than an approximation to holding every game.
 */
function deckSpeed(turnsByColors, cardTurns) {
  const baselines = new Map();
  for (const [colors, t] of turnsByColors) {
    if (t.n >= MIN_BASELINE_GAMES) baselines.set(colors, t.sum / t.n);
  }
  if (baselines.size === 0) return { deckSpeed: new Map(), turnStats: undefined };

  let allN = 0;
  let allSum = 0;
  for (const t of turnsByColors.values()) {
    allN += t.n;
    allSum += t.sum;
  }

  const perCard = new Map();
  for (const [key, ct] of cardTurns) {
    const sep = key.lastIndexOf("|");
    const name = key.slice(0, sep);
    const base = baselines.get(key.slice(sep + 1));
    if (base == null) continue;
    const e = perCard.get(name) ?? { n: 0, sum: 0, sq: 0, nb: 0, bs: 0, nbb: 0 };
    e.n += ct.n;
    e.sum += ct.sum;
    e.sq += ct.sq;
    e.nb += ct.n * base;
    e.bs += base * ct.sum;
    e.nbb += ct.n * base * base;
    perCard.set(name, e);
  }

  const out = new Map();
  for (const [name, e] of perCard) {
    if (e.n < MIN_SPEED_GAMES) continue;
    const m = (e.sum - e.nb) / e.n;
    const second = (e.sq - 2 * e.bs + e.nbb) / e.n;
    const variance = Math.max(0, second - m * m);
    out.set(name, { resid: m, se: Math.sqrt(variance / e.n), n: e.n });
  }

  return {
    deckSpeed: out,
    // The baselines the residuals were taken against, stored because a residual
    // whose baseline is not written down cannot be re-read or re-argued later.
    turnStats: {
      mean: allSum / allN,
      // `round` is a const declared further down and this runs before it, so the
      // rounding is spelled out rather than borrowed.
      byColors: Object.fromEntries(
        [...baselines].map(([c, b]) => [c, Number(b.toFixed(4))]),
      ),
    },
  };
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
  const opened = new Map();
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
      const cols = header
        .map((h, i) => [h, i])
        .filter(([h]) => h.startsWith("pack_card_"))
        .map(([h, i]) => [i, h.slice("pack_card_".length)]);
      if (pickNoI < 0 || cols.length === 0) throw new Error("not a 17Lands draft dataset");

      // The pack columns ARE the set's booster manifest. Anything in here that
      // the release-day query could not see gets looked up by name, so a card
      // is never dropped or mis-slotted just because it was printed decades
      // before the set it now appears in.
      const missing = cols.map(([, name]) => name).filter((name) => !slots.has(norm(name)));
      if (missing.length) {
        log(`  resolving ${missing.length} pack cards by name`);
        for (const [key, entry] of await resolveByName(missing, setCode)) {
          if (!slots.has(key)) slots.set(key, entry);
        }
      }

      packCols = cols.map(([i, name]) => {
        const entry = slots.get(norm(name));
        if (!entry || !SLOTS.has(entry.slot)) {
          unresolved.add(name);
          return [i, name, "bonus"];
        }
        return [i, name, entry.slot];
      });
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
      if (counts) {
        counts[slot] = (counts[slot] ?? 0) + n;
        // Only fresh packs, and counting copies rather than packs, so this is
        // expected copies per booster -- the weight a slot should draw by.
        add(opened, name, n);
      }
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

  // Every column the set's boosters can contain, with the slot it fills and the
  // set it was printed in. This is the seam between the two halves of the
  // pipeline: the shapes below are keyed by these slots, and ingestion rebuilds
  // the matching pools from these names -- so neither side has to re-derive
  // which cards are in the set, and they cannot drift apart.
  const packCards = packCols.map(([, name, slot]) => {
    const setCode = slots.get(norm(name))?.setCode;
    const entry = { name, slot };
    if (setCode) entry.setCode = setCode;
    // Cards within a slot are not equally likely -- real bonus sheets are
    // weighted by rarity. Recording what was actually opened lets makePack draw
    // by it instead of evenly. Six places keeps a ~0.0025 rate meaningful
    // without bloating the artifact.
    if (packs > 0) entry.openedRate = round((opened.get(name) ?? 0) / packs, 6);
    return entry;
  });

  return {
    seen, seenSum, taken, takenSum, maindeck,
    trophySeen, trophyTaken, shapes, packs, unresolved, packCards,
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

const isBasic = (name) => slots.get(norm(name))?.slot === "land";
const game = await readGameData(flag("game"), isBasic);
log(`game: ${game.games} games, ${game.stats.size} cards (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

const draft = await readDraftData(flag("draft"), slots);
log(`draft: ${draft.packs} packs, ${draft.shapes.size} shapes (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
// A name that survives both the release-day query and the by-name lookup has no
// slot we can place it in. Writing it anyway produced `unknown`, which the
// Convex validator rejects at seed time -- so stop here, where the names are in
// hand, rather than shipping an artifact that cannot be loaded.
if (draft.unresolved.size) {
  const names = [...draft.unresolved];
  log("");
  log(`  ${names.length} pack card(s) could not be resolved to a slot:`);
  for (const n of names) log(`    ${n}`);
  if (!flag("allow-unresolved")) {
    log("");
    log("  Refusing to write an artifact that cannot be seeded.");
    log("  Re-run with --allow-unresolved to treat these as bonus-sheet cards.");
    process.exit(1);
  }
  log("  --allow-unresolved: treating them as bonus-sheet cards.");
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
    // How much longer or shorter this card's games ran than its own colours'
    // games did, in turns, with the error bar that says whether the difference
    // is separable from none at all. Both or neither -- a residual printed
    // without its standard error is a number nobody can refuse.
    deckSpeed: game.deckSpeed.get(name) ? round(game.deckSpeed.get(name).resid) : undefined,
    deckSpeedSe: game.deckSpeed.get(name) ? round(game.deckSpeed.get(name).se) : undefined,
    deckSpeedN: game.deckSpeed.get(name)?.n,
  });
}

const archetypes = [];
for (const [key, e] of game.archetypes) {
  if (e.n < MIN_ARCHETYPE) continue;
  const i = key.lastIndexOf("|");
  archetypes.push({ name: key.slice(0, i), colors: key.slice(i + 1), n: e.n, wr: round(e.w / e.n) });
}

// Each archetype's own win rate (independent of any card). Replaces the
// /color_ratings API call the app used to make at ingest -- the last runtime
// 17Lands dependency. Every colour count is kept, pairs and wider alike: the
// three-colour rows are the majority archetype in some sets, and the gap
// between the widths is the only thing that measures what a splash costs.
const colorWinRates = [];
for (const [colors, e] of game.colorRecord) {
  if (e.n < MIN_ARCHETYPE) continue;
  colorWinRates.push({ colors, n: e.n, wr: round(e.w / e.n) });
}
colorWinRates.sort((a, b) => b.n - a.n);

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
  colorWinRates,
  synergies,
  packCards: draft.packCards,
  packComposition: packComposition(draft.shapes, draft.packs),
  // The format's own mean game length and the per-colour means every card's
  // `deckSpeed` was taken against. Stored so the residuals can be re-read rather
  // than only trusted, and absent for a set whose game data carried no turns.
  turnStats: game.turnStats,
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
log(
  `  ${artifact.packCards.length} pack cards · ` +
    `${artifact.packCards.filter((c) => c.slot === "bonus").length} off a bonus sheet`,
);
log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s total`);

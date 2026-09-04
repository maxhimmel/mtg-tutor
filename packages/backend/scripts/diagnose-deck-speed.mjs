// How fast a deck wants the game to go, and how many cards a set can be asked about.
//
//   node scripts/diagnose-deck-speed.mjs                 # every archived set
//   node scripts/diagnose-deck-speed.mjs --set fdn       # one
//   node scripts/diagnose-deck-speed.mjs --set fdn --cards   # the per-card table
//
// WHY THIS EXISTS
//
// The drill this feeds asks what kind of deck wants a card, and the number it
// grades against is a residual: the mean `num_turns` of games whose deck ran the
// card, minus the mean for that deck's own colours. That subtraction is the
// whole design. Game length is a joint outcome of both decks, so a raw mean says
// as much about the format and the colour pair as about the card; taking the
// difference against the card's own colours divides both out and leaves the part
// that is the card.
//
// It prints BEFORE anything is stored, because the number that decides whether a
// set can hold a run is the size of its question pool, and that has to be
// re-derivable rather than remembered. Trap #22 applies here as it does to the
// archetype quiz: an instrument beside a threshold measures the setting rather
// than whether the setting is right, so this prints the whole distribution and
// the gate is chosen by reading it.
//
// WHAT THE GATE IS, AND WHY IT IS NOT THE ARCHETYPE QUIZ'S
//
// `diagnose-archetype-quiz` gates on a simulated null for the RANGE over k decks,
// because the widest gap among many noisy numbers is wide even when nothing is
// there. This drill compares ONE number against a fixed point -- zero, meaning
// "the same length as other decks in these colours" -- so the ordinary two-sided
// standard error is the correct test and the simulation would be borrowed rigour
// rather than the right kind.
//
// THE CHECK THAT NEVER GETS STORED
//
// `--pairs` prints the signed statistic: mean turns when a colour pair WINS minus
// when it loses. Aggro wins faster than it loses and control loses faster than it
// wins, so the sign is a check that the axis points the way a drafter would
// expect. It is not the axis and is never written into an artifact: `won` is
// censored by the very decision being judged, and the drill must not show an
// outcome at answer time.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lines, splitRow } from "./lib/csv.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, "..", "..", "..", "archive");

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const FORMAT = arg("format", "TradDraft");
// A colour combination needs this many games before it can be a baseline. Below
// it the mean it contributes is noise, and every card in those decks would carry
// that noise into its residual.
const MIN_BASELINE_GAMES = 200;
// And a card needs this many games before its own residual is worth a standard
// error. Both floors are printed rather than hidden, because moving them is an
// argument with this table.
const MIN_CARD_GAMES = 400;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * One pass over a set's game dataset.
 *
 * `num_turns` is the whole-game total -- 17Lands' own schema types it `int8` and
 * publishes no per-player or turn-cycle variant -- so it is read as-is.
 *
 * Basics are NOT excluded from the colour baselines. `build-set-stats` drops them
 * from its per-card loop by choice, but a baseline is per game rather than per
 * card and dropping games would change what the residual is taken against.
 */
async function readSet(localPath) {
  let header = null;
  let turnsI = -1;
  let colorsI = -1;
  let wonI = -1;
  let deckCols = null;
  let width = 0;

  const games = []; // [turns, colors, won] per game, indexed by the card lists
  const byCard = new Map(); // card -> game indices
  let malformed = 0;

  for await (const line of lines({ kind: "game", localPath })) {
    if (!header) {
      header = splitRow(line);
      width = header.length;
      turnsI = header.indexOf("num_turns");
      colorsI = header.indexOf("main_colors");
      wonI = header.indexOf("won");
      deckCols = header
        .map((h, i) => [h, i])
        .filter(([h]) => h.startsWith("deck_"))
        .map(([h, i]) => [i, h.slice("deck_".length)]);
      if (turnsI < 0 || colorsI < 0 || deckCols.length === 0) {
        throw new Error("not a 17Lands game dataset, or it has no num_turns column");
      }
      continue;
    }

    // Card names carry commas and 17Lands quotes exactly those fields, so a row
    // that does not split to the header's width has been misread rather than
    // published short.
    const row = splitRow(line);
    if (row.length !== width) {
      malformed++;
      continue;
    }
    const turns = Number(row[turnsI]);
    const colors = row[colorsI];
    if (!Number.isFinite(turns) || !colors) continue;

    const g = games.length;
    games.push([turns, colors, row[wonI] === "True"]);
    for (const [i, name] of deckCols) {
      const n = row[i];
      if (n && n !== "0") {
        const seen = byCard.get(name);
        if (seen) seen.push(g);
        else byCard.set(name, [g]);
      }
    }
  }

  return { games, byCard, malformed };
}

/** The residual and its standard error for every card that clears the floor. */
function residuals({ games, byCard }) {
  const byColors = new Map();
  for (const [turns, colors] of games) {
    const seen = byColors.get(colors);
    if (seen) seen.push(turns);
    else byColors.set(colors, [turns]);
  }
  const baseline = new Map();
  for (const [colors, xs] of byColors) {
    if (xs.length >= MIN_BASELINE_GAMES) baseline.set(colors, mean(xs));
  }

  const out = [];
  for (const [name, idx] of byCard) {
    const rs = [];
    for (const g of idx) {
      const base = baseline.get(games[g][1]);
      if (base != null) rs.push(games[g][0] - base);
    }
    if (rs.length < MIN_CARD_GAMES) continue;
    const m = mean(rs);
    const variance = mean(rs.map((r) => (r - m) ** 2));
    out.push({ name, n: rs.length, resid: m, se: Math.sqrt(variance / rs.length) });
  }
  out.sort((a, b) => a.resid - b.resid);
  return { cards: out, baseline };
}

/** The signed check: how much faster a pair wins than it loses. Never stored. */
function pairDeltas({ games }) {
  const won = new Map();
  const lost = new Map();
  for (const [turns, colors, w] of games) {
    const map = w ? won : lost;
    const seen = map.get(colors);
    if (seen) seen.push(turns);
    else map.set(colors, [turns]);
  }
  const out = [];
  for (const [colors, w] of won) {
    const l = lost.get(colors);
    if (!l || w.length < MIN_BASELINE_GAMES || l.length < MIN_BASELINE_GAMES) continue;
    out.push({ colors, n: w.length + l.length, delta: mean(w) - mean(l) });
  }
  out.sort((a, b) => a.delta - b.delta);
  return out;
}

const only = arg("set");
const files = readdirSync(ARCHIVE)
  .filter((f) => f.startsWith("game_data_public.") && f.includes(`.${FORMAT}.`))
  .filter((f) => !only || f.toLowerCase().includes(`.${only.toLowerCase()}.`))
  .sort();

if (!existsSync(ARCHIVE) || files.length === 0) {
  console.error(
    `no archived ${FORMAT} game datasets in ${ARCHIVE}` +
      (only ? ` for ${only}` : "") +
      `\nrun \`pnpm archive-datasets\` first -- this reads bytes, never the network.`,
  );
  process.exit(1);
}

console.log(
  `${files.length} set(s), ${FORMAT}. ` +
    `A colour needs ${MIN_BASELINE_GAMES} games to be a baseline, ` +
    `a card ${MIN_CARD_GAMES} to carry a residual.\n`,
);
console.log("set   games    mean  sd(resid)  cards   >=2se        >=3se");

const totals = [];
for (const file of files) {
  const setCode = file.split(".")[1];
  const read = await readSet(join(ARCHIVE, file));
  const { cards } = residuals(read);
  if (cards.length === 0) {
    console.log(`${setCode.toLowerCase().padEnd(5)} ${String(read.games.length).padStart(6)}` + "   -- no card clears the floor, this set cannot hold a run");
    continue;
  }
  const m = mean(read.games.map((g) => g[0]));
  const vals = cards.map((c) => c.resid);
  const sd = Math.sqrt(mean(vals.map((v) => (v - mean(vals)) ** 2)));
  const sep2 = cards.filter((c) => Math.abs(c.resid) >= 2 * c.se).length;
  const sep3 = cards.filter((c) => Math.abs(c.resid) >= 3 * c.se).length;
  const pct = (k) => `${((100 * k) / cards.length).toFixed(1)}%`;

  console.log(
    `${setCode.toLowerCase().padEnd(5)} ${String(read.games.length).padStart(6)} ` +
      `${m.toFixed(2).padStart(7)} ${sd.toFixed(3).padStart(10)} ` +
      `${String(cards.length).padStart(6)} ` +
      `${String(sep2).padStart(5)} ${pct(sep2).padStart(6)} ` +
      `${String(sep3).padStart(5)} ${pct(sep3).padStart(6)}` +
      (read.malformed ? `   (${read.malformed} rows misread)` : ""),
  );
  totals.push({ setCode, cards, sep2, games: read.games });

  if (has("cards")) {
    console.log("\n  the fifteen fastest and the fifteen slowest, residual in turns\n");
    const show = (c) => {
      const z = c.resid / c.se;
      const gate = Math.abs(z) >= 2 ? " " : "~";
      console.log(
        `  ${gate}${c.resid >= 0 ? "+" : ""}${c.resid.toFixed(3)}  ` +
          `n=${String(c.n).padStart(6)}  z=${z >= 0 ? "+" : ""}${z.toFixed(1).padStart(5)}  ${c.name}`,
      );
    };
    cards.slice(0, 15).forEach(show);
    console.log("  ...");
    cards.slice(-15).forEach(show);
    console.log("\n  `~` marks a card inside its own error bar -- the drill will not ask about it.\n");
  }

  if (has("pairs")) {
    console.log("\n  the signed check: mean turns won minus lost, by colours\n");
    for (const p of pairDeltas(read)) {
      console.log(
        `  ${p.colors.padEnd(4)} ${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(3)}  n=${p.n}`,
      );
    }
    console.log(
      "\n  Negative is a deck that wins faster than it loses. This is a check on the\n" +
        "  axis and is never stored -- see the header.\n",
    );
  }
}

if (totals.length > 1) {
  const asked = totals.reduce((a, t) => a + t.sep2, 0);
  const measured = totals.reduce((a, t) => a + t.cards.length, 0);
  console.log(
    `\n${asked} of ${measured} measured cards can be asked about at 2 se, across ${totals.length} sets.`,
  );
  const thin = totals.filter((t) => t.sep2 < 20);
  if (thin.length) {
    console.log(
      `${thin.length} set(s) hold fewer than twenty questions and should say so rather than degrade: ` +
        thin.map((t) => t.setCode.toLowerCase()).join(", "),
    );
  }
}

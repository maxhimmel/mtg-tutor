// Drives a complete draft through the deployed Convex functions, the same way
// the CLI and the web app will. Mirrors apps/cli's headless smoke test: always
// take the highest-value card, so every pick should score 100.
//
//   pnpm --filter @mtg-tutor/backend smoke-draft [setCode] [format]

import { ConvexHttpClient } from "convex/browser";
import { cardValue } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `pnpm exec convex dev --once` first.");

const setCode = (process.argv[2] ?? "fdn").toLowerCase();
const requestedFormat = process.argv[3];
const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

// Every query below keys on (code, format), and the format is the set's, not a
// default this script may pick: `sets.get` and `draft.start` both fall back to
// PremierDraft, so a TradDraft set read without one comes back empty and reports
// itself as never ingested. Ask `list` -- the cheap table -- what is really here.
const ingested = (await client.query(api.sets.list, {})).filter((s) => s.code === setCode);
if (ingested.length === 0) {
  throw new Error(`Set "${setCode}" is not ingested. Run: convex run sets:ingest '{"setCode":"${setCode}"}'`);
}
const formats = ingested.map((s) => s.format);
if (requestedFormat && !formats.includes(requestedFormat)) {
  throw new Error(`Set "${setCode}" is ingested as ${formats.join(", ")}, not ${requestedFormat}.`);
}
// A set can be ingested under several formats, and picking one silently would
// smoke-test whichever happened to sort first.
if (!requestedFormat && formats.length > 1) {
  throw new Error(`Set "${setCode}" is ingested as ${formats.join(" and ")} -- name one.`);
}
const format = requestedFormat ?? formats[0];

const stored = await client.query(api.sets.get, { setCode, format });
console.log(`set ${setCode}/${format}: ${stored.cards.length} cards, ${stored.ratedCardCount} with 17Lands data`);

const sessionId = await client.mutation(api.draft.start, { setCode, format });
console.log(`session ${sessionId}`);

let state = await client.query(api.draft.state, { sessionId });
const openingPack = state.pack.length;
let scoreTotal = 0;
let picks = 0;
const withArt = new Set();

const started = Date.now();
while (!state.complete) {
  const best = [...state.pack].sort((a, b) => cardValue(b) - cardValue(a))[0];
  const result = await client.mutation(api.draft.pick, { sessionId, cardName: best.name });

  scoreTotal += result.score.score;
  picks++;
  for (const c of state.pack) if (c.imageUrl) withArt.add(c.name);

  state = { complete: result.complete, pack: result.pack, pool: result.pool };
}
const elapsed = Date.now() - started;

const results = await client.query(api.draft.results, { sessionId });

console.log(`\nopening pack: ${openingPack} cards`);
console.log(`picks: ${picks} (expected ${45})`);
console.log(`pool size: ${state.pool.length}`);
console.log(`avg score taking the best each time: ${(scoreTotal / picks).toFixed(1)} (expect ~100)`);
console.log(`distinct cards seen carrying art: ${withArt.size}`);
console.log(`summary: ${JSON.stringify(results.summary)}`);
const { spells, nonbasicLands, basicLands } = results.deck;
console.log(`suggested deck: ${results.deck.colors.join("") || "splashy"}, ${spells.length} spells + ${nonbasicLands.length} drafted lands + ${basicLands} basics = ${spells.length + nonbasicLands.length + basicLands}`);
console.log(`\n${picks} round trips in ${elapsed}ms (${(elapsed / picks).toFixed(0)}ms per pick)`);

// The whole session is {seed, pickedNames} -- prove a re-read replays identically.
const replayed = await client.query(api.draft.state, { sessionId });
const matches = replayed.pool.map((c) => c.name).join("|") === state.pool.map((c) => c.name).join("|");
console.log(`re-read replays to the same pool: ${matches ? "yes" : "NO -- replay is not deterministic"}`);
if (!matches) process.exit(1);

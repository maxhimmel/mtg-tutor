// Drives a complete draft through the deployed Convex functions, the same way
// the CLI and the web app will. Mirrors apps/cli's headless smoke test: always
// take the highest-value card, so every pick should score 100.
//
//   pnpm --filter @mtg-tutor/backend smoke-draft [setCode]

import { ConvexHttpClient } from "convex/browser";
import { cardValue } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `pnpm exec convex dev --once` first.");

const setCode = process.argv[2] ?? "fdn";
const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

// The draft functions require an identity, so a headless run needs a real
// WorkOS access token. Either paste one in, or let the script mint one with the
// password grant using the deployment's own WorkOS credentials. Once the CLI
// device flow lands this collapses into reading the CLI's stored token.
async function accessToken() {
  if (process.env.MTG_TUTOR_TOKEN) return process.env.MTG_TUTOR_TOKEN;

  const { SMOKE_EMAIL, SMOKE_PASSWORD, WORKOS_CLIENT_ID, WORKOS_API_KEY } = process.env;
  if (!SMOKE_EMAIL || !SMOKE_PASSWORD || !WORKOS_CLIENT_ID || !WORKOS_API_KEY) {
    throw new Error(
      "This draft needs an authenticated user. Set MTG_TUTOR_TOKEN to a WorkOS " +
        "access token, or set SMOKE_EMAIL and SMOKE_PASSWORD for a test user in " +
        "your WorkOS environment (WORKOS_CLIENT_ID and WORKOS_API_KEY come from " +
        "packages/backend/.env.local).",
    );
  }

  const res = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: WORKOS_CLIENT_ID,
      client_secret: WORKOS_API_KEY,
      email: SMOKE_EMAIL,
      password: SMOKE_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`WorkOS password grant failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

const stored = await client.query(api.sets.get, { setCode });
if (!stored) {
  throw new Error(`Set "${setCode}" is not ingested. Run: convex run sets:ingest '{"setCode":"${setCode}"}'`);
}
console.log(`set ${setCode}: ${stored.cards.length} cards, ${stored.ratedCardCount} with 17Lands data`);

const sessionId = await client.mutation(api.draft.start, { setCode });
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
console.log(`suggested deck: ${results.deck.colors.join("") || "splashy"}, ${results.deck.spells.length} spells + ${results.deck.lands} lands`);
console.log(`\n${picks} round trips in ${elapsed}ms (${(elapsed / picks).toFixed(0)}ms per pick)`);

// The whole session is {seed, pickedNames} -- prove a re-read replays identically.
const replayed = await client.query(api.draft.state, { sessionId });
const matches = replayed.pool.map((c) => c.name).join("|") === state.pool.map((c) => c.name).join("|");
console.log(`re-read replays to the same pool: ${matches ? "yes" : "NO -- replay is not deterministic"}`);
if (!matches) process.exit(1);

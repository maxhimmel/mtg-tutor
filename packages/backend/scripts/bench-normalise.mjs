// Does one row per card beat one packed column?
//
//   pnpm bench-normalise [setCode] [format]
//
// Starts a draft, then reads its card pool twice -- once out of
// `draftPools.cards` and once out of `draftCards`, one row per card -- and
// reports what Convex billed for each. Both probes return the identical
// EngineCard[], which is the only thing that makes the comparison mean anything:
// same output, two storage shapes, one counter.
//
// Separate transactions on purpose. `getTransactionMetrics` counts the whole
// transaction, so measuring both in one would bill each for the other's reads.
//
// DELETE THIS with the `draftCards` table once the question is answered.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const setCode = process.argv[2] ?? "fdn";
const format = process.argv[3] ?? "TradDraft";

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `convex dev --once` first.");

const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

const sessionId = await client.mutation(api.draft.start, { setCode, format });
console.log(`set ${setCode}/${format}, session ${sessionId}\n`);

const packed = await client.query(api.iobench.poolPackedCost, { sessionId });
const rows = await client.query(api.iobench.poolRowsCost, { sessionId });

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const pct = (a, b) => `${(((b - a) / a) * 100).toFixed(0)}%`;

console.log(`${"shape".padEnd(22)}${"read".padStart(10)}${"docs".padStart(7)}${"queries".padStart(9)}`);
console.log(`${"packed column".padEnd(22)}${kb(packed.bytesRead).padStart(10)}${String(packed.documentsRead).padStart(7)}${String(packed.databaseQueries).padStart(9)}`);
console.log(`${"one row per card".padEnd(22)}${kb(rows.bytesRead).padStart(10)}${String(rows.documentsRead).padStart(7)}${String(rows.databaseQueries).padStart(9)}`);

// One denominator: both shapes hold the same pool, and the packed probe cannot
// report its own card count without reading its row a second time.
const n = rows.cards;
console.log(`\nrows vs packed: ${pct(packed.bytesRead, rows.bytesRead)} bytes read`);
console.log(`per card: packed ${(packed.bytesRead / n).toFixed(0)} B, rows ${(rows.bytesRead / n).toFixed(0)} B`);
console.log(`envelope per row: ~${((rows.bytesRead - packed.bytesRead) / n).toFixed(0)} B`);
console.log(`(${n} cards in the pool; a draft reads it 42 times)`);
console.log(`\nNOTE: the packed figure also carries rounds + colorWinRates, which the`);
console.log(`row shape would still need on top. The gap below is the floor, not the ceiling.`);

const perDraft = (n) => `${((n * 42) / 1024 / 1024).toFixed(2)} MB`;
console.log(`\nover a 42-pick draft: packed ${perDraft(packed.bytesRead)}, rows ${perDraft(rows.bytesRead)}`);

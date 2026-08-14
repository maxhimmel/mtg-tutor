// Does the principle tiebreak actually reach a player, through the deployed
// functions, on a real draft?
//
//   pnpm --filter @mtg-tutor/backend verify-tiebreak [setCode] [format]
//
// WHY `smoke-draft` DOES NOT ANSWER THIS
//
// That one takes the highest-value card every pick, so it is always `isBest` and
// the band never forms -- it proves a draft runs end to end and says nothing
// about the half of the scorer this branch was for. `diagnose-tiebreak.mjs` does
// exercise it, but in-process against cached packs: it never calls Convex, so it
// cannot see a field dropped between core and storage.
//
// That gap is not hypothetical. `turn` and `role` were computed at ingest and
// silently discarded by `engineHalf`, and every in-process harness kept passing
// while every stored card came back without them.
//
// So this deliberately picks the RUNNER-UP each time. That is the pick most
// likely to land inside the margin of the best card, which is where a band forms
// and a principle gets a vote -- and it reads the result off what `draft.pick`
// returns rather than off anything computed here.

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- start the backend first.");

const setCode = (process.argv[2] ?? "fdn").toLowerCase();
const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

const ingested = (await client.query(api.sets.list, {})).filter((s) => s.code === setCode);
if (ingested.length === 0) throw new Error(`Set "${setCode}" is not ingested.`);
const format = process.argv[3] ?? ingested[0].format;

const sessionId = await client.mutation(api.draft.start, { setCode, format });
let state = await client.query(api.draft.state, { sessionId });

let picks = 0;
let banded = 0;
let scoredFull = 0;
let withReason = 0;
const byPrinciple = new Map();
const samples = [];

while (!state.complete) {
  const pack = state.pack;
  // The runner-up by raw value. Deliberately not the best: taking the best is
  // never a band, and taking the worst is never inside the margin.
  const ranked = [...pack].sort((a, b) => b.value - a.value);
  const take = ranked[1] ?? ranked[0];

  const result = await client.mutation(api.draft.pick, { sessionId, cardName: take.name });
  const score = result.score;
  picks++;

  if (score.score === 100 && !score.isBest) scoredFull++;
  if ((score.band ?? []).length > 0) banded++;
  if ((score.reasons ?? []).length > 0) {
    withReason++;
    const id = score.reasons[0].principle;
    byPrinciple.set(id, (byPrinciple.get(id) ?? 0) + 1);
    if (samples.length < 5) {
      samples.push(
        `P${result.packNo}P${result.pickNo}  took ${score.picked.name}  ` +
          `-> ${score.preferred?.name} [${id}] ${score.reasons[0].note}`,
      );
    }
  }

  state = {
    ...state,
    pack: result.pack,
    pool: result.pool,
    complete: result.complete,
    packNo: result.packNo,
    pickNo: result.pickNo,
  };
}

const pct = (n) => `${((100 * n) / picks).toFixed(1)}%`;

console.log(`
${setCode}/${format} -- ${picks} picks, always taking the runner-up

  scored 100 without being the best card   ${String(scoredFull).padStart(3)}  ${pct(scoredFull)}
  came back with a band                    ${String(banded).padStart(3)}  ${pct(banded)}
  came back with a principle and a reason  ${String(withReason).padStart(3)}  ${pct(withReason)}
`);

if (byPrinciple.size > 0) {
  console.log("which principle decided");
  for (const [id, n] of [...byPrinciple].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(10)} ${n}`);
  }
}
if (samples.length > 0) {
  console.log("\nsome of them, as the player would be told");
  for (const s of samples) console.log(`  ${s}`);
}

// The whole point of running against the deployment rather than in process: a
// field settled at ingest and dropped on the way to storage looks exactly like a
// feature that never fires.
if (banded === 0) {
  console.error(
    "\nNo band formed on any pick. Either `se` is missing from setCardContext " +
      "(re-ingest), or the margin never opened -- check with diagnose-margin.mjs.",
  );
  process.exit(1);
}
if (withReason === 0) {
  console.error(
    "\nBands formed but no principle ever decided. `turn`/`role` are probably " +
      "absent from the stored cards -- re-ingest, then `pnpm cache-cards`.",
  );
  process.exit(1);
}
console.log("\nThe tiebreak reaches a player through the deployed functions.");

// Puts the drafted deck into a transcript recorded before the transcript
// carried one.
//
//   pnpm --filter @mtg-tutor/backend bench-backfill-draft [--set fdn] [--seed 42]
//                                                         [--format TradDraft]
//                                                         [--provider anthropic]
//                                                         [--area coach]
//
// Spends NO model tokens. The draft is a pure function of (set, format, seed)
// and the greedy policy bench-llm uses, so replaying it here deals the same
// packs and takes the same cards as the run being backfilled -- it just never
// calls /coach. What it costs is a set read and 42 pick mutations.
//
// This exists because the report grew a deck panel after the transcripts were
// written, and re-running the benchmark to fill in data the engine can
// reproduce for free would have spent real money on answers we already have.
// It is a one-off: bench-llm records `draft` itself now.
//
// Refuses to touch a transcript that already has a draft, and refuses to write
// one whose pick sequence disagrees with the stored `bestName`s -- that
// disagreement means the deal moved (a re-ingest, a scoring change) and the
// replay is describing a different draft than the answers came from.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { cardValue } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const has = (name) => process.argv.includes(`--${name}`);

const setCode = flag("set", "fdn");
const format = flag("format", "TradDraft");
const seed = Number(flag("seed", 42));
const provider = flag("provider", "anthropic");
// Mirrors bench-llm's naming so the file this writes is the file the report reads.
const ALL_AREAS = ["coach", "verdict", "frame"];
const areas = (flag("area", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const suffix = areas.length ? `.${ALL_AREAS.filter((a) => areas.includes(a)).join("+")}` : "";
const stem = `${setCode}.${format}.${seed}.${provider}${suffix}`;

const dir = new URL("../bench/", import.meta.url);
const targets = [new URL(`run.${stem}.json`, dir), new URL(`run.${stem}.baseline.json`, dir)].filter(
  (u) => existsSync(u),
);
if (targets.length === 0) {
  throw new Error(`No transcript at bench/run.${stem}.json -- check --set/--seed/--area.`);
}

const pending = targets.filter((u) => !JSON.parse(readFileSync(u, "utf8")).draft?.length);
if (pending.length === 0) {
  console.log(`Nothing to do: every transcript for ${stem} already carries a draft.`);
  process.exit(0);
}

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `convex dev --once` first.");

const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

const stored = await client.query(api.sets.get, { setCode, format });
if (!stored) throw new Error(`Set "${setCode}" is not ingested for format "${format}".`);
const cardFacts = new Map(stored.cards.map((c) => [c.name, c]));

// The same deal and the same policy as bench-llm, and nothing else.
const sessionId = await client.mutation(api.draft.start, { setCode, format, seed });
console.log(`replaying ${setCode}/${format} seed ${seed} -- no model calls`);

const draft = [];
let state = await client.query(api.draft.state, { sessionId });
while (!state.complete) {
  const picked = [...state.pack].sort((a, b) => cardValue(b) - cardValue(a))[0];
  const packNo = state.packNo;
  const pickNo = state.pickNo;
  const result = await client.mutation(api.draft.pick, { sessionId, cardName: picked.name });
  const c = cardFacts.get(picked.name) ?? {};
  draft.push({
    pickIndex: result.pickIndex,
    packNo,
    pickNo,
    name: picked.name,
    colors: c.colors ?? [],
    cmc: c.cmc ?? 0,
    typeLine: c.typeLine ?? "",
    manaCost: c.manaCost ?? "",
    rarity: c.rarity,
    gihWinRate: c.gihWinRate,
  });
  state = {
    complete: result.complete,
    pack: result.pack,
    pool: result.pool,
    packNo: result.packNo,
    pickNo: result.pickNo,
  };
}
console.log(`replayed ${draft.length} picks`);

const byIndex = new Map(draft.map((d) => [d.pickIndex, d]));

let refused = 0;
for (const target of pending) {
  const transcript = JSON.parse(readFileSync(target, "utf8"));
  const name = target.pathname.split("/").pop();

  // The guard this script exists to have. `bestName` is the raw-power best of
  // the pack the run actually saw; under the greedy policy that IS the card it
  // took. If the replay disagrees on even one pick, the deal has moved since the
  // run and a deck rebuilt from it would be fiction next to the stored answers.
  //
  // Each transcript is judged on its own and a refusal skips only that file:
  // the usual case is exactly the one that happened first time out -- today's
  // run replays cleanly, a months-old baseline does not, and aborting on the
  // second would have thrown away the first.
  const wrong = (transcript.picks ?? []).filter(
    (p) => byIndex.get(p.pickIndex)?.name !== p.bestName,
  );
  if (wrong.length > 0) {
    const [first] = wrong;
    console.error(
      `REFUSED ${name}: replay diverges at ${wrong.length} of ${transcript.picks.length} ` +
        `picks (first at ${first.pickIndex}: recorded "${first.bestName}", replay took ` +
        `"${byIndex.get(first.pickIndex)?.name}").\n` +
        `  The deal or the card values have moved since that run, so it is not the ` +
        `draft those answers were written for. Left alone.`,
    );
    refused++;
    continue;
  }

  if (has("dry-run")) {
    console.log(`would backfill ${draft.length} picks into ${name}`);
    continue;
  }
  // Written next to `picks` in the same shape bench-llm now emits, so a
  // backfilled transcript and a freshly recorded one are indistinguishable.
  const { picks, frames, ...head } = transcript;
  writeFileSync(target, `${JSON.stringify({ ...head, draft, picks, frames }, null, 2)}\n`);
  console.log(`backfilled ${draft.length} picks into ${name}`);
}

if (refused > 0) {
  console.error(
    `\n${refused} transcript(s) refused. A transcript whose replay diverges is also a ` +
      `transcript the report should not be diffing against: the benchmark's paired ` +
      `comparison assumes both runs drafted the same cards.`,
  );
  process.exitCode = 1;
}

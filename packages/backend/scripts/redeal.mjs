// Deals a draft again from an old draft's seed, and shows what changed.
//
//   pnpm redeal <sessionId> [--pod table|sharks]
//
// The session id is in the URL of the draft you want to re-deal:
// /draft/<sessionId>.
//
// WHAT THIS IS FOR
//
// A pod change is invisible in aggregate numbers and obvious in one pack. The
// bots' picks decide what wheels, so the same seed under two policies deals the
// SAME P1P1 -- packs are generated before anyone picks -- and diverges from
// P1P2 onward, which is exactly where a bot's first-pick behaviour shows up.
// Being passed a mythic at P1P2 is how the bomb miscalibration was found in the
// first place, and no metric in bench-bots would have shown it.
//
// So this pins the one variable worth pinning and prints the two packs side by
// side.
//
// It reads the old draft through `review.load`, which no longer replays -- it
// rebuilds from the stored `draftPicks` rows. That matters here more than
// anywhere: an old draft dealt under WEIGHTS THAT NO LONGER EXIST cannot be
// replayed by definition, and this tool exists to compare against exactly those.

import { ConvexHttpClient } from "convex/browser";
import { DEFAULT_POD, STORED_PODS } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";
import { accessToken } from "./lib/auth.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const sessionId = process.argv[2];
const pod = flag("pod", DEFAULT_POD);
if (!sessionId || sessionId.startsWith("--")) {
  console.error(`usage: redeal.mjs <sessionId> [--pod ${STORED_PODS.join("|")}]`);
  console.error("  the session id is in the draft's URL: /draft/<sessionId>");
  process.exit(1);
}

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- start the backend first.");
const client = new ConvexHttpClient(url);
client.setAuth(await accessToken());

const old = await client.query(api.review.load, { sessionId });
console.log(`${old.setCode}/${old.format}, seed ${old.seed}, ${old.picks.length} picks made`);

const fresh = await client.mutation(api.draft.start, {
  setCode: old.setCode,
  format: old.format,
  seed: Number(old.seed),
  pod,
});
console.log(`new draft against the ${pod} pod: /draft/${fresh}\n`);

// Walk the new draft the way the old one went, so the comparison is pack for
// pack rather than pick for pick. Taking the same cards is what holds
// everything except the bots constant.
let state = await client.query(api.draft.state, { sessionId: fresh });
const names = (cards) => new Set(cards.map((c) => c.name));

let diverged = false;
for (const before of old.picks) {
  if (state.complete) break;

  const was = names(before.pack);
  const now = names(state.pack);
  const gained = [...now].filter((n) => !was.has(n));
  const lost = [...was].filter((n) => !now.has(n));

  if (gained.length || lost.length) {
    if (!diverged) {
      console.log("the first pack that differs, and every one after it:\n");
      diverged = true;
    }
    console.log(`P${before.packNo}P${before.pickNo}`);
    for (const n of lost) console.log(`  - ${n}`);
    for (const n of gained) console.log(`  + ${n}`);
    console.log();
  }

  // Replay your own pick where it still exists. Once the packs diverge the card
  // you took may not be on offer, and at that point the two drafts are properly
  // different rather than comparable -- so stop rather than substitute.
  const same = state.pack.find((c) => c.name === before.picked.name);
  if (!same) {
    console.log(
      `stopped at P${before.packNo}P${before.pickNo}: you took ${before.picked.name}, ` +
        `which this pod did not pass you. Everything past here is a different draft.`,
    );
    break;
  }
  const r = await client.mutation(api.draft.pick, { sessionId: fresh, cardName: same.name });
  state = { complete: r.complete, pack: r.pack, pool: r.pool };
}

if (!diverged) {
  console.log("no pack differed -- the pods took the same cards on every pick you made.");
}

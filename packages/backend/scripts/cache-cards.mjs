// Snapshots every committed set's engine cards into `datasets/`, once.
//
//   pnpm --filter @mtg-tutor/backend cache-cards [--format TradDraft]
//
// The bot-policy scripts stream the 17Lands datasets for a quarter of an hour
// and need each set's `value` as ingest settled it. Asking the deployment for
// that inside the streaming loop makes a long run depend on `convex dev` staying
// up for the whole of it, which is a bad trade for a laptop that also has to run
// other things -- and it is how two fifteen-minute fits died at set six.
//
// This is the ten seconds of deployment time those runs actually needed.

import { ConvexHttpClient } from "convex/browser";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api.js";
import { engineCards } from "./lib/engineCards.mjs";

process.loadEnvFile(new URL("../.env.local", import.meta.url));

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const format = flag("format", "TradDraft");

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- run `convex dev --once` first.");
const client = new ConvexHttpClient(url);

// The committed artifacts are the list of sets this repo knows about.
const HERE = dirname(fileURLToPath(import.meta.url));
const setCodes = readdirSync(`${HERE}/../data`)
  .filter((f) => f.endsWith(`.${format}.json`))
  .map((f) => f.slice(0, f.indexOf(".")));

// A CACHED FILE IS NEVER REFETCHED, so a POOL_REVISION bump leaves every long
// run reading cards that no longer exist -- and reading them successfully,
// which is the dangerous half. `fit-bot-policy` would fit `laneFit` against
// colours the deployment has since changed and report a perfectly good number
// for a policy no bot will ever play. Nothing downstream can detect that.
//
// So the refresh is a flag rather than a thing to remember: `--refresh` drops
// the snapshots first and takes them again. Run it after any ingest that moved
// the engine half of a card.
if (process.argv.includes("--refresh")) {
  let dropped = 0;
  for (const setCode of setCodes) {
    const path = `${HERE}/../../../datasets/cards.${setCode}.${format}.json`;
    if (existsSync(path)) {
      rmSync(path);
      dropped++;
    }
  }
  console.log(`--refresh: dropped ${dropped} stale snapshot(s)`);
}

console.log(`caching ${setCodes.length} sets from ${url}`);
let cached = 0;
for (const setCode of setCodes) {
  try {
    const cards = await engineCards(client, api, setCode, format, (m) => console.log(`  ${m}`));
    cached += cards.length > 0 ? 1 : 0;
  } catch (e) {
    // One un-ingested set must not cost the other seventeen their snapshot.
    console.error(`  ${setCode}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`${cached}/${setCodes.length} sets cached -- the long runs need no deployment now`);

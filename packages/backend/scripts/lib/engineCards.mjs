// A set's engine cards, cached on disk so a long run does not hold a deployment
// hostage.
//
// The fitting and benchmark scripts stream 90-206MB per set and take a quarter
// of an hour over the library. They need one thing from Convex -- each set's
// EngineCards, for the `value` ingest settled -- and the first version asked for
// it per set, inside the loop. So a fifteen-minute run required `convex dev` to
// stay up for fifteen minutes, and both runs died two thirds of the way in when
// the local deployment stopped.
//
// The card data does not change between runs, so it has no business being on
// that path at all. Fetched once into `datasets/` (already gitignored, same
// place the raw CSVs would go), and every run after the first needs no
// deployment at all.
//
// Not derivable from the committed artifacts, which is why this talks to Convex
// rather than reading `data/`: only 6 of the 18 artifacts carry `packCards`, and
// none carries rarity or type line, so every unrated card's value would have to
// be guessed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = `${HERE}/../../../../datasets`;

const cachePath = (setCode, format) => `${CACHE_DIR}/cards.${setCode}.${format}.json`;

/**
 * The engine half of a set's cards, from disk if it is there.
 *
 * `client` may be null, in which case a missing cache is an error naming the
 * command that fills it rather than a connection refused.
 */
export async function engineCards(client, api, setCode, format, log = () => {}) {
  const path = cachePath(setCode, format);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8"));
  }

  const missing = () =>
    new Error(
      `No cached cards for ${setCode}/${format}, and the deployment did not answer.\n` +
        `Start the backend, then run once:  pnpm cache-cards\n` +
        `After that these scripts need no deployment at all.`,
    );

  if (!client) throw missing();

  // A configured CONVEX_URL with nothing listening is the ordinary case -- the
  // backend is not always up -- and it surfaced as a raw ECONNREFUSED stack
  // naming undici. The fix for this is a command, so the error should say it.
  let set;
  try {
    set = await client.query(api.sets.get, { setCode, format });
  } catch {
    throw missing();
  }
  if (!set) throw new Error(`${setCode}/${format} is not ingested on this deployment.`);

  // The engine half only. `sets.get` is deliberately fat -- it stitches the
  // rules text back on -- and none of that is read by a policy.
  const cards = set.cards.map((c) => ({
    name: c.name,
    colors: c.colors,
    value: c.value,
    ...(c.slot === undefined ? {} : { slot: c.slot }),
    ...(c.packRate === undefined ? {} : { packRate: c.packRate }),
  }));

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(cards));
  log(`cached ${cards.length} cards for ${setCode}/${format}`);
  return cards;
}

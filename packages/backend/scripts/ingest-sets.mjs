// Rebuilds the `sets` docs the app lists, one per committed stats artifact in
// packages/backend/data. `sets:ingest` reads the seeded stats and fetches
// Scryfall, so this runs after seed-set-stats.mjs -- together they take a fresh
// Convex deployment from empty to fully populated with no source CSVs needed.
//
//   node scripts/ingest-sets.mjs                 # every changed artifact
//   node scripts/ingest-sets.mjs sos.TradDraft   # just one
//   node scripts/ingest-sets.mjs --prod
//   node scripts/ingest-sets.mjs --force         # rebuild even if unchanged
//
// Each artifact is hashed and the hash travels with the ingest call, so a set
// whose stats have not moved is left alone -- an ordinary deploy touches
// Scryfall not at all. `--force` is the way back in when the set itself changed
// upstream (a new printing, an erratum) while our artifact stayed put.
//
// The artifact filenames are the set list, so a set shows up here exactly when
// its stats are committed -- no separate list to keep in sync. Calls go over
// HTTP (ConvexHttpClient), matching seed-set-stats.mjs; the CLI is used only to
// resolve the deployment URL for the same target `--prod` would pick.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { deployKey, deploymentUrl } from "./lib/deployment.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const force = argv.includes("--force");
const only = argv.filter((a) => !a.startsWith("--"));

if (!existsSync(DATA)) {
  console.error(`No artifacts at ${DATA}. Run build-set-stats.mjs first.`);
  process.exit(1);
}

const files = readdirSync(DATA)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => only.length === 0 || only.some((o) => f.startsWith(o)));

if (files.length === 0) {
  console.error(only.length ? `No artifact matching ${only.join(", ")}` : "No artifacts found.");
  process.exit(1);
}

// WHICH CARDS the artifact names, with nothing about how they performed.
//
// Paired with `sourceHash` above, which is the whole file and therefore moves
// whenever any number in it does. This one moves only when the pool a crawl
// would produce moves, which is what lets `sets.ingest` re-derive a set from the
// cards it already stored instead of crawling Scryfall for them again. See
// CRAWL_REVISION in convex/sets.ts for the rule about which is which.
//
// `openedRate` is deliberately excluded and is the reason this cannot just hash
// `packCards` whole: it is a measured frequency that moves with every rebuild of
// the stats, so including it would make this a second copy of `sourceHash` and
// quietly restore the crawl on every deploy. `slot` and `setCode` ARE included
// -- both decide what a card IS rather than how it did.
//
// Computed here rather than in the action because the artifact is already open
// and parsed; asking the action for it would mean reading ~270KB of stats out of
// the database to decide whether to read anything at all.
function crawlHashOf(artifact) {
  const identities = (artifact.packCards ?? [])
    .map((p) => `${p.name}\u0000${p.slot ?? ""}\u0000${p.setCode ?? ""}`)
    .sort();
  const rated = (artifact.cards ?? []).map((c) => c.name).sort();

  return createHash("sha256")
    .update(JSON.stringify({ setCode: artifact.setCode, identities, rated }))
    .digest("hex");
}

const client = new ConvexHttpClient(deploymentUrl(prod));
// Resolved once, before the loop: a missing key should stop the run rather
// than fail every set in turn.
const key = deployKey(prod);

let ingested = 0;
let refreshed = 0;
let skipped = 0;
let reused = 0;

for (const file of files) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const artifact = JSON.parse(raw);
  const { setCode, format } = artifact;
  const label = `${setCode}/${format}`;
  const sourceHash = createHash("sha256").update(raw).digest("hex");

  process.stderr.write(`${label}: `);
  const result = await client.action(api.sets.ingest, {
    setCode,
    format,
    sourceHash,
    crawlHash: crawlHashOf(artifact),
    force,
    deployKey: key,
  });

  if (result.skipped) {
    skipped++;
    process.stderr.write("unchanged, skipped\n");
  } else if (result.metaOnly) {
    refreshed++;
    process.stderr.write("metadata refreshed (no card crawl)\n");
  } else {
    ingested++;
    if (result.reusedPool) reused++;
    process.stderr.write(`ingest ... ${JSON.stringify(result)}\n`);
    // The artifact names every card the set's boosters can contain, so the pool
    // coming back short means those cards can never be dealt even though the
    // pack shapes were counted with them in.
    if (result.missingPackCards) {
      process.stderr.write(
        `  WARNING: ${result.missingPackCards} pack card(s) missing from the pool\n`,
      );
    }
    // Named and not counted, and not a WARNING, because "Copy" is here for
    // nearly every set -- every format makes one and no set prints one. A count
    // would be a warning that is always on and therefore never read; the names
    // are what let a new one stand out from the one that is always there.
    if (result.tokensWithoutArt?.length) {
      process.stderr.write(`  no token art: ${result.tokensWithoutArt.join(", ")}\n`);
    }
  }
}

console.error(
  `\ningested ${ingested} set(s) (${reused} re-derived without crawling), ` +
    `refreshed ${refreshed} metadata-only, ` +
    `skipped ${skipped} unchanged${prod ? " (production)" : ""}`,
);

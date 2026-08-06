// Uploads the committed stats artifacts in packages/backend/data into a Convex
// deployment. Production has its own database and nothing carries over from dev,
// so this is how a fresh deployment gets real numbers without anyone needing the
// 1.2GB of source CSVs.
//
//   node scripts/seed-set-stats.mjs                 # every changed artifact
//   node scripts/seed-set-stats.mjs sos.TradDraft   # just one
//   node scripts/seed-set-stats.mjs --prod
//   node scripts/seed-set-stats.mjs --force         # re-write even if unchanged
//
// Artifacts are committed precisely so this step needs no network beyond Convex,
// and so a change in a set's numbers shows up as a reviewable diff.
//
// Each artifact is hashed and the hash travels with the upload, exactly as
// ingest-sets.mjs does, so an unchanged artifact costs one small read instead of
// rewriting a ~270KB document. This runs on every deploy over all 17 artifacts,
// and they change about never; without the check that was ~9MB of database
// traffic per deploy, whether or not anything had moved.
//
// The payload goes over HTTP (ConvexHttpClient), not as a `convex run` argv: a
// set's stats serialize to ~260KB, and a single argv string is capped near 128KB
// on Linux (MAX_ARG_STRLEN), which the CLI form tripped over in CI. The CLI is
// still used, once, only to resolve the deployment URL for the same target its
// `--prod` flag would pick.

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

const client = new ConvexHttpClient(deploymentUrl(prod));
// Resolved once, before the loop: a missing key should stop the run rather
// than fail every set in turn.
const key = deployKey(prod);

let seeded = 0;
let skipped = 0;

for (const file of files) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const artifact = JSON.parse(raw);
  const { setCode, format, ...rest } = artifact;
  const label = `${setCode}/${format}`;
  const sourceHash = createHash("sha256").update(raw).digest("hex");

  // The whole artifact goes into setStats, pack composition included. `ingest`
  // reads it from there, so there is no separate composition upload.
  process.stderr.write(`${label}: stats ... `);
  const stats = await client.mutation(api.sets.storeSetStats, {
    code: setCode,
    format,
    games: rest.games,
    baseWinRate: rest.baseWinRate,
    cards: rest.cards,
    archetypes: rest.archetypes,
    colorWinRates: rest.colorWinRates,
    synergies: rest.synergies,
    packComposition: rest.packComposition,
    packCards: rest.packCards,
    sourceHash,
    force,
    deployKey: key,
  });

  if (stats.skipped) {
    skipped++;
    process.stderr.write("unchanged, skipped\n");
  } else {
    seeded++;
    process.stderr.write(JSON.stringify(stats) + "\n");
  }
}

console.error(
  `\nseeded ${seeded} artifact(s), skipped ${skipped} unchanged` +
    `${prod ? " (production)" : ""}`,
);

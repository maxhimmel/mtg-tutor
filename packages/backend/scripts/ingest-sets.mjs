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
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

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

// In the Vercel build the URL is handed to us directly: `convex deploy` runs
// this via --cmd with NEXT_PUBLIC_CONVEX_URL set to the just-deployed
// deployment. Locally there is no such var, so fall back to asking the CLI for
// whichever deployment it would target -- dev by default, prod with --prod.
function deploymentUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  if (fromEnv) return fromEnv;
  const args = ["convex", "env", "get", "CONVEX_CLOUD_URL"];
  if (prod) args.push("--prod");
  const url = execFileSync("npx", args, { cwd: resolve(HERE, ".."), encoding: "utf8" }).trim();
  if (!url.startsWith("http")) {
    throw new Error(`Could not resolve the Convex deployment URL (got: ${url || "empty"}).`);
  }
  return url;
}

const client = new ConvexHttpClient(deploymentUrl());

let ingested = 0;
let refreshed = 0;
let skipped = 0;

for (const file of files) {
  const raw = readFileSync(join(DATA, file), "utf8");
  const { setCode, format } = JSON.parse(raw);
  const label = `${setCode}/${format}`;
  const sourceHash = createHash("sha256").update(raw).digest("hex");

  process.stderr.write(`${label}: `);
  const result = await client.action(api.sets.ingest, {
    setCode,
    format,
    sourceHash,
    force,
  });

  if (result.skipped) {
    skipped++;
    process.stderr.write("unchanged, skipped\n");
  } else if (result.metaOnly) {
    refreshed++;
    process.stderr.write("metadata refreshed (no card crawl)\n");
  } else {
    ingested++;
    process.stderr.write(`ingest ... ${JSON.stringify(result)}\n`);
  }
}

console.error(
  `\ningested ${ingested} set(s), refreshed ${refreshed} metadata-only, ` +
    `skipped ${skipped} unchanged${prod ? " (production)" : ""}`,
);

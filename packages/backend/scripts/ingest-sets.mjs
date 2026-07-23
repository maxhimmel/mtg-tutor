// Rebuilds the `sets` docs the app lists, one per committed stats artifact in
// packages/backend/data. `sets:ingest` reads the seeded stats and fetches
// Scryfall, so this runs after seed-set-stats.mjs -- together they take a fresh
// Convex deployment from empty to fully populated with no source CSVs needed.
//
//   node scripts/ingest-sets.mjs                 # every artifact
//   node scripts/ingest-sets.mjs sos.TradDraft   # just one
//   node scripts/ingest-sets.mjs --prod
//
// The artifact filenames are the set list, so a set shows up here exactly when
// its stats are committed -- no separate list to keep in sync. Calls go over
// HTTP (ConvexHttpClient), matching seed-set-stats.mjs; the CLI is used only to
// resolve the deployment URL for the same target `--prod` would pick.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
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

for (const file of files) {
  const { setCode, format } = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const label = `${setCode}/${format}`;

  process.stderr.write(`${label}: ingest ... `);
  const result = await client.action(api.sets.ingest, { setCode, format });
  process.stderr.write(JSON.stringify(result) + "\n");
}

console.error(`\ningested ${files.length} set(s)${prod ? " into production" : ""}`);

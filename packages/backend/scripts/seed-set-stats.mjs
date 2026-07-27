// Uploads the committed stats artifacts in packages/backend/data into a Convex
// deployment. Production has its own database and nothing carries over from dev,
// so this is how a fresh deployment gets real numbers without anyone needing the
// 1.2GB of source CSVs.
//
//   node scripts/seed-set-stats.mjs                 # every artifact
//   node scripts/seed-set-stats.mjs sos.TradDraft   # just one
//   node scripts/seed-set-stats.mjs --prod
//
// Artifacts are committed precisely so this step needs no network beyond Convex,
// and so a change in a set's numbers shows up as a reviewable diff.
//
// The payload goes over HTTP (ConvexHttpClient), not as a `convex run` argv: a
// set's stats serialize to ~260KB, and a single argv string is capped near 128KB
// on Linux (MAX_ARG_STRLEN), which the CLI form tripped over in CI. The CLI is
// still used, once, only to resolve the deployment URL for the same target its
// `--prod` flag would pick.

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

// This no longer runs inside `convex deploy --cmd`, so nothing injects the URL
// any more: --cmd is step 1 of a deploy and the function push is step 5, which
// meant anything in there talked to the PREVIOUS deployment. It now runs after
// the deploy returns, and resolves the target the same way it always did
// locally -- by asking the CLI. On Vercel, CONVEX_DEPLOY_KEY points the CLI at
// production; locally it is dev by default and prod with --prod. An explicit
// NEXT_PUBLIC_CONVEX_URL still wins if something sets one.
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
  const artifact = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const { setCode, format, ...rest } = artifact;
  const label = `${setCode}/${format}`;

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
  });
  process.stderr.write(JSON.stringify(stats) + "\n");
}

console.error(`\nseeded ${files.length} artifact(s)${prod ? " into production" : ""}`);

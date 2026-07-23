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
// its stats are committed -- no separate list to keep in sync.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function run(fn, payload) {
  const args = ["convex", "run", fn, JSON.stringify(payload)];
  if (prod) args.push("--prod");
  return execFileSync("npx", args, {
    encoding: "utf8",
    cwd: resolve(HERE, ".."),
    maxBuffer: 32 * 1024 * 1024,
  });
}

for (const file of files) {
  const { setCode, format } = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const label = `${setCode}/${format}`;

  process.stderr.write(`${label}: ingest ... `);
  const result = run("sets:ingest", { setCode, format });
  process.stderr.write(result.trim().replace(/\s+/g, " ") + "\n");
}

console.error(`\ningested ${files.length} set(s)${prod ? " into production" : ""}`);

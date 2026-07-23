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

// `convex run` takes its arguments as one JSON string argv, with no stdin form.
// execFileSync passes it directly to the process rather than through a shell, so
// the payload needs no escaping however much punctuation a card name contains.
// Size is bounded well below ARG_MAX (~1MB) by the 900KB guard in the mutation.
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
  const artifact = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  const { setCode, format, ...rest } = artifact;
  const label = `${setCode}/${format}`;

  // The whole artifact goes into setStats, pack composition included. `ingest`
  // reads it from there, so there is no separate composition upload.
  process.stderr.write(`${label}: stats ... `);
  const stats = run("sets:storeSetStats", {
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
  process.stderr.write(stats.trim().replace(/\s+/g, " ") + "\n");
}

console.error(`\nseeded ${files.length} artifact(s)${prod ? " into production" : ""}`);

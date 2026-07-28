// Moves every set's card pool out of the `sets` document and into `setCards`.
//
//   node scripts/migrate-set-cards.mjs           # dev
//   node scripts/migrate-set-cards.mjs --prod
//
// Run once per deployment, after the widened schema is pushed and before the
// schema is narrowed. Re-running is safe: a set whose pool has already moved
// reports "already-migrated" and is left alone.
//
// One set per invocation. A pool is ~240KB, and migrating all of them in one
// transaction would read and write several megabytes -- close enough to Convex's
// per-mutation ceiling that a trip would roll the whole batch back, which for a
// migration is the worst possible failure mode.
//
// Goes through `npx convex run` rather than ConvexHttpClient (as
// ingest-sets.mjs does) because these are internal functions: they exist for
// this one rollout and have no business on the public API surface.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(HERE, "..");

const prod = process.argv.slice(2).includes("--prod");

function run(fn, args = {}) {
  const argv = ["convex", "run", fn, JSON.stringify(args)];
  if (prod) argv.push("--prod");
  const out = execFileSync("npx", argv, { cwd: BACKEND, encoding: "utf8" });
  // `convex run` prints the return value as JSON, but logs from the function
  // land on the same stream ahead of it. The value is the last JSON-ish chunk.
  const start = out.search(/[[{]/);
  if (start === -1) return null;
  return JSON.parse(out.slice(start));
}

const target = prod ? "production" : "dev";
const pending = run("migrations:unmigratedSets");

if (!pending || pending.length === 0) {
  console.error(`Nothing to migrate on ${target} -- every set is already split.`);
  process.exit(0);
}

console.error(`Migrating ${pending.length} set(s) on ${target}:\n`);

let migrated = 0;

for (const { code, format } of pending) {
  process.stderr.write(`${code}/${format}: `);
  const result = run("migrations:migrateSetCards", { code, format });
  migrated++;
  process.stderr.write(`moved ${result.cardCount} cards\n`);
}

console.error(`\nmigrated ${migrated} set(s) on ${target}`);

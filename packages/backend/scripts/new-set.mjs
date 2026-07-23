// Adds a draftable set end to end: availability preflight -> build the stats
// artifact from the 17Lands public datasets -> seed it into Convex -> ingest the
// set from Scryfall + those stats. The same four steps the README spells out,
// run in order and scoped to just this set, so a new set is one command:
//
//   pnpm new-set DSK                 # DSK PremierDraft, into the dev deployment
//   pnpm new-set DSK TradDraft       # pick the format
//   pnpm new-set DSK TradDraft --prod   # seed + ingest into production
//   pnpm new-set DSK --force         # skip the availability gate
//
// A thin orchestrator over the sibling scripts in this directory -- it shells out
// to their `pnpm` aliases rather than duplicating the pipeline. For the rare
// local-CSV or custom-output case (build-set-stats' --draft/--game/--out), run
// that step by hand instead.

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const force = argv.includes("--force");
const [set, format = "PremierDraft"] = argv.filter((a) => !a.startsWith("--"));

if (!set) {
  console.error("usage: pnpm new-set <setCode> [format] [--prod] [--force]");
  process.exit(1);
}

const artifact = `${set.toLowerCase()}.${format}`;
const run = (script, args) => {
  console.error(`\n→ pnpm ${script} ${args.join(" ")}`);
  execFileSync("pnpm", [script, ...args], { stdio: "inherit" });
};

console.error(`Adding ${artifact}${prod ? " (production)" : ""}`);
try {
  if (!force) run("check-availability", [set, format]);
  run("build-set-stats", force ? [set, format, "--force"] : [set, format]);
  run("seed-set-stats", prod ? [artifact, "--prod"] : [artifact]);
  run("ingest-sets", prod ? [artifact, "--prod"] : [artifact]);
} catch {
  console.error(`\nAborted -- ${artifact} was not fully added. See the failing step above.`);
  process.exit(1);
}
console.error(`\n✓ ${artifact} is ready. It will draft locally now, and deploy from the committed data/${artifact}.json.`);

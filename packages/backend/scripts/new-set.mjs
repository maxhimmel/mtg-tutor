// Adds a draftable set end to end: availability preflight -> build the stats
// artifact from the 17Lands public datasets -> seed it into Convex -> ingest the
// set from Scryfall + those stats -> validate that it deals the packs its data
// claims -> check that its own mechanics have definitions. The steps the README
// spells out, run in order and scoped to just this set, so a new set is one
// command:
//
//   pnpm new-set DSK                 # DSK PremierDraft, into the dev deployment
//   pnpm new-set DSK TradDraft       # pick the format
//   pnpm new-set DSK TradDraft --prod   # seed + ingest into production
//   pnpm new-set DSK --force         # skip the availability gate
//   pnpm new-set DSK --no-archive    # stream the CSVs, keep nothing
//
// A thin orchestrator over the sibling scripts in this directory -- it shells out
// to their `pnpm` aliases rather than duplicating the pipeline. For the rare
// custom-output case (build-set-stats' --out), run that step by hand instead.
//
// LOCAL ONLY. Nothing here runs on a deploy: apps/web/vercel.json builds with
// `convex deploy` then seed-set-stats then ingest-sets, all of which read the
// committed artifact under data/. This is how that artifact gets made.
//
// The CSVs are archived on the way in rather than streamed and dropped, which is
// the one thing this does that is not just calling the next script. It costs
// nothing -- the download happens either way -- and it is the difference between
// an archive that covers every set and one that covers the sets somebody
// remembered to fetch twice. `--no-archive` streams and keeps nothing, for a
// one-off on a machine with no room for it.
//
// The archived files are then passed to build-set-stats EXPLICITLY. That
// direction matters and is not symmetric with writing them: a build that
// silently preferred a local file would be a build whose inputs depend on which
// machine ran it, so build-set-stats still only ever reads a path it was handed.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, "..", "..", "..", "archive");

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const force = argv.includes("--force");
const noArchive = argv.includes("--no-archive");
const [set, format = "PremierDraft"] = argv.filter((a) => !a.startsWith("--"));

if (!set) {
  console.error(
    "usage: pnpm new-set <setCode> [format] [--prod] [--force] [--no-archive]",
  );
  process.exit(1);
}

const archived = (kind) =>
  join(ARCHIVE, `${kind}_data_public.${set.toUpperCase()}.${format}.csv.gz`);

// Only when BOTH landed. A half-archived set falls back to streaming rather than
// handing build-set-stats one path and letting it fetch the other, which would
// build from two sources and report neither.
function archivedPaths() {
  if (noArchive) return null;
  const draft = archived("draft");
  const game = archived("game");
  return existsSync(draft) && existsSync(game)
    ? ["--draft", draft, "--game", game]
    : null;
}

const artifact = `${set.toLowerCase()}.${format}`;
const run = (script, args) => {
  console.error(`\n→ pnpm ${script} ${args.join(" ")}`);
  execFileSync("pnpm", [script, ...args], { stdio: "inherit" });
};

console.error(`Adding ${artifact}${prod ? " (production)" : ""}`);
try {
  if (!force) run("check-availability", [set, format]);
  if (!noArchive) run("archive-datasets", [set, "--format", format]);

  // Falls back to streaming when the archive step could not produce both files
  // -- a set 17Lands has not published, which --force is how you get past.
  const local = archivedPaths();
  if (!local) {
    console.error(
      noArchive
        ? "\n→ streaming the datasets (--no-archive), keeping nothing"
        : "\n→ nothing archived for this set, streaming instead",
    );
  }
  run("build-set-stats", [set, format, ...(local ?? []), ...(force ? ["--force"] : [])]);
  run("seed-set-stats", prod ? [artifact, "--prod"] : [artifact]);
  run("ingest-sets", prod ? [artifact, "--prod"] : [artifact]);
  // A set that ingests without throwing can still be wrong in ways nothing above
  // would notice -- a bonus pool holding ten cards where the shapes were counted
  // from fifty deals the wrong card in 11% of packs and reports success. This
  // step deals packs and counts them, so the pipeline proves its own output.
  run("validate-pack-model", prod ? [set, format, "--prod"] : [set, format]);
  // And a set that deals the right cards can still leave a drafter looking at a
  // mechanic nothing in the app can explain. That is not a crash either: the
  // hover panel just says nothing, exactly as it did for every set before the
  // corpus existed. LTR is the proof -- its flagship mechanic is on 50 of 291
  // cards and no upstream field mentions it at all.
  run("refresh-mechanics", [set.toLowerCase()]);
} catch {
  console.error(`\nAborted -- ${artifact} was not fully added. See the failing step above.`);
  process.exit(1);
}
console.error(`\n✓ ${artifact} is ready. It will draft locally now, and deploy from the committed data/${artifact}.json.`);

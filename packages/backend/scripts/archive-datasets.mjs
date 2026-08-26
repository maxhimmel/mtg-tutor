// Keeps a local copy of the 17Lands public CSVs the stats pipeline normally
// streams and discards.
//
//   node scripts/archive-datasets.mjs                    # every committed set
//   node scripts/archive-datasets.mjs FIN LTR            # those too
//   node scripts/archive-datasets.mjs --replay           # include the big one
//   node scripts/archive-datasets.mjs --format PremierDraft
//
// Everything else in this repo treats these files as re-derivable from a public
// URL -- `datasets/` says so in its .gitignore comment, and lib/csv.mjs streams
// them so that no second copy exists. This script is the deliberate exception,
// and the distinction is worth stating because the two directories look alike:
//
//   datasets/  derived caches, keyed by a fingerprint, safe to delete any time
//   archive/   the upstream bytes, kept BECAUSE they may stop being fetchable
//
// It is insurance against one specific failure: 17Lands pruning a set from S3.
// The committed ~270KB artifacts under data/ would keep the app running, but no
// change to the derivation could ever be applied to a set whose source was gone.
// The bucket still serves STX (2021) and KTK, so nothing suggests this is
// imminent -- it is cheap enough not to need a stronger reason than that.
//
// Nothing in the deploy pipeline reads this. `build-set-stats` takes --draft and
// --game paths, so an archived file plugs in there by hand; that is the whole
// integration, on purpose. A build that silently preferred a local file would be
// a build whose inputs depend on which machine ran it.
//
// Downloads land on a .part file and are renamed only once the byte count
// matches what HEAD promised, so an interrupted run leaves no file that looks
// finished. A set already at the right size is skipped, which makes this
// resumable by re-running it.

import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { datasetUrl, USED_KINDS } from "./lib/datasets.mjs";

const UA = "mtg-tutor/0.1 (draft-trainer)";
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");
const ARCHIVE = resolve(HERE, "..", "..", "..", "archive");

const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const format = flagValue("format", "TradDraft");
const kinds = argv.includes("--replay") ? [...USED_KINDS, "replay"] : USED_KINDS;

const extra = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--format");

const committed = readdirSync(DATA)
  .filter((f) => f.endsWith(`.${format}.json`))
  .map((f) => f.split(".")[0].toUpperCase());

const sets = [...new Set([...committed, ...extra.map((s) => s.toUpperCase())])].sort();

if (sets.length === 0) {
  console.error(`No committed ${format} artifacts and no set codes given.`);
  process.exit(1);
}

mkdirSync(ARCHIVE, { recursive: true });

const mb = (bytes) => `${(bytes / 1048576).toFixed(0)}MB`;

async function expectedSize(url) {
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
  return res.ok ? Number(res.headers.get("content-length") || 0) : 0;
}

let downloaded = 0;
let skipped = 0;
let missing = 0;
let bytes = 0;

for (const setCode of sets) {
  for (const kind of kinds) {
    const url = datasetUrl(kind, setCode, format);
    const name = `${kind}_data_public.${setCode}.${format}.csv.gz`;
    const dest = join(ARCHIVE, name);

    const size = await expectedSize(url);
    if (size === 0) {
      console.error(`${setCode} ${kind}: not published`);
      missing++;
      continue;
    }

    if (existsSync(dest) && statSync(dest).size === size) {
      skipped++;
      bytes += size;
      continue;
    }

    process.stderr.write(`${setCode} ${kind}: ${mb(size)} ... `);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.error(`${res.status}`);
      missing++;
      continue;
    }

    const part = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));

    const got = statSync(part).size;
    if (got !== size) {
      unlinkSync(part);
      console.error(`truncated (${mb(got)} of ${mb(size)}), left nothing`);
      missing++;
      continue;
    }

    renameSync(part, dest);
    downloaded++;
    bytes += got;
    console.error("ok");
  }
}

console.error(
  `\n${sets.length} set(s), ${kinds.join("+")}: ` +
    `${downloaded} downloaded, ${skipped} already current, ${missing} unavailable ` +
    `-- ${mb(bytes)} in ${ARCHIVE}`,
);

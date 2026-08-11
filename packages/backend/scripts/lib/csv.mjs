// Reading a 17Lands public dataset off S3 without keeping it.
//
// Lifted out of build-set-stats.mjs when bench-bots.mjs became a second reader
// of the same files. The datasets are 90-206MB gzipped per set and the pipeline
// has always streamed them rather than storing them, so a second copy of this
// that decompressed to a temp file would be the wrong thing quietly.
//
// `datasets/` at the repo root is gitignored for the same reason: a local file
// is a cache you pass in, never something these helpers write.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { datasetUrl } from "./datasets.mjs";

const UA = "mtg-tutor/0.1 (draft-trainer)";

/**
 * Streams a dataset line by line, decompressing on the fly.
 *
 * A local path is used as-is so re-deriving does not re-download; without one we
 * stream from S3 and keep nothing on disk.
 */
export async function* lines({ kind, setCode, format, localPath, log = () => {} }) {
  let input;
  if (localPath) {
    log(`${kind}: reading ${localPath}`);
    input = createReadStream(localPath);
    if (localPath.endsWith(".gz")) input = input.pipe(createGunzip());
  } else {
    const url = datasetUrl(kind, setCode, format);
    log(`${kind}: streaming ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    input = Readable.fromWeb(res.body).pipe(createGunzip());
  }
  yield* createInterface({ input, crlfDelay: Infinity });
}

/**
 * These files quote only fields containing commas, and never embed a quote or
 * newline inside a field -- which is why this is nine lines rather than a parser.
 */
export function splitRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

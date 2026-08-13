// The dealt packs of a 17Lands draft dataset, kept on disk.
//
// WHY THIS EXISTS
//
// `fit-bot-policy` and `bench-bots` both take about a quarter of an hour per
// run, and almost none of it is the thing being asked. Five sixths is streaming
// and gunzipping 90-206MB per set and splitting 586-column rows; the gradient
// descent over ~284k picks is seconds, and scoring four policies over the
// held-out fifth is not much more. That cost is paid again on every run, and on
// the day `human-bots` was fitted it was paid five times -- three of them only
// to learn that a feature earned nothing. The wrong diagnoses cost fifteen
// minutes each and should have cost seconds.
//
// WHAT IS CACHED IS THE PACKS, NOT THE FEATURES
//
// The obvious cache is the feature matrix the fit consumes, and it is the wrong
// one. Feature rows are exactly what changes when somebody is iterating on
// POLICY_FEATURES, so a feature cache is stale on the runs that matter most --
// and stale in the silent direction, refitting against columns that no longer
// mean what their names say. That is the train/serve skew `policy.ts` exists to
// prevent, reintroduced through the back door.
//
// What does not change is the DEAL: which cards were on offer and which one the
// human took. So that is what is stored, and features are recomputed on every
// run from `policyFeatures` -- seconds of arithmetic over an array in memory.
// It is also thirty times smaller (two bytes a candidate rather than seven
// floats), and it serves any consumer of these files rather than just the fit.
//
// THIS FILE DECIDES NOTHING
//
// It transcribes the dataset and stops. In particular it stores `draft_id` as
// the string the file gave, never a hash of it: the train/test split is FNV over
// that id, `fit-bot-policy` and `bench-bots` each keep their own copy of that
// hash on purpose, and a cache that hashed ids centrally would quietly become
// the shared helper those two comments forbid. Same for `event_match_wins`,
// stored raw so `--tier` stays the caller's definition.
//
// The one thing it must decide is when it is stale. Pack entries are indices
// into the set's EngineCards, so a re-ingest that moves or renames a card
// invalidates every index -- hence the card fingerprint in the header, checked
// on load. `datasets/` is gitignored, and a cache that cannot be re-derived from
// a public URL in fifteen minutes has no business being here.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "@mtg-tutor/core";
import { lines, splitRow } from "./csv.mjs";
import { engineCards } from "./engineCards.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = `${HERE}/../../../../datasets`;

// Bumped when the layout below changes. A mismatch rebuilds rather than throws,
// because the file is derived and re-deriving it is the documented cost.
const VERSION = 1;

const cachePath = (setCode, format) => `${CACHE_DIR}/picks.${setCode}.${format}.bin`;

/** `picked` is an index into the set's cards, or one of these. */
export const UNMATCHED = -1; // the row named a card the ingested pool does not have
export const NO_PICK = -2; // the row named nothing at all

/**
 * A fingerprint of the cards the pack indices point into.
 *
 * Names AND values, because a re-ingest that only moves `value` leaves every
 * index valid and every feature wrong -- which would survive an index check and
 * is the failure worth catching.
 */
function cardsFingerprint(cards) {
  let h = 0x811c9dc5;
  const eat = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const c of cards) {
    eat(c.name);
    eat(c.value.toFixed(6));
    eat(c.slot ?? "");
    eat(c.colors.join(""));
  }
  return h.toString(36);
}

// ---------------------------------------------------------------- the file
//
// A JSON header line, then typed-array sections in the order below. Every
// section starts on an 8-byte boundary so the views can alias the buffer
// instead of being copied out of it.

const pad8 = (n) => (n + 7) & ~7;

const SECTIONS = [
  ["ids", Uint8Array, (h) => h.idBytes], // draft ids, newline-joined
  ["pickCount", Uint16Array, (h) => h.drafts],
  ["wins", Uint8Array, (h) => h.drafts], // event_match_wins, 255 when absent
  ["packNo", Uint8Array, (h) => h.picks],
  ["pickNo", Uint8Array, (h) => h.picks],
  ["picked", Int16Array, (h) => h.picks],
  ["packLen", Uint8Array, (h) => h.picks],
  ["pack", Uint16Array, (h) => h.candidates],
];

function layout(header) {
  const offsets = {};
  let at = 0;
  for (const [name, Type, count] of SECTIONS) {
    offsets[name] = at;
    at = pad8(at + count(header) * Type.BYTES_PER_ELEMENT);
  }
  return { offsets, bytes: at };
}

function writeCache(path, header, sections) {
  const line = Buffer.from(`${JSON.stringify(header)}\n`, "utf8");
  const headerBytes = pad8(line.length);
  const { offsets, bytes } = layout(header);

  const buf = Buffer.alloc(headerBytes + bytes, 0x20);
  line.copy(buf);
  for (const [name, Type] of SECTIONS) {
    const src = sections[name];
    const view = new Type(buf.buffer, buf.byteOffset + headerBytes + offsets[name], src.length);
    view.set(src);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, buf);
  return buf.length;
}

function readCache(path) {
  const file = readFileSync(path);
  const nl = file.indexOf(0x0a);
  if (nl < 0) return null;
  let header;
  try {
    header = JSON.parse(file.subarray(0, nl).toString("utf8"));
  } catch {
    return null;
  }
  if (header.version !== VERSION) return null;

  // Copied into a fresh buffer so every section is aligned from zero.
  // `readFileSync` may hand back a pooled Buffer with an arbitrary byteOffset,
  // and a Uint16Array cannot be laid over an odd one.
  const bytes = new Uint8Array(file.subarray(pad8(nl + 1)));
  const { offsets } = layout(header);
  const out = { header };
  for (const [name, Type, count] of SECTIONS) {
    out[name] = new Type(bytes.buffer, offsets[name], count(header));
  }
  return out;
}

// ---------------------------------------------------------------- building

async function build({ setCode, format, cards, localPath, log }) {
  const byName = new Map();
  for (let i = 0; i < cards.length; i++) byName.set(normalizeName(cards[i].name), i);

  const ids = [];
  const pickCount = [];
  const wins = [];
  const packNo = [];
  const pickNo = [];
  const picked = [];
  const packLen = [];
  const pack = [];
  let unmatched = 0;
  let noPick = 0;

  let header = null;
  let packCols = [];
  let iDraft = -1;
  let iPack = -1;
  let iPickNo = -1;
  let iPick = -1;
  let iWins = -1;
  let currentId = null;
  let currentWins = 255;
  let rowsInDraft = 0;

  const endDraft = () => {
    if (currentId === null) return;
    ids.push(currentId);
    pickCount.push(rowsInDraft);
    wins.push(currentWins);
    rowsInDraft = 0;
  };

  for await (const line of lines({ kind: "draft", setCode, format, localPath, log })) {
    if (!header) {
      header = splitRow(line);
      iDraft = header.indexOf("draft_id");
      iPack = header.indexOf("pack_number");
      iPickNo = header.indexOf("pick_number");
      iPick = header.indexOf("pick");
      iWins = header.indexOf("event_match_wins");
      if (iDraft < 0 || iPack < 0 || iPickNo < 0 || iPick < 0) {
        throw new Error("not a 17Lands draft dataset");
      }
      // Resolved once. Per row this is a walk over precomputed indices rather
      // than a scan of 586 column names.
      for (let i = 0; i < header.length; i++) {
        if (!header[i].startsWith("pack_card_")) continue;
        const idx = byName.get(normalizeName(header[i].slice("pack_card_".length)));
        if (idx !== undefined) packCols.push([i, idx]);
      }
      log(`${packCols.length} pack columns joined`);
      continue;
    }

    const row = splitRow(line);
    const draftId = row[iDraft];
    if (draftId !== currentId) {
      endDraft();
      currentId = draftId;
      const w = iWins < 0 ? NaN : Number(row[iWins]);
      currentWins = Number.isInteger(w) && w >= 0 && w < 255 ? w : 255;
    }

    const name = row[iPick] ?? "";
    let pick = byName.get(normalizeName(name));
    if (pick === undefined) {
      if (name) {
        pick = UNMATCHED;
        unmatched++;
      } else {
        pick = NO_PICK;
        noPick++;
      }
    }

    let len = 0;
    for (const [i, idx] of packCols) {
      const n = row[i];
      // A count above 1 is two copies of the same card, which changes nothing
      // about the decision -- a policy is a function of the card, so a duplicate
      // can only tie with itself.
      if (n && n !== "0") {
        pack.push(idx);
        len++;
      }
    }

    packNo.push(Number(row[iPack]));
    pickNo.push(Number(row[iPickNo]));
    picked.push(pick);
    packLen.push(len);
    rowsInDraft++;

    if (picked.length % 500_000 === 0) log(`  ${picked.length.toLocaleString()} picks read...`);
  }
  endDraft();

  if (picked.length === 0) throw new Error(`no rows read for ${setCode}/${format}`);

  const idBlob = Buffer.from(ids.join("\n"), "utf8");
  return {
    header: {
      version: VERSION,
      setCode,
      format,
      cards: cardsFingerprint(cards),
      drafts: ids.length,
      picks: picked.length,
      candidates: pack.length,
      idBytes: idBlob.length,
      unmatched,
      noPick,
    },
    sections: {
      ids: idBlob,
      pickCount: Uint16Array.from(pickCount),
      wins: Uint8Array.from(wins),
      packNo: Uint8Array.from(packNo),
      pickNo: Uint8Array.from(pickNo),
      picked: Int16Array.from(picked),
      packLen: Uint8Array.from(packLen),
      pack: Uint16Array.from(pack),
    },
  };
}

// ---------------------------------------------------------------- the API

/**
 * Every pick of a set, grouped by draft, off disk when it is there.
 *
 * `client` may be null: the cards come from `datasets/` too (see
 * engineCards.mjs), so a cached set needs no deployment and no network at all.
 */
export async function draftPicks({
  client,
  api,
  setCode,
  format,
  localPath,
  refresh = false,
  log = () => {},
}) {
  const cards = await engineCards(client, api, setCode, format, log);
  const fingerprint = cardsFingerprint(cards);
  const path = cachePath(setCode, format);

  let file = refresh || !existsSync(path) ? null : readCache(path);
  if (file && file.header.cards !== fingerprint) {
    log(`${setCode}: cached packs were dealt from different cards, rebuilding`);
    file = null;
  }

  if (!file) {
    const { header, sections } = await build({ setCode, format, cards, localPath, log });
    const bytes = writeCache(path, header, sections);
    log(
      `${setCode}: cached ${header.picks.toLocaleString()} picks from ` +
        `${header.drafts.toLocaleString()} drafts (${(bytes / 1048576).toFixed(0)}MB)`,
    );
    file = readCache(path);
  }

  const { header } = file;
  const idText = Buffer.from(file.ids.buffer, file.ids.byteOffset, file.ids.length).toString(
    "utf8",
  );
  const ids = header.drafts ? idText.split("\n") : [];

  // Where each draft's picks start, and where each pick's pack starts. Prefix
  // sums rather than stored columns: two passes over small typed arrays at load
  // is cheaper than the bytes, and they cannot disagree with the data.
  const draftAt = new Int32Array(header.drafts + 1);
  for (let d = 0; d < header.drafts; d++) draftAt[d + 1] = draftAt[d] + file.pickCount[d];
  const packAt = new Int32Array(header.picks + 1);
  for (let p = 0; p < header.picks; p++) packAt[p + 1] = packAt[p] + file.packLen[p];

  const drafts = [];
  for (let d = 0; d < header.drafts; d++) {
    drafts.push({ id: ids[d], wins: file.wins[d], index: d });
  }

  /**
   * One drafter's rows, in file order, with cards resolved.
   *
   * Materialised per draft rather than up front, so a caller that keeps a
   * twentieth of the drafts allocates a twentieth of the objects. `picked` is
   * null when the row named a card the pool does not have, which callers must
   * treat as "no label" rather than as index 0.
   */
  const rows = (draft) => {
    const from = draftAt[draft.index];
    const to = draftAt[draft.index + 1];
    const out = [];
    for (let p = from; p < to; p++) {
      const pack = [];
      for (let c = packAt[p]; c < packAt[p + 1]; c++) pack.push(cards[file.pack[c]]);
      const idx = file.picked[p];
      out.push({
        packNo: file.packNo[p],
        pickNo: file.pickNo[p],
        pack,
        picked: idx >= 0 ? cards[idx] : null,
        named: idx !== NO_PICK,
      });
    }
    return out;
  };

  return {
    cards,
    drafts,
    rows,
    picks: header.picks,
    unmatched: header.unmatched,
    noPick: header.noPick,
  };
}

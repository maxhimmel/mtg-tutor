// Does the column the pods pick by, as the DEPLOYMENT stores it, agree with the
// one the fitting scripts compute?
//
//   pnpm verify-table-value [setCode] [format]
//
// WHY THIS EXISTS, AND WHAT IT ALREADY CAUGHT
//
// `tableValue` is computed twice on purpose: by `sets.ingest`, which stamps it
// on every stored card, and by `scripts/lib/engineCards.mjs`, which derives it
// on load so a fit is never run against a disk cache that predates the column.
// Both call `tableValues` in core, which is what makes them the same arithmetic
// -- and arithmetic was never the risk. The risk is the two sides being handed
// DIFFERENT CARDS.
//
// Which is what happened. Ingest matches a card to its pick order on the
// normalized name; the script path matched on the raw one, and so missed every
// split and adventure card in the set -- 36 of them in sos, "Emeritus of Truce
// // Swords to Plowshares" and its kind. Those fell back to `value` in every
// fit and benchmark while the app gave them their real pick order, so the
// weights were fitted against a column the bots do not have. Nothing failed. The
// numbers all looked fine, and were about a slightly different set than the one
// being played.
//
// It was found by chance, comparing two counts that had no business differing:
// 341 against 305. This is that comparison, run on purpose.
//
// `verify-tiebreak.mjs` is the same idea for `turn` and `role`, and its header
// carries the original version of this story. The difference is what each can
// see: that one catches a field DROPPED between core and storage, this one
// catches a field that survived and disagrees.

import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName, tableValues } from "@mtg-tutor/core";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const HERE = dirname(fileURLToPath(import.meta.url));

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing -- start the backend first.");

const setCode = (process.argv[2] ?? "sos").toLowerCase();
const format = process.argv[3] ?? "TradDraft";
const client = new ConvexHttpClient(url);

const doc = await client.query(api.sets.get, { setCode, format });
if (!doc?.cards?.length) throw new Error(`${setCode}/${format} is not ingested on this deployment.`);

const artifact = JSON.parse(
  readFileSync(resolve(HERE, "..", "data", `${setCode}.${format}.json`), "utf8"),
);
const alsa = new Map(artifact.cards.map((c) => [normalizeName(c.name), c.alsa]));

// Recomputed from the stored cards' own `value`, so this compares the two
// DERIVATIONS rather than re-deriving the inputs as well.
const ours = tableValues(
  doc.cards.map((c) => ({ name: c.name, value: c.value, alsa: alsa.get(normalizeName(c.name)) })),
);

const stored = doc.cards.filter((c) => c.tableValue != null).length;
console.log(`${setCode}/${format}: ${doc.cards.length} cards`);
console.log(`  stored tableValue    ${stored}`);
console.log(`  computed here        ${ours.size}`);

const problems = [];
for (const card of doc.cards) {
  const mine = ours.get(card.name);
  const theirs = card.tableValue;
  if (mine == null && theirs == null) continue;
  if (mine == null || theirs == null) {
    problems.push(`${card.name}: ${theirs == null ? "deployment has none" : "script has none"}`);
    continue;
  }
  // Both come off the same sorted array of the same numbers, so they are equal
  // or the sides disagree about which cards are in it. No tolerance.
  if (mine !== theirs) problems.push(`${card.name}: stored ${theirs}, computed ${mine}`);
}

if (problems.length === 0) {
  console.log(`\nok -- every card agrees, so the fit and the app pick by the same column.`);
  process.exit(0);
}

console.error(`\n${problems.length} card(s) disagree. The fit is weighting a column the bots`);
console.error(`do not have, which is silent everywhere else. First few:`);
for (const p of problems.slice(0, 10)) console.error(`  ${p}`);
process.exit(1);

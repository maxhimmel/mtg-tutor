// What `detectRole` actually calls things, on real cards.
//
//   node scripts/show-roles.mjs --snapshot <dir> [--set fdn] [--role removal]
//                               [--examples 6]
//
// WHY LOOK
//
// `detectRole` is a handful of regexes over rules text, and since it moved to
// ingest its answer is STORED on the card -- so it decides which deck needs a
// pick can meet (DECK-06, DECK-08) for the whole life of a pool, and correcting
// it costs a re-ingest rather than a deploy. A classifier with that much reach
// and no way to eyeball it is a classifier nobody can argue with.
//
// This prints the distribution, examples per role with the phrase that matched,
// and the two lists worth arguing about: creatures the text says also remove
// something, and cards that landed in `other` while looking like they should not
// have. Neither is a bug list -- `other` is a perfectly good answer for a mana
// rock -- but they are where a wrong answer would show up first.
//
// Reads the same `setCardText` a Convex export carries, and calls the SHIPPED
// classifier rather than a copy, so what it prints is what ingest wrote.

import { readFileSync } from "node:fs";
import { detectRole } from "@mtg-tutor/core";

const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const snapshot = flag("snapshot");
const setCode = flag("set", "fdn");
const only = flag("role");
const examples = Number(flag("examples", 6));

if (!snapshot) {
  console.error("--snapshot <dir> is required: an unzipped Convex export holding setCardText/.");
  process.exit(1);
}

const cards = [];
for (const line of readFileSync(`${snapshot}/setCardText/documents.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.code !== setCode) continue;
  cards.push(row.text);
}

if (cards.length === 0) {
  console.error(`No setCardText rows for ${setCode} in that snapshot.`);
  process.exit(1);
}

// The phrases the classifier actually tests, restated here ONLY to show which
// one fired. The verdict always comes from `detectRole` itself -- if these ever
// disagree with it, the label is what is true and this column is what is stale.
const EVIDENCE = [
  ["removal", /destroy target|deals \d+ damage to|exile target (creature|permanent)|target creature gets -/],
  ["card advantage", /draw (a|two|three|\d+) cards?/],
  ["evasion", /flying|menace|can't be blocked|trample/],
];

const matched = (card) => {
  const t = (card.oracleText ?? "").toLowerCase();
  for (const [, re] of EVIDENCE) {
    const m = t.match(re);
    if (m) return m[0];
  }
  return null;
};

const byRole = new Map();
for (const c of cards) {
  const role = detectRole({ oracleText: c.oracleText ?? "", typeLine: c.typeLine ?? "" });
  if (!byRole.has(role)) byRole.set(role, []);
  byRole.get(role).push(c);
}

const pct = (n) => `${((100 * n) / cards.length).toFixed(1)}%`;

console.log(`\n${setCode} — ${cards.length} cards\n`);
for (const [role, list] of [...byRole].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${role.padEnd(16)} ${String(list.length).padStart(4)}  ${pct(list.length).padStart(6)}`);
}

for (const [role, list] of [...byRole].sort((a, b) => b[1].length - a[1].length)) {
  if (only && role !== only) continue;
  console.log(`\n── ${role} ──`);
  for (const c of list.slice(0, examples)) {
    const hit = matched(c);
    console.log(`  ${c.name}`);
    console.log(`    ${(c.typeLine ?? "").slice(0, 70)}`);
    console.log(hit ? `    matched: "${hit}"` : `    matched: nothing — fell through to ${role}`);
  }
}

// The order the classifier checks in is a real decision: a creature whose text
// destroys something is called removal, not a creature. That is arguable in both
// directions, and DECK-06 counts bodies while DECK-08 counts removal -- so a
// card in this list is one the deck counts once and could be counted twice.
const bodiesThatRemove = cards.filter(
  (c) =>
    /\bcreature\b/.test((c.typeLine ?? "").toLowerCase()) &&
    detectRole({ oracleText: c.oracleText ?? "", typeLine: c.typeLine ?? "" }) === "removal",
);

console.log(`\n── creatures classified as removal (${bodiesThatRemove.length}) ──`);
console.log("   First-match wins, so a body whose text kills something counts toward");
console.log("   DECK-08's removal and not DECK-06's creatures. Arguable either way.");
for (const c of bodiesThatRemove.slice(0, examples)) {
  console.log(`  ${c.name} — matched "${matched(c)}"`);
}

// Where a wrong answer hides. `other` is correct for plenty of cards, so this is
// a reading list rather than a defect list.
const others = byRole.get("other") ?? [];
console.log(`\n── a sample of "other" (${others.length}) ──`);
console.log("   No phrase matched and it is not a creature. Correct for a mana rock;");
console.log("   worth a look if a removal spell is sitting here.");
for (const c of others.slice(0, examples)) {
  console.log(`  ${c.name} — ${(c.typeLine ?? "").slice(0, 50)}`);
  console.log(`    ${(c.oracleText ?? "").replace(/\n/g, " ").slice(0, 90)}`);
}
console.log();

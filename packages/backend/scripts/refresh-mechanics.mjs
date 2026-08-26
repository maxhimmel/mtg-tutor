// Checks that every mechanic our sets are built on has a definition somebody
// wrote, and says which ones do not.
//
//   node scripts/refresh-mechanics.mjs                # every committed set
//   node scripts/refresh-mechanics.mjs ltr one        # just these
//   node scripts/refresh-mechanics.mjs --min 4        # widen the bar
//   node scripts/refresh-mechanics.mjs --propose      # print YAML stubs to paste
//   node scripts/refresh-mechanics.mjs --refresh      # re-download, ignore the cache
//
// LOCAL ONLY, and step 6 of new-set. Nothing here runs on a deploy: the corpus
// is committed and compiled, and this is how a gap in it gets found.
//
// WHY THIS EXISTS AT ALL
//
// The corpus fails the way the pack model fails -- by succeeding plausibly. A
// mechanic with no entry does not throw, does not warn and does not look
// different: the hover panel simply says nothing about it, which is exactly
// what it did for every set before any of this was built. LTR is the case that
// proves it. Its flagship mechanic is on 50 of 291 cards, Scryfall reports
// `keywords: []` on the cards that carry it, and none of Scryfall's three
// keyword catalogs contain it. Nothing in the pipeline could have told us.
//
// So this exits non-zero and names them.
//
// WHY IT DOWNLOADS THE RULES AND NEVER COMMITS THEM
//
// The Comprehensive Rules are the only complete list of what Magic's mechanics
// are called, and they are not licensed for redistribution -- the Fan Content
// Policy carves verbatim republication of rules content out of what it permits.
// So the CR is a dev-time input: it decides WHICH mechanics exist and supplies
// the section number to cite, and the sentence a person reads is written by us
// in docs/set-mechanics.yaml. `checkOriginal` runs here, where the rules text is
// in hand, and fails if a definition has drifted back into Wizards' wording.
//
// The download is cached under .cache/ (gitignored) so a re-run is free and so
// nobody is tempted to commit the file to save a fetch.
//
// AND WHY IT IS NOT WIRED INTO THE BUILD
//
// There is no stable URL. The rules are published as `MagicCompRules
// YYYYMMDD.txt` under a per-year path with no `latest` alias and no directory
// listing, the txt's date drifts independently of the docx and pdf, and the old
// txt is deleted -- as this was written the site offered 20260807.docx,
// 20260807.pdf and 20260819.txt, and 20260807.txt was a 404. Academy Ruins'
// "always latest" redirect was broken for exactly that reason. A build that
// depended on any of this would break on a week nobody touched the code.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkOriginal, loadMechanics, matchesCard } from "@mtg-tutor/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "..", "data");
const CACHE = resolve(HERE, "..", ".cache", "mechanics");
const UA = "mtg-tutor/0.1 (draft-trainer)";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const refresh = argv.includes("--refresh");
const propose = argv.includes("--propose");
// A mechanic on this many cards of one set, in this many sets or fewer, is what
// the corpus is for. Below the first it is a card, not a mechanic; above the
// second it is evergreen and belongs in model/keywords.ts, whose prose is
// terser than anything either source gives.
const MIN_CARDS = Number(flag("min", 8));
const MAX_SETS = Number(flag("sets", 6));
const only = argv.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a)).map((s) => s.toLowerCase());

mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cached(name, fetchIt) {
  const path = join(CACHE, name);
  if (!refresh && existsSync(path)) return readFileSync(path, "utf8");
  const body = await fetchIt();
  writeFileSync(path, body, "utf8");
  return body;
}

// The download link is not plain HTML -- it sits inside a JSON-escaped blob in
// the page source -- so this regexes the page rather than parsing it, and takes
// the LAST match because the txt is listed after the docx and pdf and is the
// only one of the three worth reading.
async function comprehensiveRules() {
  return cached("cr.txt", async () => {
    const page = await fetch("https://magic.wizards.com/en/rules", { headers: { "User-Agent": UA } });
    if (!page.ok) throw new Error(`rules page: HTTP ${page.status}`);
    const html = await page.text();
    const links = [...html.matchAll(/https?:\\?\/\\?\/[^"'\\]*MagicCompRules[^"'\\]*\.txt/g)].map(
      (m) => m[0].replace(/\\\//g, "/"),
    );
    if (!links.length) throw new Error("no MagicCompRules .txt link on magic.wizards.com/en/rules");
    const url = encodeURI(links.at(-1));
    process.stderr.write(`rules: ${url}\n`);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`rules download: HTTP ${res.status} for ${url}`);
    // UTF-8 with a BOM and CRLF endings, both of which break naive line splits.
    return (await res.text()).replace(/^\uFEFF/, "").replace(/\r/g, "");
  });
}

// Scryfall asks for 50-100ms between requests and means between ALL of them,
// not between the pages of one search. Spacing only the pages inside a search
// walked 26 sets fast enough to get a 429 at set nine, which on a cold cache is
// eight sets of work thrown away -- so the gap is global and a rebuff is waited
// out rather than raised.
let nextSlot = 0;
async function polite(url) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, nextSlot - Date.now());
    if (wait) await sleep(wait);
    nextSlot = Date.now() + 120;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status !== 429) return res;
    if (attempt >= 4) throw new Error(`scryfall ${url}: rate-limited after ${attempt} retries`);
    const backoff = 2000 * 2 ** attempt;
    process.stderr.write(`  rate-limited, waiting ${backoff / 1000}s\n`);
    nextSlot = Date.now() + backoff;
  }
}

async function scryfall(path, name) {
  const body = await cached(name, async () => {
    let url = `https://api.scryfall.com${path}`;
    const all = [];
    while (url) {
      const res = await polite(url);
      if (!res.ok) throw new Error(`scryfall ${url}: HTTP ${res.status}`);
      const page = await res.json();
      if (page.object === "catalog") return JSON.stringify(page.data);
      all.push(...page.data);
      url = page.has_more ? page.next_page : null;
    }
    return JSON.stringify(all);
  });
  return JSON.parse(body);
}

/**
 * Every named rules concept the Comprehensive Rules carry, and what kind it is.
 *
 * Three tiers, and all three are needed. The `7xx.y` headings are the keyword
 * abilities and actions. The Glossary is what finds the rest -- `Prepared` is a
 * designation at 722.3 with no heading of its own, and `The Ring` and `Crime`
 * are only there. Rule 207.2c names the ability words, and it is the tier that
 * cannot be skipped for the opposite reason: the CR refuses to define them, so
 * without this they look like ordinary English words and are matched like one.
 */
function vocabulary(cr, abilityWordCatalog) {
  const terms = new Map();
  const add = (name, kind, rule) => {
    const key = name.toLowerCase();
    if (!terms.has(key)) terms.set(key, { name, kind, rule });
  };

  for (const m of cr.matchAll(/^(\d+)\.(\d+)\. ([A-Z][^\n]{0,60})$/gm)) {
    const [, major, minor, name] = m;
    if (Number(major) < 700) continue;
    add(name.trim(), major === "701" ? "action" : major === "702" ? "keyword" : "designation",
      `${major}.${minor}`);
  }

  const glossaryAt = cr.lastIndexOf("\nGlossary\n");
  const lines = cr.slice(glossaryAt).split("\n");
  for (let i = 1; i < lines.length - 1; i++) {
    const title = lines[i].trim();
    const body = lines[i + 1].trim();
    if (lines[i - 1].trim() !== "" || !title || !body) continue;
    if (title.length >= 60 || title.endsWith(".") || !/^[A-Z0-9]/.test(title)) continue;
    if (body.length <= 20) continue;
    add(title, "designation", undefined);
  }

  // Ability words LAST, so a word that is also a real rule keeps its rule -- the
  // CR files `Start Your Engines!` as a keyword ability at 702.179 while
  // Scryfall lists it among the ability words, and the CR is right.
  const declared = cr.match(/The ability words are ([^.]+(?:\.\d)?[^.]*)\./);
  const words = new Set(
    (declared?.[1] ?? "")
      .replace(/,? and /, ", ")
      .split(", ")
      .map((s) => s.trim().replace(/ \d$/, ""))
      .filter(Boolean),
  );
  // 207.2c is not exhaustive: `corrupted` is on 26 paper cards and appears
  // nowhere in the rules, not even in the release published for its own set.
  for (const w of abilityWordCatalog) words.add(w);

  for (const w of words) {
    const existing = terms.get(w.toLowerCase());
    if (existing?.rule) continue;
    terms.set(w.toLowerCase(), { name: w, kind: "ability-word", rule: undefined });
  }

  return terms;
}


/**
 * Drops a term whose cards are entirely somebody else's.
 *
 * The vocabulary is three overlapping lists, so one mechanic arrives under
 * several names: `Saddled` is every card `Saddle` already found, `Plotted` is a
 * subset of `Plot`, `Monstrous` of `Monstrosity`, and `The Ring` and `The Ring
 * Tempts You` are the same fifty cards under two headings. None of that is a
 * judgement call -- it is set containment -- so it is settled here rather than
 * spent on somebody's attention.
 *
 * Containment alone is not enough, and the case that proves it is dft: `Max
 * Speed` is on 36 cards and `Start Your Engines!` on 40, the same 36 among them,
 * because a card with one almost always has the other. They are two mechanics
 * and a drafter needs both. So the names have to be the same WORD as well --
 * one a prefix of the other, or six characters of shared stem, which is what
 * separates Saddle/Saddled from Speed/Exhaust.
 *
 * What is left over IS a judgement call: `Face Up` is on 55 cards of mkm and ktk
 * and is rules plumbing rather than a mechanic, and no containment test can know
 * that. Those go in `ignored` in the corpus, where the reason is written down.
 */
const stem = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function sameWord(a, b) {
  const [x, y] = [stem(a), stem(b)];
  if (x.startsWith(y) || y.startsWith(x)) return true;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= 6;
}

function collapse(rows, hits, terms) {
  const kept = [];
  for (const [name, n] of rows) {
    const mine = hits.get(name);
    const swallowedBy = rows.find(([other]) => {
      if (other === name || !sameWord(name, other)) return false;
      const theirs = hits.get(other);
      if (![...mine].every((c) => theirs.has(c))) return false;
      // Identical sets swallow each other, so the tie needs a rule: prefer the
      // name the rules actually give a section to, then the longer one.
      if (theirs.size > mine.size) return true;
      const a = terms.get(name.toLowerCase());
      const b = terms.get(other.toLowerCase());
      if (Boolean(a?.rule) !== Boolean(b?.rule)) return Boolean(b?.rule);
      return other.length > name.length;
    });
    if (!swallowedBy) kept.push([name, n]);
  }
  return kept;
}

// The committed artifacts are the set list, exactly as cache-cards and
// ingest-sets read it, so a set counts here when its stats are committed and
// never because somebody remembered to add it.
const setFiles = readdirSync(DATA).filter((f) => f.endsWith(".json"));
const sets = [...new Set(setFiles.map((f) => f.slice(0, f.indexOf("."))))]
  .filter((code) => only.length === 0 || only.includes(code));

if (!sets.length) {
  console.error(only.length ? `No committed artifact for ${only.join(", ")}` : "No artifacts.");
  process.exit(1);
}

// A set's cards are its own printing plus whatever sheet it is paired with --
// the Mystical Archive, the Special Guests -- because those are dealt in its
// packs and a drafter meets their mechanics in it. Read off the artifact rather
// than listed here, so a new bonus sheet needs no edit.
function setCodesFor(code) {
  const artifact = JSON.parse(readFileSync(join(DATA, `${code}.TradDraft.json`), "utf8"));
  const codes = new Set([code]);
  const counts = new Map();
  for (const p of artifact.packCards ?? []) {
    if (p.setCode) counts.set(p.setCode, (counts.get(p.setCode) ?? 0) + 1);
  }
  // Five or more, so a one-off reprint does not drag a whole set's card list in.
  // MKM alone names 37 sets this way, 35 of them for a single card.
  for (const [c, n] of counts) if (n >= 5) codes.add(c);
  return [...codes];
}

const cr = await comprehensiveRules();
const abilityWords = await scryfall("/catalog/ability-words", "ability-words.json");
const terms = vocabulary(cr, abilityWords);
process.stderr.write(`vocabulary: ${terms.size} terms from the rules and Scryfall's catalog\n`);

// The COMPILED corpus, not docs/set-mechanics.yaml -- this is the one that
// ships, and reading it means the report describes what the app will do rather
// than what the source says it should. It also keeps a YAML parser out of the
// backend. Run `pnpm --filter @mtg-tutor/core generate` first if the source has
// moved and this has not.
const corpus = loadMechanics();
checkOriginal(corpus, cr);
process.stderr.write(`corpus: ${corpus.mechanics.length} definitions, none lifted from the rules\n`);

// Scryfall's card text, which is what the app stores and therefore what the app
// will match against. Deliberately not the artifact's card list: that carries
// names and win rates and no rules text at all.
const perSet = new Map();
const setsWith = new Map();
for (const code of sets) {
  const cards = [];
  for (const sc of setCodesFor(code)) {
    const raw = await scryfall(`/cards/search?q=set%3A${sc}&unique=cards&order=set`, `${sc}.json`);
    for (const c of raw) {
      const text = [c.oracle_text, ...(c.card_faces ?? []).map((f) => f.oracle_text)]
        .filter(Boolean)
        .join("\n");
      if (text) cards.push({ name: c.name, oracleText: text });
    }
  }
  const counts = new Map();
  const hits = new Map();
  for (const term of terms.values()) {
    const matched = new Set();
    for (const card of cards) if (matchesCard(term, card)) matched.add(card.name);
    if (matched.size) {
      counts.set(term.name, matched.size);
      hits.set(term.name, matched);
    }
  }
  perSet.set(code, { cards: cards.length, counts, hits });
  for (const name of counts.keys()) setsWith.set(name, (setsWith.get(name) ?? 0) + 1);
  process.stderr.write(`${code}: ${cards.length} cards\n`);
}

// A term counts as this set's OWN mechanic when it is on enough of its cards and
// rare enough across the rest. Both halves are needed: `Flying` clears the first
// in every set and the second in none.
const known = new Set(corpus.mechanics.map((m) => m.name.toLowerCase()));
// Terms the vocabulary finds that are not mechanics a drafter needs told about.
// They live in the corpus beside the definitions, each with a reason, because
// "we looked at this and it is not one" is a decision worth keeping and the
// alternative is a run that is red forever and therefore says nothing.
const ignored = new Set((corpus.ignored ?? []).map((i) => i.name.toLowerCase()));
const missing = new Map();
const below = new Map();
let carrying = 0;
let explained = 0;

console.log("");
for (const code of sets) {
  const { cards, counts, hits } = perSet.get(code);
  // Ignored terms are dropped BEFORE collapsing, never after. `Speed` is on 41
  // cards of dft and is ignored; `Start Your Engines!` and `Max Speed` are
  // subsets of it and are the two mechanics the set is actually built on. Let
  // the ignored term collapse them first and all three vanish at once -- which
  // is exactly the silent loss this script exists to make impossible.
  const own = collapse(
    [...counts].filter(
      ([name, n]) =>
        n >= MIN_CARDS && setsWith.get(name) <= MAX_SETS && !ignored.has(name.toLowerCase()),
    ),
    hits,
    terms,
  ).sort((a, b) => b[1] - a[1]);
  const near = [...counts].filter(
    ([name, n]) =>
      n < MIN_CARDS &&
      n >= 2 &&
      setsWith.get(name) <= MAX_SETS &&
      !known.has(name.toLowerCase()) &&
      !ignored.has(name.toLowerCase()),
  );

  const line = own.map(([name, n]) => {
    const have = known.has(name.toLowerCase());
    if (have) explained++;
    else missing.set(name, (missing.get(name) ?? 0) + n);
    return `${name}(${n})${have ? "" : " *"}`;
  });
  carrying += own.length;
  for (const [name, n] of near) below.set(name, Math.max(below.get(name) ?? 0, n));

  console.log(`${code.padEnd(5)} ${String(cards).padStart(4)} cards  ${line.join(", ") || "—"}`);
}

// Said out loud rather than left implicit. A bar nobody can see is a bar that
// looks like completeness, and this is the tail it excludes.
if (below.size) {
  console.log(
    `\nBelow the bar (under ${MIN_CARDS} cards in any one set), not in the corpus and not counted:\n  ` +
      [...below]
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `${n}(${c})`)
        .join(", "),
  );
}

// Written by hand, and wrong four times out of five the first time it was tried.
const drift = corpus.mechanics
  .map((m) => ({ m, actual: terms.get(m.name.toLowerCase())?.rule }))
  .filter(({ m, actual }) => actual && m.rule && actual !== m.rule);
if (drift.length) {
  console.log("\nRule numbers that have moved since they were written down:");
  for (const { m, actual } of drift) console.log(`  ${m.name}: ${m.rule} -> ${actual}`);
}

console.log(
  `\n${explained}/${carrying} set mechanics across ${sets.length} sets have a definition.`,
);

if (missing.size) {
  console.error(`\n${missing.size} mechanic(s) with no entry in docs/set-mechanics.yaml:`);
  for (const [name, n] of [...missing].sort((a, b) => b[1] - a[1])) {
    const t = terms.get(name.toLowerCase());
    console.error(`  ${name} — ${n} cards, ${t.kind}${t.rule ? `, CR ${t.rule}` : ", no CR rule"}`);
  }
  if (propose) {
    console.error("\nStubs to paste into docs/set-mechanics.yaml, with the sentences left to write:\n");
    for (const [name] of missing) {
      const t = terms.get(name.toLowerCase());
      console.error(`  - name: ${name}`);
      console.error(`    kind: ${t.kind}`);
      console.error(t.rule ? `    rule: "${t.rule}"` : `    sourced: false`);
      console.error(`    short: TODO\n`);
    }
  } else {
    console.error("\nRe-run with --propose for stubs.");
  }
  process.exit(1);
}

console.log("Every mechanic over the bar has a definition.");

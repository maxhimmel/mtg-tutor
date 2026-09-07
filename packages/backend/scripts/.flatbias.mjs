import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPE_QUIZ, archetypeQuestions, dealArchetypeRun, normalizeName, sharedColor } from "@mtg-tutor/core";

const DATA = "/Users/maxymax/Repos/mtg-tutor/packages/backend/data";
const DS = "/Users/maxymax/Repos/mtg-tutor/datasets";

function cardsFor(set) {
  const cache = join(DS, `cards.${set.setCode}.${set.format}.json`);
  if (existsSync(cache)) {
    const byName = new Map(JSON.parse(readFileSync(cache, "utf8")).map((c) => [normalizeName(c.name), { colors: c.colors.join(""), role: c.role }]));
    return (name) => byName.get(normalizeName(name));
  }
  return (name) => {
    const colors = sharedColor(set.archetypes.filter((r) => r.name === name).map((r) => r.colors));
    return colors ? { colors } : undefined;
  };
}

const med = (a) => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.floor(s.length/2)] : NaN; };
const firstFlat = [], allFlat = [], firstSharp = [], allSharp = [];
let setsWithRun = 0;

for (const file of readdirSync(DATA).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  if (!set.archetypes?.length || !set.colorWinRates?.length) continue;
  const ranked = archetypeQuestions(set.archetypes, set.colorWinRates, cardsFor(set), ARCHETYPE_QUIZ);
  const flat = ranked.filter((q) => !q.separated);
  const sharp = ranked.filter((q) => q.separated);
  if (flat.length === 0) continue;
  setsWithRun++;
  // first run of 8: dealArchetypeRun with limit 8, skip 0
  const run = dealArchetypeRun(ranked, 8, 0);
  const rf = run.filter((q) => !q.separated).map((q) => q.margin);
  const rs = run.filter((q) => q.separated).map((q) => q.margin);
  firstFlat.push(...rf); allFlat.push(...flat.map((q)=>q.margin));
  firstSharp.push(...rs); allSharp.push(...sharp.map((q)=>q.margin));
  console.log(`${set.setCode.padEnd(4)} flat=${String(flat.length).padStart(4)} sharp=${String(sharp.length).padStart(3)}  run flat margins: ${rf.map((m)=>m.toFixed(2)).join(" ")}   | all-flat p50=${med(flat.map(q=>q.margin)).toFixed(2)}`);
}

const near = (a, t) => (a.filter((m) => m >= t).length / a.length * 100).toFixed(1);
console.log(`\nsets with a run: ${setsWithRun}`);
console.log(`FLAT served in run 1: n=${firstFlat.length} p50=${med(firstFlat).toFixed(2)} >=0.9: ${near(firstFlat,0.9)}%  >=0.8: ${near(firstFlat,0.8)}%`);
console.log(`FLAT whole bank:      n=${allFlat.length} p50=${med(allFlat).toFixed(2)} >=0.9: ${near(allFlat,0.9)}%  >=0.8: ${near(allFlat,0.8)}%`);
console.log(`SHARP served in run 1: n=${firstSharp.length} p50=${med(firstSharp).toFixed(2)}`);
console.log(`SHARP whole bank:      n=${allSharp.length} p50=${med(allSharp).toFixed(2)}`);

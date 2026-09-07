import { readdirSync, readFileSync } from "node:fs";
import { archetypeQuestions, sharedColor } from "./src/drills/archetypes.js";
import { ARCHETYPE_QUIZ } from "./src/config.js";

const dir = "../backend/data";
const m: number[] = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const byCard = new Map<string, string[]>();
  for (const r of d.archetypes) {
    const seen = byCard.get(r.name);
    if (seen) seen.push(r.colors);
    else byCard.set(r.name, [r.colors]);
  }
  const cardFor = (name: string) => {
    const shared = sharedColor(byCard.get(name) ?? []);
    return shared ? { colors: shared, role: "spell" } : undefined;
  };
  const qs = archetypeQuestions(d.archetypes, d.colorWinRates, cardFor, ARCHETYPE_QUIZ);
  for (const q of qs) if (q.separated) m.push(q.margin);
}
const s = [...m].sort((a, b) => a - b);
const p = (x: number) => s[Math.floor(s.length * x)];
console.log("separable n=", m.length, "p50=", p(0.5)?.toFixed(2), "max=", Math.max(...m).toFixed(2));
console.log("in [1,1.5):", m.filter((x) => x < 1.5).length, " [1.5,2):", m.filter((x) => x >= 1.5 && x < 2).length, " >=2:", m.filter((x) => x >= 2).length);

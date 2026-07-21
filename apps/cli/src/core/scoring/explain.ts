import type { Card } from "../model/card.js";
import type { PickScore } from "./score.js";

const pct = (v?: number) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export type CardRole = "removal" | "evasion" | "card advantage" | "creature" | "other";

export function detectRole(card: Card): CardRole {
  const t = card.oracleText.toLowerCase();
  if (/(destroy target|deals \d+ damage to|exile target (creature|permanent)|target creature gets -)/.test(t))
    return "removal";
  if (/(draw (a|two|three|\d+) cards?)/.test(t)) return "card advantage";
  if (/(flying|menace|can't be blocked|trample)/.test(t)) return "evasion";
  if (/\bcreature\b/.test(card.typeLine.toLowerCase())) return "creature";
  return "other";
}

function wheelNote(alsa?: number): string {
  if (alsa == null) return "";
  if (alsa <= 3) return "a premium pick that rarely tables";
  if (alsa <= 6) return `usually gone by pick ~${Math.round(alsa)}`;
  return `often wheels (last seen ~pick ${Math.round(alsa)})`;
}

export function explainPick(ps: PickScore): string[] {
  const lines: string[] = [];
  const { picked, best } = ps;

  if (ps.isBest) {
    lines.push(`✅ Best available. ${picked.name} — GIH WR ${pct(picked.gihWinRate)}, ${wheelNote(picked.alsa)}.`);
  } else {
    const delta = (ps.bestValue - ps.pickedValue) * 100;
    lines.push(
      `You took ${picked.name} (GIH WR ${pct(picked.gihWinRate)}); ` +
        `the data favors ${best.name} (GIH WR ${pct(best.gihWinRate)}) — a ${delta.toFixed(1)}% win-rate gap.`,
    );
    const bestRole = detectRole(best);
    if (bestRole === "removal") lines.push(`${best.name} is efficient removal — premium in most archetypes.`);
    if (best.alsa != null) lines.push(`${best.name} ${wheelNote(best.alsa)}; ${picked.name} ${wheelNote(picked.alsa)}.`);
  }

  if (!ps.onColor) {
    lines.push(`⚠️ Off your committed colors — splashing costs consistency unless the payoff is high.`);
  }
  return lines;
}

// Signal reading: which colors are over-represented with strong cards late in a pack.
export function readSignals(pack: Card[], pickNumber: number): string | undefined {
  if (pickNumber < 4) return undefined;
  const strengthByColor = new Map<string, number>();
  for (const c of pack) {
    const q = (c.gihWinRate ?? 0.5) - 0.5;
    for (const col of c.colors) strengthByColor.set(col, (strengthByColor.get(col) ?? 0) + Math.max(0, q));
  }
  const ranked = [...strengthByColor].sort((a, b) => b[1] - a[1]);
  if (ranked.length && ranked[0][1] > 0.15) {
    const names: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
    return `Signal: ${names[ranked[0][0]] ?? ranked[0][0]} looks open — strong cards still here at pick ${pickNumber}.`;
  }
  return undefined;
}

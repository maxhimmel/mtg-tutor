import type { Card, EngineCard } from "../model/card.js";
import type { PickScore } from "./score.js";
import { cardValue } from "./value.js";

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

// Reads the rules text to name what the best card actually does, so it wants a
// hydrated score rather than the engine's.
export function explainPick(ps: PickScore<Card>): string[] {
  const lines: string[] = [];
  const { picked, rawBest } = ps;

  if (ps.isBest) {
    lines.push(`✅ Best available. ${picked.name} — GIH WR ${pct(picked.gihWinRate)}, ${wheelNote(picked.alsa)}.`);
  } else {
    const delta = (ps.rawBestValue - ps.pickedValue) * 100;
    lines.push(
      `You took ${picked.name} (GIH WR ${pct(picked.gihWinRate)}); ` +
        `the data favors ${rawBest.name} (GIH WR ${pct(rawBest.gihWinRate)}) — a ${delta.toFixed(1)}% win-rate gap.`,
    );
    const bestRole = detectRole(rawBest);
    if (bestRole === "removal") lines.push(`${rawBest.name} is efficient removal — premium in most archetypes.`);
    if (rawBest.alsa != null)
      lines.push(`${rawBest.name} ${wheelNote(rawBest.alsa)}; ${picked.name} ${wheelNote(picked.alsa)}.`);
  }

  if (!ps.onColor) {
    lines.push(`⚠️ Off your committed colors — splashing costs consistency unless the payoff is high.`);
  }
  return lines;
}

// Signal reading: which colors are over-represented with strong cards late in a
// pack.
//
// Measured against the median card still in the pack, not against 0.5. A format
// does not sit at 50% -- SOS TradDraft's own base win rate is 0.608 -- so
// subtracting 0.5 made every card read as strong and the signal fired on
// whichever color was merely most numerous, at nearly every pick past the
// fourth. The pack's own median needs no set context to look up and is the
// comparison the sentence already claims to be making: strong RELATIVE to what
// is left here.
export function readSignals(pack: EngineCard[], pickNumber: number): string | undefined {
  if (pickNumber < 4) return undefined;
  const values = pack.map(cardValue).sort((a, b) => a - b);
  if (values.length === 0) return undefined;
  const mid = Math.floor(values.length / 2);
  const par = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

  const strengthByColor = new Map<string, number>();
  for (const c of pack) {
    const q = cardValue(c) - par;
    for (const col of c.colors) strengthByColor.set(col, (strengthByColor.get(col) ?? 0) + Math.max(0, q));
  }
  const ranked = [...strengthByColor].sort((a, b) => b[1] - a[1]);
  if (ranked.length && ranked[0][1] > 0.15) {
    const names: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
    return `Signal: ${names[ranked[0][0]] ?? ranked[0][0]} looks open — strong cards still here at pick ${pickNumber}.`;
  }
  return undefined;
}

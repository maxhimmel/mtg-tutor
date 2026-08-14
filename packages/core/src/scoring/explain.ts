import type { Card, EngineCard } from "../model/card.js";
import { detectRole as roleOf } from "../model/role.js";
import { type PickScore, gapMargin } from "./score.js";
import { cardValue } from "./value.js";

const pct = (v?: number) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

// Moved to model/role.ts, where it is an ingest-time classifier rather than a
// helper for one sentence of prose -- see there for why. Re-exported because
// this file's own line about removal still asks the question.
export { type CardRole, detectRole } from "../model/role.js";


function wheelNote(alsa?: number): string {
  if (alsa == null) return "";
  if (alsa <= 3) return "a premium pick that rarely tables";
  if (alsa <= 6) return `usually gone by pick ~${Math.round(alsa)}`;
  return `often wheels (last seen ~pick ${Math.round(alsa)})`;
}

// Reads the rules text to name what the best card actually does, so it wants a
// hydrated score rather than the engine's.
//
// Names `contextBest` throughout, because `isBest` tracks it: naming the raw
// best under a verdict decided by the context best produced lines reading "you
// took X; the data favors X — a 0.0% gap". The gap is quoted in the units the
// grade was computed in for the same reason -- `pickedContextValue` exists so
// that pair cannot be mixed across two scales.
export function explainPick(ps: PickScore<Card>): string[] {
  const lines: string[] = [];
  const { picked, contextBest, rawBest } = ps;

  if (ps.isBest) {
    lines.push(`✅ Best available. ${picked.name} — GIH WR ${pct(picked.gihWinRate)}, ${wheelNote(picked.alsa)}.`);
  } else if (ps.indistinguishable) {
    // Not a miss, and it must not read as one. The pick scored 100 because the
    // data cannot separate it from the top of the pack, so this names the set it
    // tied with rather than a single card that "beat" it -- which `contextBest`
    // would be, and which is a coin flip at this margin.
    const others = ps.band.length > 0 ? ps.band : [ps.contextBest];
    lines.push(
      `✅ Nothing measurably better. ${picked.name} — GIH WR ${pct(picked.gihWinRate)}, ` +
        `${wheelNote(picked.alsa)}.`,
    );
    lines.push(
      `The data cannot separate it from ${others.map((c) => c.name).join(", ")}, so the pick is ` +
        `not marked down.`,
    );
    // What the deck wanted out of that tie, in the corpus's own terms. Only when
    // a principle actually decided it -- `reasons` is empty when the deck and
    // the win rates agreed, and citing one there credits a rule that did nothing.
    if (ps.preferred && ps.reasons.length > 0) {
      lines.push(
        `${ps.preferred.name} is the one this deck wanted: ${ps.reasons[0].note} ` +
          `[${ps.reasons[0].principle}].`,
      );
    }
  } else {
    const gap = ps.contextBestValue - ps.pickedContextValue;
    // With its margin, like every other gap this app reports. This is the
    // FALLBACK text -- what the panel shows when the coach cannot be reached --
    // and it was the last surface still naming a better card without saying
    // whether the data can see the difference. It sits in the same panel as a
    // verdict that does say so, which is how a player would have learned to
    // trust the wrong one of the two. See notes.md decision #8.
    // Whether the gap is real is the SCORE's answer, not a fourth opinion formed
    // here -- `gapMargin` is asked only for the size of the bars. The branch
    // above owns the inside-the-margin case entirely, so this one is a miss the
    // data can actually see.
    const margin = gapMargin(contextBest, picked);
    const size = `${(gap * 100).toFixed(1)}pp`;
    lines.push(
      `You took ${picked.name} (GIH WR ${pct(picked.gihWinRate)}); ` +
        `${contextBest.name} was worth ${size} more to this deck` +
        (margin == null
          ? ", though one of the two is unrated so there are no error bars on that."
          : `, against a ±${(margin * 100).toFixed(1)}pp margin of error.`),
    );
    // Only when it is a third card. The lesson is the divergence between raw
    // power and deck fit, and there is none to draw when the strongest card in
    // the pack is the one you took or the one you are being pointed at.
    if (rawBest.name !== contextBest.name && rawBest.name !== picked.name)
      lines.push(`Strongest card in the pack was ${rawBest.name} (GIH WR ${pct(rawBest.gihWinRate)}).`);
    if (roleOf(contextBest) === "removal")
      lines.push(`${contextBest.name} is efficient removal — premium in most archetypes.`);
    if (contextBest.alsa != null)
      lines.push(`${contextBest.name} ${wheelNote(contextBest.alsa)}; ${picked.name} ${wheelNote(picked.alsa)}.`);
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

import type { Card, ColorCode, PoolCard } from "../model/card.js";
import { CARD_STAT_GLOSSARY } from "./glossary.js";

// How a card is written into a prompt: what it is, and what the data says about
// it. Shared by pickCoach and reviewPrompt so the live coach and the review
// cannot describe the same card two different ways -- they duplicated `pct` and
// `colorLabel` already, and the stat line would have been a third copy.

const COLOR_NAMES: Record<ColorCode, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export const pct = (v?: number) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

const WUBRG = "WUBRG";

// Colors as prose, in WUBRG order -- a set of committed colors comes out in pool
// order otherwise, so the same two colors would be written two ways across a draft.
export function colorNames(colors: readonly ColorCode[]): string {
  return [...colors]
    .sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b))
    .map((col) => COLOR_NAMES[col])
    .join("/");
}

export function colorLabel(c: PoolCard): string {
  if (c.colors.length === 0) return "Colorless";
  return colorNames(c.colors);
}

// "3.8k" -- sample sizes only have to convey an order of magnitude, and four
// digits of game count in every line of a fifteen-card pack is noise.
const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// What the card IS. Every card the model is shown gets this, not just the picked
// one: rendering the rest as bare names is why the coach used to invent mana
// costs for cards it was reasoning about.
export function describeCard(c: Card): string {
  return `${c.name} — ${c.cmc} mana, ${colorLabel(c)}, ${c.typeLine}`;
}

// What the DATA says. Absent stats are dropped rather than printed as "n/a": a
// set with thin data would otherwise spend most of a fifteen-line pack listing
// what it does not know. No sample-size guard is needed here -- build-set-stats
// already withholds iwd unless both halves of it cleared the floor.
export function statLine(c: Card): string {
  const parts: string[] = [];

  if (c.gihWinRate != null) {
    const n = c.gihGames != null ? ` (n ${count(c.gihGames)})` : "";
    parts.push(`GIH ${pct(c.gihWinRate)}${n}`);
  }
  // Percentage POINTS, with a sign. It is the gap between two rates, and
  // formatting it like the rates above would read as one.
  if (c.iwd != null) {
    parts.push(`IWD ${c.iwd >= 0 ? "+" : ""}${(c.iwd * 100).toFixed(1)}pp`);
  }
  if (c.avgPick != null) parts.push(`ATA ${c.avgPick.toFixed(1)}`);
  if (c.alsa != null) parts.push(`ALSA ${c.alsa.toFixed(1)}`);
  if (c.maindeckRate != null) parts.push(`maindecked ${pct(c.maindeckRate)}`);
  if (c.winRate != null) parts.push(`GP WR ${pct(c.winRate)}`);

  return parts.length ? parts.join(" · ") : "no draft data";
}

// What the numbers in statLine mean, for the system prompts. Without this the
// model recites the stats back at the player instead of reasoning with them --
// which would make a wider stat line a regression, not an improvement.
// Greedy wrap to a fixed column, so a definition edited in glossary.ts does not
// have to be re-wrapped by hand to keep the prompt legible.
function wrap(text: string, width: number, indent: string): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = indent + word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

// One bullet per stat, straight from the glossary the UI and /glossary page read.
// Per-stat facts live there; the cross-stat reading rules below do not, because
// they are relationships between stats rather than definitions of any one.
const statBullets = CARD_STAT_GLOSSARY.flatMap((s) =>
  wrap(`- ${s.label} — ${s.short}${s.caveat ? ` ${s.caveat}` : ""}`, 78, "  "),
);

export const STAT_LEGEND = [
  "# Reading the card data",
  "",
  "Each card is shown with some of the following. They measure different things;",
  "do not read them as one ranking.",
  "",
  ...statBullets,
  "",
  "Reading them together:",
  "- A high GIH with a flat IWD is a card riding its deck; a high IWD is a card",
  "  that wins games by itself.",
  "- The SIZE OF THE ATA/ALSA GAP is the signal, not either number alone.",
  "- The data verdict now reads the pool as well as the card, and shows its",
  "  working: the two answers it gives are the RAW BEST, the strongest card in",
  "  the pack on win rate alone, and the CONTEXT BEST, the one that serves this",
  "  deck. When they differ, the gap between them is the lesson and the reasons",
  "  are listed for you — archetype fit, what a third colour costs in this set,",
  "  and how much of a card's win rate to believe.",
  "- It still cannot see everything. IWD and the ATA/ALSA gap are shown to you",
  "  and are NOT in the verdict, so a card whose row argues against its own win",
  "  rate is still yours to point out.",
  "",
  "Use these to justify a judgment. Do not recite them back at the player, and do",
  "not quote a number you were not given.",
].join("\n");

import type { Card, ColorCode } from "../model/card.js";

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

export function colorLabel(c: Card): string {
  if (c.colors.length === 0) return "Colorless";
  if (c.colors.length > 1) return c.colors.map((col) => COLOR_NAMES[col]).join("/");
  return COLOR_NAMES[c.colors[0]];
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
export const STAT_LEGEND = [
  "# Reading the card data",
  "",
  "Each card is shown with some of the following. They measure different things;",
  "do not read them as one ranking.",
  "",
  "- GIH — win rate of games where the card was drawn, with its sample size. This is",
  "  confounded by deck quality: a merely fine card in a strong archetype posts a",
  "  high GIH because the decks playing it win.",
  "- IWD — the same decks' win rate with the card drawn minus without it. Deck",
  "  quality cancels out, so this is the card's own contribution, in percentage",
  "  points. It runs structurally high for expensive, high-impact cards and near",
  "  zero for cheap efficient ones and lands, so it is a SECOND AXIS, not a better",
  "  ranking. A high GIH with a low IWD is a card riding its deck; a high IWD is a",
  "  card that wins games by itself.",
  "- ATA / ALSA — the mean pick the field takes it at, and the mean pick drafters",
  "  see it at. ALSA sits below ATA because a circulating card is seen by many",
  "  drafters early and taken by one late, so the SIZE OF THE GAP is the signal:",
  "  wide means it survives the table and can be expected to come back around,",
  "  near-zero means it is taken the moment it is seen and will not wheel.",
  "- maindecked — of the drafters who took it, how many played it. A low figure",
  "  means the GIH above was measured on a self-selected sample and deserves less",
  "  trust. Taken early AND rarely maindecked is the signature of a trap.",
  "- GP WR — win rate of decks containing the card, drawn or not. The most deck-",
  "  dominated number here and the weakest evidence about the card itself; when it",
  "  disagrees with IWD, believe IWD.",
  "",
  "The data verdict ranks the pack on GIH alone, so it can rate a card top of the",
  "pack while the rest of that card's row argues against it. When the card in",
  "question is maindecked far less than the others, or its IWD is flat while its",
  "GIH is high, say so — that disagreement is the most useful thing you can point",
  "out, and the verdict cannot see it.",
  "",
  "Use these to justify a judgment. Do not recite them back at the player, and do",
  "not quote a number you were not given.",
].join("\n");

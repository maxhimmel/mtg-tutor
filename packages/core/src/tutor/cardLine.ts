import type { Card, DisplayCard, ColorCode, PoolCard } from "../model/card.js";
import { CARD_STAT_GLOSSARY } from "./glossary.js";
import { setMechanicsOf } from "../model/mechanics.js";
import { phrasesOf } from "../model/mechanicMatch.js";

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

// A quantity that is ALREADY the gap between two win rates. Written in points
// rather than as a percentage because rendering it like the rates it came from
// is how "0.3pp better" reads as "0.3% win rate".
export const pp = (v: number) => `${Math.abs(v * 100).toFixed(1)}pp`;
export const signedPp = (v: number) => `${v >= 0 ? "+" : "-"}${pp(v)}`;

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

/**
 * A card's rules text, with the reminder text it does not need.
 *
 * Reminder text says again, in brackets, what a keyword already means, and it is
 * a third of the characters on a card with three keywords, repeated for every
 * card in every pack of a draft. The model knows what flying does.
 *
 * IT DOES NOT KNOW WHAT WARP DOES, and stripping every bracket is how the rule
 * three lines below this one -- say what a card does from its text and nothing
 * else, many of these sets are newer than you are -- became unfollowable. On a
 * card carrying a mechanic its own set introduced, the reminder is the only
 * definition present, and this was deleting it on 1,148 of the 1,614 such cards
 * in the pool. Worst on mom, sir and msh at 97%, which are exactly the sets a
 * model has never seen.
 *
 * So the strip is now selective: a reminder is kept when the text ahead of it
 * names a mechanic out of the corpus, and dropped otherwise. Measured across all
 * 26 sets that keeps 24.9% of reminder characters and still drops the three
 * quarters this exists for.
 *
 * The whole change -- kept reminders plus the bracketed sentences describeCard
 * adds where there was no reminder to keep -- moves 23.1% of the 7,724 cards in
 * the pool and lengthens the mean card line 211 -> 241 characters. On a coached
 * pick, which writes out six cards, that is about +46 tokens. Measured, not
 * estimated: the estimate was +14, because it counted the reminders and forgot
 * the sentences.
 *
 * Newlines become " / " so a card stays one line: describeCard's callers own the
 * indentation of the block a card sits in, and a multi-line card would break out
 * of it.
 */
export function rulesText(c: { oracleText: string }): string {
  return readRules(c).text;
}

/**
 * The rules text, and which set mechanics the card explained for itself.
 *
 * One pass, because the second question is decided by the first: a mechanic is
 * explained when the strip above chose to keep the bracket that follows it. Two
 * passes disagreeing is how a card ends up carrying the reminder AND our
 * sentence for the same mechanic, which is the same fact twice at the model's
 * expense.
 */
function readRules(c: { oracleText: string }): { text: string; explained: Set<string> } {
  const mechanics = setMechanicsOf(c);
  const phrases = mechanics.map((m) => ({ name: m.name, needles: phrasesOf(m).map((p) => p.toLowerCase()) }));
  const explained = new Set<string>();

  const text = c.oracleText
    .split("\n")
    .map((line) => {
      // A reminder belongs to whatever precedes it on its own line, which is how
      // the card is laid out and the only thing that ties the two together.
      let kept = "";
      let rest = line;
      for (;;) {
        const open = rest.indexOf("(");
        if (open < 0) break;
        const close = rest.indexOf(")", open);
        if (close < 0) break;
        const before = kept + rest.slice(0, open);
        const lower = before.toLowerCase();
        const owner = phrases.find((p) => p.needles.some((n) => lower.includes(n)));
        if (owner) explained.add(owner.name);
        kept = before + (owner ? rest.slice(open, close + 1) : " ");
        rest = rest.slice(close + 1);
      }
      return `${kept}${rest}`.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join(" / ");

  return { text, explained };
}

// The body, for a card that has one. A creature is its size as much as its cost.
function bodyOf(c: Card): string {
  if (c.loyalty != null) return ` [${c.loyalty} loyalty]`;
  if (c.power != null && c.toughness != null) return ` [${c.power}/${c.toughness}]`;
  return "";
}

// What the card IS. Every card the model is shown gets this, not just the picked
// one: rendering the rest as bare names is why the coach used to invent mana
// costs for cards it was reasoning about.
//
// Rules text is part of that and was the last thing missing. A type line says a
// card is an Artifact or an Enchantment, and nothing about whether it kills
// something -- so a coach handed only the type line answered from the NAME, and
// told a player that a removal spell "isn't removal" and that a mana rock that
// fixes five colours was "a generic mid-range artifact". The text is stored, it
// is already hydrated onto every card that reaches a prompt, and it was being
// dropped here.
export function describeCard(c: Card): string {
  const head = `${c.name} — ${c.cmc} mana, ${colorLabel(c)}, ${c.typeLine}${bodyOf(c)}`;
  const { text, explained } = readRules(c);
  const line = text ? `${head} — ${text}` : head;

  // What the card itself never says. The reminder is kept where there is one,
  // and on a great many cards there is not: LTR printed 45 distinct reminders
  // across 291 cards and none of them mentions the Ring, because those rules
  // shipped on a separate card in the booster. `one` keeps 2% of its reminder
  // characters for the same reason.
  //
  // Bracketed and named so the model can tell this apart from the card. It is
  // the app explaining a mechanic, not text anybody is holding, and a coach that
  // quotes it back as printed rules is worse than one that never had it.
  const missing = setMechanicsOf(c).filter((m) => !explained.has(m.name));
  if (missing.length === 0) return line;
  return `${line} [${missing.map((m) => `${m.name}: ${m.short}`).join(" ")}]`;
}

// What the DATA says. Absent stats are dropped rather than printed as "n/a": a
// set with thin data would otherwise spend most of a fifteen-line pack listing
// what it does not know. No sample-size guard is needed here -- build-set-stats
// already withholds iwd unless both halves of it cleared the floor.
// Reads the statistics half only, so anything drawable can be described --
// see DisplayCard. The prompts pass whole cards and are unaffected.
export function statLine(c: DisplayCard): string {
  const parts: string[] = [];

  if (c.gihWinRate != null) {
    const n = c.gihGames != null ? ` (n ${count(c.gihGames)})` : "";
    parts.push(`GIH ${pct(c.gihWinRate)}${n}`);
  }
  // Percentage POINTS, with a sign. It is the gap between two rates, and
  // formatting it like the rates above would read as one.
  if (c.iwd != null) {
    parts.push(`IIH ${c.iwd >= 0 ? "+" : ""}${(c.iwd * 100).toFixed(1)}pp`);
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
  "- A high GIH with a flat IIH is a card riding its deck; a high IIH is a card",
  "  that wins games by itself.",
  "- The SIZE OF THE ATA/ALSA GAP is the signal, not either number alone.",
  "- The data verdict now reads the pool as well as the card, and shows its",
  "  working: the two answers it gives are the RAW BEST, the strongest card in",
  "  the pack on win rate alone, and the CONTEXT BEST, the one that serves this",
  "  deck. When they differ, the gap between them is the lesson and the reasons",
  "  are listed for you — what the archetype wants, what a third colour costs in",
  "  this set, and how much of a card's win rate to believe.",
  "- It still cannot see everything. IIH and the ATA/ALSA gap are shown to you",
  "  and are NOT in the verdict, so a card whose row argues against its own win",
  "  rate is still yours to point out.",
  "",
  "Use these to justify a judgment. Do not recite them back at the player, and do",
  "not quote a number you were not given.",
].join("\n");

import type { Card, PoolCard } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import { gapMargin } from "../scoring/score.js";
import { type PickDefense, confidenceLevel } from "./challenge.js";
import { colorLabel, describeCard, pct, pp, signedPp, statLine } from "./cardLine.js";
import { type Pivot, commitmentLine, pivotLines, situationLine } from "./situation.js";

// Renders a single draft pick into a compact prompt for the coach. Pure string
// work (no SDK), so a future web frontend can reuse it as-is.

function summarizePool(pool: readonly PoolCard[]): string {
  if (pool.length === 0) return "  (empty — this is your first pick)";
  const groups = new Map<string, string[]>();
  for (const c of pool) {
    const key = colorLabel(c);
    const list = groups.get(key) ?? [];
    list.push(c.name);
    groups.set(key, list);
  }
  return [...groups]
    .map(([label, names]) => `  ${label}: ${names.join(", ")}`)
    .join("\n");
}

// Writes cards into a prompt, so it wants them whole: describeCard names the
// mana value and type line, and statLine reads the numbers that sit beside a
// win rate. Hydrated from the text table before it gets here.
//
// `poolBefore` is what the player is building; `benched` is what they drafted
// and then set aside. Splitting them is the whole point of a sideboard taken
// during a draft: a speculative red rare the player has since given up on
// should stop counting as a red commitment, and should stop being the thing the
// next pick is judged against.
// What the player said before any of the above was shown to them.
//
// The one thing in the whole prompt the model can read that no deterministic
// path can: a sentence in their own words. It goes in ABOVE the data verdict
// because that is the order it happened in, and because a coach that reads the
// answer first and the reasoning second grades the reasoning against the answer.
function defenseBlock(defense: PickDefense, picked: Card): string {
  const level = confidenceLevel(defense.confidence);
  const outcome = defense.challengedName
    ? defense.switched
      ? `Shown ${defense.challengedName} with no verdict attached, they changed their pick to it.`
      : `Shown ${defense.challengedName} with no verdict attached, they stood by ${picked.name}.`
    : null;

  return [
    "Before seeing any of the verdict below, the player committed to this pick and defended it.",
    `  In their words: "${defense.reason.trim()}"`,
    `  How sure they said they were: ${level.label} — claiming ${level.claim}.`,
    outcome ? `  ${outcome}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function buildPickContext(
  rec: RecordedPick<Card>,
  poolBefore: readonly PoolCard[],
  benched: readonly PoolCard[] = [],
  pivots: readonly Pivot[] = [],
  defense?: PickDefense,
): string {
  const { picked, score, pack } = rec;
  // The pool the player is looking at includes what they just took; the
  // commitments they were judged against do not. Both come from `poolBefore` so
  // the two cannot drift apart.
  const pool = [...poolBefore, picked];

  const others = pack
    .filter((c) => c.name !== picked.name)
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0));
  const shown = others.slice(0, 4);
  // The verdict names the context-best card, and a top-four-by-win-rate listing
  // can leave it out -- fitting a deck is not the same ranking as raw power, so
  // the one card the answer is most likely to be about was the one the model
  // might have nothing but a name for.
  const ctxBest = others.find((c) => c.name === score.contextBest.name);
  if (ctxBest && !shown.includes(ctxBest)) shown.push(ctxBest);

  const passed = shown.map((c) => `  - ${describeCard(c)}\n    ${statLine(c)}`).join("\n");

  // Both answers, always, because the gap between them is the lesson. Naming
  // the raw best even when the player took it is what lets the coach say "the
  // strongest card here was also the right one" rather than leaving the model
  // to guess whether they diverged.
  const divergence =
    score.contextBest.name === score.rawBest.name
      ? `The strongest card in the pack was also the best one for this deck: ${score.rawBest.name}.`
      : `Strongest card in the pack: ${score.rawBest.name} ` +
        `(GIH WR ${pct(score.rawBest.gihWinRate)}). Best for THIS deck: ${score.contextBest.name}.`;

  // How big the miss was, and how much of it the data can actually resolve.
  //
  // The grade is `100 - gap * k`, so naming a better card without the gap left
  // the model unable to tell a rout from a rounding error -- and it read every
  // divergence as a rout. A 98/100 pick came back as "take the other card
  // instead" over 0.3pp, against error bars three times that wide on the two
  // win rates it was the difference of.
  //
  // WHETHER THE GAP IS REAL COMES OFF THE SCORE, NOT FROM A THIRD OPINION
  //
  // This recomputed it with `gapMargin`, which made three places in the app
  // deciding one question: the grade (server, from `CardContext.se`), the
  // verdict panel, and here. Two of those disagreeing is what put a "the data
  // cannot tell these apart" sentence under a 94/100 -- so the prompt now reads
  // `score.indistinguishable` and the size of the bars is all `gapMargin` is
  // still asked for.
  const gap = score.contextBestValue - score.pickedContextValue;
  const margin = gapMargin(score.contextBest, picked);
  const gapLine = score.isBest
    ? null
    : `${score.contextBest.name} was worth ${pp(gap)} more to this deck than ` +
      `${picked.name}` +
      (margin == null
        ? "."
        : score.indistinguishable
          ? `, against a ±${pp(margin)} margin of error on those win rates. The gap is ` +
            `INSIDE the margin: the data cannot tell these two cards apart, and the ` +
            `pick is not marked down for it.`
          : `, against a ±${pp(margin)} margin of error on those win rates.`);

  // What the deck wanted out of a tie the data could not settle, in the corpus's
  // own terms. The model already cites principle ids in its answers and is given
  // the whole corpus to cite from, so handing it the one the app itself acted on
  // keeps the two from arguing -- the alternative is a coach explaining a pick
  // the app preferred for a reason it was never told.
  //
  // Only when a principle actually decided something. `reasons` is empty when
  // the float and the deck agreed, and a citation there would credit a rule that
  // had no part in it.
  const deckWanted =
    score.preferred && score.reasons.length > 0
      ? `Of the cards the data cannot separate here, ${score.preferred.name} is the one ` +
        `this deck wanted: ${score.reasons[0].note} [${score.reasons[0].principle}].`
      : null;

  const verdict = [
    score.isBest
      ? `${score.score}/100 (${score.grade}) — you took the best card for this deck.`
      : `${score.score}/100 (${score.grade}), rank ${score.rankInPack} of ${pack.length} on raw power.`,
    gapLine,
    deckWanted,
    divergence,
    // Only the reasons that moved this pick, so the model is not handed a
    // column of zeroes to read meaning into.
    score.terms.length > 0
      ? `Why ${picked.name} is worth what it is here: ` +
        score.terms.map((t) => `${t.label} ${signedPp(t.delta)}`).join(", ") +
        "."
      : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return [
    situationLine(rec.packNo, rec.pickNo, pack.length),
    commitmentLine(poolBefore, picked),
    pivotLines(pivots),
    "",
    `Your pool so far (${pool.length} cards):`,
    summarizePool(pool),
    "",
    // Only when there is one. An empty sideboard is the normal case and a line
    // saying so would be a rule the model has to hold for nothing.
    benched.length > 0
      ? `Sideboard (${benched.length} cards) — drafted, then set aside. The player is NOT ` +
        `building with these, so do not count them toward their colors or their curve:\n` +
        `${summarizePool(benched)}\n`
      : null,
    `You picked: ${describeCard(picked)}`,
    `  ${statLine(picked)}`,
    "",
    defense ? `${defenseBlock(defense, picked)}\n` : null,
    `Data verdict: ${verdict}`,
    "",
    // Null rather than "" so dropping an empty pack list does not also drop the
    // blank lines above -- each entry now spans two lines, and run together they
    // read as one block instead of five labelled sections.
    passed ? `Other cards in the pack:\n${passed}` : null,
    "",
    // Two different jobs, said out loud. Without the second sentence the model
    // reads the player's words as colour and coaches the card anyway, which is
    // the whole thing this flow exists to stop.
    defense ? "Coach this pick AND the reasoning they gave for it." : "Coach this pick.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

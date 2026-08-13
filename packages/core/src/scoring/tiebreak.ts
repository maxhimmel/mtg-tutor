import type { Card } from "../model/card.js";
import { isLand } from "../model/card.js";
import { CURVE_TOP, castingValue } from "../model/mana.js";
import { detectRole } from "./explain.js";

// What to prefer when the data has run out of opinions.
//
// THE ONE PLACE A PRINCIPLE IS ALLOWED TO DECIDE ANYTHING
//
// Everything else this app scores with is a measured win rate carried in its own
// units. That is deliberate and it is why `contextValue` refuses terms whose
// magnitude nobody can derive -- IWD is stored and unscored for exactly that
// reason, and a weight search against trophy pick rate was rejected for finding
// a number rather than a fact.
//
// `gapMargin` marks out the one region where that discipline says nothing at
// all. Two cards inside one standard error of each other are, on the evidence,
// the same card: the scorer is not being modest there, it is being precise about
// having no answer. A rule that acts ONLY inside that band cannot overrule a
// measurement, because there is no measurement left to overrule.
//
// So this returns an ORDER, never a number. Nothing here is added to a value,
// nothing is weighted against anything, and no score moves -- which is what lets
// it use the principles corpus honestly. A magnitude would need a derivation the
// corpus cannot supply; a preference between two cards the data has declared
// equal needs only a reason, and the corpus is made of reasons.
//
// WHY THE ANSWER CARRIES ITS PRINCIPLE IDS
//
// The app already cites principles: the coach does it in every verdict and
// `/principles` publishes the corpus. A tiebreak that said "take this one" with
// no citation would be the app's one unexplained opinion. Naming the ids makes
// it checkable by the player and, more to the point, LEARNABLE -- "your curve is
// thin at two and this is a two-drop [CURVE-04]" is a lesson, where "these are
// indistinguishable" is a shrug.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not read colour or archetype fit. `contextValue` already prices both,
// per set, in win-rate points -- so a card inside the band has already been
// charged for its colours and a second opinion here would be paying twice for
// one fact, in a unit nobody derived. What is left is exactly what the stored
// data cannot see: how the deck's curve and its roles are filling up.

/**
 * The counts a Limited deck is aiming at, from the corpus rather than from
 * taste. Each is cited, and each is used only to answer "is this deck SHORT of
 * something" -- never to price how short.
 */
export const DECK_TARGETS = {
  /** DECK-06: most decks want 15-18 creatures; DECK-08 says 16-18. */
  creatures: 16,
  /** DECK-08: 3-4 removal spells. */
  removal: 3,
  /**
   * CURVE-01: 7-12 cards at 1-2 mana, median around seven two-drops. Read as a
   * floor on the cheap half of the curve, which is the half a pool actually runs
   * short of -- nobody finishes a draft short of five-drops.
   */
  cheap: 7,
  /** CURVE-03: about 85% of decks run five or fewer cards at 5+ mana. */
  expensive: 5,
} as const;

/** Which curve bucket a card lands in, by the turn you can cast it. */
const turnOf = (card: Card) => Math.min(CURVE_TOP, Math.max(1, Math.ceil(castingValue(card))));

/**
 * What the deck still wants, as a set of unmet needs.
 *
 * SCALED BY HOW MUCH DRAFT IS LEFT, which is what makes a count comparable to a
 * target mid-draft. A pool of eight cards is not short sixteen creatures; it is
 * on pace or it is not, and being on pace is `target * picksMade / totalPicks`.
 * Without that every deck reads as short of everything until pack 3 and the
 * tiebreak says the same thing at every pick, which is the same as saying
 * nothing.
 *
 * `expensive` is a CEILING rather than a floor, so it is the one need that is
 * met by NOT taking something -- a deck already at its top-end limit needs cheap
 * cards, which is CURVE-03 and CURVE-02 pointing the same way.
 */
export interface DeckNeeds {
  creatures: boolean;
  removal: boolean;
  /** Short of one- and two-drops for where the draft has got to. */
  cheap: boolean;
  /** Already at or past the top-end limit, so another expensive card is a cost. */
  toppedOut: boolean;
  /** Curve turns with nothing on them at all, which CURVE-04 is about. */
  emptyTurns: ReadonlySet<number>;
}

export function deckNeeds(
  maindeck: readonly Card[],
  picksMade: number,
  totalPicks: number,
): DeckNeeds {
  const spells = maindeck.filter((c) => !isLand(c));
  const pace = totalPicks > 0 ? Math.min(1, picksMade / totalPicks) : 0;
  // What the finished deck aims at, discounted to where this draft has got to.
  const onPace = (target: number) => target * pace;

  let creatures = 0;
  let removal = 0;
  let cheap = 0;
  let expensive = 0;
  const filled = new Set<number>();

  for (const c of spells) {
    const turn = turnOf(c);
    filled.add(turn);
    if (turn <= 2) cheap++;
    if (turn >= 5) expensive++;
    const role = detectRole(c);
    if (role === "creature" || role === "evasion") creatures++;
    if (role === "removal") removal++;
  }

  // Only the turns a deck is actually built on. Six-plus is where a curve tapers
  // rather than a hole to fill (CURVE-03), so an empty one is not a need.
  const emptyTurns = new Set<number>();
  for (let turn = 1; turn <= 4; turn++) if (!filled.has(turn)) emptyTurns.add(turn);

  return {
    creatures: creatures < onPace(DECK_TARGETS.creatures),
    removal: removal < onPace(DECK_TARGETS.removal),
    cheap: cheap < onPace(DECK_TARGETS.cheap),
    toppedOut: expensive >= DECK_TARGETS.expensive,
    emptyTurns,
  };
}

/** One reason a card was preferred, in the corpus's own terms. */
export interface TiebreakReason {
  /** Principle id, e.g. "CURVE-07". Cited exactly as the coach cites them. */
  principle: string;
  /** What it says about THIS card and THIS deck, ready to render. */
  note: string;
}

export interface Tiebreak<C extends Card = Card> {
  card: C;
  /** Empty when nothing separated the band and the first card simply stood. */
  reasons: TiebreakReason[];
}

/**
 * What a card does for this deck: the needs it meets, and the ones it makes
 * worse.
 *
 * The two are kept apart because they explain from opposite ends. A card is
 * preferred FOR what it meets, and preferred over a rival for what the RIVAL
 * costs -- so a winner with no merits of its own still has something true to
 * say, and it is a fact about the card it beat.
 *
 * Evasion counts as a creature and not as a second thing, because EVAL-04 values
 * it as a property of a body rather than as a role of its own -- counting it
 * twice would let a flier beat a better-fitting card on a technicality.
 */
interface CardFit {
  met: TiebreakReason[];
  penalties: TiebreakReason[];
}

function fitOf(card: Card, needs: DeckNeeds): CardFit {
  const met: TiebreakReason[] = [];
  const penalties: TiebreakReason[] = [];
  if (isLand(card)) return { met, penalties };

  const role = detectRole(card);
  const turn = turnOf(card);

  if (needs.creatures && (role === "creature" || role === "evasion")) {
    met.push({
      principle: "DECK-06",
      note: "your deck is light on creatures for this stage of the draft",
    });
  }
  if (needs.removal && role === "removal") {
    met.push({ principle: "DECK-08", note: "you are short of removal" });
  }
  if (needs.emptyTurns.has(turn)) {
    met.push({ principle: "CURVE-04", note: `nothing in your deck comes down on turn ${turn}` });
  } else if (needs.cheap && turn <= 2) {
    met.push({ principle: "CURVE-01", note: "your curve is thin at the cheap end" });
  }
  if (needs.toppedOut && turn >= 5) {
    penalties.push({
      principle: "CURVE-03",
      note: `you already have ${DECK_TARGETS.expensive} cards at five or more mana`,
    });
  }
  return { met, penalties };
}

// Counting, not weighting: every principle in the corpus is stated as a rule
// rather than as a quantity, so treating one as worth 1.4 of another would be
// inventing the very number this module exists to avoid.
const tally = (fit: CardFit) => fit.met.length - fit.penalties.length;

/**
 * The card to prefer out of a band the data cannot separate.
 *
 * CURVE-07 -- the Martin Juza rule, take the cheaper of two equal cards -- is
 * the last word rather than the first, and that ordering comes from the corpus
 * describing itself. SIG-16 and EVAL-10 both say the tiebreaker between
 * otherwise-equal cards is the DECK, so the needs above are read first;
 * CURVE-07 is what is left when the deck has no opinion either. Applying it
 * first would let a two-mana card the deck does not want beat a four-drop that
 * fills its only empty turn.
 *
 * Ties past that hold the incoming order, so the caller's own ranking survives
 * and this is never the reason two runs disagree.
 */
export function tiebreak<C extends Card>(band: readonly C[], needs: DeckNeeds): Tiebreak<C> {
  if (band.length === 0) throw new Error("tiebreak needs at least one card");

  const scored = band.map((card) => ({ card, fit: fitOf(card, needs) }));

  let best = scored[0];
  for (const entry of scored.slice(1)) {
    const better =
      tally(entry.fit) > tally(best.fit) ||
      // CURVE-07, and only once the deck has said nothing to separate them.
      (tally(entry.fit) === tally(best.fit) &&
        castingValue(entry.card) < castingValue(best.card));
    if (better) best = entry;
  }

  // The explanation is assembled from whatever actually did the deciding, and
  // that is not always a property of the winner. Three cases, in the order they
  // can be true.
  let reasons = best.fit.met;

  // A card can win purely because its rivals were penalised -- it fills no need,
  // it simply does not deepen a top end that is already full. The true sentence
  // there is about the card it BEAT, and without this the winner arrived with
  // nothing to say and CURVE-07 took credit for a decision it did not make.
  if (reasons.length === 0) {
    const rivalPenalties = scored
      .filter((e) => e.card.name !== best.card.name)
      .flatMap((e) => e.fit.penalties);
    const own = new Set(best.fit.penalties.map((p) => p.principle));
    const decided = rivalPenalties.filter((p) => !own.has(p.principle));
    if (decided.length > 0) reasons = [decided[0]];
  }

  // And cheapness last, cited only when it did decide: a card that won on deck
  // needs did not win for being cheap. The condition is that something in the
  // band was dearer -- if everything costs the same, being cheapest decided
  // nothing either.
  if (reasons.length === 0 && band.some((c) => castingValue(c) > castingValue(best.card))) {
    reasons = [
      { principle: "CURVE-07", note: "nothing else separates these, so take the cheaper one" },
    ];
  }

  return { card: best.card, reasons };
}

/**
 * The cards a pick cannot be told apart from, by the app's own error bars.
 *
 * `within` is one standard error on the gap between two rated cards -- the same
 * quantity `gapMargin` returns, passed in rather than recomputed so this module
 * never has to decide what "the same" means. A pair where either card is unrated
 * has no margin at all and is therefore NOT in the band: saying two cards are
 * indistinguishable is a claim about data, and there is none there to make it
 * with. `challengeFor` already draws that line the same way.
 */
export function indistinguishable<C extends Card>(
  ranked: readonly { card: C; value: number }[],
  marginBetween: (a: C, b: C) => number | undefined,
): C[] {
  if (ranked.length === 0) return [];
  const top = ranked[0];
  const band = [top.card];
  for (const other of ranked.slice(1)) {
    const margin = marginBetween(top.card, other.card);
    if (margin != null && top.value - other.value <= margin) band.push(other.card);
  }
  return band;
}

import type { Card } from "../model/card.js";
import { gapMargin } from "../scoring/score.js";
import { type ScoringContext, contextValue } from "../scoring/context.js";
import { pp } from "./cardLine.js";

// Making the player commit to a position before they are shown the answer.
//
// The coach used to narrate a pick that had already happened, which is a thing
// you absorb or do not. This is the other order: the pick is proposed, defended,
// argued with, and only then graded. Everything here is pure and deterministic
// -- the challenge itself spends no tokens, because the strongest argument
// against a pick is another card from the same pack with its verdict withheld.

/**
 * How sure the player says they are.
 *
 * Three levels, and not because three is a nice number: each one is a
 * FALSIFIABLE CLAIM ABOUT THE MARGIN, which is the only thing on this pick the
 * data can settle. `gapMargin` says whether two cards are separable at all, so
 * "this is clearly right" and "this is close" are the two sides of that one
 * question and "I don't know" is the refusal to answer it. A scale with more
 * gradations than the data has answers would be a slider nobody could grade.
 */
export type Confidence = "sure" | "close" | "guess";

export interface ConfidenceLevel {
  id: Confidence;
  /** What the player picks. */
  label: string;
  /** The claim it makes, spelled out. Shown under the control and written into
   *  the prompt, so the player is never graded against a claim they were not
   *  told they were making. */
  claim: string;
}

export const CONFIDENCE: readonly ConfidenceLevel[] = [
  {
    id: "sure",
    label: "Clear",
    claim: "the gap to the next-best card is bigger than the data's margin of error",
  },
  {
    id: "close",
    label: "Close",
    claim: "the gap to the next-best card is inside the data's margin of error",
  },
  { id: "guess", label: "Guessing", claim: "no claim about the gap either way" },
];

export const confidenceLevel = (id: Confidence): ConfidenceLevel =>
  CONFIDENCE.find((c) => c.id === id) ?? CONFIDENCE[2];

/** The card put up against theirs, and what separates the two. */
export interface Challenge<C extends Card = Card> {
  challenger: C;
  /**
   * `contextValue(challenger) - contextValue(proposed)`, in win-rate points.
   * Positive means the challenger is genuinely the better card for this deck.
   */
  gap: number;
  /** One standard error on that gap. Undefined when either card is unrated --
   *  a rarity baseline has no sample to have error bars over. */
  margin?: number;
  /** Whether the data can tell the two cards apart at all. */
  separable: boolean;
}

/**
 * The card to argue the player's pick against.
 *
 * Always the best card in the pack that is not the one they proposed, by
 * `contextValue` -- so when they have taken the context-best it is the
 * runner-up, and when they have not it is the context-best itself.
 *
 * That single rule is what keeps the challenge from leaking its own answer. If
 * being challenged only ever happened when the player was wrong, the challenge
 * would BE the verdict and the honest play would be to switch every time. Under
 * this rule the challenger wins exactly as often as the player is wrong, which
 * is a rate they cannot read anything off.
 *
 * Undefined when there is nothing to argue with -- a pack down to one card.
 */
export function challengeFor<C extends Card>(
  pack: readonly C[],
  proposed: C,
  ctx: ScoringContext,
): Challenge<C> | undefined {
  const others = pack.filter((c) => c.name !== proposed.name);
  if (others.length === 0) return undefined;

  const valued = others.map((c) => ({ card: c, value: contextValue(c, ctx).value }));
  const top = valued.reduce((a, b) => (b.value > a.value ? b : a));

  const gap = top.value - contextValue(proposed, ctx).value;
  const margin = gapMargin(top.card, proposed);
  return {
    challenger: top.card,
    gap,
    margin,
    // An unmeasurable margin is not a tie. Saying two cards are
    // indistinguishable is a claim about the data, and there is no data here to
    // make it with, so the pair stays separable and the reading below says the
    // margin is unknown rather than inventing one.
    separable: margin == null || Math.abs(gap) > margin,
  };
}

/** What the challenged pair did once the pick was actually made. */
export interface ChallengeOutcome {
  /** The player finally took the card they first proposed. */
  stood: boolean;
  /** `contextValue(taken) - contextValue(the other one)`, win-rate points. */
  edge: number;
  margin?: number;
  separable: boolean;
}

export function resolveChallenge<C extends Card>(
  challenge: Challenge<C>,
  stood: boolean,
): ChallengeOutcome {
  return {
    stood,
    // The gap is measured challenger-minus-proposed, so standing flips its sign
    // and switching keeps it. One subtraction, read from either end.
    edge: stood ? -challenge.gap : challenge.gap,
    margin: challenge.margin,
    separable: challenge.separable,
  };
}

/**
 * Whether the confidence they stated survived contact with the data.
 *
 * "none" is not a middle grade, it is the absence of a claim: someone who said
 * they were guessing has said nothing that can be wrong, and pretending
 * otherwise would punish the one honest answer on the control.
 */
export type ClaimOutcome = "held" | "broke" | "none";

export function claimOutcome(confidence: Confidence, o: ChallengeOutcome): ClaimOutcome {
  if (confidence === "guess") return "none";
  // "Clear" claims a gap the data can see, in your favour. "Close" claims one it
  // cannot see at all -- so the same measurement settles both, from either side.
  if (confidence === "sure") return o.separable && o.edge > 0 ? "held" : "broke";
  return o.separable ? "broke" : "held";
}

/**
 * The reading of that outcome, in one sentence.
 *
 * Shared by the reveal and the prompt for the same reason `isOnColor` is shared
 * by the score and the sentence describing it: the panel and the coach saying
 * different things about the same pick is the bug this most easily hides.
 *
 * Never states a gap without its margin, and never states a margin it does not
 * have -- an unrated card leaves the size of the miss genuinely unknown, and
 * that is what it says.
 */
export function calibrationLine(confidence: Confidence, o: ChallengeOutcome): string {
  const size =
    o.margin == null
      ? `${pp(Math.abs(o.edge))}, with no margin available — one of these cards is unrated`
      : `${pp(Math.abs(o.edge))} against a ±${pp(o.margin)} margin of error`;

  if (!o.separable) {
    const tie = `The two cards are ${size} apart: the data cannot tell them apart.`;
    if (confidence === "close") return `${tie} You read that correctly.`;
    if (confidence === "sure") {
      return `${tie} Being certain was not available here — whichever you took, it was not the clear call you said it was.`;
    }
    return `${tie} There was nothing here to know, so guessing was the right answer.`;
  }

  const ahead = o.edge > 0;
  const stated = ahead
    ? `You took the better of the two by ${size}.`
    : `The other card was worth ${size} more to this deck.`;

  if (confidence === "sure") {
    return ahead
      ? `${stated} You said it was clear, and it was.`
      : `${stated} You said it was clear, and it was clearly the other way.`;
  }
  if (confidence === "close") {
    return ahead
      ? `${stated} You called it close; the data can actually separate these.`
      : `${stated} You called it close, and the data separates them — this one was gettable.`;
  }
  return ahead
    ? `${stated} You said you were guessing, and you were right anyway.`
    : `${stated} You said you were guessing, and this one was there to be read.`;
}

/**
 * What the player committed to before they saw anything.
 *
 * One shape, stored on the pick and written into the prompt, so the row and the
 * coach cannot describe the same moment differently.
 */
export interface PickDefense {
  /** Their own words. The only thing here a model can read that nothing else can. */
  reason: string;
  confidence: Confidence;
  /** The card put up against theirs. Absent when the pack was too small to
   *  challenge, or when the flow was skipped. */
  challengedName?: string;
  /** They were shown the challenger and changed their pick. */
  switched: boolean;
}

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

// Each label names the GAP, because "Clear" on its own does not. A player read
// it as "how obvious is this choice to me" -- which is the one reading the data
// cannot grade, and the reveal then told them their certainty was misplaced over
// a question they had not answered. The claim underneath was correct and was not
// enough: the shortest word on the control is the one that gets read.
export const CONFIDENCE: readonly ConfidenceLevel[] = [
  {
    id: "sure",
    label: "Clear gap",
    claim: "the gap to the next-best card is bigger than the data's margin of error",
  },
  {
    id: "close",
    label: "Close call",
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
  /**
   * The card theirs was argued against.
   *
   * Carried on the outcome rather than looked up beside it because
   * `calibrationLine` is the only prose in the app that describes this pair, and
   * without a name it could only say "the two cards" -- which reads, to the
   * player who has just been told a gap they cannot see the other end of, as the
   * app declining to say what it compared them to.
   */
  challengerName: string;
  /**
   * `contextValue(proposed) - contextValue(challenger)`, in win-rate points.
   *
   * The card they PROPOSED, whichever one they ended up taking, because that is
   * the card the confidence was a claim about. Reading it from the card they
   * finished with congratulates the player who says "this is clearly right", is
   * shown the card that beats it, switches, and is told they read it correctly.
   * They did not: they were wrong and then recovered, which is a different thing
   * and a better one to be told.
   */
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
    challengerName: challenge.challenger.name,
    // The gap is measured challenger-minus-proposed, and the claim was about the
    // proposed card, so this is that one subtraction read from the other end.
    // Deliberately independent of `stood` -- see the field's note.
    edge: -challenge.gap,
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
  // "Clear" claims a gap the data can see, in favour of the card they named.
  // "Close" claims one it cannot see at all -- so the same measurement settles
  // both, from either side. Neither is affected by what they did next: changing
  // your mind is a separate act with its own reading, and folding it in here
  // would let a good recovery erase a bad call.
  if (confidence === "sure") return o.separable && o.edge > 0 ? "held" : "broke";
  return o.separable ? "broke" : "held";
}

/**
 * The reading of that outcome, in two sentences at most: what the data says
 * about the pair, and what the player's own two decisions were worth.
 *
 * There ARE two decisions and they are graded apart. The confidence was a claim
 * about the card first named; standing or switching is a second act on top of
 * it, and the interesting cells are the ones where they disagree -- someone
 * certain who then changed their mind and was right to, and someone who had the
 * better card and talked themselves out of it.
 *
 * Never states a gap without its margin, and never states a margin it does not
 * have -- an unrated card leaves the size of the miss genuinely unknown, and
 * that is what it says.
 *
 * It also never says "the two cards". Half of this pair is named on the panel
 * directly above -- it is the card they took -- and the other half is the one
 * the sentence exists to tell them about, so that is the one it names.
 */
export function calibrationLine(confidence: Confidence, o: ChallengeOutcome): string {
  // The amount and its error bars are assembled separately so the margin clause
  // can sit at the END of whichever sentence it lands in. Baked into one phrase
  // it stranded the verb: "worth 4.0pp against a ±1.0pp margin of error more".
  const amount = pp(Math.abs(o.edge));
  const bars =
    o.margin == null
      ? ", with no margin available — one of these cards is unrated"
      : `, against a ±${pp(o.margin)} margin of error`;

  const other = o.challengerName;

  if (!o.separable) {
    const tie = `The gap to ${other} is ${amount}${bars}: the data cannot tell the two apart.`;
    const move = o.stood ? "" : " Switching neither gained nor lost anything the data can see.";
    if (confidence === "close") return `${tie} You read that correctly.${move}`;
    if (confidence === "sure") {
      return `${tie} Being certain was not available here — whichever you took, it was not the clear call you said it was.${move}`;
    }
    return `${tie} There was nothing here to know, so guessing was the right answer.${move}`;
  }

  // Positive means the card they NAMED was the better one, which is what makes
  // standing and switching read so differently below.
  const named = o.edge > 0;
  const stated = named
    ? o.stood
      ? `You took the card worth ${amount} more than ${other}${bars}.`
      : `The card you named first was worth ${amount} more than ${other}${bars} — and you moved off it.`
    : o.stood
      ? `${other} was worth ${amount} more to this deck${bars}.`
      : `Switching was right: ${other} was worth ${amount} more${bars}.`;

  if (confidence === "sure") {
    if (named) {
      return o.stood
        ? `${stated} You said it was clear, and it was.`
        : `${stated} You said it was clear and you were right; the challenge is what talked you out of it.`;
    }
    return o.stood
      ? `${stated} You said it was clear, and it was clearly the other way.`
      : `${stated} The certainty was misplaced, but you changed your mind and that is what saved the pick.`;
  }
  if (confidence === "close") {
    if (named) {
      return o.stood
        ? `${stated} You called it close; the data can actually separate these.`
        : `${stated} You called it close, and the data separates them — you had it and let it go.`;
    }
    return o.stood
      ? `${stated} You called it close, and the data separates them — this one was gettable.`
      : `${stated} You called it close, and the data separates them — the change of mind got there.`;
  }
  if (named) {
    return o.stood
      ? `${stated} You said you were guessing, and you were right anyway.`
      : `${stated} You said you were guessing, and the guess was the better card.`;
  }
  return o.stood
    ? `${stated} You said you were guessing, and this one was there to be read.`
    : `${stated} You said you were guessing, and switching found it.`;
}

/**
 * How long a stated reason may be.
 *
 * Lives here rather than in the textarea because it is not a form constraint --
 * it is a token budget. The reason is pasted verbatim into the coach prompt on
 * every decision pick, so an unbounded one is unbounded spend, and a field the
 * server does not clamp is a field the client's cap does not actually enforce.
 * Both ends read this.
 *
 * Long enough for a real reason, short enough that it has to be the actual one.
 */
export const REASON_LIMIT = 140;

/** Trims and caps a stated reason. The server's last word on prompt size. */
export const clampReason = (reason: string): string =>
  reason.trim().slice(0, REASON_LIMIT);

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

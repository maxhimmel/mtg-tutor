import type { Card } from "../model/card.js";
import { gapMargin } from "../scoring/score.js";
import { type ScoringContext, contextValue } from "../scoring/context.js";
import { type TiebreakReason, indistinguishable, tiebreak } from "../scoring/tiebreak.js";
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
   * Why THIS card, when more than one was equally good.
   *
   * Empty in the ordinary case, where the challenger is the best remaining card
   * by a margin the data can see and there was nothing to choose. Non-empty only
   * when several cards were statistically indistinguishable and a principle
   * settled it -- see `tiebreak`. Carried rather than recomputed by the screen,
   * because the reason has to be the one that actually picked the card.
   */
  reasons: TiebreakReason[];
  /**
   * The whole pack's context-best BY VALUE ALONE, which is not always the card
   * put up.
   *
   * Its only job is to be checked against the card the server graded against, so
   * the reveal can drop a calibration reading rather than score a player's stated
   * certainty over a pair the server has since contradicted.
   *
   * It has to be carried rather than derived from `challenger`, and that is the
   * whole reason it exists. The caller used to reconstruct it -- "the challenger
   * was the best card that was not the proposed one, so the whole-pack best is
   * whichever of those two is higher" -- which was true until `tiebreak` could
   * put up a card that is inside the band but not the float's maximum. Then the
   * reconstruction named a card the server would never name, the check failed,
   * and the reveal silently dropped the very block it had just gained a sentence
   * in. Computed here, beside the values it is about.
   */
  contextBestName: string;
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
 * WHEN SEVERAL CARDS ARE EQUALLY BEST, WHICH IS OFTEN
 *
 * `contextValue` returns a float, so it always has a strict maximum -- but the
 * gaps at the top of a pack are routinely smaller than the error bars on them,
 * and then "the best remaining card" is a card the data picked by coin flip. It
 * was still a defensible challenger; it was just an arbitrary one, and it went
 * on the screen with no way to say why.
 *
 * The choice inside that band is made by `tiebreak` against `ctx.needs`, and the
 * reason comes with it. This is the only place in the app a principle decides
 * anything, and it is confined to where the measurement has abstained -- see the
 * header of `scoring/tiebreak.ts` for why that confinement is the whole
 * argument.
 *
 * The needs come off the CONTEXT rather than a parameter, and that is not tidying.
 * As an argument they were the browser's to supply and nobody else's, so the
 * grade and the challenge ranked the same pack by two different rules and said
 * so on screen three times. `packScoringContext` builds one context for both
 * sides; needs living on it is what makes the two answers the same answer.
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

  let challenger = top.card;
  let reasons: TiebreakReason[] = [];
  {
    // Ranked before banding, because `indistinguishable` measures every
    // candidate against the top one and needs to know which that is.
    const ranked = [...valued].sort((a, b) => b.value - a.value);
    const band = indistinguishable(ranked, gapMargin);
    if (band.length > 1) {
      const broken = tiebreak(band, ctx.needs);
      challenger = broken.card;
      // Only when the principle actually CHANGED the answer. Measured over
      // 35,916 real challenged picks on fdn, a band forms and a principle has
      // something to say on 42.5% of them -- but on 20.4% it names the card the
      // float had already chosen, and there "put up BECAUSE your curve is thin"
      // is not true. The principle agreed; it did not decide.
      //
      // The same rule `tiebreak` applies to CURVE-07 internally, one level out:
      // a reason is only worth stating when it did the deciding.
      if (broken.card.name !== top.card.name) reasons = broken.reasons;
    }
  }

  // Against the card actually put up, never against the float's winner -- the
  // gap, the margin and the separability all have to describe the pair the
  // player is shown, or the calibration line grades a comparison nobody saw.
  const proposedValue = contextValue(proposed, ctx).value;
  const gap = contextValue(challenger, ctx).value - proposedValue;
  const margin = gapMargin(challenger, proposed);
  return {
    challenger,
    reasons,
    // By value alone and over the whole pack, which is the one question the
    // server also answers -- so it stays keyed to `top` rather than to whatever
    // the tiebreak put up. Ties go to the card that is not the proposed one,
    // which is what the caller's own derivation did before this moved here.
    contextBestName: proposedValue > top.value ? proposed.name : top.card.name,
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
  /**
   * Why this card was the one put up, when the data had no preference.
   *
   * Carried for the same reason `challengerName` is: the reveal is the only
   * place that describes this pair, and a reason looked up beside it could
   * describe a different band. Empty in the ordinary case -- see `Challenge`.
   */
  reasons: TiebreakReason[];
}

export function resolveChallenge<C extends Card>(
  challenge: Challenge<C>,
  stood: boolean,
): ChallengeOutcome {
  return {
    stood,
    challengerName: challenge.challenger.name,
    reasons: challenge.reasons,
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
 * Why that card and not another, when the data could not choose.
 *
 * A SECOND SENTENCE, AND ONLY EVER AFTER THE REVEAL
 *
 * The challenge screen is deliberately statistics-free -- the printed cards and
 * the player's own pool, nothing 17Lands knows -- because turning the numbers on
 * there would make the higher win rate the answer. A principle citation is not a
 * statistic, but it is still the app having an opinion, and the one thing that
 * screen must not do is hint at one. So this belongs where `calibrationLine`
 * already is: after the choice, in the reveal, which is what the reveal is FOR.
 *
 * It is also the only moment the sentence is worth anything. Told beforehand
 * that their curve is thin at two, a player is being coached; told afterwards
 * that the card they were argued with was chosen BECAUSE their curve is thin at
 * two, they have learned what the app was looking at -- and can disagree with
 * it, which the deterministic path has never let anybody do.
 *
 * Undefined in the ordinary case, where the challenger won on a gap the data
 * can see and no principle was consulted. Silence is right there: an explanation
 * offered on every pick stops being read by the third one.
 */
export function tiebreakLine(o: ChallengeOutcome): string | undefined {
  if (o.reasons.length === 0) return undefined;
  // One reason, not a list. Two would read as a case being built, and the
  // tiebreak did not weigh them -- it counted them, and any one of them is the
  // whole of what it can honestly claim.
  const [{ principle, note }] = o.reasons;
  return `${o.challengerName} was the card put up because ${note} [${principle}].`;
}

/**
 * Reasons to start from, so a defence is a click when the player has nothing to
 * add to it.
 *
 * Forty-five sentences a draft is a tax on the one input here that carries
 * anything a model can read, and a tax gets paid in worse sentences: "good
 * card", every pick, is worth less to the reveal than a starter that at least
 * states a ground. These fill the box rather than bypassing it, so the player
 * can take one as it stands or make it theirs.
 *
 * WHICH reasons is not a taste question. The principles corpus is what the
 * coach answers from, so its categories are the map of grounds a claim can be
 * answered ON -- one starter each, in the corpus's own terms so a defence and
 * the principle that judges it are talking about the same thing. The last two
 * have no category and that is the point: denial and speculation are the
 * grounds the data cannot see, which makes them the ones worth having a player
 * say out loud.
 *
 * The list is FIXED. Filtering it by the pool -- offering "I have no removal"
 * only to a player who has none -- would make the menu itself a hint, on the
 * one screen in this app built to show the cards and nothing else. The same ten
 * appear at P1P1 and P3P15, so the list says nothing about the pack.
 */
export interface ReasonStarter {
  /**
   * The word on the control. One or two, because ten whole sentences laid out
   * as buttons is a wall the player has to read before they can answer -- which
   * costs more attention than typing the sentence did.
   */
  label: string;
  /** What it puts in the box. A whole sentence: the box is what gets read, and
   *  a chip's worth of words is not a defence of anything. */
  text: string;
}

export const REASON_STARTERS: readonly ReasonStarter[] = [
  // card-evaluation. BREAD's top two tiers are different claims answered by
  // different principles, so they are two starters rather than one.
  { label: "Bomb", text: "The most powerful card in this pack." },
  { label: "Removal", text: "Best removal here, and I don't have enough." },
  // archetypes
  { label: "Archetype", text: "Exactly what my archetype wants." },
  // signals
  { label: "Signal", text: "This colour keeps coming back to me — it's open." },
  // common-mistakes: the honest form of the most common one, which is
  // committing early and then refusing to pivot.
  { label: "Staying open", text: "Staying open; I'm not committed to anything yet." },
  // mana-curve
  { label: "Curve", text: "My curve is top-heavy and this is a cheap play." },
  // deck-construction
  { label: "Bodies", text: "I'm light on creatures and this is a body." },
  // mana-base
  { label: "Castable", text: "I can cast this; the alternatives fight my mana." },
  // No principle answers either of these, which is why they are here.
  { label: "Gamble", text: "A gamble — my out if these colours dry up." },
  { label: "Hate-draft", text: "Hate-draft: I don't want this passed to my left." },
];

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

/**
 * The misses drill: the packs you got wrong, dealt back.
 *
 * Every pick a draft recorded carries the pack it was offered from, so a pick
 * you would want back is re-servable exactly as it stood -- fourteen cards, the
 * same fourteen, with no memory of which one you took. Nothing here is
 * simulated and nothing is regenerated: the question was asked once already and
 * the answer was written down at the time.
 *
 * WHY THIS GRADES STRICTLY, WHERE THE REVIEW QUIZ IS LENIENT
 *
 * `isCorrectGuess` accepts either the raw-power best or the context best,
 * because a walkthrough steps through a whole draft and the lesson lives in the
 * gap between those two answers. A run of misses is not a whole draft. Every
 * question in it was selected BECAUSE the pick missed the card it was graded
 * against, so that card is the answer the drill is teaching -- and lenient
 * grading would let a player re-take the exact card the drill picked out as a
 * mistake and be told they were right, which is incoherent on its face.
 *
 * It costs nothing to say the other thing anyway: `tookRawBest` marks the guess
 * that is the strongest card in the pack and still not what this deck wanted,
 * which is the most interesting way to be wrong here and worth its own sentence
 * on the reveal.
 */

/**
 * What the drill has already asked about one of these, and how it went.
 *
 * Only the LAST answer, and only the drill's own. A review guess about the same
 * pick is stored too and is deliberately not read here: the review reveals the
 * answer to every decision pick it steps through, so treating it as history
 * would retire the questions this drill exists to re-ask.
 */
export interface MissAsked {
  /** When it was last put to them. */
  at: string;
  /** Whether that answer was the card the pick was graded against. */
  fixed: boolean;
}

/** The half of a stored mistake this module ranks by. */
export interface MissCandidate {
  packNo: number;
  pickNo: number;
  pickedValue: number;
  bestValue: number;
  /**
   * Absent when the drill has never asked about this pick.
   *
   * Absence is an ANSWER here rather than a gap, which is the distinction trap
   * #9 in notes.md turns on: there is no history because the question has not
   * been put yet, and "never asked" is exactly what the ranking below wants to
   * know. A caller with no answers to hand and a caller whose player has given
   * none are the same caller, and neither is wrong.
   */
  asked?: MissAsked;
}

/**
 * Which pile a candidate is in.
 *
 * Three, not two, because "asked and still wrong" and "asked and fixed" are the
 * two things this drill is for and pooling them would be the drill unable to
 * say whether it had taught anybody anything.
 */
export type MissTier = "unasked" | "unfixed" | "fixed";

export const missTier = (candidate: MissCandidate): MissTier =>
  !candidate.asked ? "unasked" : candidate.asked.fixed ? "fixed" : "unfixed";

const TIER_ORDER: Record<MissTier, number> = { unasked: 0, unfixed: 1, fixed: 2 };

/** The gap the grade was made of, in win-rate points, and what ranks a miss. */
export const missGap = (m: MissCandidate): number => m.bestValue - m.pickedValue;

/**
 * Where in the session a stored mistake happened.
 *
 * A digest keeps its mistakes as a short list and its per-pick arrays whole, in
 * pick order -- so the arrays ARE the index, and a mistake is located by the
 * one pack/pick pair that can only occur once in a draft. Returns undefined
 * rather than guessing: a digest written by a different shape of draft is a
 * miss that cannot be served, not a miss to serve from the wrong pack.
 *
 * The alternative was storing a pickIndex on every mistake, which is a schema
 * change plus a backfill to recover a number the row beside it already implies.
 */
export function pickIndexOfMiss(
  picks: { readonly packNos: readonly number[]; readonly pickNos: readonly number[] },
  miss: { packNo: number; pickNo: number },
): number | undefined {
  for (let i = 0; i < picks.packNos.length; i++) {
    if (picks.packNos[i] === miss.packNo && picks.pickNos[i] === miss.pickNo) return i;
  }
  return undefined;
}

/**
 * How many cards the pack still held when a stored mistake was made.
 *
 * Read off the digest rather than the pick row, which is the point: a pick with
 * three cards left is a forced pick and teaches nothing, and knowing that
 * BEFORE the row is read is the difference between filtering a candidate and
 * paying for it first. The arrays carry every pick of the draft, so the largest
 * pick number in a pack IS that pack's size -- exact for a completed draft,
 * where every pack is picked to the end, which is the only kind this drill
 * draws from.
 */
export function cardsLeftAtMiss(
  picks: { readonly packNos: readonly number[]; readonly pickNos: readonly number[] },
  miss: { packNo: number; pickNo: number },
): number {
  let size = 0;
  for (let i = 0; i < picks.packNos.length; i++) {
    if (picks.packNos[i] === miss.packNo && picks.pickNos[i] > size) size = picks.pickNos[i];
  }
  return size - miss.pickNo + 1;
}

/**
 * The ones you have not answered first, then the ones you got wrong, then the
 * ones you fixed -- and the worst gap first inside each.
 *
 * It used to be the gap alone, which meant two runs in a row dealt the same ten
 * packs and `skip` was the only way past them. That is a fine way to be handed
 * your worst picks once and a poor way to be taught anything, because the pick
 * you have already taken back three times goes on outranking one you have never
 * seen twice.
 *
 * WHY UNASKED COMES BEFORE UNFIXED. Both are misses and both are holes; the one
 * you have never answered is the one nothing is known about, so it is worth more
 * per slot. It also means nothing changes until somebody has actually played --
 * with no history every candidate is in the first tier and this is the old rule
 * exactly.
 *
 * WHY THE SECOND KEY IS THE DATE AND NOT A REST INTERVAL. Spacing wants a
 * number -- do not ask this again for a week -- and there is nothing here to
 * derive one from; inventing it would be a constant with no argument behind it,
 * in a file that has refused two of those already. Least-recently-asked first is
 * the same behaviour without the constant: a pick answered last night sorts
 * behind one answered a month ago, and the interval falls out of how much
 * history there is rather than out of a guess. When there is enough data to fit
 * a real curve on, THAT is the moment to put a number here.
 *
 * The gap survives as the last key, and its own argument is unchanged: a run
 * built from your five worst drafts would be five packs of the same set in a
 * row, and this is meant to be the picks you would most want back rather than a
 * tour of one bad afternoon. If that reads as repetitive in practice the fix is
 * a spread rule here, with the reason written down, not a shuffle that hides it.
 */
export function rankMisses<T extends MissCandidate>(
  candidates: readonly T[],
  limit: number,
): T[] {
  return [...candidates]
    .sort((a, b) => {
      const tier = TIER_ORDER[missTier(a)] - TIER_ORDER[missTier(b)];
      if (tier !== 0) return tier;
      // Spelled out rather than defaulted to "", which an earlier draft did and
      // which made the tier untestable: an empty string sorts ahead of every
      // date, so the sentinel silently did the tier's job and a test with the
      // tiers flattened still came out in tier order. Trap #4 in notes.md, in
      // three characters.
      if (a.asked && b.asked && a.asked.at !== b.asked.at) {
        return a.asked.at < b.asked.at ? -1 : 1;
      }
      return missGap(b) - missGap(a);
    })
    .slice(0, Math.max(0, limit));
}

/**
 * What the drill teaches for one question, and what the player answered.
 *
 * `graded` is the card the pick was measured against when it was made -- the
 * context best, the card the score docked them for -- and it is the answer.
 */
export interface MissQuestion {
  /** What they took the first time. Never the answer: that is what made it a miss. */
  tookName: string;
  /** The card the grade was measured against, and what the drill is asking for. */
  gradedName: string;
  /** The strongest card in the pack blind to the deck. Often the same card. */
  rawBestName: string;
}

/**
 * How a retry went.
 *
 * - `fixed`  -- a different card, and the one the pick was graded against
 * - `stood`  -- the same card as last time, so the same call made twice
 * - `missed` -- a different card, and still not the one
 *
 * There is no fourth outcome. "Right, and the same card as before" cannot
 * happen: a question only enters this drill because the card taken was not the
 * card it was graded against, so repeating it is wrong by construction. That is
 * a property of the selection rule, and the reason grading strictly (above) is
 * what keeps the vocabulary honest -- under lenient grading this quadrant opens
 * up and the word "fixed" stops meaning anything.
 */
export type MissOutcome = "fixed" | "stood" | "missed";

export interface MissResult {
  outcome: MissOutcome;
  correct: boolean;
  /** They made the same call again. */
  repeated: boolean;
  /** Wrong, but wrong by taking the best card in the pack for somebody else's deck. */
  tookRawBest: boolean;
}

export function gradeMiss(question: MissQuestion, guessName: string): MissResult {
  const correct = guessName === question.gradedName;
  const repeated = guessName === question.tookName;
  return {
    outcome: correct ? "fixed" : repeated ? "stood" : "missed",
    correct,
    repeated,
    tookRawBest: !correct && guessName === question.rawBestName,
  };
}

export interface MissRunScore {
  answered: number;
  fixed: number;
  stood: number;
  missed: number;
}

/**
 * A run's tally.
 *
 * `fixed` over `answered` is the number the whole feature is built to move, and
 * the one the analytics carry: it is the share of the picks you got wrong that
 * you would now get right. Nothing else here is a claim about learning --
 * `stood` in particular is not failure, and a player who stands by every one of
 * their picks has told us something worth knowing about the grader.
 */
export function scoreMissRun(results: readonly MissResult[]): MissRunScore {
  const count = (o: MissOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    answered: results.length,
    fixed: count("fixed"),
    stood: count("stood"),
    missed: count("missed"),
  };
}

import { SAME } from "./archetypes.js";
import type { DeckSpeedBucket } from "./deckSpeed.js";

/**
 * What one person has answered in a set-based drill, and what it says.
 *
 * WHAT THIS SHARES AND WHAT IT DOES NOT. `drill.ts` argues that the archetype
 * quiz and the deck-speed drill earn no common abstraction, because a
 * `MissQuestion` is three card names and an `ArchetypeQuestion` is a card and a
 * table of decks -- they share a shape and no data. That argument survives and
 * this file does not weaken it. What is lifted here is the ANSWER, which
 * genuinely is one thing across both drills: a card in a set, a short string
 * somebody said, the short string the data said, and how sharp the question was.
 * The questions stay unshared; their answers share a table.
 *
 * The misses drill is deliberately not part of it. Its identity is a pick in a
 * session and it has `pickAnswers`, which carries `rawBestName`,
 * `contextBestName` and a session id -- none of which mean anything about a
 * card in a set.
 *
 * WHY THE DRILLS NEEDED THIS AT ALL, which is not the reason it looks like.
 * Both banks are ranked deterministically -- nothing in this directory calls
 * `Math.random` -- and both `deal` queries paged through them with a `skip` the
 * client held for a sitting and reset on reload. So the second time anybody
 * opened the archetype quiz on a set, they were dealt the same eight cards as
 * the first time, and would be forever. The history is what makes a run move
 * forward; measuring anything with it is the second thing it buys.
 */

/**
 * One stored answer, reduced to what a reader of them needs.
 *
 * `correct` rather than a boolean, for the reason `pickAnswers` stores both of a
 * pick's candidate names: the answer is derived from a set's statistics, a
 * re-seed moves them, and a verdict written down at the time would let a later
 * re-ingest silently re-decide an answer somebody already gave. It also makes
 * the flat answer legible from the row alone -- `same` in the archetype quiz and
 * `middle` in the deck-speed drill both mean "the data has no opinion here",
 * which is the pair of questions worth reading apart from the rest.
 */
export interface DrillAnswerRow {
  /**
   * The set the question came out of, and its format.
   *
   * ON THE ROW BECAUSE A CARD IS NOT A QUESTION -- a reprint is the same name in
   * two sets with two different answers. Grouping on the name alone merged them:
   * the second set's genuine FIRST answer was dropped from the bands, and when
   * the two answers happened to agree it was counted as a repeat that had never
   * been put back. The deal never saw it because the deal is scoped to one set.
   */
  setCode: string;
  format: string;
  /** The card, normalised. */
  key: string;
  /** What they said. */
  answered: string;
  /** What the data said, at the moment they were asked. */
  correct: string;
  /**
   * How far past its own drill's gate the question sat, as a multiple of it.
   *
   * NOTHING READS IT, AND IT IS STORED ANYWAY -- which needs both halves said,
   * because an unread column that looks meaningful is how a wrong number gets
   * picked up later (deferred trade-off #3 is that mistake with `synergies`).
   *
   * Kept because it cannot be recovered: each drill judges by a bar that is not
   * a constant -- the archetype quiz's moves with the deck count, deck speed's
   * is a second test against the set's own spread -- and neither the deck count
   * nor the spread is on this row. Rebuilding it later would mean rebuilding a
   * set's statistics as they stood on the day.
   *
   * AND IT IS NOT COMPARABLE BETWEEN THE TWO DRILLS. Deck speed's is
   * `min(|z|/width, |resid|/worthSaying)` and is bound by the EFFECT-SIZE leg
   * 56.2% of the time, measured over 3,351 sharp questions. The archetype
   * quiz's is `sigmas / rangeThreshold(k)` and has no effect-size leg at all, so
   * it ranks by CONFIDENCE rather than by size of effect: a small gap measured
   * over many games can outrank a large one measured over few, which is the
   * inversion `deckSpeed.ts` records for Healer's Hawk and built `worthSaying`
   * to stop. Trap #22 adds that the archetype false positives concentrate on the
   * best-sampled cards, which pushes the same way. (An earlier version of this
   * comment illustrated it with a made-up pair of numbers that did not survive
   * arithmetic; `pnpm diagnose-drill-margin` prints the real distributions.)
   *
   * The distributions are not alike either: over all 25 sets the archetype
   * margins run p50 1.13 and max 2.39, where deck speed's run p50 1.81 and max
   * 9.73. A reader who pools them, bands them, or draws them on one axis is
   * reading two different quantities. Within ONE drill it is a real ordering;
   * across both it is not. `pnpm diagnose-drill-margin` re-runs every figure in
   * this docblock off the committed artifacts.
   *
   * Optional because rows written before the column existed have none.
   */
  margin?: number;
  at: string;
}

/**
 * The grading rule, over a stored row rather than a live question.
 *
 * Stated once here for the reason `missFixed` is stated once in `misses.ts`: two
 * readers writing it out inline is how one of them ends up grading by a
 * different rule than the drill did.
 */
export const answerRead = (a: Pick<DrillAnswerRow, "answered" | "correct">): boolean =>
  a.answered === a.correct;

/**
 * The answer both drills give when the data has no opinion.
 *
 * ONE SET RATHER THAN A DRILL SWITCH, because the two words mean the same thing
 * -- "these decks want it the same" and "this card's decks are neither fast nor
 * grindy" are both "there is nothing here to read" -- and every reader of a
 * stored answer wants that distinction rather than the drill's name for it. The
 * two constants are imported rather than spelled, so a drill renaming its flat
 * answer breaks the build here instead of silently splitting the fold.
 */
const FLAT: ReadonlySet<string> = new Set<string>([SAME, "middle" satisfies DeckSpeedBucket]);

/** Whether the DATA had an opinion about this question, not whether the player did. */
export const wasFlat = (a: Pick<DrillAnswerRow, "correct">): boolean => FLAT.has(a.correct);

/** Whether the PLAYER said there was nothing to read. */
export const saidFlat = (a: Pick<DrillAnswerRow, "answered">): boolean => FLAT.has(a.answered);

/** One question's identity: a card in a set, never a card. */
const identify = (a: DrillAnswerRow) => `${a.setCode}/${a.format}/${a.key}`;

/** Every attempt at one question, oldest first. */
export interface QuestionHistory {
  first: DrillAnswerRow;
  latest: DrillAnswerRow;
  attempts: number;
}

/**
 * Group answers by question, oldest first inside each.
 *
 * Sorted here rather than trusted from the caller, the same call `missProgress`
 * makes and for the same reason: the rows come out of an index whose order is
 * insertion, which is nearly this and is not it.
 */
export function historyByQuestion(
  answers: readonly DrillAnswerRow[],
): Map<string, QuestionHistory> {
  const grouped = new Map<string, DrillAnswerRow[]>();
  for (const answer of answers) {
    const id = identify(answer);
    const seen = grouped.get(id);
    if (seen) seen.push(answer);
    else grouped.set(id, [answer]);
  }

  const out = new Map<string, QuestionHistory>();
  for (const [key, attempts] of grouped) {
    const ordered = [...attempts].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    out.set(key, {
      first: ordered[0],
      latest: ordered[ordered.length - 1],
      attempts: ordered.length,
    });
  }
  return out;
}

/** The calendar day an ISO timestamp falls on, in UTC. */
const day = (at: string): string => at.slice(0, 10);

/**
 * The questions worth putting again, least-recently-asked first.
 *
 * MISREAD ONLY, AND ON AN EARLIER DAY. The first half is the drill: a card you
 * read correctly is not the one to spend a slot on while a set still has
 * hundreds you have never seen. The second half is the floor, and both what it
 * rests on and what it does NOT rest on are worth stating.
 *
 * It rests on the spacing effect. Cepeda et al. (2006), over 839 assessments,
 * find that the gap between attempts and the retention interval act together and
 * that the best gap RISES with the interval -- so massed attempts are the wrong
 * end of that curve, whatever the right end turns out to be. That is a direction
 * and not a number, and it is all the sources give: the optimum depends on a
 * retention interval this app has never named, so a constant here would be
 * inventing the target it depends on.
 *
 * IT DOES NOT REST ON A REVEAL. An earlier version of this comment cited
 * Roediger & Karpicke (2006) for the claim that an immediate re-ask measures
 * memory of the reveal. That study ran WITHOUT FEEDBACK -- its subjects were
 * never shown the answer -- and what it measured is restudy against testing on a
 * later test, not a short gap against a long one. It is a real result and it is
 * about something else, which is trap #1 with the units changed: a source that
 * supports a thing existing is not a source for the use being made of it.
 *
 * So: not today, and least-recently-asked above that -- which is exactly the
 * rule `rankMisses` argues for, with a floor where the spacing literature
 * supports one and no interval where nothing derives one.
 *
 * UTC DAYS, AND THE SEAM IS NOT MIDNIGHT WHERE THE PLAYER IS. It is 16:00 at
 * UTC-8 and 13:00 at UTC+13, so two sittings twenty minutes apart across it can
 * be mid-afternoon and still count as different days -- which is the massed case
 * the floor exists to exclude. That is the honest cost, and it is bigger than
 * "somebody drilling near midnight".
 *
 * Taken anyway, because the fix is worse than the fault: a per-player timezone
 * is a column nothing else here needs, it moves when somebody travels, and the
 * rows are stamped in UTC so both sides of the comparison would have to be
 * converted. The floor is a coarse rule against re-asking a card in the sitting
 * that revealed it, not a spacing schedule, and it gets that right for everybody
 * except somebody who returns within hours of a UTC boundary.
 */
export function dueForRepeat(
  history: ReadonlyMap<string, QuestionHistory>,
  now: string,
): string[] {
  const today = day(now);
  return [...history.values()]
    .filter((q) => !answerRead(q.latest) && day(q.latest.at) < today)
    .sort((a, b) => (a.latest.at < b.latest.at ? -1 : a.latest.at > b.latest.at ? 1 : 0))
    .map((q) => q.latest.key);
}

/**
 * How many slots of a run go to questions you have already been asked.
 *
 * ONE, and the argument is that the fold is per QUESTION. A repeat is worth
 * having because it turns one card's history into a first-versus-latest
 * comparison; it is not worth having four of, because four repeats in an
 * eight-card run is a review session rather than a drill, and the readout on
 * /stats reads FIRST answers, so repeats are not on its critical path at all.
 * The player's own return rate paces the measurement, which is the honest thing
 * to let pace it.
 *
 * Last rather than first, so a run opens on something you have not seen.
 */
export const REPEAT_SLOTS = 1;

/**
 * The first reading: can you tell an opinion from no opinion?
 *
 * TWO RATES AND NOT ONE ACCURACY, because one number cannot separate a player
 * who reads cards from a player who has noticed that "Neither" is usually right.
 * Both drills already name these two mistakes -- `saw-difference` for calling a
 * flat card sharp and `saw-none` for calling a sharp card flat -- so this is the
 * drills' own vocabulary counted over a history rather than a new idea.
 *
 * Each has its own denominator and they are different denominators, which is the
 * point: `calledSharp` is out of the questions the data had NO opinion about,
 * `calledFlat` out of the ones it did. Somebody who always answers Neither
 * scores 0% and 100%; somebody who never does scores 100% and 0%. Neither
 * pattern is visible in a single accuracy figure, and the second one is the
 * standing error in Limited that both drills exist to catch.
 */
export interface Discrimination {
  /** Questions the data had no opinion about. */
  flat: number;
  /** Of those, how many the player called sharp. The `saw-difference` mistake. */
  calledSharp: number;
  /** Questions the data did have an opinion about. */
  sharp: number;
  /** Of those, how many the player called flat. The `saw-none` mistake. */
  calledFlat: number;
}

export interface ReadProgress {
  /** Distinct questions the drill has put to them -- a card in a set, not a card. */
  asked: number;
  /** Attempts, so a reader can weigh how much is behind the rest. */
  answers: number;
  /** Distinct sets the questions came out of, so a count has a scope. */
  sets: number;
  /** The reading, over first answers. */
  discrimination: Discrimination;
  /** Distinct questions put more than once. */
  askedAgain: number;
  /** Misread first, read by the latest. */
  tookBack: number;
  /** Misread first, and still. */
  stillWrong: number;
  /**
   * Repeats dropped because the answer moved between the attempts.
   *
   * COUNTED RATHER THAN SILENTLY SKIPPED. Dropping the pair is right -- two
   * attempts graded against different answers are two questions wearing one
   * card's name -- but a re-seed that moves many answers would otherwise shrink
   * `askedAgain` with nothing to say it had, and "no cards have come back yet"
   * would read identically whether nobody returned or the pipeline ate them.
   */
  moved: number;
  /** When the record starts. */
  since?: string;
}

/**
 * The fold, in the two readings the drills actually support.
 *
 * FIRST ANSWERS ONLY, in both of them. The first time a card is dealt is the
 * only time the reveal has not already shown the answer, so every attempt after
 * it is measuring something else. The repeat split below is the separate
 * question of what happened when a card came back.
 *
 * WHY NOT ONE ACCURACY RATE, which is what this was before review. Both banks
 * deal their clearest questions first, so a rate over everything falls as a
 * player improves -- and worse, most questions are flat, so the rate mostly
 * measures how willing somebody is to answer Neither. Splitting it into "did you
 * see there was something to read" and "when there was, did you read it" gives
 * each half an honest denominator and a baseline that is true in every band.
 *
 * THE REPEAT SPLIT HAS TWO ARMS AND NOT FOUR, which is a property of the
 * selection rule rather than a simplification. `dueForRepeat` only ever offers a
 * question whose latest answer was wrong, so "had it right and lost it" cannot
 * happen here -- the same shape `MissOutcome` argues for when it says there is
 * no fourth outcome.
 */
export function readProgress(answers: readonly DrillAnswerRow[]): ReadProgress {
  const history = historyByQuestion(answers);

  const discrimination: Discrimination = { flat: 0, calledSharp: 0, sharp: 0, calledFlat: 0 };
  let askedAgain = 0;
  let tookBack = 0;
  let stillWrong = 0;
  let moved = 0;

  for (const question of history.values()) {
    const first = question.first;

    if (wasFlat(first)) {
      discrimination.flat++;
      if (!saidFlat(first)) discrimination.calledSharp++;
    } else {
      discrimination.sharp++;
      if (saidFlat(first)) discrimination.calledFlat++;
    }

    if (question.attempts < 2) continue;
    // Two answers to two different questions. See `moved`.
    if (first.correct !== question.latest.correct) {
      moved++;
      continue;
    }
    askedAgain++;
    if (answerRead(question.latest)) tookBack++;
    else stillWrong++;
  }

  return {
    asked: history.size,
    answers: answers.length,
    sets: new Set(answers.map((a) => `${a.setCode}/${a.format}`)).size,
    discrimination,
    askedAgain,
    tookBack,
    stillWrong,
    moved,
    since: answers.reduce<string | undefined>(
      (earliest, a) => (!earliest || a.at < earliest ? a.at : earliest),
      undefined,
    ),
  };
}

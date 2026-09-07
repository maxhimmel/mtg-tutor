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
   * How far past this drill's own gate the question sat, as a multiple of it.
   *
   * WRITTEN NOW OR GONE, and `sigmas` was the wrong number to write. Each drill
   * judges a question by a bar that is not a constant -- the archetype quiz's
   * moves with how many decks a card was measured in, and deck speed's is a
   * second test against the set's own spread of residuals -- so error bars alone
   * do not say how hard a question was, and neither the deck count nor the
   * spread is on this row. `margin` is the ratio each drill computed at deal
   * time: 1.0 is exactly on the gate, under 1.0 is a question with no answer.
   *
   * Recovering it later would mean rebuilding a set's statistics as they stood
   * on the day, which is the same reason `gap` rides on every `pickAnswers` row.
   *
   * Optional because rows written before the column existed have none. Absent
   * means "sharp, and how far past the gate is unknown", which `marginBand`
   * clamps to the gate's own edge rather than dropping from a count the panel
   * prints -- there is no honest value to backfill.
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
 * Where the bands fall, as multiples of the drill's OWN gate.
 *
 * NOT ERROR BARS, and the difference is the whole reason this was rebuilt. Raw
 * `sigmas` is not a difficulty in either drill: the archetype quiz's bar moves
 * with how many decks a card was measured in, so at 2.5 error bars a k=3 card
 * has an answer and a k=10 card does not; and deck speed needs a residual floor
 * as well as a z test, so a 5-sigma card with a small effect is `middle`. Two
 * questions with the same `sigmas` could be opposite questions, which makes a
 * band on it a band on nothing.
 *
 * `margin` is what each drill actually judged the question by, divided by the
 * bar it had to clear. 1.0 is exactly on the gate whatever k is; the bands are
 * how far past it a question sat.
 *
 * AND THEY COVER THE SHARP HALF ONLY. Below 1.0 the answer is flat BY
 * CONSTRUCTION -- that is what failing the gate means -- so a band under 1.0
 * would have exactly one possible answer in it, and "always say Neither" would
 * score 100% there. That is not a difficulty level, it is a different question,
 * and it gets its own reading in `discrimination` below rather than a place on
 * this axis.
 *
 * The first band carries a caveat nothing else can: trap #22's sequel measured
 * about a third of what gets SERVED as false positives, and a false positive is
 * just past the gate by definition. So 1.0-1.5 holds most of the bank's own
 * error rate, and a reader must not take a low bar there for a low skill.
 */
export const MARGIN_BANDS: readonly number[] = [1, 1.5, 2];

export interface ReadBin {
  /** Multiples of the gate, inclusive. */
  from: number;
  /** Exclusive, or null for the last band, which is open. */
  to: number | null;
  /** First answers to SHARP questions falling in this band. */
  answers: number;
  /** How many of them named the right end. */
  read: number;
  /** The share, and the interval around it. Both null at zero answers. */
  rate: number | null;
  low: number | null;
  high: number | null;
}

/**
 * A Wilson score interval at 95%.
 *
 * WHY THE CONVENTIONAL INTERVAL IS RIGHT HERE, when ruling #26 says a band
 * beside a decision must be sized by the decision. That ruling is about the
 * archetype quiz's reveal, where the reader measures two bands against a
 * threshold and a 95% interval visibly disagrees with the verdict printed
 * underneath. Nothing is read off a threshold on this chart: the band says how
 * firmly one band's rate is known, and the only line is a guessing rate. Wilson
 * rather than the normal approximation because these counts are small by
 * construction -- a band with four answers in it is the ordinary case for weeks
 * -- and the approximation puts its interval outside [0, 1] there.
 */
function wilson(read: number, answers: number): { rate: number; low: number; high: number } {
  const z = 1.96;
  const p = read / answers;
  const denom = 1 + (z * z) / answers;
  const centre = (p + (z * z) / (2 * answers)) / denom;
  const spread =
    (z * Math.sqrt((p * (1 - p)) / answers + (z * z) / (4 * answers * answers))) / denom;
  return {
    rate: p,
    low: Math.max(0, centre - spread),
    high: Math.min(1, centre + spread),
  };
}

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
  /** The first reading, over first answers. */
  discrimination: Discrimination;
  /**
   * The second reading: among questions that DID have an answer, how often the
   * right end was named, banded by how far past its gate the question sat.
   */
  bins: ReadBin[];
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

  const bins: ReadBin[] = MARGIN_BANDS.map((from, i) => ({
    from,
    to: i === MARGIN_BANDS.length - 1 ? null : MARGIN_BANDS[i + 1],
    answers: 0,
    read: 0,
    rate: null,
    low: null,
    high: null,
  }));

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
      // The bands hold the sharp half only. A flat question has one possible
      // answer, so a band containing it would report willingness rather than
      // reading -- see MARGIN_BANDS.
      const bin = bins[marginBand(first.margin ?? 0)];
      bin.answers++;
      if (answerRead(first)) bin.read++;
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

  for (const bin of bins) {
    if (bin.answers === 0) continue;
    Object.assign(bin, wilson(bin.read, bin.answers));
  }

  return {
    asked: history.size,
    answers: answers.length,
    discrimination,
    bins,
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

/**
 * Which band a sharp question falls in.
 *
 * Clamped at the bottom rather than guarded: a sharp question has `margin >= 1`
 * by construction, and a row from before that column existed carries 0. Putting
 * those in the first band is the honest default -- they are known to be sharp
 * and their distance past the gate is unknown, so they belong at its edge rather
 * than dropped from a count the panel prints.
 */
export function marginBand(margin: number): number {
  let band = 0;
  for (let i = 1; i < MARGIN_BANDS.length; i++) {
    if (margin >= MARGIN_BANDS[i]) band = i;
  }
  return band;
}

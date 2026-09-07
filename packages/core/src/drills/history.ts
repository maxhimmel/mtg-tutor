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
  /** The card, normalised. Any stable key; the folds only group by it. */
  key: string;
  /** What they said. */
  answered: string;
  /** What the data said, at the moment they were asked. */
  correct: string;
  /** How many error bars the question was worth. Signed in the deck-speed drill. */
  sigmas: number;
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
    const seen = grouped.get(answer.key);
    if (seen) seen.push(answer);
    else grouped.set(answer.key, [answer]);
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
 * hundreds you have never seen. The second half is the floor, and it is a floor
 * rather than an interval on purpose.
 *
 * Roediger & Karpicke (2006) measured the reversal directly -- at an immediate
 * check restudying beat testing, and testing only won at two days and a week --
 * so re-asking inside the sitting that just revealed the answer is measuring
 * memory of the reveal. What nobody can hand over is a NUMBER: Cepeda et al.
 * (2006) find the best gap rises with the retention interval, and this app has
 * never named one, so a constant here would be inventing the target it depends
 * on. Carrying their two days across from prose recall to reading a Limited card
 * would be borrowing rigour rather than having it.
 *
 * So: not today, and least-recently-asked above that -- which is exactly the
 * rule `rankMisses` argues for, with a floor added where the sources support one
 * and no interval where they do not.
 *
 * UTC DAYS, and the cost is stated rather than hidden: somebody answering at
 * 23:50 and again at 00:10 gets a repeat they have not slept on. The alternative
 * needs a timezone the server does not have, to buy back ten minutes at the one
 * boundary. A calendar day is the coarsest thing that is certainly not "the
 * sitting you are in", which is all the sources actually support.
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
 * Where the bands on the difficulty axis fall, in error bars.
 *
 * DERIVED FROM THE DRILLS' OWN THRESHOLDS, not from equal widths. One error bar
 * is the margin `gapMargin` uses and trap #3 argues for. Two and three bracket
 * the archetype quiz's threshold across every deck count it can have -- 2.34 at
 * three decks, 3.16 at ten, because the width that buys a false-positive rate
 * moves with k (trap #22). Past three, a question is clear at every k, which
 * makes it the last band rather than one of several.
 *
 * The bottom band is therefore where both drills' flat answers live: a card the
 * decks cannot be separated on, and a card whose games ran the format's own
 * length. That is not a defect of the binning, it is the drill's own subject
 * sitting at one end of its own axis.
 */
export const SIGMA_BANDS: readonly number[] = [0, 1, 2, 3];

export interface ReadBin {
  /** Error bars, inclusive. */
  from: number;
  /** Exclusive, or null for the last band, which is open. */
  to: number | null;
  /** First answers falling in this band. */
  answers: number;
  /** How many of them were read right. */
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
 * archetype quiz's reveal, where the reader is measuring two bands against a
 * threshold and a 95% interval disagrees with the verdict printed under it.
 * Nothing is read off a threshold on this chart: the band says how firmly one
 * band's rate is known, there is no gate it either clears or does not, and the
 * only line on the chart is chance. Wilson rather than the normal approximation
 * because these counts are small by construction -- a band with four answers in
 * it is the normal case early on, and the approximation puts its interval
 * outside [0, 1] there.
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

export interface ReadProgress {
  /** Distinct questions the drill has put to them. */
  asked: number;
  /** Attempts, so a reader can weigh how much is behind the rest. */
  answers: number;
  /** First answers, banded by how sharp the question was. */
  bins: ReadBin[];
  /** Distinct questions put more than once. */
  askedAgain: number;
  /** Misread first, read by the latest. */
  tookBack: number;
  /** Misread first, and still. */
  stillWrong: number;
  /** When the record starts. */
  since?: string;
}

/**
 * The fold, and the one number in it that difficulty cannot inflate.
 *
 * FIRST ANSWERS ONLY, IN THE BANDS. A raw accuracy percentage over everything
 * would move with the difficulty MIX rather than with the player -- both banks
 * deal their clearest questions first, so somebody who keeps playing meets
 * harder questions and their headline falls while their reading improves.
 * Banding by `sigmas` is the cut where that confound becomes the x-axis instead
 * of a caveat, and first answers are the half of the history that memory of a
 * reveal cannot reach.
 *
 * THE REPEAT SPLIT HAS TWO ARMS AND NOT FOUR, which is a property of the
 * selection rule rather than a simplification. `dueForRepeat` only ever offers a
 * question whose latest answer was wrong, so "had it right and lost it" cannot
 * happen here -- the same shape `MissOutcome` argues for when it says there is
 * no fourth outcome.
 *
 * A PAIR WHOSE ANSWER MOVED IS NOT A PAIR. `correct` comes from a set's
 * statistics, and a re-seed can change what a card's decks wanted or how long
 * its games ran. Two attempts graded against different answers are two different
 * questions wearing one card's name, so they are dropped from the split rather
 * than counted as somebody slipping.
 */
export function readProgress(answers: readonly DrillAnswerRow[]): ReadProgress {
  const history = historyByQuestion(answers);

  const bins: ReadBin[] = SIGMA_BANDS.map((from, i) => ({
    from,
    to: i === SIGMA_BANDS.length - 1 ? null : SIGMA_BANDS[i + 1],
    answers: 0,
    read: 0,
    rate: null,
    low: null,
    high: null,
  }));

  let askedAgain = 0;
  let tookBack = 0;
  let stillWrong = 0;

  for (const question of history.values()) {
    const bin = bins[bandOf(question.first.sigmas)];
    bin.answers++;
    if (answerRead(question.first)) bin.read++;

    if (question.attempts < 2) continue;
    // Two answers to two different questions. See the docblock.
    if (question.first.correct !== question.latest.correct) continue;
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
    bins,
    askedAgain,
    tookBack,
    stillWrong,
    since: answers.reduce<string | undefined>(
      (earliest, a) => (!earliest || a.at < earliest ? a.at : earliest),
      undefined,
    ),
  };
}

/**
 * Which band a question falls in.
 *
 * On the ABSOLUTE value, because the deck-speed drill signs its `sigmas` -- a
 * card three error bars below the format's mean length is exactly as sharp a
 * question as one three above, and banding on the signed number would put every
 * fast card in the bottom band and call it easy.
 */
export function bandOf(sigmas: number): number {
  const s = Math.abs(sigmas);
  let band = 0;
  for (let i = 1; i < SIGMA_BANDS.length; i++) {
    if (s >= SIGMA_BANDS[i]) band = i;
  }
  return band;
}

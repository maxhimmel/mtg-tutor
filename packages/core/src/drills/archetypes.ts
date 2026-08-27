/**
 * The archetype quiz: one card, two decks, which one wants it.
 *
 * Notes Ideas #1 asked for "a quiz on what archetype a mono-coloured card
 * belongs to", and the data will not answer that question as asked. Naming which
 * ONE of the decks in a card's colour wants it most needs the best deck
 * separated from the RUNNER-UP, and that clears even a flat two standard errors
 * for 3.5% of cards -- a bar which is itself too generous, for the reason the
 * next paragraph but one gives, so the true figure is lower still. The decks are
 * indistinguishable for the rest, which is trap #3 one level up: the gaps
 * between them are smaller than the error bars on those gaps.
 *
 * NARROWED TO TWO DECKS, 335 of them have an answer. That is only about a tenth
 * of the candidates, which is why the drill does not stop there -- see
 * `separated` on the question and `dealArchetypeRun` below. With the third
 * answer the bank is 3,346 cards across 25 sets and 23 of them hold a full run.
 * `pnpm diagnose-archetype-quiz` is that measurement, kept so the rate can be
 * re-argued rather than remembered.
 *
 * THREE-COLOUR DECKS ARE IN, AND THEY ARE WHAT MAKE IT UNIVERSAL. Pairs alone
 * left ktk, snc, sos and tdm with nothing to ask -- they are three-colour
 * formats, where the wedges and shards ARE the archetypes and the pairs are a
 * rounding error. With widths of three, ktk, snc, sos and tdm have 5, 5, 6 and
 * 2 cards with an answer where pairs alone gave them none at all.
 * They also cost something, and it is the same coin: more decks per card means
 * a wider gate, which is why the numbers above are what they are rather than a
 * regret. STX is the only set that cannot ask anything at all, because it has no
 * archetype data -- notes issue #8, and this drill is the first surface that
 * says so out loud instead of quietly degrading.
 *
 * WHAT A LIFT IS HERE, and why it is not the card's win rate. A card's raw rate
 * inside a deck says mostly what that deck does: every card in the best deck in
 * the format posts a good number. So a deck's appetite for a card is the card's
 * rate inside it MINUS what the deck wins generally, which is a lift over the
 * deck's own baseline and not over the format's.
 *
 * IT AGREES WITH THE SCORER BY CONSTRUCTION, which is worth stating because
 * trap #21 is a rule taught to one surface and reaching no other.
 * `scoring/context.ts`'s `archDelta` is this same difference with the card's own
 * format-wide term subtracted as well. That term is identical for both decks in
 * a question, so it cancels in every comparison this file makes and the two
 * rank cards identically. The single difference is kept because it is the one a
 * person can read off the screen: "+2.9pp on what RW decks do anyway".
 *
 * THE GATE IS NOT A NUMBER OF STANDARD ERRORS, AND THE FIRST VERSION OF IT WAS
 * WRONG. A question is asked when the best and worst decks are far enough apart
 * -- but best-minus-worst is a RANGE over k decks, not a comparison of two, and
 * the largest gap among k noisy numbers is wide even when every deck wants the
 * card equally. Simulated over 2,000,000 draws of k independent nulls, a flat
 * two-sigma gate passes 18.7% of pure noise at four decks and 59.8% at ten. It
 * would have shipped a bank whose false questions were concentrated exactly on
 * the cards played in the most decks, which is the commons.
 *
 * So the threshold comes from the null distribution of the range at that card's
 * own deck count -- `rangePValue` below -- and the setting is a false-positive
 * RATE rather than a width.
 *
 * THE VARIANCE is the card's rate in both decks plus both decks' own rates,
 * summed rather than pooled. Summing is conservative in the right direction: the
 * card's games inside a deck are a subset of that deck's games, so the two are
 * positively correlated and the true variance of the difference is smaller than
 * this. A question that survives an over-estimate of its own noise is really
 * there.
 */

export interface DeckRate {
  colors: string;
  n: number;
  wr: number;
}

/** One card's win rate inside one deck. A row of `setStats.archetypes`. */
export interface CardDeckRate {
  name: string;
  colors: string;
  n: number;
  wr: number;
}

/** How much one deck wants one card, and how firmly that is known. */
export interface DeckLift {
  colors: string;
  /** The card's rate inside this deck minus the deck's own rate. A fraction. */
  lift: number;
  /** Games with this card in hand in this deck. Never below the artifact's floor of 200. */
  n: number;
  /**
   * What this deck wins generally -- the number `lift` was measured against.
   *
   * Carried so a question is self-contained: grading has to know which of the
   * two decks is simply the better one, and without this the client would need
   * the set's whole colour table beside every question to work that out.
   */
  deckWr: number;
  /** Variance of `lift`, carried so a comparison does not have to re-derive it. */
  variance: number;
}

/**
 * One question: a card, and the decks that disagree about it.
 *
 * `decks` is every deck the card has a measured rate in, most-wanted first --
 * all of them are carried even though only two are asked about, because the
 * reveal shows the whole picture. Being graded on the half the data can defend
 * and shown the half it cannot is the honest version of this screen.
 */
export interface ArchetypeQuestion {
  name: string;
  /** The card's single colour, one of WUBRG. */
  color: string;
  decks: DeckLift[];
  /** The deck with the highest lift. `decks[0]`. */
  wants: string;
  /** The deck with the lowest. The last of `decks`. */
  spurns: string;
  /** How many error bars separate those two. */
  sigmas: number;
  /** The chance k decks that all wanted it equally would look this far apart. */
  pValue: number;
  /**
   * Whether the gap is bigger than the data's own margin.
   *
   * FALSE IS AN ANSWER AND NOT A REJECTION, which is the whole shape of this
   * drill. About 90% of mono-coloured cards have no deck that genuinely wants
   * them more -- measured by a Storey estimate off the p-value distribution
   * over 2,652 candidates -- and gating those out left a bank that was still
   * about a third noise, because a 5% rate over everything TESTED is a much
   * bigger share of what gets SERVED. Controlling that properly with
   * Benjamini-Hochberg left 25 questions across eighteen sets.
   *
   * So the inseparable cards are not thrown away, they are the third answer.
   * "These two decks want it the same" is true of most cards in a colour, it is
   * the single most useful thing a drafter can know about their own reads, and
   * it turns the statistical weakness into the lesson. A question the data
   * cannot answer stops being a wrong question and becomes a correct one.
   */
  separated: boolean;
}

const variance = (wr: number, n: number): number =>
  n > 0 ? (wr * (1 - wr)) / n : Number.POSITIVE_INFINITY;

/**
 * The decks that have a measured opinion about this card, most-wanted first.
 *
 * A deck the set has no baseline for is dropped rather than compared against
 * the format's mean. Substituting a baseline would make a lift out of two
 * numbers measured on different populations, which is trap #10's shape: it
 * would fit cleanly and mean nothing.
 */
export function deckLifts(
  rates: readonly CardDeckRate[],
  decks: readonly DeckRate[],
): DeckLift[] {
  const baseline = new Map(decks.map((d) => [d.colors, d]));
  return rates
    .flatMap((r) => {
      const own = baseline.get(r.colors);
      if (!own) return [];
      return [
        {
          colors: r.colors,
          lift: r.wr - own.wr,
          n: r.n,
          deckWr: own.wr,
          variance: variance(r.wr, r.n) + variance(own.wr, own.n),
        },
      ];
    })
    .sort((a, b) => b.lift - a.lift);
}

/** How many standard errors separate two decks' appetite for the same card. */
export function separation(a: DeckLift, b: DeckLift): number {
  const noise = Math.sqrt(a.variance + b.variance);
  return noise > 0 ? (a.lift - b.lift) / noise : 0;
}

/**
 * The one colour every one of these decks contains, or undefined.
 *
 * A card only earns a row in a deck it was actually played in, so the decks a
 * mono-red card has rates in are exactly the pairs and wedges containing red --
 * and red is the only colour ALL of them share, which is what makes this work.
 * A gold RG card is in RG, BRG, URG and WRG, where both R and G are shared, so
 * it comes back undefined and is dropped.
 *
 * This is the cheap half of deciding a card is mono-coloured and not the whole
 * of it: a colourless card that only ever got played in white decks would look
 * mono-white from here. The caller checks the card's real colours; this only
 * has to name the colour the decks agree on so that check has something to
 * compare against.
 */
export function sharedColor(colors: readonly string[]): string | undefined {
  if (colors.length === 0) return undefined;
  const candidates = [...colors[0]].filter((c) => colors.every((k) => k.includes(c)));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The chance that k decks which all want a card equally show a gap this wide.
 *
 * Best-minus-worst is a RANGE over k decks, not a comparison of two, and the
 * widest gap among k noisy numbers is wide even when nothing is there. A flat
 * two-sigma gate passes 18.7% of pure noise at four decks and 59.8% at ten -- it
 * would have shipped a bank whose false questions were concentrated exactly on
 * the cards played in the most decks, which is the commons. Trap #13: a
 * max-of-many is significant against its own null, not against the null of a
 * single comparison.
 *
 * Exact rather than a table of simulated quantiles, which is what this was
 * first. The range of k standard normals has a closed form --
 * `P(R <= r) = k INTEGRAL phi(x) [Phi(x + r) - Phi(x)]^(k-1) dx` over the
 * minimum -- so the only approximation left is the quadrature, and Simpson over
 * [-9, 9] agrees with 2,000,000 simulated draws to three decimals at every k
 * from 2 to 10. The test pins it against those draws.
 *
 * `separation` divides by `sqrt(var_a + var_b)`, so a separation of s is a range
 * of `s * sqrt(2)` in units where each lift has unit variance. At k = 2 that
 * makes this the ordinary two-sided z-test and `rangePValue(1.96, 2)` is 0.05,
 * which is the anchor the whole thing is checked against.
 *
 * IT ASSUMES THE k LIFTS ARE INDEPENDENT, AND THEY ARE. A game belongs to one
 * deck, so two decks of different colours share no games at all. The overlap
 * that does exist is WITHIN a single lift -- the card's games are a subset of
 * that deck's -- and `deckLifts` already handles that conservatively by summing
 * the two variances rather than pooling them.
 *
 * The real approximation is equal variance across the k decks, since n runs from
 * 200 to tens of thousands. It errs conservative: measured by parametric
 * bootstrap over the real sample sizes and the real deck rates, the gate fires
 * on 3.14% of true nulls where it nominally allows 5%.
 */
export function rangePValue(sigmas: number, deckCount: number): number {
  if (deckCount < 2 || !Number.isFinite(sigmas)) return 1;
  const r = sigmas * Math.SQRT2;
  if (r <= 0) return 1;

  const lo = -9;
  const hi = 9;
  const steps = 2000;
  const h = (hi - lo) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const x = lo + i * h;
    const weight = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    sum += weight * normalPdf(x) * Math.pow(normalCdf(x + r) - normalCdf(x), deckCount - 1);
  }
  const cdf = (deckCount * sum * h) / 3;
  return Math.min(1, Math.max(0, 1 - cdf));
}

const normalPdf = (x: number): number => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);

// Zelen & Severo 26.2.17. Accurate to 7.5e-8, which is four orders of magnitude
// finer than the quadrature it feeds.
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = normalPdf(x) * poly;
  return x >= 0 ? 1 - tail : tail;
}

/** A deck's own win rate, with no card dimension. `colorWinRates` in the stats. */
export interface QuestionOptions {
  /** How many decks a card must have rates in before it is asked about. */
  minDecks: number;
  /**
   * How often a card whose decks all want it equally may be asked about anyway.
   *
   * A rate rather than a width, because the width that buys it depends on how
   * many decks the card has -- see `rangePValue`.
   */
  falsePositive: number;
}

/**
 * Every card a set could ask about, clearest first.
 *
 * NOT FILTERED TO THE ONES WITH AN ANSWER. `separated` says which those are, and
 * `dealArchetypeRun` below is what builds a run out of both kinds -- see its
 * docblock for why a drill made only of separable cards was the wrong drill.
 *
 * RANKED BY SEPARATION RATHER THAN SHUFFLED, which is the same call
 * `rankMisses` makes and for a better reason here. Among the separable cards
 * the top of the list is the decks that disagree most, which is where a person
 * learns fastest. Among the inseparable ones it is the cards that look MOST
 * like they should differ and do not -- which is exactly the mistake worth
 * catching, where a "these are the same" on two obviously identical cards
 * teaches nobody anything.
 *
 * `cardFor` is asked for every candidate rather than looked up on the row,
 * because the stats artifact has neither colours nor roles on it -- both live on
 * the set's cards. Returning undefined drops the card, which is what happens to
 * a card the set no longer has.
 *
 * LANDS ARE DROPPED HERE AND THE REASON IS NOT OBVIOUS. A land has no mana cost,
 * so Scryfall reports no colours -- but `data/mapping.ts` deliberately gives a
 * land its colour IDENTITY instead, because a Boros tapland is playable in
 * exactly one kind of deck and every other reader in this codebase needs that.
 * The consequence here is that a mono-coloured land looks exactly like a
 * mono-coloured spell: `Boseiju, Who Endures` reads as a green card played in
 * green decks, and it cleared the gate at 3.11 sigmas.
 *
 * It is not even wrong about the data -- a land really is wanted more by some
 * decks. It is wrong about the QUESTION. "Which deck wants this card" asks what
 * a deck is trying to do, and the answer for a land is "the one whose colours it
 * makes", which is on its face. Two of 254 questions were lands, and one of them
 * was a third of tdm's entire bank.
 */
export function archetypeQuestions(
  rates: readonly CardDeckRate[],
  decks: readonly DeckRate[],
  cardFor: (name: string) => { colors: string; role?: string } | undefined,
  options: QuestionOptions,
): ArchetypeQuestion[] {
  const byCard = new Map<string, CardDeckRate[]>();
  for (const r of rates) {
    // Two and three colours, which is not an arbitrary cut: those are exactly
    // the widths the game gives a NAME to -- ten guilds and ten wedges and
    // shards -- and a name is what this drill teaches. A width-1 or width-5 row
    // is a real measurement of something nobody drafts toward, and it would go
    // on the screen as a bare colour string with nothing to learn from it.
    //
    // Mixing the widths in one ranking is safe because a lift is measured
    // against each deck's OWN rate, so what a third colour costs is already
    // priced into the baseline it is subtracted from. Comparing raw win rates
    // across widths would not be.
    if (r.colors.length < 2 || r.colors.length > 3) continue;
    const seen = byCard.get(r.name);
    if (seen) seen.push(r);
    else byCard.set(r.name, [r]);
  }

  const questions: ArchetypeQuestion[] = [];
  for (const [name, rows] of byCard) {
    if (rows.length < options.minDecks) continue;

    const shared = sharedColor(rows.map((r) => r.colors));
    if (!shared) continue;

    // The card's real colours, so a colourless artifact that happens to have
    // only been played in white decks is not taught as a white card -- and its
    // role, because a mono-coloured land passes the colour check and is not a
    // card this question is about. See the docblock.
    const card = cardFor(name);
    if (!card || card.colors !== shared || card.role === "land") continue;

    const lifts = deckLifts(rows, decks);
    if (lifts.length < 2) continue;

    const wants = lifts[0];
    const spurns = lifts[lifts.length - 1];
    const sigmas = separation(wants, spurns);
    // Against the null of THIS card's deck count, not a flat width. A card in
    // ten decks has to clear 3.16 error bars where a card in three clears 2.34,
    // because the wider a net the more the widest gap in it means nothing.
    const pValue = rangePValue(sigmas, lifts.length);

    questions.push({
      name,
      color: shared,
      decks: lifts,
      wants: wants.colors,
      spurns: spurns.colors,
      sigmas,
      pValue,
      separated: pValue < options.falsePositive,
    });
  }

  return questions.sort((a, b) => b.sigmas - a.sigmas);
}

/**
 * A run: half cards whose decks really differ, half cards where they do not.
 *
 * THE HALF IS DERIVED AND NOT A TASTE. About 90% of candidates are cards no
 * deck truly wants more, so a run drawn in the format's own proportions would
 * be nine "they are the same" in ten and the best strategy would be to stop
 * reading the card. Half is the largest share of inseparable cards that does
 * NOT make a constant answer the winning one -- past it the drill scores a
 * person for giving up, which is the one thing a drill must never do.
 *
 * Below half it drifts back toward the first version of this drill, which
 * taught that every card has a deck that wants it. That is false about Limited
 * and is the belief this drill exists to correct.
 *
 * Interleaved rather than blocked, so a run cannot be read off its own shape --
 * four real answers followed by four coin flips is a pattern somebody notices
 * by question five and then stops thinking.
 *
 * `skip` pages both halves together, so a second run repeats neither.
 */
export function dealArchetypeRun(
  questions: readonly ArchetypeQuestion[],
  limit: number,
  skip = 0,
): ArchetypeQuestion[] {
  const separated = questions.filter((q) => q.separated);
  const same = questions.filter((q) => !q.separated);

  const half = Math.ceil(limit / 2);
  const from = Math.max(0, skip);
  const run: ArchetypeQuestion[] = [];

  // Alternating, and starting on whichever side actually has cards. A set with
  // three separable questions and hundreds of inseparable ones serves a run
  // that is mostly the latter rather than a run of three.
  for (let i = 0; run.length < limit; i++) {
    const a = separated[from + i];
    const b = same[from + i];
    if (!a && !b) break;
    if (a && i < half) run.push(a);
    if (b && run.length < limit && i < half) run.push(b);
    if (!a && b && i >= half) run.push(b);
    if (a && !b && i >= half) run.push(a);
  }

  return run.slice(0, limit);
}

/**
 * How a guess went.
 *
 * Two outcomes rather than the misses drill's three, and that is a property of
 * the question: there are two decks on the screen and no third thing a person
 * can do. The vocabulary is `read`/`misread` because what is being tested is a
 * read of what a deck wants, which is the word the game already uses for it.
 */
export type ArchetypeOutcome = "read" | "misread";

/** The answer for a card whose decks the data cannot separate. */
export const SAME = "same";

export interface ArchetypeResult {
  outcome: ArchetypeOutcome;
  correct: boolean;
  /**
   * Which kind of wrong, because the three are three different lessons.
   *
   * - `stronger-deck` -- named the deck that simply wins more. The archetype
   *   quiz's version of `tookRawBest`: answering "which of these is the better
   *   deck" when the question was "which of these wants this card".
   * - `saw-difference` -- called a coin flip a difference. The commonest real
   *   mistake in Limited and the one this drill's third answer exists for.
   * - `saw-none` -- called a real difference a coin flip. The opposite error,
   *   and if it dominates then the third answer is too tempting and the run's
   *   half-and-half split is doing harm.
   * - `wrong-deck` -- picked a deck, there was a real answer, it was the other
   *   one, and it was not the stronger deck either.
   */
  mistake: "stronger-deck" | "saw-difference" | "saw-none" | "wrong-deck" | null;
}

/**
 * Takes the question's own decks rather than the set's table, so a client can
 * grade what it was handed without holding anything else.
 */
export function gradeArchetypeGuess(
  question: Pick<ArchetypeQuestion, "wants" | "spurns" | "separated"> & {
    decks: readonly Pick<DeckLift, "colors" | "deckWr">[];
  },
  guess: string,
): ArchetypeResult {
  // The answer is a deck when the data can name one, and `SAME` when it cannot.
  const answer = question.separated ? question.wants : SAME;
  const correct = guess === answer;

  const rate = new Map(question.decks.map((d) => [d.colors, d.deckWr]));
  const wanted = rate.get(question.wants) ?? 0;
  const spurned = rate.get(question.spurns) ?? 0;

  return {
    outcome: correct ? "read" : "misread",
    correct,
    mistake: correct
      ? null
      : guess === SAME
        ? "saw-none"
        : !question.separated
          ? "saw-difference"
          : // Only when the decks actually differ in strength: if the deck that
            // wants the card is also the better one, no guess can be this kind
            // of wrong and marking one would count the question, not the answer.
            spurned > wanted
            ? "stronger-deck"
            : "wrong-deck",
  };
}

export interface ArchetypeRunScore {
  answered: number;
  read: number;
  misread: number;
}

export function scoreArchetypeRun(
  results: readonly ArchetypeResult[],
): ArchetypeRunScore {
  return {
    answered: results.length,
    read: results.filter((r) => r.outcome === "read").length,
    misread: results.filter((r) => r.outcome === "misread").length,
  };
}

/**
 * What the game calls each deck of two or three colours.
 *
 * Wizards' own names -- the Ravnica guilds, and the shards and wedges from
 * Alara and Khans -- and the reason they are here is that idea #1 asked for
 * exactly this: "it'd teach me what the archetypes even are". A row of pips
 * says which colours; only the name says which deck, and a person who has read
 * "Boros" on this screen can read it everywhere else the game is discussed.
 *
 * THIS MAP IS ALSO THE WIDTH RULE. `archetypeQuestions` asks about decks of two
 * and three colours, and the derivation of that bound is this table: these are
 * the decks the game has a word for. A five-colour row would go on the screen
 * as "WUBRG", which teaches nothing and is not a deck anybody drafts toward.
 *
 * Keyed in WUBRG order, which is the order every other colour string in this
 * codebase is written in -- see `colorKey` in scoring/context.ts.
 */
export const DECK_NAMES: Readonly<Record<string, string>> = {
  WU: "Azorius",
  WB: "Orzhov",
  WR: "Boros",
  WG: "Selesnya",
  UB: "Dimir",
  UR: "Izzet",
  UG: "Simic",
  BR: "Rakdos",
  BG: "Golgari",
  RG: "Gruul",

  WUB: "Esper",
  WUR: "Jeskai",
  WUG: "Bant",
  WBR: "Mardu",
  WBG: "Abzan",
  WRG: "Naya",
  UBR: "Grixis",
  UBG: "Sultai",
  URG: "Temur",
  BRG: "Jund",
};

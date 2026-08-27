/**
 * The archetype quiz: one card, two decks, which one wants it.
 *
 * Notes Ideas #1 asked for "a quiz on what archetype a mono-coloured card
 * belongs to", and the data will not answer that question as asked. Measured
 * over every mono-coloured card in all 26 artifacts: naming which ONE of the
 * decks in a card's colour wants it most clears two standard errors for 3.5% of
 * them. The rest are indistinguishable, which is trap #3 one level up -- the
 * gaps between the decks are smaller than the error bars on those gaps.
 *
 * NARROWED TO TWO DECKS IT COMES ALIVE: 1,149 cards, 30.1% of every candidate,
 * and 17-89 questions in every set but one. `pnpm diagnose-archetype-quiz` is
 * that measurement, kept so the gate can be re-argued rather than remembered.
 *
 * THREE-COLOUR DECKS ARE IN, AND THEY ARE WHAT MAKE IT UNIVERSAL. Pairs alone
 * left ktk, snc, sos and tdm with nothing to ask -- they are three-colour
 * formats, where the wedges and shards ARE the archetypes and the pairs are a
 * rounding error. Adding widths of three takes those four from 0, 0, 0 and 0
 * questions to 19, 38, 21 and 17, and the bank as a whole from 961 to 1,149.
 * STX is now the only set that cannot ask anything, because it has no archetype
 * data at all -- notes issue #8, and this drill is the first surface that says
 * so out loud instead of quietly degrading.
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
 * THE GRADE IS THE GAP, NOT THE WINNER. A question is only asked when the best
 * and worst decks are separated by `ARCHETYPE_QUIZ.minSigmas` -- and the
 * variance is the card's rate in BOTH decks plus both decks' own rates, summed
 * rather than pooled. Summing is conservative in the right direction: the card's
 * games inside a deck are a subset of that deck's games, so the two are
 * positively correlated and the true variance of the difference is smaller than
 * this. A question that survives an over-estimate of its own noise is a question
 * that is really there.
 */

/** A deck's own win rate, with no card dimension. `colorWinRates` in the stats. */
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
  /** The deck that wants it. `decks[0]`. */
  wants: string;
  /** The deck that wants it least. The last of `decks`. */
  spurns: string;
  /** How many standard errors separate those two. Never below the gate. */
  sigmas: number;
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

export interface QuestionOptions {
  /** How many decks a card must have rates in before it is asked about. */
  minDecks: number;
  /** How far apart the best and worst deck must be, in standard errors. */
  minSigmas: number;
}

/**
 * Every question a set can ask, clearest first.
 *
 * RANKED BY SEPARATION RATHER THAN SHUFFLED, which is the same call
 * `rankMisses` makes and for a better reason here: the top of this list is the
 * cards whose decks disagree most, and those are the ones a person can actually
 * learn something from. A shuffle would spend a run's first question on a
 * card two decks barely disagree about, and a drill's first question is the one
 * that decides whether there is a second.
 *
 * `colorOf` is asked for every candidate rather than looked up on the row,
 * because the stats artifact has no colours on it -- they live on the set's
 * cards. Returning undefined drops the card, which is what happens to a card
 * the set no longer has.
 */
export function archetypeQuestions(
  rates: readonly CardDeckRate[],
  decks: readonly DeckRate[],
  colorOf: (name: string) => string | undefined,
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
    // only been played in white decks is not taught as a white card.
    if (colorOf(name) !== shared) continue;

    const lifts = deckLifts(rows, decks);
    if (lifts.length < 2) continue;

    const wants = lifts[0];
    const spurns = lifts[lifts.length - 1];
    const sigmas = separation(wants, spurns);
    if (sigmas < options.minSigmas) continue;

    questions.push({
      name,
      color: shared,
      decks: lifts,
      wants: wants.colors,
      spurns: spurns.colors,
      sigmas,
    });
  }

  return questions.sort((a, b) => b.sigmas - a.sigmas);
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

export interface ArchetypeResult {
  outcome: ArchetypeOutcome;
  correct: boolean;
  /**
   * Wrong by taking the deck that simply wins more.
   *
   * The archetype quiz's version of `tookRawBest`, and the most interesting way
   * to be wrong here: it is a person answering "which of these decks is better"
   * when the question was "which of these decks wants this card". Worth its own
   * sentence on the reveal, and worth counting -- if it is most of the misses
   * then the two decks on screen need to say less about themselves.
   */
  tookStrongerDeck: boolean;
}

/**
 * Takes the question's own decks rather than the set's table, so a client can
 * grade what it was handed without holding anything else.
 */
export function gradeArchetypeGuess(
  question: Pick<ArchetypeQuestion, "wants" | "spurns"> & {
    decks: readonly Pick<DeckLift, "colors" | "deckWr">[];
  },
  guess: string,
): ArchetypeResult {
  const correct = guess === question.wants;
  const rate = new Map(question.decks.map((d) => [d.colors, d.deckWr]));
  const wanted = rate.get(question.wants) ?? 0;
  const spurned = rate.get(question.spurns) ?? 0;
  return {
    outcome: correct ? "read" : "misread",
    correct,
    // Only when the two decks actually differ: if the deck that wants the card
    // is also the stronger one, no guess can be this kind of wrong and marking
    // one would be counting the question rather than the answer.
    tookStrongerDeck: !correct && spurned > wanted,
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

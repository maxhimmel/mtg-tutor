import { describe, expect, it } from "vitest";
import {
  DECK_NAMES,
  SAME,
  archetypeQuestions,
  dealArchetypeRun,
  deckLifts,
  gradeArchetypeGuess,
  scoreArchetypeRun,
  decisionBand,
  rangePValue,
  rangeThreshold,
  separation,
  sharedColor,
  type ArchetypeQuestion,
  type CardDeckRate,
  type DeckRate,
} from "./archetypes.js";

// The decks of a small invented format. Rates are far apart and samples are
// large, so a test that cares about ordering is never at the mercy of the
// separation gate, and a test that cares about the gate sets its own numbers.
const DECKS: DeckRate[] = [
  { colors: "WU", n: 20000, wr: 0.6 },
  { colors: "WB", n: 20000, wr: 0.5 },
  { colors: "WR", n: 20000, wr: 0.55 },
  { colors: "WG", n: 20000, wr: 0.52 },
  { colors: "WUB", n: 20000, wr: 0.54 },
];

const rate = (colors: string, wr: number, n = 5000, name = "Cathar Commando"): CardDeckRate => ({
  name,
  colors,
  n,
  wr,
});

describe("deckLifts", () => {
  // The whole point of the statistic: the deck that wins most is not the deck
  // that wants the card most, and a quiz built on raw rates would teach the
  // former while claiming the latter.
  it("measures a card against the deck's own rate, not the format's", () => {
    const lifts = deckLifts([rate("WU", 0.62), rate("WB", 0.56)], DECKS);

    // WU is the higher raw rate and the LOWER appetite: +2pp on a deck that
    // wins 60 anyway, against +6pp on one that wins 50.
    expect(lifts.map((l) => l.colors)).toEqual(["WB", "WU"]);
    expect(lifts[0].lift).toBeCloseTo(0.06, 5);
    expect(lifts[1].lift).toBeCloseTo(0.02, 5);
  });

  // Not a filter for tidiness. A lift against a baseline measured on a
  // different population is two numbers that never met, and it would sort
  // cleanly beside real ones with nothing marking it apart.
  it("drops a deck the set has no baseline for rather than substituting one", () => {
    const lifts = deckLifts([rate("WU", 0.62), rate("UG", 0.7)], DECKS);

    expect(lifts.map((l) => l.colors)).toEqual(["WU"]);
  });

  it("carries a variance that falls as the sample grows", () => {
    const [small] = deckLifts([rate("WU", 0.62, 300)], DECKS);
    const [large] = deckLifts([rate("WU", 0.62, 30000)], DECKS);

    expect(small.variance).toBeGreaterThan(large.variance);
  });
});

describe("separation", () => {
  it("counts the gap in standard errors, so a wide gap on thin data is not a finding", () => {
    const thin = deckLifts([rate("WB", 0.56, 210), rate("WU", 0.62, 210)], DECKS);
    const thick = deckLifts([rate("WB", 0.56, 40000), rate("WU", 0.62, 40000)], DECKS);

    // Identical lifts either way; only the confidence moves.
    expect(separation(thin[0], thin[1])).toBeLessThan(separation(thick[0], thick[1]));
  });
});

describe("sharedColor", () => {
  // The decks a mono-red card gets played in are exactly the ones with red in
  // them, which is what lets a colour be read off the archetype table at all.
  it("names the one colour every deck has in common", () => {
    expect(sharedColor(["WR", "UR", "BR", "RG", "BRG", "WUR"])).toBe("R");
  });

  // A gold card is in decks that share BOTH its colours, so there is no single
  // answer -- which is the test that keeps gold cards out of a quiz about
  // mono-coloured ones.
  it("refuses when two colours are shared", () => {
    expect(sharedColor(["RG", "BRG", "URG", "WRG"])).toBeUndefined();
  });

  it("refuses when nothing is shared", () => {
    expect(sharedColor(["WU", "BR"])).toBeUndefined();
  });

  it("refuses an empty list rather than throwing", () => {
    expect(sharedColor([])).toBeUndefined();
  });
});

describe("archetypeQuestions", () => {
  const white = (name: string, rates: [string, number][], n = 5000): CardDeckRate[] =>
    rates.map(([colors, wr]) => rate(colors, wr, n, name));

  const opts = { minDecks: 3, falsePositive: 0.05 };
  const allWhite = () => ({ colors: "W" });

  it("asks about a card its decks disagree about, naming both ends", () => {
    const [q] = archetypeQuestions(
      white("Cathar Commando", [
        ["WU", 0.6],
        ["WB", 0.58],
        ["WR", 0.62],
      ]),
      DECKS,
      allWhite,
      opts,
    );

    // WB is +8pp on a 50% deck; WU is dead level on a 60% one.
    expect(q).toMatchObject({ name: "Cathar Commando", color: "W", wants: "WB", spurns: "WU" });
    expect(rangePValue(q.sigmas, 3)).toBeLessThan(0.05);
    // Every deck is carried, not just the two asked about -- the reveal needs
    // the whole picture even though the grade only uses the ends.
    expect(q.decks).toHaveLength(3);
  });

  // The finding this drill is built around: most cards' decks cannot be told
  // apart. It is not a rejection -- the card is still asked about, and "they
  // want it the same" is the right answer.
  it("keeps a card whose decks are inside the error bars, and marks it unseparated", () => {
    const [q] = archetypeQuestions(
      white(
        "Fading Hope",
        [
          ["WU", 0.605],
          ["WB", 0.505],
          ["WR", 0.555],
        ],
        400,
      ),
      DECKS,
      allWhite,
      opts,
    );

    expect(q).toMatchObject({ name: "Fading Hope", separated: false });
    expect(q.pValue).toBeGreaterThan(0.05);
  });

  it("refuses a card too few decks have an opinion about", () => {
    const questions = archetypeQuestions(
      white("Fading Hope", [
        ["WU", 0.6],
        ["WB", 0.58],
      ]),
      DECKS,
      allWhite,
      opts,
    );

    expect(questions).toEqual([]);
  });

  // The colour check the archetype table alone cannot do. These decks all share
  // white, so the table would call this a white card; the set says otherwise.
  it("refuses a card whose real colour is not the one its decks share", () => {
    const questions = archetypeQuestions(
      white("Wastes", [
        ["WU", 0.6],
        ["WB", 0.58],
        ["WR", 0.62],
      ]),
      DECKS,
      () => undefined,
      opts,
    );

    expect(questions).toEqual([]);
  });

  // Two and three, because those are the widths the game names -- and the same
  // table that names them is what bounds this.
  it("ignores decks of a width the game has no name for", () => {
    const rates = white("Cathar Commando", [
      ["WU", 0.6],
      ["WB", 0.58],
      ["WR", 0.62],
    ]);
    rates.push(rate("W", 0.9, 5000, "Cathar Commando"));
    rates.push(rate("WUBRG", 0.1, 5000, "Cathar Commando"));

    const [q] = archetypeQuestions(
      rates,
      [...DECKS, { colors: "W", n: 20000, wr: 0.4 }, { colors: "WUBRG", n: 20000, wr: 0.4 }],
      allWhite,
      opts,
    );

    // Without the width rule the mono-W row is a +50pp lift and would be the
    // answer to every question this card could be asked.
    expect(q.decks.map((d) => d.colors).sort()).toEqual(["WB", "WR", "WU"]);
    expect(q.wants).toBe("WB");
  });

  // A three-colour deck is a first-class answer, and in ktk, snc, sos and tdm
  // it is the only kind there is.
  it("asks about wedges and shards the same way it asks about pairs", () => {
    const [q] = archetypeQuestions(
      white("Cathar Commando", [
        ["WU", 0.6],
        ["WB", 0.5],
        ["WUB", 0.62],
      ]),
      DECKS,
      allWhite,
      opts,
    );

    expect(q.wants).toBe("WUB");
    expect(DECK_NAMES[q.wants]).toBe("Esper");
  });

  // The bug the range gate exists for, shown rather than asserted about.
  //
  // One gap, 2.6 standard errors wide, and the only thing that changes is how
  // many decks were looked at to find it. Three decks ask for 2.34 and take it;
  // six ask for 2.85 and refuse it. Under the flat gate this shipped with, both
  // passed -- and the extra decks were free evidence for a difference nobody
  // had, concentrated on the cards that get played in the most decks.
  it("calls the same gap separated on three decks and not on six", () => {
    const decks = [
      ...DECKS,
      { colors: "WUR", n: 20000, wr: 0.55 },
      { colors: "WBR", n: 20000, wr: 0.55 },
    ];
    // Lifts of +1.5pp and −1.4pp against those baselines; every other deck sits
    // exactly on its own rate, so adding them cannot widen the range.
    const ends: [string, number][] = [
      ["WU", 0.615],
      ["WB", 0.486],
      ["WR", 0.55],
    ];
    const middle: [string, number][] = [
      ["WG", 0.52],
      ["WUB", 0.54],
      ["WUR", 0.55],
    ];

    const [three] = archetypeQuestions(white("Three", ends), decks, allWhite, opts);
    const six = archetypeQuestions(white("Six", [...ends, ...middle]), decks, allWhite, opts);

    expect(rangePValue(three.sigmas, 3)).toBeLessThan(0.05);
    expect(rangePValue(three.sigmas, 6)).toBeGreaterThan(0.05);
    expect(three.separated).toBe(true);
    expect(six[0].separated).toBe(false);
  });

  // A mono-coloured LAND passes every colour check there is, because
  // data/mapping.ts deliberately gives a land its colour identity where
  // Scryfall gives it none. Two of 254 real questions were lands before this,
  // and one was a third of tdm's whole bank.
  it("refuses a land even though its colour is real", () => {
    const rates = white("Boseiju, Who Endures", [
      ["WU", 0.6],
      ["WB", 0.58],
      ["WR", 0.62],
    ]);

    expect(
      archetypeQuestions(rates, DECKS, () => ({ colors: "W", role: "land" }), opts),
    ).toEqual([]);
    // Same card, same numbers, not a land -- so the refusal above is the role
    // and not something else about the fixture.
    expect(
      archetypeQuestions(rates, DECKS, () => ({ colors: "W", role: "creature" }), opts),
    ).toHaveLength(1);
  });

  // The clearest questions first, because a drill's first question decides
  // whether there is a second one.
  it("ranks the sharpest disagreements first", () => {
    const questions = archetypeQuestions(
      [
        ...white("Sharp", [
          ["WU", 0.6],
          ["WB", 0.6],
          ["WR", 0.55],
        ]),
        ...white("Sharper", [
          ["WU", 0.6],
          ["WB", 0.66],
          ["WR", 0.55],
        ]),
      ],
      DECKS,
      allWhite,
      opts,
    );

    expect(questions.map((q) => q.name)).toEqual(["Sharper", "Sharp"]);
  });
});

describe("gradeArchetypeGuess", () => {
  const decks = [
    { colors: "WB", deckWr: 0.5 },
    { colors: "WU", deckWr: 0.6 },
  ];
  // WB wants it, and WB is the WORSE deck -- which is the trap the drill is for.
  const real = { wants: "WB", spurns: "WU", separated: true, decks };
  const same = { ...real, separated: false };

  it("reads a guess for the deck that wants the card", () => {
    expect(gradeArchetypeGuess(real, "WB")).toEqual({
      outcome: "read",
      correct: true,
      mistake: null,
    });
  });

  // The third answer, and the one most cards in a colour have.
  it("reads SAME on a card whose decks cannot be separated", () => {
    expect(gradeArchetypeGuess(same, SAME)).toMatchObject({
      outcome: "read",
      correct: true,
    });
  });

  it("refuses SAME when there is a real answer", () => {
    expect(gradeArchetypeGuess(real, SAME)).toMatchObject({
      outcome: "misread",
      mistake: "saw-none",
    });
  });

  // The commonest real mistake in Limited: seeing a difference that is not
  // there. The whole reason the third answer exists.
  it("names a difference seen where there is none", () => {
    expect(gradeArchetypeGuess(same, "WB")).toMatchObject({
      outcome: "misread",
      mistake: "saw-difference",
    });
  });

  // Answering "which of these is the better deck" when the question was "which
  // of these wants this card".
  it("names the miss that took the stronger deck", () => {
    expect(gradeArchetypeGuess(real, "WU")).toMatchObject({
      outcome: "misread",
      mistake: "stronger-deck",
    });
  });

  // When the deck that wants the card is also the better one there is no such
  // trap to fall into, and marking one would count the question, not the answer.
  it("does not call it a stronger-deck miss when the wanted deck is stronger", () => {
    const flipped = { ...real, wants: "WU", spurns: "WB" };

    expect(gradeArchetypeGuess(flipped, "WB")).toMatchObject({
      outcome: "misread",
      mistake: "wrong-deck",
    });
  });
});

describe("dealArchetypeRun", () => {
  const q = (name: string, separated: boolean): ArchetypeQuestion => ({
    name,
    color: "W",
    decks: [],
    // On the gate. These fixtures are about the run's composition, not about
    // how far past its bar any one question sat.
    margin: 1,
    wants: "WB",
    spurns: "WU",
    sigmas: separated ? 4 : 1,
    pValue: separated ? 0.001 : 0.5,
    separated,
  });

  const real = Array.from({ length: 20 }, (_, i) => q(`real${i}`, true));
  const same = Array.from({ length: 200 }, (_, i) => q(`same${i}`, false));

  // The derivation: past half, always answering "they are the same" becomes the
  // winning strategy, and a drill that scores a person for giving up is worse
  // than no drill.
  it("deals half a run from each kind", () => {
    const run = dealArchetypeRun([...real, ...same], 8);

    expect(run).toHaveLength(8);
    expect(run.filter((x) => x.separated)).toHaveLength(4);
  });

  // A run that blocks its two kinds is a run somebody reads off its own shape
  // by question five and then stops thinking about the cards.
  it("interleaves them rather than blocking them", () => {
    const run = dealArchetypeRun([...real, ...same], 8);

    expect(run.map((x) => x.separated)).toEqual([
      true, false, true, false, true, false, true, false,
    ]);
  });

  // A set with three separable cards and hundreds of coin flips still gets a
  // full run, because the alternative is a run of three.
  it("fills from whichever kind it has when one runs out", () => {
    const run = dealArchetypeRun([...real.slice(0, 2), ...same], 8);

    expect(run).toHaveLength(8);
    expect(run.filter((x) => x.separated)).toHaveLength(2);
  });

  it("pages both kinds so a second run repeats neither", () => {
    const first = dealArchetypeRun([...real, ...same], 8);
    const second = dealArchetypeRun([...real, ...same], 8, 4);

    const names = new Set(first.map((x) => x.name));
    expect(second.some((x) => names.has(x.name))).toBe(false);
  });

  it("deals nothing out of nothing", () => {
    expect(dealArchetypeRun([], 8)).toEqual([]);
  });
});

describe("scoreArchetypeRun", () => {
  it("tallies a run", () => {
    const r = (outcome: "read" | "misread") => ({
      outcome,
      correct: outcome === "read",
      mistake: null,
    });

    expect(scoreArchetypeRun([r("read"), r("misread"), r("read")])).toEqual({
      answered: 3,
      read: 2,
      misread: 1,
    });
  });
});

describe("rangePValue", () => {
  // Quantiles from 2,000,000 simulated draws of k standard normals -- an
  // INDEPENDENT implementation of the same null, so this pins the closed form
  // against something that shares none of its arithmetic.
  const SIMULATED_95TH: Record<number, number> = {
    2: 1.96,
    3: 2.34,
    4: 2.57,
    5: 2.73,
    6: 2.85,
    7: 2.95,
    8: 3.03,
    9: 3.1,
    10: 3.16,
  };

  it("agrees with the simulated null at every deck count", () => {
    for (const [k, sigmas] of Object.entries(SIMULATED_95TH)) {
      expect(rangePValue(sigmas, Number(k))).toBeCloseTo(0.05, 2);
    }
  });

  // The anchor. With two decks there is nothing to maximise over, so the range
  // test collapses to the ordinary two-sided z-test -- and 1.96 catches a wrong
  // divisor, a one-sided quantile and an off-by-one in the quadrature, which
  // are the three ways this goes wrong.
  it("is the plain two-sided z-test at two decks", () => {
    expect(rangePValue(1.96, 2)).toBeCloseTo(0.05, 3);
    expect(rangePValue(2.576, 2)).toBeCloseTo(0.01, 3);
  });

  // The whole reason the gate is not a flat number.
  it("charges more for the same gap the more decks it was chosen from", () => {
    const ps = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => rangePValue(2.5, k));
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThan(ps[i - 1]);
  });

  it("refuses to find anything in a gap of nothing", () => {
    expect(rangePValue(0, 4)).toBe(1);
    expect(rangePValue(Number.NaN, 4)).toBe(1);
    expect(rangePValue(3, 1)).toBe(1);
  });
});

describe("rangeThreshold and decisionBand", () => {
  it("inverts the p-value it is the other half of", () => {
    for (const k of [2, 3, 5, 8, 10]) {
      expect(rangePValue(rangeThreshold(k, 0.05), k)).toBeCloseTo(0.05, 3);
    }
  });

  // The property the whole picture rests on: bands that just touch are a gap
  // that just clears the bar. Without it the screen could draw two bands
  // clearly apart and print "the decks are level" underneath them.
  it("draws bands that touch exactly at the threshold", () => {
    for (const k of [3, 5, 10]) {
      const sd = 0.012;
      const band = decisionBand(sd, k, 0.05);
      // Two ends whose bands exactly touch: the gap is the two half-widths.
      const gap = band * 2;
      const sigmas = gap / Math.sqrt(sd * sd + sd * sd);
      expect(sigmas).toBeCloseTo(rangeThreshold(k, 0.05), 6);
    }
  });

  // A wider band on a thinner sample, which is the thing the picture is for.
  it("draws a wider band for fewer games", () => {
    expect(decisionBand(0.02, 5, 0.05)).toBeGreaterThan(decisionBand(0.005, 5, 0.05));
  });

  // More decks in the running means a wider bar to clear, so the bands grow --
  // which is what makes "it only looks best because it won a five-way race"
  // visible rather than asserted.
  it("draws wider bands the more decks were compared", () => {
    expect(decisionBand(0.01, 10, 0.05)).toBeGreaterThan(decisionBand(0.01, 3, 0.05));
  });
});

describe("DECK_NAMES", () => {
  // The map is also the width rule -- `archetypeQuestions` asks about the decks
  // the game names, so a gap here is a deck that silently stops being askable.
  it("names all ten pairs and all ten wedges and shards", () => {
    const keys = Object.keys(DECK_NAMES);

    expect(keys.filter((k) => k.length === 2)).toHaveLength(10);
    expect(keys.filter((k) => k.length === 3)).toHaveLength(10);
  });

  // Every colour string in this codebase is written in WUBRG order, and a key
  // out of order is a deck that can never be looked up.
  it("keys every deck in WUBRG order", () => {
    const order = "WUBRG";
    for (const key of Object.keys(DECK_NAMES)) {
      const sorted = [...key].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("");
      expect(key).toBe(sorted);
    }
  });
});

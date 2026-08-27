import { describe, expect, it } from "vitest";
import {
  DECK_NAMES,
  archetypeQuestions,
  deckLifts,
  gradeArchetypeGuess,
  scoreArchetypeRun,
  separation,
  sharedColor,
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

  const opts = { minDecks: 3, minSigmas: 2 };
  const allWhite = () => "W";

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
    expect(q.sigmas).toBeGreaterThan(2);
    // Every deck is carried, not just the two asked about -- the reveal needs
    // the whole picture even though the grade only uses the ends.
    expect(q.decks).toHaveLength(3);
  });

  // The finding this drill exists because of: most cards' decks cannot be told
  // apart, and serving those would be grading somebody against noise.
  it("refuses a card whose best and worst decks are inside the error bars", () => {
    const questions = archetypeQuestions(
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

    expect(questions).toEqual([]);
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
  const question = {
    name: "Cathar Commando",
    color: "W",
    decks: [],
    wants: "WB",
    spurns: "WU",
    sigmas: 3,
  };

  it("reads a guess for the deck that wants the card", () => {
    expect(gradeArchetypeGuess(question, DECKS, "WB")).toEqual({
      outcome: "read",
      correct: true,
      tookStrongerDeck: false,
    });
  });

  // The interesting way to be wrong: answering "which of these decks is better"
  // when the question was "which of these decks wants this card".
  it("marks a miss that took the stronger deck instead", () => {
    expect(gradeArchetypeGuess(question, DECKS, "WU")).toMatchObject({
      outcome: "misread",
      tookStrongerDeck: true,
    });
  });

  // When the deck that wants the card is also the better deck there is no such
  // trap to fall into, and marking one would be counting the question rather
  // than the answer.
  it("does not mark it when the wanted deck is the stronger one", () => {
    const flipped = { ...question, wants: "WU", spurns: "WB" };

    expect(gradeArchetypeGuess(flipped, DECKS, "WB")).toMatchObject({
      outcome: "misread",
      tookStrongerDeck: false,
    });
  });
});

describe("scoreArchetypeRun", () => {
  it("tallies a run", () => {
    const r = (outcome: "read" | "misread") => ({
      outcome,
      correct: outcome === "read",
      tookStrongerDeck: false,
    });

    expect(scoreArchetypeRun([r("read"), r("misread"), r("read")])).toEqual({
      answered: 3,
      read: 2,
      misread: 1,
    });
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

// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

// What the deck-speed drill will and will not ask, THROUGH THE QUERY.
//
// WHY THIS FILE EXISTS, and it is not the usual reason.
//
// The drill shipped with `deckSpeedQuestions` covered by twenty-four unit tests
// in core and `deal` covered by none. Everything anybody claimed about the drill
// working came from running the core function over an artifact -- which cannot
// see the query at all: not the four refusals, not the roles read, not whether
// `turnStats` survives an ingest. So a set that had been seeded and ingested was
// reported working on evidence that could not show it, twice, and the actual
// state was only ever visible by opening the page.
//
// The refusals are most of what is tested here, because they are most of what
// this query does. Four causes, and getting one wrong puts a sentence in front of
// a player that is either a promise nobody can keep or a shrug where there was a
// real answer.

const ISS = "https://example.workos.com";
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: `${ISS}|${subject}`, issuer: ISS, role: "tester" });

const SET = { code: "tst", format: "TradDraft" };

/** The day every deal is asked on, unless a test is about the day changing. */
const TODAY = "2026-09-07";

/** The next calendar day, so a test never has to hard-code the clock's answer. */
const dayAfter = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Any answer but the right one, so a test can miss on purpose. */
const wrongly = (answer: string) => (answer === "middle" ? "fast" : "middle");

/** The day the store actually wrote its rows on, which is the server's clock. */
const writtenOn = async (t: ReturnType<typeof harness>) =>
  (await t.run(async (ctx) => ctx.db.query("drillAnswers").first()))!.at.slice(0, 10);

const DECKS = [
  { colors: "WU", n: 20000, wr: 0.6 },
  { colors: "WB", n: 20000, wr: 0.5 },
];

const ARCHETYPES = [{ name: "Anything", colors: "WU", n: 8000, wr: 0.55 }];

/** A measured card. Defaults are sharp enough to clear the precision gate. */
const statCard = (
  name: string,
  deckSpeed: number,
  deckSpeedSe = 0.02,
  deckSpeedN = 9000,
) => ({
  name,
  gihN: 9000,
  ohN: 3000,
  gdN: 6000,
  gndN: 1000,
  deckN: 9000,
  seen: 12000,
  taken: 6000,
  deckSpeed,
  deckSpeedSe,
  deckSpeedN,
});

const engineCard = (name: string, role = "creature") => ({
  name,
  colors: ["W"],
  slot: "common" as const,
  value: 40,
  turn: 2,
  role: role as "creature" | "land",
});

const cardText = (name: string) => ({
  name,
  colorIdentity: ["W"] as ("W" | "U" | "B" | "R" | "G")[],
  collectorNumber: "1",
  manaCost: "{1}{W}",
  cmc: 2,
  typeLine: "Creature — Human Soldier",
  oracleText: "Vigilance.",
  rarity: "common" as const,
});

/**
 * A spread of cards wide enough that the set has a real sd, because BOTH gates
 * are fractions of it. A fixture of two cards would be tested against a spread
 * no set has -- the same mistake the core fixture originally made.
 */
const SPREAD = [
  statCard("Fast One", -0.45),
  statCard("Fast Two", -0.3),
  statCard("Fast Three", -0.2),
  statCard("Flat One", 0.01),
  statCard("Flat Two", -0.02),
  statCard("Flat Three", 0.03),
  statCard("Slow One", 0.22),
  statCard("Slow Two", 0.34),
  statCard("Slow Three", 0.47),
];

async function seed(
  t: ReturnType<typeof harness>,
  opts: {
    cards?: ReturnType<typeof statCard>[];
    turnStats?: { mean: number; byColors: Record<string, number> } | undefined;
    roles?: Record<string, string>;
    archetypes?: { name: string; colors: string; wr: number; n: number }[];
    colorWinRates?: { colors: string; n: number; wr: number }[];
    omitStats?: boolean;
  } = {},
) {
  const cards = opts.cards ?? SPREAD;
  await t.run(async (ctx) => {
    await ctx.db.insert("sets", {
      code: SET.code,
      format: SET.format,
      cardCount: cards.length,
      ratedCardCount: cards.length,
      ingestedAt: new Date(0).toISOString(),
    });
    await ctx.db.insert("setCards", {
      code: SET.code,
      format: SET.format,
      cards: cards.map((c) => engineCard(c.name, opts.roles?.[c.name])),
      colorWinRates: opts.colorWinRates ?? DECKS,
    });
    if (!opts.omitStats) {
      await ctx.db.insert("setStats", {
        code: SET.code,
        format: SET.format,
        games: 100000,
        baseWinRate: 0.55,
        cards,
        archetypes: opts.archetypes ?? ARCHETYPES,
        colorWinRates: opts.colorWinRates ?? DECKS,
        synergies: [],
        builtAt: new Date(0).toISOString(),
        ...("turnStats" in opts
          ? { turnStats: opts.turnStats }
          : { turnStats: { mean: 9.2, byColors: { WU: 9.4, WB: 9.0 } } }),
      });
    }
    for (const c of cards) {
      await ctx.db.insert("setCardText", {
        code: SET.code,
        format: SET.format,
        key: c.name.toLowerCase(),
        text: cardText(c.name),
      });
    }
  });
}

describe("drills/deckSpeed.deal", () => {
  it("deals a run and hydrates the card, which is the thing nobody ever ran", async () => {
    const t = harness();
    await seed(t);

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });

    expect(run.mute).toBeNull();
    expect(run.questions.length).toBeGreaterThan(0);
    expect(run.quizzable).toBeGreaterThan(0);
    // In turns, one per set, and the reveal draws it. Zero would draw a band of
    // no width and make every card look like an end.
    expect(run.worthSaying).toBeGreaterThan(0);
    expect(run.formatTurns).toBeCloseTo(9.2);
    expect(run.questions[0].card).toMatchObject({
      name: expect.any(String),
      typeLine: "Creature — Human Soldier",
    });
  });

  it("serves all three answers and never repeats a card", async () => {
    const t = harness();
    await seed(t);

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    const answers = new Set(run.questions.map((q) => q.answer));
    expect(answers.has("middle")).toBe(true);
    expect(answers.size).toBeGreaterThan(1);
    expect(new Set(run.questions.map((q) => q.card.name)).size).toBe(run.questions.length);
  });

  // THE SLOT DEFECT, IN THIS DRILL'S COPY -- and the reason this test exists
  // separately from the one below it. The archetype quiz got a regression for
  // this and deck speed got one that could not fail: on the nine-card SPREAD
  // fixture the fresh pile has nothing left to over-spend after one run, so the
  // old concatenated version passed it. That is trap #4 committed inside the fix
  // for trap #4. This seeds thirty fresh cards, which is what every real set
  // looks like, so the fresh half alone can fill the run twice over.
  it("still serves a repeat when the fresh pile could fill the whole run", async () => {
    const t = harness();
    const many = [
      statCard("Missed One", -0.45),
      ...Array.from({ length: 30 }, (_, i) => statCard(`Fresh ${i}`, 0.2 + i * 0.01)),
    ];
    await seed(t, { cards: many });

    const alice = as(t, "alice");
    const first = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: TODAY,
    });
    const missed = first.questions.find((q) => q.card.name === "Missed One");
    expect(missed).toBeDefined();

    // Every card of the run answered, and the one card misread on purpose, so
    // exactly one thing is due back.
    for (const q of first.questions) {
      await alice.mutation(api.drills.answers.record, {
        drill: "deckSpeed",
        setCode: SET.code,
        name: q.card.name,
        answered: q === missed ? wrongly(q.answer) : q.answer,
        correct: q.answer,
        sigmas: q.sigmas,
        margin: q.margin,
        attemptId: `run-1:${q.card.name}`,
      });
    }
    const wrote = await writtenOn(t);

    const back = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: dayAfter(wrote),
    });

    // A full run, and the repeat is in it -- which the concatenated version
    // could not manage, because the fresh over-deal reached the run length
    // before the appended repeat was ever examined.
    expect(back.questions).toHaveLength(8);
    expect(back.questions.filter((q) => q.repeat)).toHaveLength(1);
    expect(back.questions.at(-1)?.card.name).toBe("Missed One");
  });

  // THE DEFECT THIS TABLE WAS ADDED FOR, in this drill's version. `servingOrder`
  // ranks the whole bank once and `dealDeckSpeedRun` slices it, so a run used to
  // be paged by a `skip` the client reset on reload -- and a second sitting on a
  // set dealt the same eight cards as the first, forever.
  it("does not deal a card back once it has been answered", async () => {
    const t = harness();
    await seed(t);

    const alice = as(t, "alice");
    const first = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: TODAY,
    });
    expect(first.questions.length).toBeGreaterThan(0);

    for (const q of first.questions) {
      await alice.mutation(api.drills.answers.record, {
        drill: "deckSpeed",
        setCode: SET.code,
        name: q.card.name,
        // Read right, so nothing is due back either.
        answered: q.answer,
        correct: q.answer,
        sigmas: q.sigmas,
        margin: q.margin,
        attemptId: `run-1:${q.card.name}`,
      });
    }

    const second = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: TODAY,
    });
    const seen = new Set(first.questions.map((q) => q.card.name));
    for (const q of second.questions) expect(seen.has(q.card.name)).toBe(false);
    expect(second.asked).toBe(first.questions.length);
  });

  // The floor. Roediger & Karpicke measured restudy beating testing at an
  // immediate check, so a card re-asked in the sitting that revealed its answer
  // is testing memory of the reveal rather than a read.
  it("puts a misread card back the next day and not the same day", async () => {
    const t = harness();
    await seed(t);

    const alice = as(t, "alice");
    const first = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: TODAY,
    });
    const missed = first.questions[0];
    // Every card of the run answered, so only the misread one can come back.
    for (const q of first.questions) {
      await alice.mutation(api.drills.answers.record, {
        drill: "deckSpeed",
        setCode: SET.code,
        name: q.card.name,
        answered: q === missed ? wrongly(q.answer) : q.answer,
        correct: q.answer,
        sigmas: q.sigmas,
        margin: q.margin,
        attemptId: `run-1:${q.card.name}`,
      });
    }
    const wrote = await writtenOn(t);

    const sameDay = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: wrote,
    });
    for (const q of sameDay.questions) expect(q.card.name).not.toBe(missed.card.name);

    const nextDay = await alice.query(api.drills.deckSpeed.deal, {
      setCode: SET.code,
      today: dayAfter(wrote),
    });
    const back = nextDay.questions.find((q) => q.card.name === missed.card.name);
    expect(back).toBeDefined();
    expect(back?.repeat).toBe(true);
    // One slot while the set still has cards nobody has seen.
    expect(nextDay.questions.filter((q) => q.repeat)).toHaveLength(1);
  });

  // THE FOUR REFUSALS. Each puts a different sentence in front of a player, and
  // three of the four are about us rather than about Magic.
  it("says `unbuilt` when the set has no statistics at all", async () => {
    const t = harness();
    await seed(t, { omitStats: true });

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    expect(run.mute).toBe("unbuilt");
    expect(run.questions).toHaveLength(0);
    expect(run.worthSaying).toBe(0);
  });

  it("says `untimed` for an artifact built before game length was measured", async () => {
    const t = harness();
    await seed(t, { turnStats: undefined });

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    // The state every set was in until the artifacts were rebuilt, and the one
    // that promises a refresh will fix it. It must only be said when that is true.
    expect(run.mute).toBe("untimed");
  });

  // notes issue #8, and the bug this drill shipped with. STX has no `main_colors`
  // in 17Lands' game data, so it will never have colour baselines -- and telling
  // its player "it comes back the next time this set's data is refreshed" is a
  // promise nobody can keep. Found by running the pipeline over all 26 sets.
  it("says `unrated`, not `untimed`, for a set 17Lands never recorded colours for", async () => {
    const t = harness();
    await seed(t, { turnStats: undefined, archetypes: [], colorWinRates: [] });

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    expect(run.mute).toBe("unrated");
  });

  it("says `unmeasured` when the set has turns but nothing sharp enough to ask", async () => {
    const t = harness();
    // Wide spread, every estimate far too vague to support any of the three
    // answers. A thin set, which is about Magic rather than about us.
    await seed(t, {
      cards: [
        statCard("Vague One", -0.4, 0.9, 500),
        statCard("Vague Two", 0.1, 0.9, 500),
        statCard("Vague Three", 0.4, 0.9, 500),
      ],
    });

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    expect(run.mute).toBe("unmeasured");
    expect(run.quizzable).toBe(0);
  });

  it("drops lands, using the role off the pool document", async () => {
    const t = harness();
    await seed(t, { roles: { "Slow Three": "land" } });

    const run = await as(t, "alice").query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY });
    expect(run.questions.map((q) => q.card.name)).not.toContain("Slow Three");
  });

  it("refuses an anonymous caller, because the read is 270KB and the URL ships", async () => {
    const t = harness();
    await seed(t);

    await expect(
      t.query(api.drills.deckSpeed.deal, { setCode: SET.code, today: TODAY }),
    ).rejects.toThrow();
  });
});

// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

// What the archetype quiz will and will not ask.
//
// The interesting cases are all refusals, because the whole design of this
// drill is a gate: a set with no archetype table, a card whose decks cannot be
// told apart, a card whose colours say it is not the card the statistics think
// it is. A test that only checked the happy path would pass against a query
// that asked every card in the set.

const ISS = "https://example.workos.com";
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: `${ISS}|${subject}`, issuer: ISS, role: "tester" });

const SET = { code: "tst", format: "TradDraft" };

// Five decks with rates far apart, so a lift is never at the mercy of a
// baseline and only the card rows decide anything.
const DECKS = [
  { colors: "WU", n: 20000, wr: 0.6 },
  { colors: "WB", n: 20000, wr: 0.5 },
  { colors: "WR", n: 20000, wr: 0.55 },
  { colors: "WUB", n: 20000, wr: 0.54 },
];

/** A card's rate in one deck. Big samples unless a test wants thin ones. */
const rate = (name: string, colors: string, wr: number, n = 8000) => ({ name, colors, wr, n });

/**
 * A card the quiz could serve: white, and wanted much more by WB than by WU.
 *
 * +8pp on a deck that wins 50 anyway against level on one that wins 60, which
 * is also the shape of the trap the drill is built to teach -- the deck that
 * wants it is the WORSE deck.
 */
const wanted = (name: string) => [
  rate(name, "WB", 0.58),
  rate(name, "WU", 0.6),
  rate(name, "WR", 0.56),
];

const engineCard = (name: string, colors: string[], role = "creature") => ({
  name,
  colors,
  slot: "common" as const,
  value: 40,
  turn: 2,
  role: role as "creature" | "land",
});

const cardText = (name: string, colorIdentity: string[] = ["W"]) => ({
  name,
  colorIdentity: colorIdentity as ("W" | "U" | "B" | "R" | "G")[],
  collectorNumber: "1",
  manaCost: "{1}{W}",
  cmc: 2,
  typeLine: "Creature — Human Soldier",
  oracleText: "Vigilance.",
  rarity: "common" as const,
});

async function seed(
  t: ReturnType<typeof harness>,
  opts: {
    archetypes: { name: string; colors: string; wr: number; n: number }[];
    colorWinRates?: { colors: string; n: number; wr: number }[];
    cards?: { name: string; colors: string[]; role?: string }[];
    text?: string[];
  },
) {
  const names = [...new Set(opts.archetypes.map((a) => a.name))];
  const cards = opts.cards ?? names.map((n) => ({ name: n, colors: ["W"] }));
  const text = opts.text ?? cards.map((c) => c.name);

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
      cards: cards.map((c) => engineCard(c.name, c.colors, c.role)),
      colorWinRates: opts.colorWinRates ?? DECKS,
    });
    await ctx.db.insert("setStats", {
      code: SET.code,
      format: SET.format,
      games: 100000,
      baseWinRate: 0.55,
      cards: [],
      archetypes: opts.archetypes,
      colorWinRates: opts.colorWinRates ?? DECKS,
      synergies: [],
      builtAt: new Date(0).toISOString(),
    });
    for (const name of text) {
      await ctx.db.insert("setCardText", {
        code: SET.code,
        format: SET.format,
        key: name.toLowerCase(),
        text: cardText(name),
      });
    }
  });
}

describe("drills/archetypes.deal", () => {
  it("asks which deck wants the card, and names both ends", async () => {
    const t = harness();
    await seed(t, { archetypes: wanted("Cathar Commando") });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.mute).toBeNull();
    expect(run.questions).toHaveLength(1);
    expect(run.questions[0]).toMatchObject({
      color: "W",
      wants: "WB",
      spurns: "WU",
      separated: true,
    });
    // The whole table rides along, not just the two ends: the reveal shows
    // every deck and the grade only uses the extremes.
    expect(run.questions[0].decks).toHaveLength(3);
    // Hydrated, so the screen has a card to draw rather than a name.
    expect(run.questions[0].card).toMatchObject({
      name: "Cathar Commando",
      typeLine: "Creature — Human Soldier",
    });
  });

  // notes issue #8. STX has no `main_colors` in 17Lands' game data, so its
  // artifact has zero archetypes -- and until now every surface met that with a
  // quiet fallback. A drill cannot: it either has questions or it does not.
  it("says a set with no archetype table cannot be quizzed, rather than dealing nothing", async () => {
    const t = harness();
    await seed(t, { archetypes: [], cards: [{ name: "Cathar Commando", colors: ["W"] }] });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run).toMatchObject({ mute: "unrated", quizzable: 0, questions: [] });
  });

  // The other half of what used to be one `mute` flag, and the reason it is two.
  // A set whose statistics were never built is a pipeline problem, and telling a
  // player "17Lands never recorded this set's deck colours" about one would be
  // a named cause that is simply false.
  it("tells a set with no statistics row apart from one 17Lands never rated", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      await ctx.db.insert("sets", {
        code: SET.code,
        format: SET.format,
        cardCount: 1,
        ratedCardCount: 1,
        ingestedAt: new Date(0).toISOString(),
      });
      await ctx.db.insert("setCards", {
        code: SET.code,
        format: SET.format,
        cards: [engineCard("Cathar Commando", ["W"])],
        colorWinRates: DECKS,
      });
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run).toMatchObject({ mute: "unbuilt", quizzable: 0, questions: [] });
  });

  // A set with a statistics row whose colour table is empty is the same hole as
  // no archetypes at all, and reads as the set's own fault rather than ours.
  it("calls an empty colour table unrated, not unbuilt", async () => {
    const t = harness();
    await seed(t, { archetypes: wanted("Cathar Commando"), colorWinRates: [] });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.mute).toBe("unrated");
  });

  // Nothing here is private, so this is not about disclosure -- it is that an
  // unauthenticated query reading up to 412KB is the shape of problem this
  // codebase has had once already.
  it("refuses a caller who is not signed in", async () => {
    const t = harness();
    await seed(t, { archetypes: wanted("Cathar Commando") });

    await expect(t.query(api.drills.archetypes.deal, { setCode: SET.code })).rejects.toThrow();
  });

  // A mono-coloured LAND passes every colour check there is, because a land is
  // given its colour identity where Scryfall gives it none. Two of 254 real
  // questions were lands, and one was a third of tdm's whole bank.
  it("refuses a land whose colour is real", async () => {
    const t = harness();
    await seed(t, {
      archetypes: wanted("Boseiju, Who Endures"),
      cards: [{ name: "Boseiju, Who Endures", colors: ["W"], role: "land" }],
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.questions).toEqual([]);
  });

  // The finding the whole drill is shaped by, and it is served rather than
  // refused: most cards' decks are inside each other's error bars, and "these
  // two want it the same" is the right answer for them.
  it("serves a card whose decks are too close, marked as having no answer", async () => {
    const t = harness();
    await seed(t, {
      archetypes: [
        rate("Fading Hope", "WB", 0.505, 250),
        rate("Fading Hope", "WU", 0.605, 250),
        rate("Fading Hope", "WR", 0.555, 250),
      ],
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run).toMatchObject({ mute: null, separable: 0 });
    expect(run.questions).toHaveLength(1);
    expect(run.questions[0].separated).toBe(false);
  });

  // The check the archetype table cannot make for itself. These decks all share
  // white, so the statistics alone would teach this artifact as a white card.
  it("refuses a colourless card its decks make look mono-coloured", async () => {
    const t = harness();
    await seed(t, {
      archetypes: wanted("Prophetic Prism"),
      cards: [{ name: "Prophetic Prism", colors: [] }],
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.questions).toEqual([]);
  });

  // A card the statistics still name but the set no longer has text for -- a
  // re-ingest since the artifact was built. The card IS the question here, so
  // there is no partial version to show.
  it("drops a card the set has no text for rather than throwing", async () => {
    const t = harness();
    await seed(t, {
      archetypes: [...wanted("Cathar Commando"), ...wanted("Ghostly Flicker")],
      cards: [
        { name: "Cathar Commando", colors: ["W"] },
        { name: "Ghostly Flicker", colors: ["W"] },
      ],
      text: ["Cathar Commando"],
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.questions.map((q) => q.card.name)).toEqual(["Cathar Commando"]);
    // Counted as examined, so paging does not deal it again.
    expect(run.nextSkip).toBe(2);
  });

  // Three-colour decks are first-class answers, and in ktk, snc, sos and tdm
  // they are the only kind there is.
  it("offers a wedge as the deck that wants a card", async () => {
    const t = harness();
    await seed(t, {
      archetypes: [
        rate("Cathar Commando", "WUB", 0.62),
        rate("Cathar Commando", "WU", 0.6),
        rate("Cathar Commando", "WR", 0.55),
      ],
    });

    const run = await as(t, "alice").query(api.drills.archetypes.deal, { setCode: SET.code });

    expect(run.questions[0]).toMatchObject({ wants: "WUB" });
  });

  it("pages past a run without re-dealing it", async () => {
    const t = harness();
    await seed(t, {
      archetypes: [
        // Two questions, the first sharper than the second.
        rate("Sharper", "WB", 0.6),
        rate("Sharper", "WU", 0.6),
        rate("Sharper", "WR", 0.55),
        rate("Sharp", "WB", 0.57),
        rate("Sharp", "WU", 0.6),
        rate("Sharp", "WR", 0.55),
      ],
      cards: [
        { name: "Sharper", colors: ["W"] },
        { name: "Sharp", colors: ["W"] },
      ],
    });

    const first = await as(t, "alice").query(api.drills.archetypes.deal, {
      setCode: SET.code,
      limit: 1,
    });
    expect(first.questions.map((q) => q.card.name)).toEqual(["Sharper"]);

    const second = await as(t, "alice").query(api.drills.archetypes.deal, {
      setCode: SET.code,
      limit: 1,
      skip: first.nextSkip,
    });
    expect(second.questions.map((q) => q.card.name)).toEqual(["Sharp"]);
  });
});

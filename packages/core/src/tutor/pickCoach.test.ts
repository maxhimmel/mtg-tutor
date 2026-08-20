import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import type { PickScore } from "../scoring/score.js";
import { buildPickContext } from "./pickCoach.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    value: 0.55,
    colors: [],
    colorIdentity: [],
    manaCost: "",
    cmc: 2,
    typeLine: "Creature",
    turn: 2,
    role: "creature",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.55,
    gihGames: 5000,
    alsa: 6,
    ...over,
  };
}

describe("buildPickContext", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58, typeLine: "Instant" });
  const best = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });
  const poolMate = card("Storm Fox", { colors: ["U"] });

  const score: PickScore<Card> = {
    score: 72,
    grade: "B",
    picked,
    pickedValue: 0.58,
    pickedContextValue: 0.58,
    rawBest: best,
    rawBestValue: 0.62,
    contextBest: best,
    contextBestValue: 0.62,
    terms: [],
    isBest: false,
  indistinguishable: false,
    band: [],
    reasons: [],
    onColor: true,
    targetOnColor: true,
    rankInPack: 2,
  };

  const rec: RecordedPick<Card> = {
    packNo: 1,
    pickNo: 3,
    pack: [picked, best],
    picked,
    score,
  };

  // The pool BEFORE the pick; buildPickContext adds the picked card back for display.
  const ctx = buildPickContext(rec, [poolMate]);

  it("names the picked card and the pick position", () => {
    expect(ctx).toContain("Lightning Strike");
    expect(ctx).toContain("Pack 1, Pick 3");
  });

  // Pack and pick number alone left the coach unable to tell an early pick from
  // a late one, so it advised staying open at pick 40.
  it("places the pick in the whole draft", () => {
    expect(ctx).toContain("pick 3 of 12 in the draft");
  });

  it("states the colors the pool has committed to", () => {
    expect(ctx).toContain("Committed colors: none yet");
  });

  it("includes the running pool, with the pick in it", () => {
    expect(ctx).toContain("Storm Fox");
    expect(ctx).toContain("Your pool so far (2 cards)");
  });

  it("includes the numeric data verdict", () => {
    expect(ctx).toContain("72/100");
    expect(ctx).toContain("Big Bomb"); // best-available card by the numbers
  });

  // The cards the player DIDN'T take used to render as bare names, so every
  // curve or size claim the coach made about one of them was invention.
  it("gives the passed cards their cost and type, not just a name", () => {
    expect(ctx).toContain("Big Bomb — 2 mana, Red, Creature");
  });

  it("gives the passed cards their stats, not just a win rate", () => {
    expect(ctx).toContain("ALSA 6.0");
  });

  // The pool the coach is shown includes the card just taken, on purpose -- it
  // is what the player is holding. What it is not is the pool an argument FOR a
  // passed card gets to use, and nothing said so: a real answer argued that
  // Micromancer "tutors back one of your Burst Lightnings" on a pick where Burst
  // Lightning was taken INSTEAD of Micromancer. notes.md #5.
  it("says the passed cards are a world where the pick was not made", () => {
    expect(ctx).toContain("these were PASSED");
    expect(ctx).toContain("would have meant NOT taking Lightning Strike");
    expect(ctx).toContain("Lightning Strike is not in the pool");
  });

  it("says nothing about a sideboard when nothing has been benched", () => {
    expect(ctx).not.toContain("Sideboard");
  });

  describe("with cards benched", () => {
    // Two blue cards in the pool, both set aside: the pool is committed to blue
    // only if you count cards the player has already given up on.
    const benched = [card("Storm Fox", { colors: ["U"] }), card("Tide Herald", { colors: ["U"] })];
    const withBench = buildPickContext(rec, [], benched);

    it("lists what was set aside, and says it is not being built with", () => {
      expect(withBench).toContain("Sideboard (2 cards)");
      expect(withBench).toContain("Storm Fox");
      expect(withBench).toContain("NOT");
    });

    it("leaves the benched cards out of the committed colors", () => {
      expect(withBench).toContain("Committed colors: none yet");
    });

    it("leaves them out of the pool it counts, so the two lists cannot double-count", () => {
      expect(withBench).toContain("Your pool so far (1 cards)");
    });
  });

  describe("with a pivot", () => {
    // The case a filtered pool cannot express: the deck reads RW either way, but
    // only the pivot line says blue was given up and when.
    const ctxWithPivot = buildPickContext(rec, [], [], [
      {
        atPick: 19,
        colors: ["U"],
        cards: [
          { name: "Storm Fox", colors: ["U"] },
          { name: "Tide Herald", colors: ["U"] },
        ],
      },
    ]);

    it("puts the abandoned color and the moment into the prompt", () => {
      expect(ctxWithPivot).toContain("at pick 20");
      expect(ctxWithPivot).toContain("left Blue behind");
    });

    it("says nothing when no color was left behind", () => {
      expect(ctx).not.toContain("Pivot:");
    });
  });
});

describe("buildPickContext showing the verdict's working", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58 });
  const other = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });
  const base = (over: Partial<PickScore<Card>>): RecordedPick<Card> => ({
    packNo: 2,
    pickNo: 5,
    pack: [picked, other],
    picked,
    score: {
      score: 84,
      grade: "B+",
      picked,
      pickedValue: 0.58,
      pickedContextValue: 0.58,
      rawBest: other,
      rawBestValue: 0.62,
      contextBest: picked,
      contextBestValue: 0.6,
      terms: [],
      isBest: true,
  indistinguishable: false,
    band: [],
    reasons: [],
      onColor: true,
      targetOnColor: true,
      rankInPack: 2,
      ...over,
    },
  });

  it("names both answers when they differ, so the gap can be taught", () => {
    const out = buildPickContext(base({}), []);
    expect(out).toContain("Strongest card in the pack: Big Bomb");
    expect(out).toContain("Best for THIS deck: Lightning Strike");
  });

  it("says so plainly when they agree, rather than leaving it to be inferred", () => {
    const out = buildPickContext(base({ contextBest: other, rawBest: other }), []);
    expect(out).toContain("also the best one for this deck: Big Bomb");
  });

  // Issue #5: the prompt named a better card and never said by how much, so the
  // model read a rounding error as a blunder and told a player to swap an A+
  // pick for a card worth 0.3pp more.
  it("says how much better the context-best card was", () => {
    const out = buildPickContext(base({ isBest: false, contextBest: other, contextBestValue: 0.62 }), []);
    expect(out).toContain("Big Bomb was worth 4.0pp more to this deck than Lightning Strike");
  });

  it("gives the margin of error on that gap", () => {
    const out = buildPickContext(base({ isBest: false, contextBest: other, contextBestValue: 0.62 }), []);
    expect(out).toContain("margin of error");
  });

  // The 98/100 case. Both cards are sampled at 5000 games, so the error bars run
  // to roughly ±1pp and a 0.2pp gap is not a gap the data can see -- and the
  // SCORE is what says so, which is the change. This used to recompute the
  // margin here, making three places in the app decide one question.
  it("says outright when the gap is inside the margin, so the pick stands", () => {
    const out = buildPickContext(
      base({
        isBest: false,
        contextBest: other,
        contextBestValue: 0.582,
        indistinguishable: true,
      }),
      [],
    );
    expect(out).toContain("INSIDE the margin");
    expect(out).toContain("cannot tell these two cards apart");
  });

  // The anti-regression for the whole three-opinions problem: the prompt must
  // follow the grade even where its own arithmetic would say otherwise, because
  // a coach explaining a verdict the app did not reach is the failure mode that
  // put "the data cannot tell these apart" under a 94/100.
  it("follows the score rather than recomputing the margin", () => {
    const out = buildPickContext(
      base({
        isBest: false,
        contextBest: other,
        contextBestValue: 0.582,
        indistinguishable: false,
      }),
      [],
    );
    expect(out).not.toContain("INSIDE the margin");
  });

  // The corpus id the app itself acted on. Without it the model is asked to
  // explain a pick the app preferred for a reason it was never told.
  it("passes on which card the deck wanted, and why", () => {
    const out = buildPickContext(
      base({
        isBest: false,
        contextBest: other,
        contextBestValue: 0.582,
        indistinguishable: true,
        preferred: other,
        reasons: [{ principle: "DECK-08", note: "you are short of removal" }],
      }),
      [],
    );
    expect(out).toContain("Big Bomb is the one this deck wanted");
    expect(out).toContain("[DECK-08]");
  });

  it("says nothing about a preference when no principle decided one", () => {
    const out = buildPickContext(
      base({ isBest: false, contextBest: other, contextBestValue: 0.582, indistinguishable: true }),
      [],
    );
    expect(out).not.toContain("this deck wanted");
  });

  it("does not claim a tie when the gap is real", () => {
    const out = buildPickContext(base({ isBest: false, contextBest: other, contextBestValue: 0.62 }), []);
    expect(out).not.toContain("INSIDE the margin");
  });

  it("says nothing about a gap when the player took the best card", () => {
    expect(buildPickContext(base({}), [])).not.toContain("margin of error");
  });

  // Fitting a deck is not the same ranking as raw power, so the context-best can
  // sit outside the top four by win rate -- and it is the one card the answer is
  // most likely to be about.
  it("lists the context-best card even when its win rate would not make the cut", () => {
    const fillers = Array.from({ length: 6 }, (_, i) =>
      card(`Filler ${i}`, { gihWinRate: 0.6, colors: ["R"] }),
    );
    const niche = card("Niche Fit", { gihWinRate: 0.5, colors: ["R"] });
    const rec = base({ contextBest: niche, contextBestValue: 0.5, isBest: false });
    const out = buildPickContext({ ...rec, pack: [picked, ...fillers, niche] }, []);
    expect(out).toContain("Niche Fit — 2 mana, Red, Creature");
  });

  it("lists the reasons the pick was worth what it was", () => {
    const out = buildPickContext(
      base({ terms: [{ label: "archetype", delta: 0.023 }, { label: "splash", delta: -0.008 }] }),
      [],
    );
    expect(out).toContain("archetype +2.3pp");
    expect(out).toContain("splash -0.8pp");
  });

  it("says nothing about reasons when none moved the pick", () => {
    expect(buildPickContext(base({}), [])).not.toContain("is worth what it is here");
  });
});

describe("buildPickContext with a defended pick", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58 });
  const other = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });
  const rec: RecordedPick<Card> = {
    packNo: 1,
    pickNo: 2,
    pack: [picked, other],
    picked,
    score: {
      score: 84,
      grade: "B+",
      picked,
      pickedValue: 0.58,
      pickedContextValue: 0.58,
      rawBest: other,
      rawBestValue: 0.62,
      contextBest: picked,
      contextBestValue: 0.6,
      terms: [],
      isBest: true,
  indistinguishable: false,
    band: [],
    reasons: [],
      onColor: true,
      targetOnColor: true,
      rankInPack: 2,
    },
  };

  const defended = buildPickContext(rec, [], [], [], {
    reason: "cheap removal is what this deck is short of",
    confidence: "sure",
    challengedName: "Big Bomb",
    switched: false,
  });

  it("puts the player's own words in the prompt", () => {
    expect(defended).toContain("cheap removal is what this deck is short of");
  });

  // Graded against a claim they were never shown is not a lesson, so the claim
  // travels with the level rather than being implied by its name.
  it("spells out what the stated confidence was claiming", () => {
    expect(defended).toContain("Clear");
    expect(defended).toContain("margin of error");
  });

  it("says which card was put to them, and what they did about it", () => {
    expect(defended).toContain("Shown Big Bomb");
    expect(defended).toContain("stood by Lightning Strike");
  });

  it("reports a switch as a switch", () => {
    const switched = buildPickContext(rec, [], [], [], {
      reason: "on reflection the bomb wins games on its own",
      confidence: "close",
      challengedName: "Big Bomb",
      switched: true,
    });
    expect(switched).toContain("changed their pick to it");
  });

  // A model handed a sentence and no instruction reads it as colour and coaches
  // the card anyway, which is the one thing this flow exists to stop.
  it("asks for the reasoning to be coached, not just the pick", () => {
    expect(defended).toContain("AND the reasoning");
  });

  it("is absent entirely on a pick that was never defended", () => {
    const plain = buildPickContext(rec, []);
    expect(plain).not.toContain("committed to this pick");
    expect(plain).toContain("Coach this pick.");
  });
});

// The other half of notes.md #13. The colour sentence is `situation.test.ts`;
// this is where the card is LISTED, and getting that wrong is the error the
// model would have believed -- the sideboard block says out loud that its cards
// do not count toward the colours, and the pool block says nothing, because
// everything in it is supposed to.
describe("buildPickContext on a pick sent straight to the sideboard", () => {
  const picked = card("Doom Blade", { colors: ["B"], gihWinRate: 0.6 });
  const other = card("Grizzly Bears", { colors: ["G"], gihWinRate: 0.52 });
  const rec = (): RecordedPick<Card> => ({
    packNo: 3,
    pickNo: 9,
    pack: [picked, other],
    picked,
    score: {
      score: 91,
      grade: "A",
      picked,
      pickedValue: 0.6,
      pickedContextValue: 0.6,
      rawBest: picked,
      rawBestValue: 0.6,
      contextBest: picked,
      contextBestValue: 0.6,
      terms: [],
      isBest: true,
      indistinguishable: false,
      band: [],
      reasons: [],
      onColor: false,
      targetOnColor: false,
      rankInPack: 1,
    },
  });

  const pool = [
    { name: "Island", colors: [] as Card["colors"] },
    { name: "Blue One", colors: ["U"] as Card["colors"] },
    { name: "Blue Two", colors: ["U"] as Card["colors"] },
  ];

  it("lists the card under the sideboard rather than the pool", () => {
    const out = buildPickContext(rec(), pool, [], [], undefined, true);
    const sideboardAt = out.indexOf("Sideboard (1 cards)");
    const poolAt = out.indexOf("Your pool so far");
    expect(sideboardAt).toBeGreaterThan(-1);
    expect(out.slice(sideboardAt)).toContain("Doom Blade");
    // The pool block runs from its heading to the sideboard heading.
    expect(out.slice(poolAt, sideboardAt)).not.toContain("Doom Blade");
  });

  it("counts it beside cards benched earlier rather than replacing them", () => {
    const earlier = [{ name: "Old Mistake", colors: ["R"] as Card["colors"] }];
    const out = buildPickContext(rec(), pool, earlier, [], undefined, true);
    expect(out).toContain("Sideboard (2 cards)");
    expect(out).toContain("Old Mistake");
  });

  it("puts it in the pool as usual when it was not benched", () => {
    const out = buildPickContext(rec(), pool);
    const poolAt = out.indexOf("Your pool so far");
    expect(out).toContain("Your pool so far (4 cards)");
    expect(out.slice(poolAt)).toContain("Doom Blade");
    expect(out).not.toContain("Sideboard (");
  });
});

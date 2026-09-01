import { describe, expect, it } from "vitest";
import type { Card } from "../model/card.js";
import type { StoredPick } from "../model/review.js";
import { marginVerdict } from "./pickCoach.js";
import { buildReviewContext } from "./reviewPrompt.js";

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

describe("buildReviewContext", () => {
  const picked = card("Lightning Strike", { colors: ["R"], gihWinRate: 0.58 });
  const best = card("Big Bomb", { colors: ["R"], gihWinRate: 0.62 });

  // A third card, on colour and weaker than the bomb, so the two "best" answers
  // can differ -- which is the case the prompt has to carry and the fixture
  // could not express while it only had one.
  const fit = card("Solid Common", { colors: ["R"], gihWinRate: 0.6 });

  const pick: StoredPick = {
    pickIndex: 4,
    packNo: 1,
    pickNo: 5,
    pack: [picked, best, fit],
    picked,
    bestName: best.name,
    contextBestName: fit.name,
    score: 72,
    gap: 0.04,
    isBest: false,
    onColor: true,
  };

  // The model used to be told only the raw-power best and asked to work the
  // other one out, so a screen read after the fact could nominate a card the
  // grade never considered -- including one the deck cannot cast, after the
  // board had been taught not to. Both answers now, as the live coach has
  // always had them.
  it("names both bests, and says which one the score used", () => {
    const ctx = buildReviewContext(pick, []);
    expect(ctx).toContain("The raw-power best (highest 17Lands win rate available): Big Bomb.");
    expect(ctx).toContain("what the score was measured against: Solid Common");
    expect(ctx).toContain("best for this deck (what the score used)");
  });

  it("says so in one line when the two are the same card", () => {
    const agreed = buildReviewContext({ ...pick, contextBestName: best.name }, []);
    expect(agreed).toContain("The strongest card was also the best one for this deck.");
    expect(agreed).not.toContain("what the score was measured against");
  });

  // Issue #5, one screen later. The review prompt carried two card names and no
  // gap at all, so the model decided for itself how big the lesson was on the
  // screen a player reads AFTER the draft -- the surface nobody had complained
  // about yet, which is the one this codebase keeps finding rules have not
  // reached. The sentence is `marginVerdict`, the same one the live coach gets.
  it("carries the gap and its verdict when the caller has a score", () => {
    const note = marginVerdict({
      betterName: "Solid Common",
      pickedName: "Lightning Strike",
      gap: 0.012,
      margin: 0.011,
      indistinguishable: false,
    });
    const ctx = buildReviewContext(pick, [], [], [], false, note);
    expect(ctx).toContain("OUTSIDE the margin");
    expect(ctx).toContain("±1.1pp margin of error");
  });

  // A pick with no stored scoring row has no gap to report, and a prompt that
  // invents one is the thing the line exists to stop.
  it("says nothing about a margin when the caller has no score", () => {
    expect(buildReviewContext(pick, [])).not.toContain("margin of error");
  });

  it("says nothing about a sideboard when nothing was set aside", () => {
    expect(buildReviewContext(pick, [card("Storm Fox", { colors: ["U"] })])).not.toContain(
      "Sideboard",
    );
  });

  describe("with cards set aside by this pick", () => {
    // Two blue cards drafted and then benched: the pool reads as committed to
    // blue only if you count cards the player had already given up on.
    const benched = [card("Storm Fox", { colors: ["U"] }), card("Tide Herald", { colors: ["U"] })];
    const ctx = buildReviewContext(pick, [], benched);

    it("lists them, and says they were not being built with", () => {
      expect(ctx).toContain("Sideboard by this point (2 cards)");
      expect(ctx).toContain("Storm Fox");
      expect(ctx).toContain("NOT");
    });

    it("leaves them out of the committed colors", () => {
      expect(ctx).toContain("Committed colors: none yet");
    });

    it("leaves them out of the pool it counts, so the two lists cannot double-count", () => {
      expect(ctx).toContain("Pool before this pick (0 cards)");
    });
  });
});

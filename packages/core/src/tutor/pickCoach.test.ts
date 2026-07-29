import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import type { RecordedPick } from "../model/pick.js";
import type { PickScore } from "../scoring/score.js";
import { buildPickContext } from "./pickCoach.js";

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    colors: [],
    colorIdentity: [],
    manaCost: "",
    cmc: 2,
    typeLine: "Creature",
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

  const score: PickScore = {
    score: 72,
    grade: "B",
    picked,
    best,
    pickedValue: 0.58,
    bestValue: 0.62,
    isBest: false,
    onColor: true,
    rankInPack: 2,
  };

  const rec: RecordedPick = {
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
});

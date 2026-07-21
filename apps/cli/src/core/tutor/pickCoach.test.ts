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

  const ctx = buildPickContext(rec, [poolMate, picked]);

  it("names the picked card and the pick position", () => {
    expect(ctx).toContain("Lightning Strike");
    expect(ctx).toContain("Pack 1, Pick 3");
  });

  it("includes the running pool", () => {
    expect(ctx).toContain("Storm Fox");
  });

  it("includes the numeric data verdict", () => {
    expect(ctx).toContain("72/100");
    expect(ctx).toContain("Big Bomb"); // best-available card by the numbers
  });
});

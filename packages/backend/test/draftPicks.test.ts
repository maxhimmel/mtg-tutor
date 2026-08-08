import { describe, expect, it } from "vitest";
import { deckColors, splitPool } from "@mtg-tutor/core";
import type { Bench, ColorCode, PoolCard } from "@mtg-tutor/core";
import { poolFromLastPick } from "../convex/draftPicks.js";
import type { Doc, Id } from "../convex/_generated/dataModel.js";

// A last-pick row: 44 cards taken before it, and the 45th sitting in the
// one-card pack that row is about. Only names and colours are under test; the
// score is filled in because the shape requires it.
function lastRow(
  poolBefore: PoolCard[],
  picked: PoolCard,
  packAlso: PoolCard[] = [],
): Doc<"draftPicks"> {
  const pack = [picked, ...packAlso].map((c) => ({ ...c, value: 50 }));
  return {
    _id: "row" as Id<"draftPicks">,
    _creationTime: 0,
    sessionId: "session" as Id<"draftSessions">,
    pickIndex: poolBefore.length,
    packNo: 3,
    pickNo: 15,
    pack,
    pickedName: picked.name,
    poolBefore,
    score: {
      score: 100,
      grade: "A+",
      pickedName: picked.name,
      pickedValue: 50,
      pickedContextValue: 50,
      rawBestName: picked.name,
      rawBestValue: 50,
      contextBestName: picked.name,
      contextBestValue: 50,
      isBest: true,
      onColor: true,
      rankInPack: 1,
    },
  };
}

const card = (name: string, ...colors: ColorCode[]): PoolCard => ({ name, colors });

describe("poolFromLastPick", () => {
  it("rebuilds the whole pool in pick order, the picked card last", () => {
    const poolBefore = [card("Early", "U"), card("Middle", "G")];
    const row = lastRow(poolBefore, card("Last", "W"));

    expect(poolFromLastPick(row)).toEqual([
      { name: "Early", colors: ["U"] },
      { name: "Middle", colors: ["G"] },
      { name: "Last", colors: ["W"] },
    ]);
  });

  it("finds the picked card in a pack that still holds others", () => {
    const row = lastRow([card("Early", "U")], card("Taken", "R"), [card("Passed", "B")]);

    expect(poolFromLastPick(row).at(-1)).toEqual({ name: "Taken", colors: ["R"] });
  });

  it("refuses a row that names a card outside its own pack", () => {
    const row = lastRow([card("Early", "U")], card("Taken", "R"));
    row.pickedName = "Something Else";

    expect(() => poolFromLastPick(row)).toThrow(/not in its own pack/);
  });
});

// The bug this exists to fix: a splash cut in the deck builder must stop being
// one of the deck's colours. Two cards is where `committedColors` puts the line,
// so the pool below commits to blue and green and splashes a single white card.
describe("the colours of a rebuilt pool", () => {
  const poolBefore = [card("Isle", "U"), card("Tide", "U"), card("Bloom", "G"), card("Grove", "G")];
  const row = lastRow(poolBefore, card("Splash", "W"));
  const pool = poolFromLastPick(row);

  // Two white cards, so white is genuinely committed rather than splashed --
  // this is the control that proves the assertion below can fail.
  const twoWhite = [...pool, card("Second", "W")];

  const colorsOf = (cards: PoolCard[], bench: Bench[]) =>
    deckColors(splitPool(cards, bench, cards.length).maindeck);

  it("names white while the deck is still playing both of them", () => {
    expect(colorsOf(twoWhite, [])).toBe("WUG");
  });

  it("drops white once the deck builder cuts them", () => {
    // `atPick` past the last pick is what the deck builder writes: a card cut
    // after the draft finished, which every reading of the deck can see.
    const cut: Bench[] = [
      { pos: 4, atPick: twoWhite.length },
      { pos: 5, atPick: twoWhite.length },
    ];
    expect(colorsOf(twoWhite, cut)).toBe("UG");
  });

  it("never named a lone splash in the first place", () => {
    expect(colorsOf(pool, [])).toBe("UG");
  });
});

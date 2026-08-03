import { describe, it, expect } from "vitest";
import type { ColorCode, PoolCard } from "../model/card.js";
import type { Bench } from "../model/bench.js";
import { commitmentLine, pivotLines, pivots, situationLine } from "./situation.js";

describe("situationLine", () => {
  // The whole point: "Pack 2, Pick 5" does not say how much draft is left, so the
  // model could not tell a speculative early pick from a committed late one.
  it("places the pick in the whole draft, not just its pack", () => {
    expect(situationLine(2, 5, 11)).toBe(
      "Situation: Pack 2, Pick 5 — pick 20 of 45 in the draft, 25 to come.",
    );
  });

  it("reads the pack size off the pack, so Play Boosters count to 42", () => {
    expect(situationLine(1, 1, 14)).toContain("pick 1 of 42");
    expect(situationLine(3, 14, 1)).toContain("pick 42 of 42 in the draft, the last one.");
  });

  it("counts the first pick of the last pack correctly", () => {
    expect(situationLine(3, 1, 15)).toContain("pick 31 of 45");
  });
});

describe("commitmentLine", () => {
  const pool = (...colors: string[][]): PoolCard[] =>
    colors.map((c, i) => ({ name: `Card ${i}`, colors: c as PoolCard["colors"] }));
  const [red] = pool(["R"]);
  const [blue] = pool(["U"]);
  const [rock] = pool([]);

  it("says the pool is open when no color has two cards", () => {
    expect(commitmentLine(pool(["U"], ["R"]), red)).toContain("none yet");
  });

  it("names the committed colors in WUBRG order", () => {
    expect(commitmentLine(pool(["U"], ["W"], ["U"], ["W"]), blue)).toContain(
      "Committed colors: White/Blue",
    );
  });

  it("reports whether the pick respected those colors", () => {
    expect(commitmentLine(pool(["R"], ["R"]), red)).toContain("This pick is on that color.");
    expect(commitmentLine(pool(["R"], ["R"]), blue)).toContain("This pick is OFF that color.");
    expect(commitmentLine(pool(["R"], ["R"], ["W"], ["W"]), blue)).toContain(
      "This pick is OFF those colors.",
    );
  });

  it("counts a colorless pick as on-color, whatever the pool is in", () => {
    expect(commitmentLine(pool(["R"], ["R"]), rock)).toContain("This pick is on that color.");
  });

  // The reason this is derived here rather than passed in: benching the red
  // cards must take red off the commitments AND stop calling a blue pick
  // on-color, and a stored onColor from the whole pool says the opposite.
  it("judges the pick against the pool it renders, not the one it was scored against", () => {
    const benchedRed = pool(["U"], ["U"]);
    expect(commitmentLine(benchedRed, red)).toContain("Committed colors: Blue");
    expect(commitmentLine(benchedRed, red)).toContain("This pick is OFF that color.");
  });
});

describe("pivots", () => {
  const card = (name: string, ...colors: ColorCode[]): PoolCard => ({ name, colors });

  // Four blue cards drafted early, then all set aside at pick 20 for a red-white
  // deck: the pool is RW now, and how it got there is the interesting part.
  const pool = [
    card("Storm Fox", "U"),
    card("Tide Herald", "U"),
    card("Deep Diver", "U"),
    card("Ember Cat", "R"),
    card("Ember Hound", "R"),
    card("Sun Cleric", "W"),
    card("Sun Squire", "W"),
  ];
  const left = [
    { pos: 0, atPick: 20 },
    { pos: 1, atPick: 20 },
    { pos: 2, atPick: 20 },
  ];

  it("names the color left behind, and when", () => {
    expect(pivots(pool, left, 25)).toEqual([
      { atPick: 20, colors: ["U"], cards: [pool[0], pool[1], pool[2]] },
    ]);
  });

  it("says nothing before the moment it happened", () => {
    expect(pivots(pool, left, 19)).toEqual([]);
  });

  // The distinction the whole function exists to draw. One unplayable late-pack
  // card is not a change of direction, and reporting it as one would train the
  // coach to lecture about a card the player already dismissed.
  it("does not call a single set-aside card a pivot", () => {
    expect(pivots(pool, [{ pos: 0, atPick: 20 }], 25)).toEqual([]);
  });

  it("does not call it a pivot while the color is still in the deck", () => {
    // Two blue benched, but two blue still in the maindeck -- they trimmed, they
    // did not leave.
    const stillBlue = [...pool, card("Reef Watcher", "U"), card("Wave Rider", "U")];
    const benched: Bench[] = [
      { pos: 0, atPick: 20 },
      { pos: 1, atPick: 20 },
    ];
    expect(pivots(stillBlue, benched, 25)).toEqual([]);
  });

  // `poolBefore` for an early pick is short, so a bench recorded later points
  // past its end and simply has no card to be about.
  it("ignores a bench past the end of the pool it was given", () => {
    const past: Bench[] = [
      { pos: 5, atPick: 20 },
      { pos: 6, atPick: 20 },
    ];
    expect(pivots(pool.slice(0, 3), past, 25)).toEqual([]);
  });

  it("reports each moment separately", () => {
    const twice: Bench[] = [
      ...left,
      { pos: 5, atPick: 30 },
      { pos: 6, atPick: 30 },
    ];
    expect(pivots(pool, twice, 35).map((p) => [p.atPick, p.colors])).toEqual([
      [20, ["U"]],
      [30, ["W"]],
    ]);
  });
});

describe("pivotLines", () => {
  it("is absent when nothing was left behind", () => {
    expect(pivotLines([])).toBeNull();
  });

  it("states it as something that happened at a moment", () => {
    const line = pivotLines([
      { atPick: 20, colors: ["U"], cards: [{ name: "Storm Fox", colors: ["U"] }] },
    ]);
    // Picks are stored 0-indexed and spoken 1-indexed, as everywhere else.
    expect(line).toContain("at pick 21");
    expect(line).toContain("left Blue behind");
    expect(line).toContain("Storm Fox");
  });
});

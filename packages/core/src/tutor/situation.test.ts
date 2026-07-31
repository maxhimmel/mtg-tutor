import { describe, it, expect } from "vitest";
import type { PoolCard } from "../model/card.js";
import { commitmentLine, situationLine } from "./situation.js";

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

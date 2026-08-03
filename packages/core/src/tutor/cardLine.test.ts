import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import { describeCard, statLine } from "./cardLine.js";

function card(over: Partial<Card> = {}): Card {
  return {
    name: "Lightning Strike",
    rarity: "common",
    value: 0.55,
    colors: ["R"],
    colorIdentity: ["R"],
    manaCost: "{1}{R}",
    cmc: 2,
    typeLine: "Instant",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.552,
    gihGames: 3829,
    alsa: 9.17,
    avgPick: 4.92,
    iwd: 0.0359,
    maindeckRate: 0.4419,
    winRate: 0.604,
    ...over,
  };
}

describe("describeCard", () => {
  // The whole point of this function: pack cards used to render as bare names,
  // which is why the coach invented mana costs for cards it hadn't picked.
  it("carries the cost and type of a card the model must reason about", () => {
    expect(describeCard(card())).toBe("Lightning Strike — 2 mana, Red, Instant");
  });

  it("names multicolor and colorless cards rather than printing an empty color", () => {
    expect(describeCard(card({ colors: ["W", "U"] }))).toContain("White/Blue");
    expect(describeCard(card({ colors: [] }))).toContain("Colorless");
  });
});

describe("statLine", () => {
  it("renders every stat, with the sample size on the win rate", () => {
    expect(statLine(card())).toBe(
      "GIH 55.2% (n 3.8k) · IWD +3.6pp · ATA 4.9 · ALSA 9.2 · maindecked 44.2% · GP WR 60.4%",
    );
  });

  // IWD is a difference between two rates, not a rate. Formatting it like the
  // win rates beside it would read as one, which is the whole misreading risk.
  it("renders IWD in signed percentage points, never as a percentage", () => {
    expect(statLine(card({ iwd: 0.149 }))).toContain("IWD +14.9pp");
    expect(statLine(card({ iwd: -0.021 }))).toContain("IWD -2.1pp");
  });

  it("keeps a zero IWD signed so it reads as a difference", () => {
    expect(statLine(card({ iwd: 0 }))).toContain("IWD +0.0pp");
  });

  // A thin set would otherwise spend most of a fifteen-card pack listing what it
  // does not know.
  it("omits absent stats instead of printing placeholders", () => {
    const line = statLine(
      card({ iwd: undefined, maindeckRate: undefined, avgPick: undefined, winRate: undefined }),
    );
    expect(line).toBe("GIH 55.2% (n 3.8k) · ALSA 9.2");
    expect(line).not.toContain("n/a");
  });

  it("says so plainly when the card has no data at all", () => {
    expect(
      statLine(
        card({
          gihWinRate: undefined,
          gihGames: undefined,
          alsa: undefined,
          avgPick: undefined,
          iwd: undefined,
          maindeckRate: undefined,
          winRate: undefined,
        }),
      ),
    ).toBe("no draft data");
  });

  it("spells out small sample sizes rather than rounding them to 0.0k", () => {
    expect(statLine(card({ gihGames: 412 }))).toContain("(n 412)");
  });
});

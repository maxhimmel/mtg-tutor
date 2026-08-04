import { describe, it, expect } from "vitest";
import type { Card } from "../model/card.js";
import { describeCard, rulesText, statLine } from "./cardLine.js";

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

  // The bug this exists to prevent: a coach given a type line and a name told a
  // player their removal spell "isn't removal", and called a five-colour mana
  // rock a generic artifact. A type line cannot say what a card does.
  it("says what the card does, not only what it is", () => {
    const line = describeCard(card({ oracleText: "Lightning Strike deals 3 damage to any target." }));
    expect(line).toContain("deals 3 damage to any target");
  });

  it("gives a creature its size", () => {
    const line = describeCard(
      card({ typeLine: "Creature — Elf Warrior", power: "2", toughness: "3" }),
    );
    expect(line).toContain("Creature — Elf Warrior [2/3]");
  });

  it("gives a planeswalker its loyalty", () => {
    expect(describeCard(card({ typeLine: "Legendary Planeswalker — Jace", loyalty: "4" }))).toContain(
      "[4 loyalty]",
    );
  });

  it("leaves a vanilla card exactly as it was", () => {
    expect(describeCard(card())).toBe("Lightning Strike — 2 mana, Red, Instant");
  });
});

describe("rulesText", () => {
  // Reminder text restates keywords the model already knows, on every card of
  // every pack of a 42-pick draft.
  it("drops reminder text", () => {
    expect(rulesText({ oracleText: "Flying (This creature can't be blocked except by...)" })).toBe(
      "Flying",
    );
  });

  // describeCard's callers own the indent of the block a card sits in, so a card
  // that spans lines breaks out of it.
  it("keeps a multi-line card on one line", () => {
    expect(rulesText({ oracleText: "Vigilance\nTrample\n{T}: Add {G}." })).toBe(
      "Vigilance / Trample / {T}: Add {G}.",
    );
  });

  it("says nothing for a card with no rules text", () => {
    expect(rulesText({ oracleText: "" })).toBe("");
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

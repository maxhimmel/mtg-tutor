import { describe, it, expect } from "vitest";
import pc from "picocolors";
import type { Card } from "../model/card.js";
import { renderManaCost, ptLine, wrapText, cardDetail } from "./format.js";

// Strip ANSI so assertions are about content, not color codes.
const plain = (s: string) => s.replace(new RegExp("\\u001b\\[[0-9;]*m", "g"), "");

function card(over: Partial<Card> = {}): Card {
  return {
    name: "Test Bear",
    rarity: "common",
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: "{1}{G}",
    cmc: 2,
    typeLine: "Creature — Bear",
    oracleText: "Vigilance",
    power: "2",
    toughness: "2",
    collectorNumber: "1",
    ...over,
  };
}

describe("renderManaCost", () => {
  it("renders each symbol from a cost", () => {
    expect(plain(renderManaCost("{2}{U}{U}"))).toBe("2UU");
    expect(plain(renderManaCost("{T}"))).toBe("T");
    expect(renderManaCost("")).toBe("");
  });
});

describe("ptLine", () => {
  it("shows power/toughness for creatures", () => {
    expect(ptLine(card())).toBe("2/2");
  });
  it("shows loyalty for planeswalkers", () => {
    expect(ptLine(card({ power: undefined, toughness: undefined, loyalty: "3", typeLine: "Planeswalker" }))).toBe("Loyalty 3");
  });
  it("is empty for noncreature nonplaneswalker", () => {
    expect(ptLine(card({ power: undefined, toughness: undefined, typeLine: "Instant" }))).toBe("");
  });
});

describe("wrapText", () => {
  it("wraps to the given width", () => {
    const lines = wrapText("alpha beta gamma delta", 11);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(11);
    expect(lines.join(" ")).toBe("alpha beta gamma delta");
  });
  it("preserves explicit newlines and strips mana braces", () => {
    const lines = wrapText("Flying\n{T}: Add {G}.", 40);
    expect(lines[0]).toBe("Flying");
    expect(lines[1]).toBe("T: Add G.");
  });
});

describe("cardDetail", () => {
  it("includes name, P/T, oracle text and stats", () => {
    const out = plain(cardDetail(card({ gihWinRate: 0.56, alsa: 3.2, winRate: 0.55 }), 60));
    expect(out).toContain("Test Bear");
    expect(out).toContain("2/2");
    expect(out).toContain("Vigilance");
    expect(out).toContain("GIH WR 56.0%");
  });
  it("shows both faces of a double-faced card", () => {
    const dfc = card({
      name: "Front // Back",
      oracleText: "Front Name\nCreature — Elf\nHaste\n//\nBack Name\nLand\n{T}: Add {G}.",
    });
    const out = plain(cardDetail(dfc, 60));
    expect(out).toContain("Haste");
    expect(out).toContain("Back Name");
    expect(out).toContain("T: Add G.");
  });
  it("notes missing 17Lands data", () => {
    const out = plain(cardDetail(card(), 60));
    expect(out).toContain("no 17Lands data");
  });
});

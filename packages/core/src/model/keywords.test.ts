import { describe, it, expect } from "vitest";
import { keywordsOf } from "./keywords.js";

const names = (oracleText: string) => keywordsOf({ oracleText }).map((k) => k.name);

describe("keywordsOf", () => {
  it("finds keywords in the order they are printed", () => {
    expect(names("Flying, vigilance")).toEqual(["Flying", "Vigilance"]);
  });

  it("ignores keywords that only appear in reminder text", () => {
    const flier =
      "Flying (This creature can't be blocked except by creatures with flying or reach.)";
    expect(names(flier)).toEqual(["Flying"]);
  });

  it("does not read double strike as first strike", () => {
    expect(names("Double strike")).toEqual(["Double strike"]);
    expect(names("First strike")).toEqual(["First strike"]);
  });

  it("matches a keyword that carries a number", () => {
    expect(names("When this creature enters, surveil 2.")).toEqual(["Surveil"]);
  });

  it("does not match a keyword inside a longer word", () => {
    expect(names("This creature is unreachable by mere words.")).toEqual([]);
  });

  it("finds a keyword the card grants to something else", () => {
    expect(names("Target creature gains trample until end of turn.")).toEqual(["Trample"]);
  });

  it("is empty for vanilla rules text", () => {
    expect(names("When this creature dies, draw a card.")).toEqual([]);
  });
});

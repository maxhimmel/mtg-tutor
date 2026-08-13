import { describe, expect, it } from "vitest";
import type { Card } from "../model/card.js";
import { DECK_TARGETS, deckNeeds, indistinguishable, tiebreak } from "./tiebreak.js";

// The rule this module has to keep is narrower than it looks: it may express a
// PREFERENCE and never a quantity. So the tests are about ordering, about which
// principle gets cited, and about the one thing that would make it dangerous --
// acting on a pair the data CAN separate.

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    value: 0.55,
    colors: ["R"],
    colorIdentity: ["R"],
    manaCost: "{1}{R}",
    cmc: 2,
    typeLine: "Creature — Goblin",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.55,
    gihGames: 5000,
    turn: 2,
    role: "creature",
    ...over,
  };
}

// `turn` and `role` are stated rather than derived from the type line, because
// that is now what the code reads: both are settled at ingest so the pick path
// can see them at all. A fixture that set only `typeLine` would be describing a
// card the scorer cannot judge.
const creature = (name: string, cmc: number) =>
  card(name, { cmc, turn: cmc, manaCost: `{${cmc}}`, typeLine: "Creature — Goblin", role: "creature" });

const removal = (name: string, cmc: number) =>
  card(name, {
    cmc,
    turn: cmc,
    manaCost: `{${cmc}}`,
    typeLine: "Instant",
    oracleText: "Destroy target creature.",
    role: "removal",
  });

const trick = (name: string, cmc: number) =>
  card(name, {
    cmc,
    turn: cmc,
    manaCost: `{${cmc}}`,
    typeLine: "Instant",
    oracleText: "Target creature gets +2/+2.",
    role: "other",
  });

// Half a draft gone, so the on-pace targets are half the finished-deck ones and
// a pool can be genuinely ahead or behind rather than trivially behind.
const HALFWAY = { picksMade: 21, totalPicks: 42 };
const needsOf = (pool: Card[]) => deckNeeds(pool, HALFWAY.picksMade, HALFWAY.totalPicks);

describe("deckNeeds", () => {
  // The scaling is the whole reason this is usable mid-draft. Without it every
  // pool is short of everything until pack 3, and a tiebreak that fires on every
  // pick has said nothing.
  it("reads a pool against where the draft has got to, not against the finished deck", () => {
    const eight = Array.from({ length: 8 }, (_, i) => creature(`C${i}`, 2));

    // Eight creatures at the halfway mark is ahead of a 16-creature pace.
    expect(needsOf(eight).creatures).toBe(false);
    // The same eight at three quarters is behind it.
    expect(deckNeeds(eight, 32, 42).creatures).toBe(true);
  });

  it("names the turns the deck cannot act on", () => {
    const pool = [creature("Two", 2), creature("Four", 4)];
    const needs = needsOf(pool);

    expect([...needs.emptyTurns].sort()).toEqual([1, 3]);
  });

  // CURVE-03 is a ceiling, so it is the one need met by NOT taking something.
  it("notices a top end that is already full", () => {
    const heavy = Array.from({ length: DECK_TARGETS.expensive }, (_, i) => creature(`Big${i}`, 6));
    expect(needsOf(heavy).toppedOut).toBe(true);
    expect(needsOf([creature("Big", 6)]).toppedOut).toBe(false);
  });
});

describe("tiebreak", () => {
  // SIG-16 and EVAL-10 say the tiebreaker is the deck, and CURVE-07 says it is
  // the cheaper card. They disagree here, and the corpus settles the order: the
  // deck is read first, so a four-drop that fills the only hole beats a two-drop
  // the deck does not need.
  it("prefers the card the deck needs over the cheaper one", () => {
    // Twelve creatures over turns 1-3: ahead of pace on bodies and on cheap
    // cards, so the ONLY need left is the hole at four. That isolation is the
    // point -- a pool short of several things at once meets them with both
    // candidates, and then cheapness decides and should.
    const pool = Array.from({ length: 12 }, (_, i) => creature(`C${i}`, (i % 3) + 1));
    const needs = needsOf(pool);
    expect(needs.creatures).toBe(false);
    expect(needs.cheap).toBe(false);
    expect([...needs.emptyTurns]).toEqual([4]);

    const { card: chosen, reasons } = tiebreak(
      [creature("Two Drop", 2), creature("Four Drop", 4)],
      needs,
    );

    expect(chosen.name).toBe("Four Drop");
    expect(reasons.map((r) => r.principle)).toContain("CURVE-04");
  });

  // And CURVE-07 as the last word, cited only when it actually did the deciding.
  it("falls back to the cheaper card, and says that is why", () => {
    // A pool with no holes and plenty of everything, so no need fires.
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => creature(`C${i}`, (i % 4) + 1)),
      ...Array.from({ length: 4 }, (_, i) => removal(`R${i}`, 2)),
    ];
    const needs = needsOf(pool);
    expect(needs.creatures).toBe(false);
    expect(needs.removal).toBe(false);
    expect(needs.emptyTurns.size).toBe(0);

    const { card: chosen, reasons } = tiebreak([trick("Dear", 4), trick("Cheap", 2)], needs);

    expect(chosen.name).toBe("Cheap");
    expect(reasons).toEqual([
      { principle: "CURVE-07", note: "nothing else separates these, so take the cheaper one" },
    ]);
  });

  // A card that won on a deck need did not win for being cheap, and citing
  // CURVE-07 for it would credit a principle that had no part in the answer.
  it("does not cite cheapness when the deck decided it", () => {
    const pool = [creature("A", 2), creature("B", 2)];
    const { reasons } = tiebreak([removal("Kill", 2), creature("Body", 1)], needsOf(pool));

    expect(reasons.map((r) => r.principle)).not.toContain("CURVE-07");
  });

  // A card can win purely because its rival was penalised: it meets nothing, it
  // simply does not deepen a top end that is already full. The only true thing
  // to say there is about the card it BEAT, so the reason has to come off the
  // loser -- otherwise the winner arrives with nothing and CURVE-07 takes credit
  // for a decision cheapness did not make.
  it("explains a win that came from the rival's penalty, not its own merits", () => {
    const heavy = [
      ...Array.from({ length: DECK_TARGETS.expensive }, (_, i) => creature(`Big${i}`, 6)),
      ...Array.from({ length: 10 }, (_, i) => creature(`Mid${i}`, (i % 4) + 1)),
    ];
    const { card: chosen, reasons } = tiebreak(
      [creature("Sixth Big", 6), trick("Modest", 3)],
      needsOf(heavy),
    );

    expect(chosen.name).toBe("Modest");
    expect(reasons.map((r) => r.principle)).toEqual(["CURVE-03"]);
  });

  it("holds the incoming order when nothing separates the band at all", () => {
    const pool = Array.from({ length: 12 }, (_, i) => creature(`C${i}`, (i % 4) + 1));
    const a = trick("First", 3);
    const b = trick("Second", 3);

    expect(tiebreak([a, b], needsOf(pool)).card.name).toBe("First");
    expect(tiebreak([b, a], needsOf(pool)).card.name).toBe("Second");
  });
});

// The guard that keeps the whole idea honest. A principle may only act where the
// data has abstained, so the band must not swallow a pair the error bars can
// actually tell apart -- and must not form at all around an unrated card, which
// has no error bars to be inside of.
describe("indistinguishable", () => {
  const margin = (a: Card, b: Card) => {
    const v = (c: Card) =>
      c.gihWinRate == null || c.gihGames == null ? undefined : (c.gihWinRate * (1 - c.gihWinRate)) / c.gihGames;
    const va = v(a);
    const vb = v(b);
    return va == null || vb == null ? undefined : Math.sqrt(va + vb);
  };

  // ~±1.0pp at 5,000 games each, so 0.4pp is inside it and 3pp is not.
  const top = card("Top", { gihWinRate: 0.58 });
  const near = card("Near", { gihWinRate: 0.576 });
  const far = card("Far", { gihWinRate: 0.55 });

  it("keeps a card the error bars cannot separate from the best", () => {
    const band = indistinguishable(
      [
        { card: top, value: 0.58 },
        { card: near, value: 0.576 },
      ],
      margin,
    );
    expect(band.map((c) => c.name)).toEqual(["Top", "Near"]);
  });

  it("excludes one they can", () => {
    const band = indistinguishable(
      [
        { card: top, value: 0.58 },
        { card: far, value: 0.55 },
      ],
      margin,
    );
    expect(band.map((c) => c.name)).toEqual(["Top"]);
  });

  // An unmeasurable margin is not a tie. There is no data to call these the
  // same, so the band stays closed and the tiebreak never runs.
  it("never bands an unrated card, however close its value", () => {
    const unrated = card("Unrated", { gihWinRate: undefined, gihGames: undefined, value: 0.579 });
    const band = indistinguishable(
      [
        { card: top, value: 0.58 },
        { card: unrated, value: 0.579 },
      ],
      margin,
    );
    expect(band.map((c) => c.name)).toEqual(["Top"]);
  });
});

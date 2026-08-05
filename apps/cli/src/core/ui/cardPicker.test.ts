import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import type { Card } from "@mtg-tutor/core";
import { editPiles, pickFromPack, type PileRow } from "./cardPicker.js";

// A pack is read off a hydrated board, so a fixture only has to carry what the
// rows and the detail panel print.
const card = (name: string, overrides: Partial<Card> = {}): Card =>
  ({
    name,
    rarity: "common",
    colors: ["W"],
    colorIdentity: ["W"],
    manaCost: "{1}{W}",
    cmc: 2,
    typeLine: "Creature — Human",
    oracleText: "",
    collectorNumber: name,
    gihWinRate: 0.55,
    gihGames: 5000,
    alsa: 8,
    value: 0.55,
    ...overrides,
  }) as Card;

// The prompt owns the terminal, so a test has to hand it one. Keys go in one at
// a time exactly as a keypress arrives, each after a tick that lets the prompt
// finish reading the last one.
function terminal() {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  return {
    io: { input, output },
    async press(...keys: string[]) {
      for (const key of keys) {
        await new Promise((resolve) => setImmediate(resolve));
        input.write(key);
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

const ENTER = "\r";
const DOWN = "\x1b[B";
// What Clack reads as walking away. Escape alone is the head of every arrow
// key's own sequence, so it is not the one.
const ABORT = "\x03";

describe("pickFromPack", () => {
  const pack = [card("First"), card("Second")];

  it("takes the highlighted card to the maindeck on enter", async () => {
    const term = terminal();
    const choice = pickFromPack(pack, "Pick", term.io);
    await term.press(DOWN, ENTER);

    expect(await choice).toEqual({ kind: "pick", card: pack[1], bench: false });
  });

  // The whole point of the key: the pile is named as the card is taken, not
  // corrected afterwards.
  it("takes the highlighted card to the sideboard on s", async () => {
    const term = terminal();
    const choice = pickFromPack(pack, "Pick", term.io);
    await term.press("s");

    expect(await choice).toEqual({ kind: "pick", card: pack[0], bench: true });
  });

  it("opens the two piles on v without picking anything", async () => {
    const term = terminal();
    const choice = pickFromPack(pack, "Pick", term.io);
    await term.press("v");

    expect(await choice).toEqual({ kind: "piles" });
  });

  it("abandons the draft when the player walks away", async () => {
    const term = terminal();
    const choice = pickFromPack(pack, "Pick", term.io);
    await term.press(ABORT);

    expect(await choice).toBeNull();
  });
});

describe("editPiles", () => {
  const rows = (): PileRow[] => [
    { card: card("Playing"), pos: 0, benched: false },
    { card: card("Benched"), pos: 4, benched: true },
  ];

  it("moves the highlighted card to the other pile without leaving", async () => {
    const term = terminal();
    const edited = editPiles(rows(), "Your picks", term.io);
    await term.press(" ", DOWN, " ", ENTER);

    expect(await edited).toEqual([
      { card: rows()[0].card, pos: 0, benched: true },
      { card: rows()[1].card, pos: 4, benched: false },
    ]);
  });

  it("hands back the split it was given when nothing was moved", async () => {
    const term = terminal();
    const edited = editPiles(rows(), "Your picks", term.io);
    await term.press(ENTER);

    expect(await edited).toEqual(rows());
  });

  // Moving a card twice is moving it back, which has to leave the split where
  // it started rather than accumulate.
  it("moves a card back on a second press", async () => {
    const term = terminal();
    const edited = editPiles(rows(), "Your picks", term.io);
    await term.press(" ", " ", ENTER);

    expect(await edited).toEqual(rows());
  });

  it("changes nothing when the player walks away", async () => {
    const term = terminal();
    const edited = editPiles(rows(), "Your picks", term.io);
    await term.press(" ", ABORT);

    expect(await edited).toBeNull();
  });
});

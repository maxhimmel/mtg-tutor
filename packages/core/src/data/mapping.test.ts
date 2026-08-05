import { describe, it, expect } from "vitest";
import { mergeCards } from "./mapping.js";
import type { ScryfallCard } from "./sources.js";

// Shapes taken from live Scryfall responses rather than invented, because the
// whole point of `backImageUrl` is a distinction Scryfall draws and we do not:
// two halves of one picture versus two pictures. A fixture that gave every
// multi-faced card face images would agree with any implementation.
const scryfall = (over: Partial<ScryfallCard>): ScryfallCard => ({
  name: "Plains",
  rarity: "common",
  type_line: "Basic Land — Plains",
  collector_number: "1",
  booster: true,
  set: "fdn",
  layout: "normal",
  ...over,
});

const IMAGE = "https://cards.scryfall.io/normal/front/5/e/abc.jpg";
const BACK = "https://cards.scryfall.io/normal/back/5/e/abc.jpg";

const merge = (card: ScryfallCard) => mergeCards([card], [])[0];

describe("mergeCards", () => {
  it("leaves the layout off an ordinary card", () => {
    const card = merge(scryfall({ name: "Llanowar Elves", image_uris: { normal: IMAGE } }));
    expect(card.layout).toBeUndefined();
    expect(card.backImageUrl).toBeUndefined();
  });

  // Picklock Prankster: one picture carrying both halves, and no face images.
  it("carries a two-in-one card's layout but gives it no back face", () => {
    const card = merge(
      scryfall({
        name: "Picklock Prankster // Free the Fae",
        layout: "adventure",
        type_line: "Creature — Faerie Rogue // Instant — Adventure",
        image_uris: { normal: IMAGE },
        card_faces: [
          { name: "Picklock Prankster", type_line: "Creature — Faerie Rogue" },
          { name: "Free the Fae", type_line: "Instant — Adventure" },
        ],
      }),
    );
    expect(card.layout).toBe("adventure");
    expect(card.imageUrl).toBe(IMAGE);
    expect(card.backImageUrl).toBeUndefined();
  });

  // Brigid, Clachan's Heart: no top-level picture, one per face.
  it("takes the back face's art from the face that has one", () => {
    const card = merge(
      scryfall({
        name: "Brigid, Clachan's Heart // Brigid, Doun's Mind",
        layout: "transform",
        type_line: "Legendary Creature — Kithkin Warrior // Legendary Creature — Kithkin Soldier",
        card_faces: [
          { name: "Brigid, Clachan's Heart", image_uris: { normal: IMAGE } },
          { name: "Brigid, Doun's Mind", image_uris: { normal: BACK } },
        ],
      }),
    );
    expect(card.layout).toBe("transform");
    expect(card.imageUrl).toBe(IMAGE);
    expect(card.backImageUrl).toBe(BACK);
  });
});

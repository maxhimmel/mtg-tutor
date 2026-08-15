import { describe, it, expect } from "vitest";
import { mergeCards } from "./mapping.js";
import type { ScryfallCard } from "./sources.js";

// Shapes taken from live Scryfall responses rather than invented, because the
// whole point of `backImageUrl` is a distinction Scryfall draws and we do not:
// two halves of one picture versus two pictures. A fixture that gave every
// multi-faced card face images would agree with any implementation.
const scryfall = (over: Partial<ScryfallCard>): ScryfallCard => ({
  id: "card-id",
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

const merge = (card: ScryfallCard, tokens: ScryfallCard[] = []) =>
  mergeCards([card], [], tokens)[0];

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

// dsk prints two Insect tokens under one name, a 1/1 and a 2/1, and two cards in
// the set make one each. Real ids and real art, because that collision IS the
// test: a fixture with distinct names would pass against a name lookup, which is
// the implementation this one exists to rule out.
const SMALL_INSECT = "377f1a20-b270-4b07-9892-7170cd0bee38";
const BIG_INSECT = "b802aea8-0ca3-4d2c-a8ef-a80e16729c9b";

const tokenSheet = [
  scryfall({
    id: SMALL_INSECT,
    name: "Insect",
    type_line: "Token Creature — Insect",
    image_uris: { normal: "https://cards.scryfall.io/normal/front/3/7/small.jpg" },
  }),
  scryfall({
    id: BIG_INSECT,
    name: "Insect",
    type_line: "Token Creature — Insect",
    image_uris: { normal: "https://cards.scryfall.io/normal/front/b/8/big.jpg" },
  }),
];

const relatedToken = (id: string, name: string, type_line: string) => ({
  id,
  component: "token",
  name,
  type_line,
});

describe("mergeCards tokens", () => {
  it("leaves the field off a card that makes none", () => {
    expect(merge(scryfall({ name: "Llanowar Elves" }), tokenSheet).tokens).toBeUndefined();
  });

  // Fear of Impostors: two `all_parts` entries, both combo pieces, one of them
  // named "Manifest" and typed "Creature". A filter that took the array whole,
  // or that went by the type line, would have this card making a token.
  it("takes no token from a card whose only parts are combo pieces", () => {
    const card = merge(
      scryfall({
        name: "Fear of Impostors",
        all_parts: [
          {
            id: "bdee441e-14ab-42d1-b447-5a6488fd713a",
            component: "combo_piece",
            name: "Fear of Impostors",
            type_line: "Enchantment Creature — Nightmare",
          },
          {
            id: "01104ab1-84e1-4c78-853d-637c6554bdf9",
            component: "combo_piece",
            name: "Manifest",
            type_line: "Creature",
          },
        ],
      }),
      tokenSheet,
    );
    expect(card.tokens).toBeUndefined();
  });

  // Broodspinner lists itself as a combo piece beside the Insect it makes, so
  // "has all_parts" and "makes a token" are not the same question.
  it("keeps the token and drops the card's own entry", () => {
    const card = merge(
      scryfall({
        name: "Broodspinner",
        all_parts: [
          {
            id: "dcdd2622-ab7a-4990-b026-3667cac42894",
            component: "combo_piece",
            name: "Broodspinner",
            type_line: "Creature — Spider",
          },
          relatedToken(SMALL_INSECT, "Insect", "Token Creature — Insect"),
        ],
      }),
      tokenSheet,
    );
    expect(card.tokens).toEqual([
      {
        name: "Insect",
        typeLine: "Token Creature — Insect",
        imageUrl: "https://cards.scryfall.io/normal/front/3/7/small.jpg",
      },
    ]);
  });

  it("tells two tokens of the same name apart by their Scryfall id", () => {
    const overlord = merge(
      scryfall({
        name: "Overlord of the Mistmoors",
        all_parts: [relatedToken(BIG_INSECT, "Insect", "Token Creature — Insect")],
      }),
      tokenSheet,
    );
    expect(overlord.tokens?.[0].imageUrl).toBe(
      "https://cards.scryfall.io/normal/front/b/8/big.jpg",
    );
  });

  // The Copy token is the one every format makes and no set prints, so its
  // sheet never has it. Keeping the name and the type line is the difference
  // between a card that says what it makes and a card that says nothing.
  it("keeps a token the sheet does not print, without art", () => {
    const card = merge(
      scryfall({
        name: "Dazzling Denial",
        all_parts: [
          relatedToken("f4e87a11-b3b1-47b2-bd73-f4c78d6fbe6c", "Copy", "Token"),
        ],
      }),
      tokenSheet,
    );
    expect(card.tokens).toEqual([{ name: "Copy", typeLine: "Token" }]);
    expect(card.tokens?.[0]).not.toHaveProperty("imageUrl");
  });

  it("illustrates nothing when no token sheet was crawled", () => {
    const card = merge(
      scryfall({
        name: "Broodspinner",
        all_parts: [relatedToken(SMALL_INSECT, "Insect", "Token Creature — Insect")],
      }),
    );
    expect(card.tokens).toEqual([{ name: "Insect", typeLine: "Token Creature — Insect" }]);
  });
});

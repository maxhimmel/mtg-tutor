import { COLOR_NAMES } from "./format";

// Colour shorthand inside a sentence, found narrowly enough to redraw as the
// game's own symbols.
//
// The letters get into the prose honestly: the review prompt hands the model the
// set's archetype win rates keyed "WU", "BRG", and the coach writes them back at
// the player. They are a database key either way, and a pip needs no decoding --
// but swapping them means matching letters inside prose, which is where this
// could go badly wrong. So the rule is deliberately narrow, and everything it
// refuses, it refuses for a reason:
//
//   - A single letter. "B" is a grade on this app's own verdict panel, and a
//     coach that writes "a B pick" would have it redrawn as a black pip. No
//     letter on its own is safe, so only a run of two or more counts.
//   - Any order but WUBRG. "BUG" and "RUG" are colour nicknames AND English
//     words. Canonical order costs the nickname spelling and buys immunity to
//     the word -- and `prompt.ts` asks the model for canonical order, so the
//     spelling is predictable rather than hoped for.
//   - Lower case, which puts every English word made of these letters out of
//     reach whatever its order.
//   - "WR". It is white-red, and it is also how this app writes a win rate:
//     "GIH WR 56.2%" comes out of `explainPick` and is rendered through the same
//     component that would transform it. A win rate drawn as two mana pips is a
//     worse failure than a colour pair left as letters, so the pair is the one
//     that gives way.

const WUBRG = "WUBRG";

// Every combination of two or more colours, spelled in WUBRG order: 26 of them,
// less the one held back above.
const TOKENS = new Set(
  Array.from({ length: 1 << WUBRG.length }, (_, mask) =>
    [...WUBRG].filter((_, i) => (mask & (1 << i)) !== 0).join(""),
  ).filter((token) => token.length >= 2 && token !== "WR"),
);

// Bounded the same way `cardNamePattern` is, and for the same reason: "URGENT"
// and "P1UR" are not colour tokens. A trailing hyphen or apostrophe is let
// through, so "UR-based" and "UR's" keep their pips and their suffix.
//
// Not global, so `split` behaves and the pattern stays safe to `test`.
export const COLOR_TOKEN = /(?<![\p{L}\p{N}])([WUBRG]{2,5})(?![\p{L}\p{N}])/u;

// A capture from `COLOR_TOKEN` is only shorthand if it is one of the spellings
// above -- "GG" and "GW" match the shape and are not colours this will draw.
export const isColorToken = (part: string): boolean => TOKENS.has(part);

// What the pips say out loud. Lower case and hyphenated because this is read
// mid-clause: "your blue-red shell" is the sentence the letters were in, where
// "your Blue Red shell" is two things and a missing word.
export const spokenColors = (token: string): string =>
  [...token].map((c) => COLOR_NAMES[c]?.toLowerCase() ?? c).join("-");

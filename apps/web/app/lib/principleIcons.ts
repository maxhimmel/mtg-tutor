/**
 * A mark per principle category, so a citation can be recognised before it is
 * read.
 *
 * The coach cites its grounds by id -- SIG-03, EVAL-07 -- and a row of those is
 * a row of near-identical mono tokens: the eye has to read all six characters of
 * each before it knows whether the answer leaned on signal-reading or on curve.
 * The category is the half of the id that carries the meaning and the half that
 * repeats, which makes it exactly the half worth drawing rather than spelling.
 * Same trade the mana pips make against "UWBRG".
 *
 * SHAPE, NOT COLOUR. Every saturated hue in this theme is already spoken for --
 * gold is "yours", and success/info/warning/error ARE the grade scale -- so
 * seven categories cannot be seven colours without one of them meaning two
 * things. They are told apart by silhouette instead: waves, star, two rings,
 * bars, drop, stack, triangle. That also survives being printed at 14px in a
 * badge, where a hue difference would not.
 *
 * Paths rather than JSX so the coverage of this table is testable without
 * rendering anything -- see principleIcons.test.ts, which asserts every category
 * the corpus actually contains has a mark. A category added to the YAML with no
 * entry here would otherwise draw nothing and say nothing about it.
 *
 * Geometry is Lucide's (ISC), which is drawn for exactly this size and weight.
 */
export const PRINCIPLE_ICONS: Record<string, readonly string[]> = {
  // Broadcast. What is coming round the table, and what the table is telling you.
  signals: [
    "M4.9 19.1C1 15.2 1 8.8 4.9 4.9",
    "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5",
    "M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5",
    "M19.1 4.9C23 8.8 23 15.1 19.1 19",
  ],
  // A rating. This is the category about how good a card is on its own.
  "card-evaluation": [
    "M11.5 3.4a.6.6 0 0 1 1 0l2.2 4.5 4.9.7a.6.6 0 0 1 .3 1l-3.5 3.5.8 4.9a.6.6 0 0 1-.9.6L12 16.3l-4.3 2.3a.6.6 0 0 1-.9-.6l.8-4.9-3.5-3.5a.6.6 0 0 1 .3-1l4.9-.7z",
  ],
  // Two overlapping rings, because an archetype IS an intersection -- the cards
  // two colours both want.
  archetypes: ["M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0", "M9 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
  // The curve itself, drawn as the bars the deck builder draws it as.
  "mana-curve": ["M6 19v-4", "M12 19v-8", "M18 19v-12"],
  // A drop of mana. The one category whose subject already has a symbol.
  "mana-base": ["M12 2.7c3.5 3.8 6 7 6 9.8a6 6 0 0 1-12 0c0-2.8 2.5-6 6-9.8z"],
  // Cards stacked into a deck.
  "deck-construction": [
    "M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
    "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  ],
  // The warning triangle, and the only mark here that is about being wrong.
  "common-mistakes": [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
};

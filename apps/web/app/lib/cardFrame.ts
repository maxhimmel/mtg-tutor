import { type Card, type ColorCode, isLand } from "@mtg-tutor/core";

// Colours for the deck-list row Arena draws: a saturated ring in the card's
// colour, wrapping a plate that is the same colour mixed toward white.
//
// Sampled from a screenshot of the real thing -- mono blue gave ring #3d87c6 and
// plate #9fc0d8, mono black gave #5e5c5a and #a8a5a2. Both plates sit at about
// 55% ring against white, so only the ring is stored here and the plate is
// derived; keeping one number per colour is what stops the two drifting apart.
//
// These are deliberately literal hex rather than daisyUI tokens: they encode
// which Magic colour a card is, not which part of our UI this is, so they must
// not shift with the active theme. Every plate is light enough for near-black
// text, so the row reads the same in light and dark.
const RINGS = {
  W: "#c2b78e",
  U: "#3d87c6",
  B: "#5e5c5a",
  R: "#c25a3e",
  G: "#4e8a55",
  colorless: "#8c98a2",
} satisfies Record<string, string>;

// A card of two or more colours keeps them all in the ring and goes gold in the
// plate, which is the only place a colour pair is visible at all. Sampled off a
// {U}{B} card: the ring runs blue on the left to black on the right, flat at
// both ends and blending across the middle. A dual land lands here too, so it
// reads as the pair it fixes rather than as a colourless rock.
const GOLD_PLATE = "#d3c68c";

const WUBRG: ColorCode[] = ["W", "U", "B", "R", "G"];

export interface Frame {
  // Paints the ring. A flat colour for one colour, a gradient for several.
  ring: string;
  plate: string;
}

const plateFor = (ring: string) => `color-mix(in srgb, ${ring} 55%, #fff)`;

const mono = (ring: string): Frame => ({ ring, plate: plateFor(ring) });

function multicolor(colors: ColorCode[]): Frame {
  const span = 100 / colors.length;
  const stops = colors.flatMap((c, i) => {
    // Hold each colour flat over the middle half of its share so the blends stay
    // in the seams rather than washing the whole ring out.
    const start = i * span + span * 0.25;
    const end = (i + 1) * span - span * 0.25;
    return [`${RINGS[c]} ${start.toFixed(1)}%`, `${RINGS[c]} ${end.toFixed(1)}%`];
  });
  return { ring: `linear-gradient(to right, ${stops.join(", ")})`, plate: GOLD_PLATE };
}

// Lands run through the same rules as everything else, but off a different
// field: producing mana does not make a land coloured, so its own `colors` is
// almost always empty and every land would come out the same grey. Its identity
// is what says which colours it belongs to -- the deck builder already reads it
// this way to decide which lands fit a pool (see landFitsColors in
// core/draft/deck.ts).
//
// Precedence from there: no colours takes the colourless ring, one colour takes
// that colour, and anything else runs its colours across the ring.
export function frameFor(card: Card): Frame {
  const colors = isLand(card) ? card.colorIdentity : card.colors;
  if (colors.length === 0) return mono(RINGS.colorless);
  if (colors.length === 1) return mono(RINGS[colors[0]]);
  return multicolor(WUBRG.filter((c) => colors.includes(c)));
}

import { type Card, type ColorCode, isLand, parseManaCost } from "@mtg-tutor/core";

// The colours of a printed M15 card frame, sampled from Scryfall scans.
//
// These are deliberately literal hex rather than daisyUI tokens: they encode
// which Magic colour a card is, not which part of our UI this is, so they must
// not shift with the active theme. Every plate is light enough for near-black
// text, so the placard reads the same in light and dark.
export interface Frame {
  // The saturated outer band. A gradient for hybrids, where the two colours meet.
  band: string;
  // The plate's hairline, which on a real card is the band colour darkened.
  stroke: string;
  plateTop: string;
  plateBottom: string;
}

// A plate is nearly white on every frame except gold and land, which are printed
// in an actual gold. Sampling Serra Angel, Sphinx of Foresight, Sign in Blood,
// Shock, Beast Within, Sol Ring, Lightning Helix and Command Tower gives:
const FRAMES = {
  W: { band: "#f6efd6", stroke: "#a1946f", plateTop: "#fbfaf4", plateBottom: "#e6e3d6" },
  U: { band: "#2f7fbe", stroke: "#5d7d99", plateTop: "#e8eef5", plateBottom: "#c6d2de" },
  B: { band: "#1c1a18", stroke: "#4a4744", plateTop: "#d9d7d3", plateBottom: "#b8b5b0" },
  R: { band: "#d4462b", stroke: "#a97f68", plateTop: "#f7e2d3", plateBottom: "#edcdb6" },
  G: { band: "#22874d", stroke: "#6d7a68", plateTop: "#eef1e9", plateBottom: "#d3dbcd" },
  gold: { band: "#c9a94e", stroke: "#8a7434", plateTop: "#e0d3a4", plateBottom: "#c9b881" },
  artifact: { band: "#8f9aa2", stroke: "#6d777e", plateTop: "#e4e6e8", plateBottom: "#c7ccd0" },
  land: { band: "#a2825a", stroke: "#6b5c37", plateTop: "#d9d3a8", plateBottom: "#bdb682" },
} satisfies Record<string, Frame>;

const COLORS: ColorCode[] = ["W", "U", "B", "R", "G"];

// A hybrid card is printed with the two colours meeting across the band rather
// than blended into gold, so the pair itself is visible. The gradient runs the
// same direction the printed frame does: first colour on the left.
function hybridFrame(a: ColorCode, b: ColorCode): Frame {
  const left = FRAMES[a];
  const right = FRAMES[b];
  return {
    band: `linear-gradient(100deg, ${left.band} 0%, ${left.band} 38%, ${right.band} 62%, ${right.band} 100%)`,
    stroke: FRAMES.gold.stroke,
    plateTop: "#f0eee8",
    plateBottom: "#d6d3ca",
  };
}

// True when every coloured pip is a hybrid of the card's own two colours -- the
// printed test for the split frame. A card mixing hybrid and plain pips, or one
// whose hybrids are Phyrexian or generic-hybrid ({2/W}), is printed in gold.
function isFullyHybrid(manaCost: string, colors: ColorCode[]): boolean {
  const pips = parseManaCost(manaCost).filter((s) => COLORS.some((c) => s.includes(c)));
  if (pips.length === 0) return false;
  return pips.every((pip) => {
    const parts = pip.split("/");
    return (
      parts.length === 2 &&
      parts.every((p) => colors.includes(p as ColorCode)) &&
      parts[0] !== parts[1]
    );
  });
}

// Printed frame precedence: a land takes the land frame whatever its colour
// identity, a colourless card takes the artifact frame, one colour takes that
// colour, a fully hybrid pair takes the split frame, and anything else with two
// or more colours takes gold.
export function frameFor(card: Card): Frame {
  if (isLand(card)) return FRAMES.land;
  if (card.colors.length === 0) return FRAMES.artifact;
  if (card.colors.length === 1) return FRAMES[card.colors[0]];
  if (card.colors.length === 2 && isFullyHybrid(card.manaCost, card.colors)) {
    // Order by the colour wheel so {G/W} and {W/G} produce the same frame.
    const [a, b] = COLORS.filter((c) => card.colors.includes(c));
    return hybridFrame(a, b);
  }
  return FRAMES.gold;
}

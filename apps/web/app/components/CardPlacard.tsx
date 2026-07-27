"use client";

import { type Card, isLand } from "@mtg-tutor/core";
import { ManaCost } from "./ManaCost";

// The placard across the top of a printed Magic card: a bevelled, frame-coloured
// rectangle holding the name on the left and the mana cost on the right.
//
// Rebuilt in CSS rather than cropped out of the card image. The image would be
// exact for bespoke frames, but this stays crisp at any size, keeps the name as
// real selectable text for screen readers, and costs no request -- which matters
// when a finished pool stacks 45 of these in one scrolling column.
interface Frame {
  from: string;
  to: string;
  border: string;
  text: string;
}

// Approximations of the printed frames. These are deliberately literal colours
// rather than daisyUI tokens: they encode which Magic colour a card is, not
// which part of our UI this is, so they must not shift with the active theme.
// Each carries its own text colour, so the placard reads the same in light and
// dark.
const FRAMES = {
  W: { from: "#fffdf2", to: "#ece3c8", border: "#cabd93", text: "#1b1a15" },
  U: { from: "#bfdaf3", to: "#8ab3da", border: "#6690bc", text: "#0b2034" },
  B: { from: "#5c5e62", to: "#2c2d31", border: "#17181b", text: "#eae8e5" },
  R: { from: "#f6a78e", to: "#dd785a", border: "#bb5e44", text: "#2c0f07" },
  G: { from: "#b3cfa9", to: "#82ac79", border: "#628c5a", text: "#0f2310" },
  gold: { from: "#eedd9c", to: "#d5bc67", border: "#b19d4b", text: "#2a2109" },
  artifact: { from: "#d8dee2", to: "#abb7be", border: "#8997a0", text: "#131f28" },
  land: { from: "#d5b997", to: "#af8e68", border: "#8c714e", text: "#211709" },
} satisfies Record<string, Frame>;

// Printed frame rules: a land takes the land frame whatever its colour identity,
// a costless colourless card takes the artifact frame, one colour takes that
// colour, and two or more take gold.
function frameFor(card: Card): Frame {
  if (isLand(card)) return FRAMES.land;
  if (card.colors.length === 0) return FRAMES.artifact;
  if (card.colors.length > 1) return FRAMES.gold;
  return FRAMES[card.colors[0]];
}

export function CardPlacard({ card, className }: { card: Card; className?: string }) {
  const frame = frameFor(card);

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1 ${className ?? ""}`}
      style={{
        background: `linear-gradient(to bottom, ${frame.from}, ${frame.to})`,
        borderColor: frame.border,
        color: frame.text,
        // The bevel a real frame gets from its printed highlight and shadow.
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18)",
      }}
    >
      <span className="truncate font-serif text-sm font-semibold tracking-tight">
        {card.name}
      </span>
      <ManaCost cost={card.manaCost} className="shrink-0 whitespace-nowrap text-xs" />
    </div>
  );
}

"use client";

import { COLOR_NAMES } from "../lib/format";
import { ManaCost } from "./ManaCost";

/**
 * A deck's colours, drawn as Magic's own symbols.
 *
 * "WU" is a database key, not a way of saying a thing out loud. The pips are how
 * the game itself writes a colour, they are already on every card in the pack and
 * on every placard in a deck list, and they need no key -- a reader who has seen
 * one card knows what the blue drop means, where WU has to be decoded.
 *
 * Through ManaCost rather than a second symbol renderer, because there is already
 * one and two of them would drift on the day a hybrid or a snow symbol turns up.
 */
export function ColorPips({ colors, className }: { colors: string; className?: string }) {
  const letters = [...colors];
  if (letters.length === 0) return <span className={className}>—</span>;

  return (
    // Named here rather than left to ManaCost, which would say "Mana cost WU" --
    // true of a card's cost and wrong for a deck's colours.
    <span
      className={className}
      role="img"
      aria-label={letters.map((c) => COLOR_NAMES[c] ?? c).join(" ")}
    >
      <ManaCost cost={letters.map((c) => `{${c}}`).join("")} />
    </span>
  );
}

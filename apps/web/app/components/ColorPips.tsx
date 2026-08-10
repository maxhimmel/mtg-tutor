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

/**
 * The colours a pile is made of, and how many cards each.
 *
 * The same symbols as `ColorPips` above, which is the whole point of it living
 * next to it. The draft screen's picks panel and the deck builder both drew this
 * as a flat disc filled with the colour's ring paint and a number beside it --
 * accurate, and a mark that appears nowhere else in the game. Every card in the
 * pack, every placard in a deck list and the colour readout on the results screen
 * are already printing Magic's own symbol, so a bare dot was the one place a
 * reader had to work out what the colour meant from the colour alone.
 *
 * Ordered by the caller, which in practice means `tally`'s own order: commonest
 * first, which is what makes the row say which colours the deck is actually in
 * rather than which colours exist.
 */
export function ColorTally({
  colors,
  className,
}: {
  colors: readonly (readonly [string, number])[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className ?? ""}`}>
      {colors.map(([color, n]) => (
        <span
          key={color}
          className="flex items-center gap-1.5 text-xs tabular-nums text-base-content/70"
          title={COLOR_NAMES[color] ?? color}
        >
          {/* Hidden rather than left to speak for itself: ManaCost names what it
              draws "Mana cost White", which is true of a card's cost and wrong
              for a count of cards. The name a reader needs is on the line below,
              where it can be said as "7 White". */}
          <span aria-hidden className="leading-none">
            <ManaCost cost={`{${color}}`} className="text-[11px]" />
          </span>
          {n}
          <span className="sr-only">{COLOR_NAMES[color] ?? color}</span>
        </span>
      ))}
    </div>
  );
}

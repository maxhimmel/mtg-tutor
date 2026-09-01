"use client";

import { scaleLinear } from "@visx/scale";
import { INK, MARK } from "./ink";
import { points } from "../lib/format";

/**
 * A gap, and whether the data can see it.
 *
 * THE APP KEEPS MAKING THIS CLAIM AND KEEPS ASKING THE READER TO DO THE
 * ARITHMETIC. `Verdict` spends fourteen lines arguing that at 17Lands sample
 * sizes the error bars run to about a point, so a 0.3pp miss is a coin flip
 * rendered as two grades -- and then prints "−2.3pp ± 1.1pp" and leaves the
 * comparison to the reader. The archetype quiz says "the widest gap was 2.6
 * against a bar of 2.7" and does the same. Both are the same picture: a
 * quantity, its margin, and a zero the margin either reaches or does not.
 *
 * SO THE RULE IS THE ANSWER. If the bar crosses the zero line, the gap is not a
 * gap -- that is the whole reading, it takes no arithmetic, and it cannot
 * disagree with the verdict because it is drawn from the same two numbers the
 * verdict was decided on. Same grammar as `DeckBands` in the quiz, deliberately:
 * a reader who has learned to read one of these has learned to read both.
 *
 * IT IS DELIBERATELY TINY AND HAS NO AXIS. This rides inside an eyebrow beside
 * the numbers it draws, and the numbers are right there -- so the marks carry
 * the RELATION and the text carries the values, which is the division of labour
 * that lets it be 5rem wide. A version of this with tick labels would be a
 * second, worse copy of what is already printed next to it.
 *
 * WITH NO MARGIN IT DRAWS NOTHING. An unrated card has no error bars, and a bar
 * of unknown length is worse than no bar: it invites the exact reading -- "this
 * gap is real" -- that the missing margin is what makes unavailable.
 */

/**
 * WHY IT IS DRAWN AS AN ERROR BAR AND NOT AS A BAND WITH A DOT ON IT.
 *
 * The first version was one 6px round-capped stroke with an 8px circle sitting
 * inside it -- a filled lozenge with a slightly fatter bump somewhere along its
 * length, in one colour, 80 by 14, next to a vertical line. That is a TOGGLE
 * SWITCH. Not approximately: it is the exact silhouette of every on/off control
 * on the platform, and a reader meets it at the top of a panel full of controls,
 * where the first thing to decide about a small rounded thing with a knob in it
 * is whether it can be clicked. The mark meant "an interval, and where inside it
 * the estimate sits" and read "a setting, currently off".
 *
 * The fix is the oldest convention there is for exactly this quantity: a thin
 * rule with a serif at each end and a point estimate on it. Nobody has to be
 * taught it, it cannot be mistaken for a control, and it makes the two things
 * the mark is actually made of -- a SPAN and a POINT -- different shapes rather
 * than the same shape at two thicknesses. The reading is unchanged and so is
 * every number: does the span reach the rule.
 */
const WIDTH = 80;
const HEIGHT = 16;
/** Half the height of the serif closing each end of the interval. */
const SERIF = 4;
/** The interval's own weight. Thin, so the dot on it is unmistakably a dot. */
const SPAN_W = 1.5;

export function GapMark({
  /** The gap itself, in rate units. Signed the way the caller says it. */
  gap,
  /** Half-width of the error bar, in rate units. Undefined where unrated. */
  margin,
  /**
   * How to say the quantity out loud, for the accessible name.
   *
   * `points` by default, which is what every caller here means: a difference of
   * two rates. It is a prop because the drafter dials are the same PICTURE of a
   * different quantity -- a multiple of what the field weighs something at,
   * where "−2.3pp" would be a units error read aloud to exactly the readers who
   * cannot see the mark. The geometry and the reading are identical and only
   * the words change, which is why this is a prop rather than a second mark.
   */
  describe = points,
}: {
  gap: number;
  margin: number | undefined;
  describe?: (value: number) => string;
}) {
  if (margin == null) return null;

  // Always contains zero, and always holds the whole bar, so the one thing the
  // mark is read for -- does this reach the line -- is never cropped out of it.
  const reach = Math.max(Math.abs(gap) + margin, margin) * 1.15;
  const x = scaleLinear({ domain: [-reach, reach], range: [0, WIDTH] });

  const mid = HEIGHT / 2;
  const clears = Math.abs(gap) > margin;
  const ink = clears ? INK.value : INK.hollow;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      className="shrink-0"
      role="img"
      aria-label={
        clears
          ? `${describe(gap)}, against a margin of ${describe(margin).slice(1)} — a gap the data can see.`
          : `${describe(gap)}, inside a margin of ${describe(margin).slice(1)} — too small for the data to call.`
      }
    >
      {/* The interval first, so the zero rule paints over it: the rule is the
          thing being measured against, not a mark on the measurement. */}
      <path
        d={
          `M ${x(gap - margin)} ${mid - SERIF} V ${mid + SERIF} ` +
          `M ${x(gap - margin)} ${mid} H ${x(gap + margin)} ` +
          `M ${x(gap + margin)} ${mid - SERIF} V ${mid + SERIF}`
        }
        stroke={ink}
        strokeWidth={SPAN_W}
        fill="none"
      />
      <circle cx={x(gap)} cy={mid} r={MARK.dot / 2} fill={ink} />
      <line x1={x(0)} x2={x(0)} y1={0} y2={HEIGHT} stroke={INK.zero} strokeWidth={1} />
    </svg>
  );
}

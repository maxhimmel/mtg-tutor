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

const WIDTH = 80;
const HEIGHT = 14;

export function GapMark({
  /** The gap itself, in rate units. Signed the way the caller says it. */
  gap,
  /** Half-width of the error bar, in rate units. Undefined where unrated. */
  margin,
}: {
  gap: number;
  margin: number | undefined;
}) {
  if (margin == null) return null;

  // Always contains zero, and always holds the whole bar, so the one thing the
  // mark is read for -- does this reach the line -- is never cropped out of it.
  const reach = Math.max(Math.abs(gap) + margin, margin) * 1.15;
  const x = scaleLinear({ domain: [-reach, reach], range: [0, WIDTH] });

  const mid = HEIGHT / 2;
  const clears = Math.abs(gap) > margin;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      className="shrink-0"
      role="img"
      aria-label={
        clears
          ? `${points(gap)}, against a margin of ${points(margin).slice(1)} — a gap the data can see.`
          : `${points(gap)}, inside a margin of ${points(margin).slice(1)} — too small for the data to call.`
      }
    >
      {/* The bar first, so the zero rule paints over it: the rule is the thing
          being measured against, not a mark on the measurement. */}
      <line
        x1={x(gap - margin)}
        x2={x(gap + margin)}
        y1={mid}
        y2={mid}
        stroke={clears ? INK.value : INK.hollow}
        strokeWidth={MARK.band}
        strokeLinecap="round"
      />
      <circle
        cx={x(gap)}
        cy={mid}
        r={MARK.dot / 2}
        fill={clears ? INK.value : INK.hollow}
      />
      <line x1={x(0)} x2={x(0)} y1={0} y2={HEIGHT} stroke={INK.zero} strokeWidth={1} />
    </svg>
  );
}

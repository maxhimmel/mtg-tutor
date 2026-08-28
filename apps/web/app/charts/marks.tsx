"use client";

import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { GlyphCircle, GlyphDiamond, GlyphSquare, GlyphTriangle } from "@visx/glyph";
import type { ReactNode } from "react";
import { INK, MARK, NEUTRAL } from "./ink";
import { ringFor } from "../lib/cardFrame";

/**
 * The marks a chart in this app is drawn out of, at the sizes that make them
 * legible rather than at whatever the caller happened to type.
 *
 * These are thin on purpose -- a mark component that took twenty props would be
 * a chart library, and the reason this app is on visx rather than on one is that
 * the shapes here are not a library's shapes. What they fix is the class of
 * defect the August audit was full of: a two-pixel band, a dot too small to aim
 * at, two fills touching with no seam so they read as one, a bar whose end is
 * indistinguishable from the axis it stands on.
 */

/** A bar's end is rounded and its base is not: the base is the axis. */
const CAP = 4;

/**
 * A horizontal bar, capped at the value end and square at the baseline.
 *
 * The asymmetry is the point and it is not a style choice: a bar rounded at both
 * ends floats, and the whole claim a bar makes is that it is MEASURED FROM
 * somewhere. Square where it meets the axis, rounded where it stops.
 */
export function ValueBar({
  x,
  y,
  width,
  height,
  ink,
  from = "left",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  ink: string;
  /** Which end is the baseline. A diverging row has bars growing both ways. */
  from?: "left" | "right";
}) {
  const r = Math.min(CAP, Math.abs(width));
  return (
    <Bar
      x={x}
      y={y}
      width={Math.abs(width)}
      height={height}
      fill={ink}
      rx={r}
      // Square off the baseline end by covering its corners: `rx` alone rounds
      // all four, and an SVG rect has no per-corner radius.
      clipPath={undefined}
      style={{
        clipPath:
          from === "left"
            ? `inset(0 0 0 0 round 0 ${r}px ${r}px 0)`
            : `inset(0 0 0 0 round ${r}px 0 0 ${r}px)`,
      }}
    />
  );
}

/**
 * A point estimate.
 *
 * `MARK.dot` rather than a caller's number, because the audit found dots at
 * three pixels that a reader was expected to aim a tooltip at. Eight is the
 * floor at which a mark is a target as well as a mark.
 */
export function Dot({
  cx,
  cy,
  ink = INK.value,
  hollow = false,
}: {
  cx: number;
  cy: number;
  ink?: string;
  hollow?: boolean;
}) {
  return (
    <GlyphCircle
      left={cx}
      top={cy}
      size={MARK.dot * MARK.dot}
      fill={hollow ? "transparent" : ink}
      stroke={ink}
      strokeWidth={hollow ? 1.5 : 0}
    />
  );
}

/**
 * The shapes a series takes when colour cannot carry it alone.
 *
 * Assigned in a fixed order and never cycled, for the same reason a categorical
 * palette is: a shape that means "the second series" moves the moment a filter
 * drops the first, and then the chart has repainted itself under the reader.
 */
const GLYPHS = [GlyphCircle, GlyphSquare, GlyphTriangle, GlyphDiamond] as const;

export function SeriesGlyph({
  index,
  cx,
  cy,
  ink,
}: {
  index: number;
  cx: number;
  cy: number;
  ink: string;
}) {
  // Past four, a fifth shape is not a fifth series -- it is a chart that should
  // have been faceted. Clamped rather than wrapped so the failure is visible.
  const Glyph = GLYPHS[Math.min(index, GLYPHS.length - 1)];
  return <Glyph left={cx} top={cy} size={MARK.dot * MARK.dot} fill={ink} />;
}

/**
 * A band of one Magic colour, WITH ITS PIP. The pip is not optional and that is
 * the whole reason this component exists rather than a fill.
 *
 * `cardFrame`'s WUBRG rings are sampled from Arena and are not ours to re-pick:
 * they say which colour a CARD is, and a drafter expects red to be red. Put
 * through a colour-vision check against this app's near-black surface they come
 * back badly:
 *
 *     green #4e8a55 <-> red #c25a3e         dE 4.8   deuteranopia
 *     colourless #8c98a2 <-> green #4e8a55  dE 14.2  NORMAL vision
 *
 * 4.8 is below even the floor at which a categorical palette is legal with a
 * second channel behind it, and 14.2 means two of these are hard to separate
 * with full colour vision. Red against green is also the pair Magic asks about
 * most often.
 *
 * The palette cannot move, so the other end has to: WUBRG is never the only
 * channel. The second one is already in the app and is better than a hatch or a
 * texture would be -- the mana pip. Magic solved this itself, with symbols,
 * decades ago, and every reader of this app can already read one.
 *
 * Structural rather than advisory: there is no way to get the fill out of here
 * without the pip coming with it, so a future chart cannot quietly reintroduce
 * the defect by painting `ringFor` on a rectangle.
 */
export interface ManaMark {
  /** The ring `cardFrame` paints this colour's cards with. */
  fill: string;
  /** The second channel. Near-black, because every ring is light enough. */
  letter: string;
  ink: string;
  /** The smallest box the letter is legible in. Below it, lean on the legend. */
  fits: (width: number, height: number) => boolean;
}

/**
 * A Magic colour, as a fill AND the letter that goes on it. Never one without
 * the other, which is why this returns a pair rather than a colour.
 *
 * The renderer is the caller's business -- the mana curve is HTML because its
 * axis is a mana-font icon row that has to line up with the columns, and the
 * braid is SVG because it is a rope. What must not vary between them is this
 * rule, so it lives here and both of them ask for it.
 */
export function manaMark(color: string): ManaMark {
  return {
    fill: ringFor(color),
    letter: color === "colorless" ? "C" : color,
    // Near-black on every ring: all five are light enough to carry it, which is
    // the same fact `cardFrame` already leans on for its plates.
    ink: "#0d0b06",
    fits: (width, height) => height >= 13 && width >= 11,
  };
}

/** The SVG form. `manaMark` is the rule; this is one way of drawing it. */
export function ManaBand({
  color,
  x,
  y,
  width,
  height,
}: {
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const mark = manaMark(color);

  return (
    <Group>
      <rect x={x} y={y} width={width} height={height} fill={mark.fill} />
      {mark.fits(width, height) && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(11, height - 4)}
          fontWeight={700}
          fill={mark.ink}
          aria-hidden
        >
          {mark.letter}
        </text>
      )}
    </Group>
  );
}

/**
 * The gap between two fills that touch.
 *
 * Two segments of a stack with no seam read as one segment of a colour neither
 * of them is. Two pixels of the surface is enough to separate them and small
 * enough not to be read as a value of its own -- and it is drawn as a stroke in
 * the surface colour rather than taken out of the geometry, so the segments
 * still sum to the bar.
 */
export const SEAM = { stroke: "var(--color-base-100)", strokeWidth: 2 } as const;

/**
 * A rule the marks are measured from: a zero, a baseline, a threshold.
 *
 * Always labelled. An unlabelled reference line gets read as zero even when it
 * is a 50% win rate or a significance bar, and the reader has no way to find
 * out they are wrong.
 */
export function Baseline({
  x1,
  x2,
  y,
  label,
  ink = INK.zero,
}: {
  x1: number;
  x2: number;
  y: number;
  label?: ReactNode;
  ink?: string;
}) {
  return (
    <Group>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={ink} strokeWidth={MARK.axis} />
      {label != null && (
        <text x={x1} y={y - 4} fontSize={10} fill={NEUTRAL.quiet} fontFamily="inherit">
          {label}
        </text>
      )}
    </Group>
  );
}

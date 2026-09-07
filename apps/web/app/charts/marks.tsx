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

export interface ManaMark {
  /** The ring `cardFrame` paints this colour's cards with. Flat, or a gradient. */
  fill: string;
  /** The second channel, as a cost string: "UB" -> "{U}{B}". Draw with ManaCost. */
  pips: string;
  /** The shortest box the pips stay legible in. Below it, lean on the legend. */
  fits: (width: number, height: number) => boolean;
}

/**
 * A Magic colour as a fill AND the pips that go on it. Never one without the
 * other, which is why this returns a pair rather than a colour.
 *
 * WHY THERE HAS TO BE A SECOND CHANNEL. `cardFrame`'s rings are sampled from
 * Arena and are not ours to re-pick -- a drafter expects red to be red. Put
 * through a colour-vision check against this app's near-black surface they come
 * back badly:
 *
 *     green #4e8a55 <-> red #c25a3e         dE 4.8   deuteranopia
 *     colourless #8c98a2 <-> green #4e8a55  dE 14.2  NORMAL vision
 *
 * 4.8 is below even the floor at which a categorical palette is legal with a
 * second channel behind it, and red against green is the pair this game asks
 * about most.
 *
 * WHY PIPS AND NOT A LETTER. A letter was the first answer here and it was
 * wrong twice. It is a mark that appears nowhere else in Magic -- `ColorPips`
 * has argued since it was written that the pip is how the game itself writes a
 * colour, is on every card in the pack, and needs no key where "WU" has to be
 * decoded. And a gold card has no single letter, so exactly the marks whose
 * ring is a GRADIENT, the ones a reader can least infer, would have got
 * nothing. Pips have neither problem: a two-colour mark prints both.
 *
 * Returned as a cost string rather than a rendered node so the caller draws it
 * with `ManaCost`, which is the app's one mana-font renderer -- a second one
 * would drift the day a hybrid or snow symbol turns up.
 */
export function manaMark(colors: string): ManaMark {
  return {
    fill: colors.length === 1 ? ringFor(colors) : ringFor("colorless"),
    pips: colors === "" ? "{C}" : [...colors].map((c) => `{${c}}`).join(""),
    fits: (width, height) => height >= 13 && width >= 11 * Math.max(1, colors.length),
  };
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
 * is a 50% win rate or a significance bar, and the reader has no way to find out
 * they are wrong.
 */
export function Baseline({
  x1,
  x2,
  y,
  label,
  labelAt = "start",
  ink = INK.zero,
}: {
  x1: number;
  x2: number;
  y: number;
  label?: ReactNode;
  /**
   * Which end of the rule the label hangs from.
   *
   * IT EXISTS BECAUSE A LABEL AT x1 IS NOT ALWAYS SOMEWHERE THERE IS ROOM. The
   * left end of a rule is where a low value's mark sits, so on a chart whose
   * first band is near the baseline the label and the dot land on each other --
   * and moving the RULE to dodge the label would move the thing being measured.
   * Anchoring the text at the other end instead costs nothing and moves nothing.
   *
   * `end` anchors the text itself, so it reads inward from x2 rather than
   * starting there and running off the drawing.
   */
  labelAt?: "start" | "end";
  ink?: string;
}) {
  const from = Math.min(x1, x2);
  const to = Math.max(x1, x2);
  return (
    <Group>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={ink} strokeWidth={MARK.axis} />
      {label != null && (
        <text
          x={labelAt === "end" ? to : from}
          y={y - 4}
          textAnchor={labelAt === "end" ? "end" : "start"}
          fontSize={10}
          fill={NEUTRAL.quiet}
          fontFamily="inherit"
        >
          {label}
        </text>
      )}
    </Group>
  );
}

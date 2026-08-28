"use client";

import { ParentSize } from "@visx/responsive";
import { AxisBottom, AxisLeft } from "@visx/axis";
import type { AxisScale } from "@visx/axis";
import type { ReactNode } from "react";
import { INK, NEUTRAL } from "./ink";

/**
 * The frame every SVG chart in this app is drawn in, and the two rules it
 * enforces that no chart library enforces for you.
 *
 * RULE ONE: A CHART THAT WILL NOT FIT SAYS SO INSTEAD OF SHRINKING. Three of
 * the graphics audited on 2026-08-28 were unreadable for the same reason and
 * none of them looked broken: the archetype quiz's deck bands need 352px of
 * non-shrinkable row and got 263px on a phone, so the track -- the part
 * carrying the entire explanation -- was squeezed to zero and the row hung 90px
 * off the panel. The glossary's win-rate axis hid its own scale below 640px and
 * became two rows of dots with no domain. The diff track drew 42 picks in 132px
 * and gave every one of them a 3px hit target.
 *
 * A chart squeezed past its minimum is not a smaller chart, it is a WRONG one,
 * and the failure is silent because the marks are still there. So `needs` is
 * mandatory: state the width below which this drawing stops being true, and
 * hand `instead` the thing to show there -- usually the same numbers as a list,
 * which is what a reader on a phone wanted anyway.
 *
 * RULE TWO: THE DOMAIN IS PART OF THE DRAWING. `label` is required and is the
 * chart in one sentence, including its units and both ends of its scale. It is
 * the accessible name, and writing it is the check on whether the chart has a
 * stated scale at all -- a label you cannot finish is a chart with no axis.
 *
 * WHAT THIS IS NOT. It does not own the marks, pick the scale, or decide the
 * shape. visx supplies `scaleLinear`, the axis renderers and the tick maths;
 * this supplies the frame and the two rules. Everything between the margins is
 * the chart's own business, which is what keeps the braid and the mana curve
 * possible -- see the visx commit for why that mattered more than components.
 */

export interface PlotBox {
  /** Width inside the margins. Never below `needs` minus the margins. */
  width: number;
  /** Height inside the margins. */
  height: number;
}

export interface PlotProps {
  /** Total height in px, margins included. Charts here are fixed-height. */
  height: number;
  /**
   * The narrowest total width at which this drawing is still true. Below it,
   * `instead` renders and the SVG does not.
   */
  needs: number;
  /** What a reader gets below `needs`. Usually the same values as text. */
  instead: ReactNode;
  /**
   * The whole chart in one sentence, units and both ends of the scale included.
   * Becomes the accessible name.
   */
  label: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  children: (box: PlotBox) => ReactNode;
  className?: string;
}

const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };

export function Plot({
  height,
  needs,
  instead,
  label,
  margin,
  children,
  className,
}: PlotProps) {
  const m = { ...NO_MARGIN, ...margin };

  return (
    <ParentSize
      className={className}
      // The chart is a fixed height and only ever asks about width, so there is
      // nothing for a height observer to do but fire during layout.
      parentSizeStyles={{ width: "100%", height }}
    >
      {({ width }) => {
        // ParentSize reports 0 on the first frame, before the observer has
        // measured. Drawing the fallback there would flash the phone version at
        // everyone; drawing nothing holds the space the chart is about to take.
        if (width === 0) return null;
        if (width < needs) return instead;

        const box = {
          width: Math.max(0, width - m.left - m.right),
          height: Math.max(0, height - m.top - m.bottom),
        };

        return (
          <svg width={width} height={height} role="img" aria-label={label}>
            <g transform={`translate(${m.left}, ${m.top})`}>{children(box)}</g>
          </svg>
        );
      }}
    </ParentSize>
  );
}

/**
 * The app's one label style, as SVG text props.
 *
 * Matches the `eyebrow` utility in globals.css, which is what every other small
 * label on these screens is set in -- an axis that invented its own type scale
 * would be the only thing on the page not speaking the app's voice. `em` rather
 * than px so a tick label rides the surrounding text size.
 */
export const TICK_TEXT = {
  fill: NEUTRAL.quiet,
  fontSize: 10,
  fontFamily: "inherit",
  letterSpacing: "0.02em",
} as const;

const AXIS_SHARED = {
  stroke: INK.rule,
  tickStroke: INK.rule,
  strokeWidth: 1,
} as const;

/**
 * A horizontal scale, drawn.
 *
 * Thin on purpose: it exists so that every axis in the app has the same tick
 * type, the same rule colour and the same 10px labels, and so that adding one
 * is cheap enough that a chart without an axis is a decision rather than an
 * omission. `numTicks` is approximate by d3's design -- it picks round numbers
 * near the count you ask for, which is the behaviour you want and the reason
 * hand-rolled axes in this app ended up with ticks at 0.47 and 0.72.
 */
export function ValueAxisBottom({
  scale,
  top,
  numTicks = 4,
  format,
}: {
  scale: AxisScale;
  top: number;
  numTicks?: number;
  format?: (v: number) => string;
}) {
  return (
    <AxisBottom
      {...AXIS_SHARED}
      scale={scale}
      top={top}
      numTicks={numTicks}
      tickFormat={format ? (v) => format(Number(v)) : undefined}
      tickLabelProps={() => ({ ...TICK_TEXT, textAnchor: "middle", dy: "0.25em" })}
    />
  );
}

/** The vertical twin. Same rules, same ink. */
export function ValueAxisLeft({
  scale,
  numTicks = 4,
  format,
}: {
  scale: AxisScale;
  numTicks?: number;
  format?: (v: number) => string;
}) {
  return (
    <AxisLeft
      {...AXIS_SHARED}
      scale={scale}
      numTicks={numTicks}
      tickFormat={format ? (v) => format(Number(v)) : undefined}
      tickLabelProps={() => ({ ...TICK_TEXT, textAnchor: "end", dx: "-0.25em", dy: "0.25em" })}
    />
  );
}

/**
 * The line a chart's values are claims ABOUT: a zero, a baseline, a threshold.
 *
 * Labelled, always. An unlabelled reference line is a mark the reader has to
 * guess the meaning of, and the guess is usually "zero" even when it is a 50%
 * win rate or a significance bar. `at` is in pixels, already through the scale,
 * because a reference line is drawn in the same space as the marks it explains.
 */
export function Reference({
  at,
  height,
  label,
  ink = INK.zero,
  dashed = false,
}: {
  at: number;
  height: number;
  label?: string;
  ink?: string;
  dashed?: boolean;
}) {
  return (
    <g>
      <line
        x1={at}
        x2={at}
        y1={0}
        y2={height}
        stroke={ink}
        strokeWidth={1}
        strokeDasharray={dashed ? "3 3" : undefined}
      />
      {label && (
        <text x={at} y={height + 12} textAnchor="middle" {...TICK_TEXT}>
          {label}
        </text>
      )}
    </g>
  );
}

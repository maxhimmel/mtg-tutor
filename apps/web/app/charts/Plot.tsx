"use client";

import { useParentSize } from "@visx/responsive";
import { Key, type KeyEntry } from "./Key";
import { type Guide, given } from "./guides";
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
  /**
   * What the colours and shapes mean, or why this chart does not need saying.
   *
   * REQUIRED, and that is the point. The audit found keys on the two charts
   * that needed them least and none on the one place hue was genuinely
   * load-bearing, which is what a convention gets you. A required field turns
   * "did anybody think about the legend" from something you have to go and
   * check into something the compiler asks.
   *
   * `{ none: "..." }` is the same one line as `false` would have been and keeps
   * the argument -- `WinRateAxis` had already written its reason into a comment
   * where nothing could reach it.
   */
  legend: Guide<KeyEntry[]>;
  /**
   * What the reader gets at the cursor. `Plot` renders the node; the caller
   * wires `tip.follow(...)` onto whatever should answer.
   *
   * Required for the same reason as `legend`, and the honest "off" is common
   * here: a chart that labels every value in place has nothing a hover could
   * add, and should say so.
   */
  tip: Guide<ReactNode>;
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
  legend,
  tip,
  margin,
  children,
  className,
}: PlotProps) {
  const key = given(legend);
  const tipNode = given(tip);
  const m = { ...NO_MARGIN, ...margin };

  // `useParentSize` rather than the `ParentSize` COMPONENT, and the difference
  // is the whole reason the fallback works.
  //
  // ParentSize renders its children inside an `position:absolute; inset:0;
  // overflow:hidden` box sized to the height you gave it -- which is right for
  // an SVG of that exact height and silently wrong for anything else. A
  // fifteen-row fallback list handed to it is CLIPPED to the chart's height with
  // no scrollbar and no sign, which is precisely the class of failure `needs`
  // exists to stop: the reader sees something that looks finished and is not.
  // Measuring with the hook leaves the box ours, so the fallback sizes itself.
  const { parentRef, width } = useParentSize({ debounceTime: 0 });
  const fits = width >= needs;

  return (
    <div ref={parentRef} className={className} style={{ width: "100%" }}>
      {/* Width is 0 until the observer has measured. Drawing the fallback there
          would flash the narrow version at everyone on first paint, so the
          chart's own height is held empty for the one frame it takes. */}
      {width === 0 ? (
        <div style={{ height }} />
      ) : fits ? (
        <svg width={width} height={height} role="img" aria-label={label}>
          <g transform={`translate(${m.left}, ${m.top})`}>
            {children({
              width: Math.max(0, width - m.left - m.right),
              height: Math.max(0, height - m.top - m.bottom),
            })}
          </g>
        </svg>
      ) : (
        instead
      )}

      {/* Under the chart rather than over it, and drawn in both states: a
          reader who fell through to `instead` still needs to know what the
          words mean, and a key that disappears with the drawing takes the
          vocabulary with it. */}
      {key && key.length > 0 && <Key className="mt-2" entries={key} />}

      {/* Outside the `role="img"` element on purpose -- that subtree is one
          labelled picture, and a box that follows the pointer is not part of
          it. */}
      {tipNode}
    </div>
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
 * How much of a 10px tick label sits either side of its own anchor point.
 *
 * A tick within this of the end of the range has half its label hanging outside
 * the SVG, where the browser clips it without a word -- so the anchor turns
 * inward instead. See `edgeAnchor`.
 */
const HALF_TICK_LABEL = 10;

/**
 * Which way a tick label reads, so that a tick ON the end of the scale is still
 * on the page.
 *
 * AN AXIS THAT CANNOT PRINT ITS OWN ENDS IS THE FAILURE THIS APP KEEPS HAVING.
 * `midpoint` centres every label on its tick, which is right in the middle of a
 * chart and quietly wrong at the edges: the outermost tick is at x=0 or x=width,
 * so half its digits are outside the viewport and the outermost SVG clips them.
 * The reader is left with "−" and "8" cut in half, or nothing.
 *
 * That matters more than it sounds, because the house rule is SAY THE DOMAIN --
 * both ends of the scale, in the drawing -- and the only tick that can say an
 * end is the one sitting on it. An axis that has to keep its ticks away from the
 * edge to stay legible is an axis that structurally cannot state its own range.
 *
 * So it turns inward: the first tick reads left-to-right from the end, the last
 * reads right-to-left into it, everything between stays centred. Applied by
 * PIXEL POSITION rather than by index, so a chart whose ticks all land well
 * inside is unaffected and nothing that looks right today moves.
 */
function edgeAnchor(x: number, from: number, to: number): "start" | "middle" | "end" {
  if (x <= from + HALF_TICK_LABEL) return "start";
  if (x >= to - HALF_TICK_LABEL) return "end";
  return "middle";
}

/**
 * A horizontal scale, drawn.
 *
 * Thin on purpose: it exists so that every axis in the app has the same tick
 * type, the same rule colour and the same 10px labels, and so that adding one
 * is cheap enough that a chart without an axis is a decision rather than an
 * omission. `numTicks` is approximate by d3's design -- it picks round numbers
 * near the count you ask for, which is the behaviour you want and the reason
 * hand-rolled axes in this app ended up with ticks at 0.47 and 0.72.
 *
 * `values` IS THE ESCAPE HATCH FOR WHEN ROUND NUMBERS ARE THE WRONG ONES, and
 * the score breakdown is the case that earned it. Its track runs to ±8pp;
 * `d3.ticks(-8, 8, 5)` returns −5, 0, 5 and asking for one more returns nine
 * ticks at every even number. So the axis under an eight-point track said FIVE,
 * and a reader measuring a bar against the last label it could see read every
 * magnitude on the panel about 60% too large. d3 is right that round numbers
 * are usually better; it has no way to know that here the ends of the domain
 * ARE the fact being stated.
 */
export function ValueAxisBottom({
  scale,
  top,
  numTicks = 4,
  values,
  format,
}: {
  scale: AxisScale;
  top: number;
  numTicks?: number;
  /** Exact ticks, where the ends of the domain are the point. */
  values?: number[];
  format?: (v: number) => string;
}) {
  const range = scale.range();
  const from = Number(range[0]);
  const to = Number(range[range.length - 1]);
  const at = scale as (v: unknown) => number | undefined;

  return (
    <AxisBottom
      {...AXIS_SHARED}
      scale={scale}
      top={top}
      numTicks={numTicks}
      tickValues={values}
      tickFormat={format ? (v) => format(Number(v)) : undefined}
      tickLabelProps={(v) => ({
        ...TICK_TEXT,
        textAnchor: edgeAnchor(Number(at(v)), from, to),
        dy: "0.25em",
      })}
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
  // `ReactNode`, matching `Baseline` in marks.tsx. A reference line's label is
  // often two families at once -- CardStats names its baseline with the Mana
  // font's rarity glyph and then a word -- which an SVG says as two tspans and a
  // string cannot hold at all.
  label?: ReactNode;
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

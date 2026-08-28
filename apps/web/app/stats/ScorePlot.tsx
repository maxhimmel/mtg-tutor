"use client";

import Link from "next/link";
import { scaleBand, scaleLinear } from "@visx/scale";
import { gradeFor } from "@mtg-tutor/core";
import { Plot } from "../charts/Plot";
import { INK, MARK, NEUTRAL } from "../charts/ink";
import { SetIcon } from "../components/SetIcon";
import { gradeColor } from "../lib/format";
import { scoreAxis } from "./plot";

// The one plot this page has, drawn three times.
//
// It is one component rather than three because the three questions -- how you
// have gone lately, which pack you are worst in, how deep into a pack you start
// slipping -- are the same quantity cut three ways, and a page that drew them at
// three scales would be asking the reader to re-learn the axis at every panel.
// Same axis rule, same colours, same shape: read it once, then only read the
// columns. That is the glossary's figure rule applied to live numbers.
//
// A DOT ON A STEM, NOT A BAR, and that follows from the axis rather than from
// taste. `plot.ts` argues the case for standing the plot on a grade threshold
// instead of on zero; the cost of doing that is that LENGTH stops meaning
// anything. A column twice as tall as its neighbour is not twice the score, it
// is a few points of a hundred, and a filled bar invites exactly that reading
// because a bar is a quantity measured from its own base. A dot is a POSITION on
// a stated scale and carries no base at all, so it can be read off a truncated
// axis without lying. The stem is a hairline back to the floor -- a connector so
// the eye can find which column a dot belongs to, deliberately too thin to be
// mistaken for the mark.
//
// The colours are the grade scale and nothing else. There is no second series
// anywhere on this page, which is deliberate rather than a gap: gold in this app
// means the card you are holding or the choice you made, and a column of
// averages is neither.

export interface ScoreColumn {
  key: string;
  /** Drawn under the column. A pick number, a pack number, a set code. */
  label: string;
  /** Drawn instead of the label where the set has a symbol of its own. */
  iconUri?: string;
  score: number;
  /**
   * How many picks the average was taken over. Omitted where every column is
   * the same size by construction -- a run of finished drafts is forty-five
   * picks each, and printing that under all ten would be noise.
   */
  n?: number;
  /** Makes the column a place to go. Omitted, the plot is a picture. */
  href?: string;
  /** The column said in full, for a screen reader and for a hover. */
  title: string;
}

// Tall enough for a point of score to be visible across a zoomed axis, short
// enough that two of these sit side by side without owning the page.
const AXIS_H = 136;

// Room for the gutter's three digits on the left, and for a grade letter at the
// right end of each threshold line.
const MARGIN = { top: 6, right: 14, bottom: 0, left: 30 };

// The three rows under the axis: what the column is, what it scored, and how
// many picks that came from.
const LABEL_ROW = 14;
const VALUE_ROW = 12;
const COUNT_ROW = 12;

/**
 * The narrowest a column can be and still have its own number under it.
 *
 * MEASURED, not guessed, off the font this app actually ships: Archivo's
 * tabular figures advance 568/1000 em and its period 277, so "88.4" at 10px
 * with the 0.02em tracking these labels carry is 20.6px. Two of them need
 * roughly three more pixels of air or "88.4 91.0" reads as one number.
 *
 * It is the value labels rather than the dots that set this -- fifteen dots fit
 * a phone's width comfortably and fifteen labels smear -- and the one string
 * this does not cover is a perfect "100.0" at 26.3px, which needs a second
 * perfect average in the next column to collide with anything.
 */
const PER_COLUMN = 24;

/**
 * The floor under that, whatever the column count.
 *
 * A plot narrower than it is tall turns a two-point drift into a cliff -- the
 * same distortion the zoomed axis was already accused of, arriving through the
 * other dimension.
 */
const MIN_WIDTH = AXIS_H + MARGIN.left + MARGIN.right;

const TEXT = { fontFamily: "inherit", letterSpacing: "0.02em" } as const;

export function ScorePlot({
  columns,
  label,
  counting,
}: {
  columns: ScoreColumn[];
  /** The whole plot in one sentence, for anyone who cannot see it. */
  label: string;
  /** The noun the counts are in. Required where the columns carry an `n`. */
  counting?: string;
}) {
  const axis = scoreAxis(columns.map((c) => c.score));
  const counted = columns.some((c) => c.n != null);
  const bottom = LABEL_ROW + VALUE_ROW + (counted ? COUNT_ROW : 0);
  const margin = { ...MARGIN, bottom };

  return (
    <Plot
      height={MARGIN.top + AXIS_H + bottom}
      needs={Math.max(MIN_WIDTH, MARGIN.left + MARGIN.right + columns.length * PER_COLUMN)}
      instead={<ScoreTable columns={columns} label={label} counting={counting} />}
      label={label}
      margin={margin}
    >
      {({ width, height }) => {
        const y = scaleLinear<number>({ domain: [axis.floor, 100], range: [height, 0] });
        const x = scaleBand<string>({
          domain: columns.map((c) => c.key),
          range: [0, width],
          // No gutter between columns: the band is a hit target as well as a
          // slot, and a dot needs no clearance from its neighbour the way a bar
          // does.
          paddingInner: 0,
        });
        const band = x.bandwidth();

        return (
          <>
            {/* The grade thresholds, which are the only gridlines worth drawing
                here: a reader already knows where B+ starts, and round numbers
                at 85 and 95 would be a second scale competing with the one the
                colours are painted from. */}
            {axis.bands.map((grade) => (
              <g key={grade.grade}>
                <line
                  x1={0}
                  x2={width}
                  y1={y(grade.floor)}
                  y2={y(grade.floor)}
                  stroke={INK.rule}
                  strokeWidth={MARK.axis}
                />
                <text
                  x={width + 3}
                  y={y(grade.floor)}
                  dy="0.32em"
                  fontSize={9}
                  fontWeight={600}
                  fill={`color-mix(in oklab, ${gradeColor(grade.grade)} 60%, transparent)`}
                  {...TEXT}
                >
                  {grade.grade}
                </text>
              </g>
            ))}

            {/* Both ends of the range, stated. The axis does not start at zero
                and a plot that does not say so is the one dishonest thing a
                chart of averages can be. */}
            <text x={-6} y={0} dy="0.75em" textAnchor="end" fontSize={10} fill={NEUTRAL.quiet} {...TEXT}>
              100
            </text>
            <text
              x={-6}
              y={height}
              dy="-0.1em"
              textAnchor="end"
              fontSize={10}
              fill={NEUTRAL.quiet}
              {...TEXT}
            >
              {axis.floor}
            </text>
            {counted && counting && (
              <text
                x={-6}
                y={height + LABEL_ROW + VALUE_ROW + 9}
                textAnchor="end"
                fontSize={9}
                fill={NEUTRAL.quiet}
                {...TEXT}
              >
                {counting}
              </text>
            )}

            {columns.map((column) => {
              const left = x(column.key) ?? 0;
              const marks = (
                <Column
                  column={column}
                  cx={left + band / 2}
                  cy={y(column.score)}
                  floor={height}
                  bottom={bottom}
                  left={left}
                  band={band}
                  top={MARGIN.top}
                />
              );

              return column.href ? (
                <Link
                  key={column.key}
                  href={column.href}
                  aria-label={column.title}
                  className="group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/70"
                >
                  <title>{column.title}</title>
                  {marks}
                </Link>
              ) : (
                <g key={column.key}>
                  <title>{column.title}</title>
                  {marks}
                </g>
              );
            })}
          </>
        );
      }}
    </Plot>
  );
}

function Column({
  column,
  cx,
  cy,
  floor,
  bottom,
  left,
  band,
  top,
}: {
  column: ScoreColumn;
  cx: number;
  cy: number;
  /** The bottom of the axis, in the plot's own coordinates. */
  floor: number;
  bottom: number;
  left: number;
  band: number;
  top: number;
}) {
  const color = gradeColor(gradeFor(column.score));

  return (
    <>
      {/* The whole column, labels included, is the hit area. Drawn first so the
          marks paint over it, and hovered through the group rather than through
          itself -- a pointer sitting on the dot is not on the rectangle. */}
      <rect
        x={left}
        y={-top}
        width={band}
        height={floor + bottom + top}
        rx={3}
        className="fill-transparent transition-colors group-hover:fill-base-content/10"
      />

      <line
        x1={cx}
        x2={cx}
        y1={floor}
        y2={cy}
        stroke={INK.rule}
        strokeWidth={MARK.axis}
      />
      <circle cx={cx} cy={cy} r={MARK.dot / 2} fill={color} />

      {column.iconUri ? (
        // The set symbol is a mask over a coloured block rather than an image
        // -- Scryfall ships them as solid black -- so it cannot be an <image>
        // and comes through as the component that already knows that.
        <foreignObject x={cx - 7} y={floor + 2} width={14} height={14}>
          <span className="flex text-base-content/50">
            <SetIcon uri={column.iconUri} className="size-3.5" />
          </span>
        </foreignObject>
      ) : (
        <text
          x={cx}
          y={floor + 11}
          textAnchor="middle"
          fontSize={10}
          fill={NEUTRAL.quiet}
          {...TEXT}
        >
          {column.label}
        </text>
      )}

      {/* Under the column rather than beside the dot, which is where it wanted
          to go: a figure riding the mark is a second plot of the same number,
          and it also pushes the dot off the axis it is measured on. */}
      <text
        x={cx}
        y={floor + LABEL_ROW + 9}
        textAnchor="middle"
        fontSize={10}
        fill={NEUTRAL.plain}
        style={{ fontVariantNumeric: "tabular-nums" }}
        {...TEXT}
      >
        {column.score.toFixed(1)}
      </text>

      {/* THE SAMPLE SIZE IS PRINTED, not drawn, and the house rules leave no
          other option: sizing the dot by n encodes with area and dimming a
          low-n column encodes with opacity, and both are ruled out for exactly
          the reason they are tempting -- they read as a second measurement of
          the score. A number under the column is the only channel left that
          says "believe this one less" without saying "this one scored less".
          Unseparated, because "1204" is four characters where "1,204" is five,
          and the column is twenty-four pixels wide. */}
      {column.n != null && (
        <text
          x={cx}
          y={floor + LABEL_ROW + VALUE_ROW + 9}
          textAnchor="middle"
          fontSize={9}
          fill={NEUTRAL.quiet}
          style={{ fontVariantNumeric: "tabular-nums" }}
          {...TEXT}
        >
          {column.n}
        </text>
      )}
    </>
  );
}

/**
 * The same numbers as a table, for a screen too narrow to give each column its
 * own label.
 *
 * Not a smaller chart. Fifteen pick numbers in a phone's width is fifteen value
 * labels overlapping, and the reader who opened this on a phone wanted the
 * numbers anyway -- so they get them, with the grade the colour would have
 * carried spelled out and the sample size the dots could not carry printed in
 * full.
 *
 * ONE COLUMN, top to bottom, in the order the plot draws them. A two-column
 * layout fits in half the height and reads wrong: a row-major grid puts picks
 * 1, 3, 5 down the left and 2, 4, 6 down the right, so following the run
 * "deeper into the pack" -- the only reason to look at this panel -- means
 * zig-zagging. Height is free here; reading order is not.
 */
function ScoreTable({
  columns,
  label,
  counting,
}: {
  columns: ScoreColumn[];
  label: string;
  counting?: string;
}) {
  const counted = columns.some((c) => c.n != null);

  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="eyebrow text-base-content/45">
          <th scope="col" className="py-1 text-left font-semibold">
            <span className="sr-only">What</span>
          </th>
          <th scope="col" className="py-1 pl-3 text-right font-semibold">
            Score
          </th>
          <th scope="col" className="py-1 pl-3 text-right font-semibold">
            Grade
          </th>
          {counted && (
            <th scope="col" className="py-1 pl-3 text-right font-semibold">
              {counting ?? "n"}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {columns.map((column) => {
          const grade = gradeFor(column.score);
          return (
            <tr key={column.key} className="border-t border-base-300">
              <th scope="row" className="py-1 text-left font-normal text-base-content/70">
                {column.href ? (
                  <Link href={column.href} className="no-underline hover:underline">
                    {column.label}
                  </Link>
                ) : (
                  column.label
                )}
              </th>
              <td className="py-1 pl-3 text-right text-base-content/80">
                {column.score.toFixed(1)}
              </td>
              <td
                className="py-1 pl-3 text-right font-semibold"
                style={{ color: gradeColor(grade) }}
              >
                {grade}
              </td>
              {counted && (
                <td className="py-1 pl-3 text-right text-base-content/55">
                  {column.n?.toLocaleString() ?? "—"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

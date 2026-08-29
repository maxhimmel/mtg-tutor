"use client";

import Link from "next/link";
import { scaleBand, scaleLinear } from "@visx/scale";
import { gradeFor } from "@mtg-tutor/core";
import { Plot } from "../charts/Plot";
import type { KeyEntry } from "../charts/Key";
import { INK, MARK, NEUTRAL } from "../charts/ink";
import { ColorPips } from "../components/ColorPips";
import { useCursorTip } from "../components/CursorTip";
import { SetIcon } from "../components/SetIcon";
import { COLOR_NAMES, gradeColor } from "../lib/format";
import { scoreAxis, type GradeBand } from "./plot";

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
  /**
   * The deck's colours, as letters -- "WU". Drawn as PIPS, which is the only
   * way this app writes a colour: `ColorPips` has argued since it was written
   * that the pip is on every card in the pack and needs no key where "WU" has
   * to be decoded, and `manaMark` in the kit refuses to paint a Magic colour
   * without them because `cardFrame`'s green and red are 4.8 apart under
   * deuteranopia.
   *
   * Takes the same row as `n`, and never collides with it: a column is either a
   * draft you took, which has colours and a fixed forty-five picks, or an
   * average over picks, which has a count and no colours.
   */
  pips?: string;
  /** Makes the column a place to go. Omitted, the plot is a picture. */
  href?: string;
  /** The column said in full, for a screen reader. Words, never symbols. */
  title: string;
  /**
   * The same sentence for the POINTER, where the game's symbols can be drawn.
   *
   * Two fields because the two surfaces cannot carry the same notation. `title`
   * is the accessible name, and a row of pips read aloud is nothing; the cursor
   * tip is explicitly not an accessible name and is read by somebody pointing
   * at a column whose colours are already drawn under it in pips. Falls back to
   * `title` where a column has no colours to say -- a pick number has none.
   */
  said?: string;
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
 * One mana pip's box in the third row, at the 10px the pips are drawn at.
 *
 * A column carrying colours is wider than one carrying a count, and it has to
 * be: a three-colour deck prints three pips and `committedColors` is never
 * capped, so a splash makes the column wider rather than dropping a colour off
 * the end. Below the width that holds them all, `needs` sends the reader to the
 * table, where the colours are named in words.
 */
const PIP_W = 11;

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
  const piped = columns.some((c) => c.pips);
  const bottom = LABEL_ROW + VALUE_ROW + (counted || piped ? COUNT_ROW : 0);
  const margin = { ...MARGIN, bottom };
  const tip = useCursorTip();

  // The widest thing a column has to hold under it. Usually the value label,
  // which is what `PER_COLUMN` was measured on; a plot of drafts instead has to
  // hold a deck's pips, and a three-colour deck needs more room than "88.4".
  const widestPips = Math.max(0, ...columns.map((c) => c.pips?.length ?? 0));
  const perColumn = Math.max(PER_COLUMN, widestPips * PIP_W);

  return (
    <Plot
      height={MARGIN.top + AXIS_H + bottom}
      needs={Math.max(MIN_WIDTH, MARGIN.left + MARGIN.right + columns.length * perColumn)}
      instead={<ScoreTable columns={columns} label={label} counting={counting} />}
      label={label}
      legend={gradeKey(axis.grades, columns)}
      tip={tip.node}
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

              // The whole column answers, not just the dot: a reader pointing
              // halfway up a column is asking about that column, which is the
              // case `useCursorTip` exists for. It replaces an SVG `<title>`,
              // which was a hover that does not exist on a touch screen -- and
              // nothing accessible goes with it, because `Plot` already names
              // the whole picture with a sentence built from these same titles.
              const hover = tip.follow(() => say(column));

              // The group carries the hover in both cases, so the band lights
              // up and answers whether or not the column is also a link -- it
              // used to do neither on the two panels whose columns go nowhere.
              return (
                <g key={column.key} className="group" {...hover}>
                  {column.href ? (
                    <Link
                      href={column.href}
                      aria-label={column.title}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/70"
                    >
                      {marks}
                    </Link>
                  ) : (
                    marks
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </Plot>
  );
}

/**
 * The column at the cursor, said in full.
 *
 * The caller's own sentence with the grade added, rather than a second
 * description assembled here: `title` is what the plot's accessible name is
 * built from, so a hover that said something else would be the chart
 * disagreeing with itself. The grade is the one thing the sentence cannot
 * already carry, because it is what the COLOUR says and the caller does not
 * know which colour its score will land in.
 */
const say = (column: ScoreColumn) =>
  `${column.said ?? column.title} — grade ${gradeFor(column.score)}`;

/**
 * The grade bands, as the letters they are painted with.
 *
 * WHY THIS PLOT NEEDS A KEY AT ALL, given the letters are already printed at
 * the right end of every threshold line: the lines say where a grade STARTS and
 * the letters say which grade it is, and neither says how the run fell across
 * them. The count is what turns this from a thing you consult into a thing you
 * read -- `PickSplit` is the model, and it is the same argument `Key` makes for
 * `aside`. Ten drafts as "B+ x7, A x2, B x1" is a sentence about the run that
 * the dots make you count off the gridlines.
 *
 * Only the grades something landed in. Every threshold on the plot is drawn as
 * a line carrying its own letter, so an entry for a band with no column in it
 * would be a legend explaining a mark that is not there.
 */
function gradeKey(grades: GradeBand[], columns: ScoreColumn[]): KeyEntry[] {
  const landed = new Map<string, number>();
  for (const column of columns) {
    const grade = gradeFor(column.score);
    landed.set(grade, (landed.get(grade) ?? 0) + 1);
  }

  return grades
    .filter((band) => landed.has(band.grade))
    .map((band) => ({
      // The threshold rather than the letter, because the letter is the mark:
      // a key whose label repeated its own swatch would say one thing twice.
      // Each band runs from its own number to wherever the next entry above it
      // starts, which is why they are listed highest first.
      label: `from ${band.floor}`,
      ink: gradeColor(band.grade),
      aside: `×${landed.get(band.grade)}`,
      // The same letter, in the same colour, as the one at the end of that
      // grade's line on the plot -- so the key is a smaller copy of the thing
      // it explains rather than a chip in a colour that appears nowhere.
      swatch: (
        <span
          aria-hidden
          className="w-4 text-center font-display text-xs font-semibold leading-none"
          style={{ color: gradeColor(band.grade) }}
        >
          {band.grade}
        </span>
      ),
    }));
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

      {/* THE DECK'S COLOURS, IN THE GAME'S OWN NOTATION. The set symbol above
          says which pack this draft came out of and the score says how it went;
          what a player scanning their last ten drafts is actually looking for
          is which decks those were. It was in the hover text as "WU" and
          nowhere on the drawing, which is the one place this app is not allowed
          to write a colour as letters.

          A foreignObject for the same reason the set symbol is one: `ManaCost`
          is the app's only mana-font renderer and a second one would drift the
          day a hybrid turns up, so the pips come through the component rather
          than being redrawn as SVG here. */}
      {column.pips && (
        <foreignObject
          x={left}
          y={floor + LABEL_ROW + VALUE_ROW}
          width={band}
          height={COUNT_ROW}
        >
          <span className="flex items-center justify-center leading-none">
            <ColorPips
              colors={column.pips}
              label={[...column.pips].map((c) => COLOR_NAMES[c] ?? c).join(" ")}
              className="text-[10px]"
            />
          </span>
        </foreignObject>
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
  const piped = columns.some((c) => c.pips);

  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="eyebrow text-base-content/45">
          <th scope="col" className="py-1 text-left font-semibold">
            <span className="sr-only">What</span>
          </th>
          {piped && (
            <th scope="col" className="py-1 pl-3 text-left font-semibold">
              Colors
            </th>
          )}
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
              {/* Still pips here rather than "WU": the row is narrower than the
                  drawing, not less of a place to write a colour properly, and
                  `ColorPips` names them in words for a screen reader. */}
              {piped && (
                <td className="py-1 pl-3 text-left">
                  <ColorPips
                    colors={column.pips ?? ""}
                    label={[...(column.pips ?? "")].map((c) => COLOR_NAMES[c] ?? c).join(" ")}
                    className="text-[11px]"
                  />
                </td>
              )}
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

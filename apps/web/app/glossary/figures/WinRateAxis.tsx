"use client";

import type { ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";
import { Plot, TICK_TEXT, ValueAxisBottom } from "../../charts/Plot";
import { Dot } from "../../charts/marks";
import { INK, MARK, NEUTRAL } from "../../charts/ink";
import { FIG_LABEL, Figure, Term } from "./Figure";

// The page's opening figure and its thesis: three of the numbers a player is
// shown about a card are positions on ONE axis, and a fourth is the distance
// between two of them. Taught spatially, before any definition, because the
// relationship between them is the hard part -- not the words.
//
// A dumbbell rather than bars, because the subject is the GAP and not either
// endpoint: on a shared axis the connector's length IS the IWD, so the reader
// measures nothing. It also lets the punchline land visually -- the gold dots
// line up, the neutral ones do not.
//
// GP WR is a caliper tick across the connector rather than a third dot. It is a
// different KIND of quantity -- both halves of the split averaged back together,
// over a different denominator -- and it must not compete with the dumbbell it
// sits inside. The reader should notice it second, and notice that it can only
// ever land between the two ends, which is the entire case against it.
//
// The ends are not peer categories, one being a baseline and one a result, so
// the baseline is neutral and identity comes from position and a direct label
// rather than from hue. Every value is labelled, which is why there is no legend
// and no tooltip: there is nothing a hover could add. That argument now rides on
// the plots themselves rather than in this comment, where nothing could reach it
// -- see the `legend` and `tip` on `Track`.

interface Row {
  card: string;
  without: number;
  inDeck: number;
  drawn: number;
  iwd: string;
}

// Fixed numbers, not a query: this is an illustration that has to keep saying
// the same thing, and the live set document is re-ingested. Verified against
// packages/backend/data/tdm.TradDraft.json -- gndWr, deckWr, gihWr, iwd.
const ROWS: Row[] = [
  { card: "Dragonstorm Globe", without: 57.1, inDeck: 59.9, drawn: 62.4, iwd: "+5.3pp" },
  { card: "Frontline Rush", without: 62.1, inDeck: 62.1, drawn: 62.2, iwd: "+0.2pp" },
];

// The axis, held wide enough that neither dot touches an edge.
const MIN = 56;
const MAX = 64;

// Where a value sits on the axis as a fraction of it, which is what the
// responsive minimum below is derived from. The drawn scale is built per row
// from the measured width; this is the same domain with the pixels left out.
const frac = (v: number) => (v - MIN) / (MAX - MIN);

const iwdLabel = CARD_STAT_GLOSSARY.find((s) => s.id === "iih")?.label ?? "IIH";

// Three values can land on one x -- that is exactly what the second row does --
// so each gets a lane of its own rather than a collision rule. The lanes are
// assigned by meaning: the baseline above the line, the headline below it, and
// the mixture in a quiet third lane at the bottom. When all three coincide they
// stack into a tidy column, which reads correctly as "there is nothing here".
const AXIS_Y = 28;
const LANE_BASELINE = 10;
const LANE_HEADLINE = 48;
const LANE_MIXTURE = 64;
const TRACK_H = 76;

// The height of the shared axis under the rows: a rule with its numbers under
// it, and nothing else.
const RULER_H = 20;

// THE WIDEST LANE LABEL IS WHAT SETS THE MINIMUM, not the dots. "GP WR 62.1" is
// ten characters of Archivo tabular at 10px -- about 54px -- and it is CENTRED
// on its own value, so half of it hangs past the mark. The binding case is
// whichever drawn value sits closest to an end of the axis: below the width
// where half that label still fits beyond it, the label is cropped by the SVG
// and the figure prints a number with its digits missing.
const LANE_LABEL = 54;
const NEAREST_END = Math.min(
  ...ROWS.flatMap((row) => [row.without, row.inDeck, row.drawn])
    .map(frac)
    .flatMap((at) => [at, 1 - at]),
);

// Enough for half of an end tick label to hang off each end of the scale. Unlike
// a CSS box, an SVG clips at its own edge, so a "56%" centred on x=0 loses its
// left half rather than spilling harmlessly. Every track carries the same
// margin, or the rows and the ruler would be drawn to different widths.
const SIDE = 12;

const NEEDS = Math.ceil(LANE_LABEL / 2 / NEAREST_END) + SIDE * 2;

/** The shared scale, as `Track` hands it to whatever is being drawn on it. */
type Scale = ReturnType<typeof scaleLinear<number>>;

// Both spellings are written out, rather than one derived from the other,
// because Tailwind generates a class only when it finds that exact string in the
// source -- a `.replace("sm:", "")` produces a name no stylesheet contains.
const COLUMNS = "sm:grid-cols-[minmax(0,11rem)_1fr_4.5rem]";

// THE AXIS SURVIVES THE PHONE. It used to be `hidden sm:grid`, along with the
// two end labels, which left a narrow screen with two rows of dots, four bare
// numbers and no scale at all -- on the figure that IS the page's argument. The
// three columns are what cannot fit below 640px, not the axis, so the header and
// the ticks stack into one column there and keep every word: the card names go
// above their own plot, and the gutter cells the desktop layout needs collapse
// out rather than taking the labels with them.
//
// That reflow is CSS and stays CSS, which is why the plot column measures itself
// rather than being told a width: whatever the grid gives it at any breakpoint
// is the range the scale is built on, and `needs` only fires if that column ever
// gets narrower than the labels it has to hold.
const STACKED = `grid grid-cols-[1fr] gap-1 sm:gap-4 ${COLUMNS}`;
const GUTTER = "hidden sm:block";

// Thinner than the dots it joins, so the ends stay the marks and the span stays
// a relation between them. `MARK.band` is the width of a band UNDER a dot; this
// one runs between two.
const CONNECTOR = 3;

// The lane labels, in the kit's one small-label style with the tabular figures
// these need. `fontVariantNumeric` rather than a class, so the three lanes stay
// one object with the axis ticks below them.
const LANE = {
  ...TICK_TEXT,
  fontSize: 11,
  style: { fontVariantNumeric: "tabular-nums" as const },
} as const;

// The ring that keeps two marks apart where they almost coincide, which is the
// entire point of the second row. Painted in the figure's own surface, so it
// reads as a gap rather than as a third colour.
//
// Measured off the mark rather than assumed: visx sizes a glyph by AREA, so the
// kit's 8px dot is a circle of radius 4.5 and not 4. A ring drawn to a guessed
// radius comes out a pixel thin on one side.
const DOT_R = Math.sqrt((MARK.dot * MARK.dot) / Math.PI);
const RING = DOT_R + 2;

/**
 * One row's worth of the shared axis, or the shared axis itself.
 *
 * Every caller gets the same domain and the same minimum, so the rows and the
 * ruler underneath cannot disagree about where 62.1 is -- they are separate
 * `Plot`s only because they are separate cells of a grid that reflows.
 */
function Track({
  label,
  height,
  instead,
  children,
}: {
  label: string;
  height: number;
  instead: ReactNode;
  /** The shared scale, already fitted to whatever width the grid gave this cell. */
  children: (x: Scale) => ReactNode;
}) {
  return (
    <Plot
      height={height}
      needs={NEEDS}
      instead={instead}
      label={label}
      // The ends are not two series. One is a baseline and one is a result, and
      // a key would present them as a pair of categories -- which is the reading
      // the figure spends its whole coda arguing against. Identity comes from
      // position and from a label sitting on each value, and the two ends are
      // named in the header directly above the marks.
      legend={{
        none: "The two ends are named in the header over the marks, and neither is a series.",
      }}
      // Every value is labelled where it sits, in its own lane, including the
      // one that has no header of its own. There is nothing a hover could add.
      tip={{ none: "Every value is printed beside its own mark." }}
      margin={{ left: SIDE, right: SIDE }}
    >
      {({ width }) => children(scaleLinear<number>({ domain: [MIN, MAX], range: [0, width] }))}
    </Plot>
  );
}

function AxisRow({ row, index }: { row: Row; index: number }) {
  // Staggered so the two rows read as a comparison being made, not as two things
  // happening at once.
  const delay = `${index * 220}ms`;

  return (
    <div className={`${STACKED} sm:items-center`}>
      <div className="font-display text-base leading-tight text-base-content sm:text-right">
        {row.card}
      </div>

      <Track
        height={TRACK_H}
        label={`${row.card}: won ${row.without.toFixed(1)}% of games it was never drawn in, ${row.inDeck.toFixed(1)}% of every game it was in the deck, and ${row.drawn.toFixed(1)}% of games it reached hand — ${iwdLabel} ${row.iwd}. Scale ${MIN}% to ${MAX}%.`}
        instead={
          <p className="text-sm leading-relaxed text-base-content/70">
            <span className="tabular-nums">{row.without.toFixed(1)}%</span> without it,{" "}
            <span className="tabular-nums text-primary">{row.drawn.toFixed(1)}%</span> after
            drawing it — {iwdLabel} <span className="tabular-nums">{row.iwd}</span>. GP WR{" "}
            <span className="tabular-nums">{row.inDeck.toFixed(1)}%</span>.
          </p>
        }
      >
        {(x) => (
          <>
            {/* The hairline the marks sit on, so a near-zero gap still reads as
                a position on a scale rather than a stray dot. */}
            <line
              x1={0}
              x2={x(MAX)}
              y1={AXIS_Y}
              y2={AXIS_Y}
              stroke={INK.rule}
              strokeWidth={MARK.axis}
            />

            {/* A rect rather than a line, because `animate-gap` is a scaleX
                about the mark's own left edge and `transform-box: fill-box`
                needs a box with area to resolve that against. */}
            <rect
              x={x(row.without)}
              y={AXIS_Y - CONNECTOR / 2}
              width={Math.max(0, x(row.drawn) - x(row.without))}
              height={CONNECTOR}
              rx={CONNECTOR / 2}
              fill={INK.yours}
              className="motion-safe:animate-gap"
              style={{ transformBox: "fill-box", animationDelay: delay }}
            />

            {/* Drawn before the dots so they paint over it where all three
                coincide. */}
            <line
              x1={x(row.inDeck)}
              x2={x(row.inDeck)}
              y1={AXIS_Y - 8}
              y2={AXIS_Y + 8}
              stroke={NEUTRAL.plain}
              strokeWidth={1}
            />

            {/* Each mark on a disc of the figure's own surface, which keeps the
                two legible where they almost coincide -- which is the entire
                point of the second row. */}
            <circle
              cx={x(row.without)}
              cy={AXIS_Y}
              r={RING}
              fill="var(--color-base-200)"
            />
            <Dot cx={x(row.without)} cy={AXIS_Y} ink={INK.theirs} />
            <circle
              cx={x(row.drawn)}
              cy={AXIS_Y}
              r={RING}
              fill="var(--color-base-200)"
            />
            <g
              className="motion-safe:animate-verdict"
              style={{ animationDelay: `calc(${delay} + 380ms)` }}
            >
              <Dot cx={x(row.drawn)} cy={AXIS_Y} ink={INK.yours} />
            </g>

            <text x={x(row.without)} y={LANE_BASELINE} textAnchor="middle" {...LANE}>
              {row.without.toFixed(1)}
            </text>
            <text
              x={x(row.drawn)}
              y={LANE_HEADLINE}
              textAnchor="middle"
              {...LANE}
              fill={INK.yours}
              fontWeight={600}
            >
              {row.drawn.toFixed(1)}
            </text>
            {/* Self-labelling, because it is the only mark whose lane has no
                header of its own -- and naming it here is what stops the third
                number reading as a stray tick. */}
            <text
              x={x(row.inDeck)}
              y={LANE_MIXTURE}
              textAnchor="middle"
              {...TICK_TEXT}
              fontSize={9}
            >
              GP WR {row.inDeck.toFixed(1)}
            </text>
          </>
        )}
      </Track>

      <div className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums text-primary">
        <span className="sr-only">{iwdLabel}: </span>
        <span aria-hidden className={`sm:hidden ${FIG_LABEL} text-base-content/55`}>
          {iwdLabel}
        </span>
        {row.iwd}
      </div>
    </div>
  );
}


export function WinRateAxis() {
  return (
    <Figure
      headingLevel="h2"
      title="Two cards with the same win rate. Only one is doing the work."
      lede={
        <>
          Decks that drew{" "}
          <strong className="font-semibold text-base-content">Dragonstorm Globe</strong> won 62.4% of
          those games. Decks that drew{" "}
          <strong className="font-semibold text-base-content">Frontline Rush</strong> won 62.2%. By
          the headline number they are the same card.
        </>
      }
      coda={
        <>
          Now look at the games those same decks played{" "}
          <em className="not-italic text-primary">without</em> ever drawing the card. Globe&apos;s
          decks won 57.1%. Rush&apos;s won 62.1% — they were winning just as often with it stuck in
          the library. That gap is <Term id="iih" />, and it is the difference between a card that
          wins games and a card along for the ride. The tick between the two ends is{" "}
          <Term id="gpwr" />: every game the card was in the deck, drawn or not, which is the two
          halves averaged back together. It can only ever land between them, and it can never tell
          you which half it came from.
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:gap-3">
        <div className={STACKED}>
          <span className={GUTTER} />
          <div className={`flex justify-between ${FIG_LABEL}`}>
            <span className="text-base-content/55">Won without drawing it</span>
            <span className="text-primary/75">Won after drawing it</span>
          </div>
          {/* Named in the row itself below 640px, where it sits under its own
              value rather than over a column of them. */}
          <span className={`${GUTTER} ${FIG_LABEL} text-base-content/55`}>{iwdLabel}</span>
        </div>

        {ROWS.map((row, i) => (
          <AxisRow key={row.card} row={row} index={i} />
        ))}

        {/* The axis has to sit in the same three columns as the rows, or it
            measures the label gutter as well as the plot. */}
        <div className={STACKED}>
          <span className={GUTTER} />
          <Track
            height={RULER_H}
            label={`Win rate, ${MIN}% to ${MAX}%.`}
            instead={
              <p className={`${FIG_LABEL} text-base-content/55`}>
                Win rate, {MIN}% to {MAX}%
              </p>
            }
          >
            {/* d3 lands on 56, 58, 60, 62, 64 here. The hand-rolled version
                asked for 57, 59, 61, 63 to keep the end labels off the edges,
                which is what the plot's own margins are for -- and the kit
                exists so that no axis in this app picks its own numbers. */}
            {/* One pixel down, because a 1px rule centred on y=0 has half of
                itself outside the SVG and renders at half strength. */}
            {(x) => <ValueAxisBottom scale={x} top={1} format={(v) => `${v}%`} />}
          </Track>
          <span className={GUTTER} />
        </div>
      </div>
    </Figure>
  );
}

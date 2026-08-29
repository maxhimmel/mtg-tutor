"use client";

import { scaleLinear } from "@visx/scale";
import { SCORING, gradeFor } from "@mtg-tutor/core";
import { Plot, ValueAxisBottom } from "../../charts/Plot";
import { gradeColor } from "../../lib/format";
import { FIG_LABEL, Figure } from "./Figure";

// A score is one subtraction: how far your pick's win rate fell short of the
// best card in the pack. Everything after that -- the number out of a hundred,
// the letter -- is that one distance relabelled. So the figure puts the distance
// on the axis, in the percentage points a player already compares cards in, and
// lets the grades fall where they fall.
//
// Drawn that way round on purpose. A player arrives knowing they took the
// second-best card by about a point and wanting to know what that cost, so the
// thing they know goes on the axis and the thing they want is read off it.
//
// The bands come from gradeFor and SCORING, never from a copy of their numbers:
// a glossary that restated the scale would be a second place it is written down,
// and the two would disagree the first time a band moved. The eight thresholds
// themselves are not repeated here either -- the Grade entry directly below the
// figure lists them, and the figure's job is the SHAPE of the scale.
//
// This is the one figure allowed more than one hue, because the grade colours
// are already the app's own scale -- see gradeColor, and the theme note in
// globals.css that spaces them by hue for exactly this purpose. Teaching them in
// any other colours would be teaching a different vocabulary. They are held at a
// fifth strength so the page still reads as gold.

const K = SCORING.winRateGapK;
// scorePick computes score = 100 - gap * K with gap as a fraction, so this is
// the gap that produces a given score, in the percentage points cards are
// compared in.
const gapFor = (score: number) => ((100 - score) / K) * 100;

// Where the axis stops. A score bottoms out at 0 somewhere past thirteen points,
// but drawing that far would squeeze every band a player actually sees into the
// left third, so the F band runs off the end instead.
//
// AND THE RUNNING OFF IS DRAWN. Truncating here is the right call and it was the
// silent part that was wrong: the bar used to end in a tidy rounded corner, which
// reads as the scale finishing rather than as the scale giving up. So the F band
// now fades out into a gutter that prints where it really ends, and the ruler
// keeps its square right edge. A scale that stops short of its data has to say
// so somewhere a reader can see it.
const AXIS_MAX = 8;

// The lowest score in each grade, asked of gradeFor rather than transcribed.
const FLOORS = (() => {
  const out: { grade: string; floor: number }[] = [];
  for (let score = 100; score >= 0; score--) {
    const grade = gradeFor(score);
    const last = out[out.length - 1];
    if (last?.grade === grade) last.floor = score;
    else out.push({ grade, floor: score });
  }
  return out;
})();

const BANDS = FLOORS.map((band, i) => ({
  grade: band.grade,
  from: i === 0 ? 0 : gapFor(FLOORS[i - 1].floor),
  to: Math.min(gapFor(band.floor), AXIS_MAX),
  // Where the band actually ends, before the axis clips it. Only F differs, and
  // it differs by more than the whole rest of the ruler -- so this is what the
  // gutter prints and what the spoken form announces.
  end: gapFor(band.floor),
})).filter((band) => band.from < AXIS_MAX);

const LAST = BANDS[BANDS.length - 1];
const truncated = LAST.end > LAST.to;

// The rows, in the order they stack. The letters ride ABOVE the bar rather than
// inside it because A+ is a sliver -- which is the point of the drawing, and
// also why its letter will not fit in its own band.
const LETTER_ROW = 17;
const BAR_H = 28;
const TICK_ROW = 22;
const HEIGHT = LETTER_ROW + BAR_H + TICK_ROW;

// Enough for half a tick label to hang off each end of the scale. Unlike a CSS
// box, an SVG clips at its own edge, so a "0" centred on x=0 loses its left half
// rather than spilling harmlessly.
const SIDE = 7;

// A+ and A are the closest pair of letters on the ruler, and everything else
// follows from that: below the width where those two centres are a letter apart,
// the row of letters is a smear and the drawing stops being true. Derived rather
// than guessed, so it moves on its own the day a band moves.
const LETTER_W = 16;
const clamp = (v: number) => Math.min(Math.max(v, 0.025), 0.975);
const CENTRES = BANDS.map((band) => clamp((band.from + band.to) / 2 / AXIS_MAX));
const TIGHTEST = Math.min(...CENTRES.slice(1).map((at, i) => at - CENTRES[i]));
const NEEDS = Math.ceil(LETTER_W / TIGHTEST) + SIDE * 2;

// A mask id has to be unique on the page. This figure renders once, and the name
// says which drawing owns it if a second ever appears.
const FADE = "grade-ruler-truncation";

// Every band as a RANGE, because a list of lower edges is not a scale. The old
// label read "F: 4.0 percentage points behind" and left the listener to infer
// where it ended from where the next one started -- which for the last band is
// nowhere, since there is no next one. Both ends, and the truncation said out
// loud, since a listener cannot see the fade.
const spoken = [
  "Grade by how far behind the best card in the pack a pick lands, in percentage points.",
  truncated ? `The drawn axis stops at ${AXIS_MAX}; ${LAST.grade} runs on to ${LAST.end.toFixed(1)}.` : "",
  BANDS.map((band) => `${band.grade}: ${band.from.toFixed(1)} to ${band.end.toFixed(1)}`).join("; "),
]
  .filter(Boolean)
  .join(" ");

export function GradeRuler() {
  return (
    <Figure
      title="A grade is one subtraction, wearing a letter."
      lede={
        <>
          The axis is the only thing the app measures: the win-rate gap between the card you took
          and the highest-rated card in the pack. Take that card and the gap is zero. The bands are
          what a given gap is worth.
        </>
      }
      coda={
        <>
          Two percentage points behind the best card for your deck is a B+. Packs routinely hold
          four or five cards inside that range, which is why the top of the scale is crowded and why
          a B+ is a fine pick rather than a near miss. The card you are measured against is the one
          that suited your deck, not always the strongest in the pack — so staying in your colors
          is not rewarded with a bonus, it is simply what the comparison is made of.
        </>
      }
    >
      {/* A gutter to the right of the scale, outside it, so the number the axis
          cannot reach has somewhere to be printed and the F band has somewhere
          to dissolve into. Both rows share the first column, so the plot
          measures the ruler and not the ruler plus its footnote. */}
      <div className="grid grid-cols-[1fr_2.75rem]">
        <Plot
          height={HEIGHT}
          needs={NEEDS}
          instead={<BandList />}
          label={spoken}
          // The letters ARE the legend. Every band on this ruler carries its own
          // grade directly above it, in the same colour the band is painted, so
          // a key would be those eight letters printed a second time six
          // inches lower -- which is the defect the audit found on the two
          // charts that already had keys they did not need.
          legend={{
            none: "Each band is labelled with its own grade, in the colour it is painted.",
          }}
          // Nothing moves and nothing is hidden. The values are fixed teaching
          // numbers, every band's letter is drawn on it, both ends of the scale
          // are on the axis, and the one number the axis cannot reach is
          // printed in the gutter. There is no fact left for a hover to hold.
          tip={{
            none: "Every band is named where it sits and the truncated end prints its own number.",
          }}
          margin={{ left: SIDE, right: SIDE }}
        >
          {({ width }) => {
            const x = scaleLinear<number>({ domain: [0, AXIS_MAX], range: [0, width] });

            return (
              <>
                {/* The clipped band dissolves rather than stopping, so the eye
                    reads it as carrying on past the edge -- which it does, for
                    another five points. */}
                <defs>
                  <linearGradient
                    id={`${FADE}-ramp`}
                    gradientUnits="userSpaceOnUse"
                    x1={x(LAST.from)}
                    x2={x(LAST.to)}
                  >
                    <stop offset="40%" stopColor="#fff" />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                  <mask id={FADE}>
                    <rect
                      x={x(LAST.from)}
                      y={LETTER_ROW}
                      width={x(LAST.to) - x(LAST.from)}
                      height={BAR_H}
                      fill={`url(#${FADE}-ramp)`}
                    />
                  </mask>
                </defs>

                {BANDS.map((band) => (
                  <g key={band.grade}>
                    <rect
                      x={x(band.from)}
                      y={LETTER_ROW}
                      width={x(band.to) - x(band.from)}
                      height={BAR_H}
                      fill={`color-mix(in oklab, ${gradeColor(band.grade)} 22%, transparent)`}
                      mask={band === LAST && truncated ? `url(#${FADE})` : undefined}
                    />
                    {/* The seam between two bands. Same job as the 2px gap in
                        the kit's stacked marks: two fills that touch read as
                        one fill of a colour neither of them is. */}
                    {band !== LAST && (
                      <line
                        x1={x(band.to)}
                        x2={x(band.to)}
                        y1={LETTER_ROW}
                        y2={LETTER_ROW + BAR_H}
                        stroke="var(--color-base-200)"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                ))}

                {BANDS.map((band, i) => (
                  <text
                    key={band.grade}
                    x={CENTRES[i] * width}
                    y={LETTER_ROW - 5}
                    textAnchor="middle"
                    fontSize={14}
                    fill={gradeColor(band.grade)}
                    // A class rather than a `font-family` attribute: the
                    // display face is a CSS variable, and a presentation
                    // attribute does not resolve `var()`.
                    className="font-display font-semibold"
                  >
                    {band.grade}
                  </text>
                ))}

                {/* One tick per percentage point, which is the unit the reader
                    is being taught to think in. d3 lands exactly on the
                    integers for a nine-tick request over a span of eight. */}
                <ValueAxisBottom
                  scale={x}
                  top={LETTER_ROW + BAR_H}
                  numTicks={AXIS_MAX + 1}
                />
              </>
            );
          }}
        </Plot>

        {truncated ? (
          <div
            aria-hidden
            className="flex h-7 items-center pl-1.5 text-[0.625rem] leading-none tabular-nums text-base-content/55"
            style={{ marginTop: LETTER_ROW }}
          >
            …{LAST.end.toFixed(1)}
          </div>
        ) : (
          <span />
        )}

        <div className="col-start-1 mt-4 flex justify-between">
          <span className={`${FIG_LABEL} text-base-content/55`}>Took the best card</span>
          <span className={`${FIG_LABEL} text-base-content/45`}>Percentage points behind it</span>
        </div>
        <span />
      </div>
    </Figure>
  );
}

/**
 * The same scale as a list, for a screen too narrow to keep the letters apart.
 *
 * The figure's whole claim is that the top of the scale is crowded, so a ruler
 * whose first three letters have merged is not a smaller version of it -- it is
 * one that says the opposite. Both ends of every band, and the band that runs
 * off the axis stated in full, because there is no fade here to imply it.
 */
function BandList() {
  return (
    <dl className="grid grid-cols-[2.5rem_1fr] gap-x-3 text-sm tabular-nums">
      {BANDS.map((band) => (
        <div key={band.grade} className="contents">
          <dt
            className="border-t border-base-300 py-1 font-display font-semibold"
            style={{ color: gradeColor(band.grade) }}
          >
            {band.grade}
          </dt>
          <dd className="border-t border-base-300 py-1 text-base-content/70">
            {band.from.toFixed(1)} to {band.end.toFixed(1)} points behind
          </dd>
        </div>
      ))}
    </dl>
  );
}

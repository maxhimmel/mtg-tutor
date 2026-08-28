import { SCORING, gradeFor } from "@mtg-tutor/core";
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
const TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

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

const pos = (gap: number) => Math.round((gap / AXIS_MAX) * 1e4) / 100;

const FADE = "linear-gradient(to right, #000 40%, transparent)";

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

// A+ is a sliver -- which is the point, and also why its letter cannot sit
// inside its band. The letters ride above the bar instead, held off the ends so
// the first and last are not half outside the figure.
const clamp = (v: number) => Math.min(Math.max(v, 2.5), 97.5);

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
          to dissolve into. All three rows share the first column, so `pos` is a
          percentage of the ruler and not of the ruler plus its footnote. */}
      <div className="grid grid-cols-[1fr_2.75rem]">
        <div className="relative h-4">
          {BANDS.map((band) => (
            <span
              key={band.grade}
              className="absolute top-0 -translate-x-1/2 font-display text-sm font-semibold leading-none"
              style={{
                left: `${clamp(pos((band.from + band.to) / 2))}%`,
                color: gradeColor(band.grade),
              }}
            >
              {band.grade}
            </span>
          ))}
        </div>
        <span />

        <div
          role="img"
          aria-label={spoken}
          className={`mt-1.5 flex h-7 overflow-hidden ${truncated ? "rounded-l-field" : "rounded-field"}`}
        >
          {BANDS.map((band) => (
            <div
              key={band.grade}
              className="border-r border-base-200 last:border-r-0"
              style={{
                width: `${pos(band.to - band.from)}%`,
                backgroundColor: `color-mix(in oklab, ${gradeColor(band.grade)} 22%, transparent)`,
                // The clipped band dissolves rather than stopping, so the eye
                // reads it as carrying on past the edge -- which it does, for
                // another five points.
                ...(band === LAST && truncated
                  ? {
                      maskImage: FADE,
                      WebkitMaskImage: FADE,
                    }
                  : {}),
              }}
            />
          ))}
        </div>
        {truncated ? (
          <div
            aria-hidden
            className="mt-1.5 flex h-7 items-center pl-1.5 text-[0.625rem] leading-none tabular-nums text-base-content/55"
          >
            …{LAST.end.toFixed(1)}
          </div>
        ) : (
          <span />
        )}

        <div className="relative mt-1.5 h-4">
          <div className="absolute inset-x-0 top-0 h-px bg-base-content/10" />
          {TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute top-1.5 -translate-x-1/2 text-[0.625rem] tabular-nums text-base-content/55"
              style={{ left: `${pos(tick)}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
        <span />

        <div className="col-start-1 mt-5 flex justify-between">
          <span className={`${FIG_LABEL} text-base-content/55`}>Took the best card</span>
          <span className={`${FIG_LABEL} text-base-content/45`}>
            Percentage points behind it
          </span>
        </div>
        <span />
      </div>
    </Figure>
  );
}

"use client";

import { scaleLinear } from "@visx/scale";
import { DECK_SPEED } from "@mtg-tutor/core";
import { INK, MARK, NEUTRAL } from "./ink";
import { Plot, Reference, ValueAxisBottom } from "./Plot";

/**
 * Where one card sits on the axis it was measured on, with the band where the
 * data cannot tell it from flat.
 *
 * THE CLAIM THIS DRAWING MAKES is a comparison and not a quantity: this card's
 * games against the games of decks in the same colours. So flat is always on the
 * chart, labelled, and it is a `Reference` rather than a tick -- an unlabelled
 * rule here would be read as zero-the-number when it means "the same length as
 * its own colours", which is a different sentence.
 *
 * THE BAND IS THE VERDICT, NOT A DECORATION. It is `DECK_SPEED.width` error bars
 * either side of flat -- the same width `deckSpeedQuestions` calls the middle
 * answer with -- so a card whose dot sits inside the band IS a middle card and
 * the picture cannot disagree with the answer beside it. That is `DeckBands` in
 * the archetype quiz, doing the same job for the same reason.
 *
 * NO LEGEND, ON PURPOSE. Three marks about ONE number -- the estimate, its
 * interval, and the reference it is measured from -- are not three series. The
 * dot is direct-labelled with its own value; the band and the rule are named on
 * the axis. A legend here would be taller than the chart.
 *
 * AND NOTHING IS HIDDEN IN A HOVER. The format's own mean game length belongs
 * beside this chart and the caller prints it, because `title=` does not exist on
 * touch and a figure a reader needs is a figure that is drawn.
 *
 * NOTHING IS ENCODED IN HUE. The dot's position carries the answer, the interval
 * carries the precision, and the printed figure carries both again. The single
 * colour is `INK.yours` for the card under discussion, which is what gold means
 * everywhere else in this app.
 */
export function SpeedRuler({
  resid,
  se,
  height = 92,
}: {
  /** Turns longer (+) or shorter (−) than this card's own colours ran. */
  resid: number;
  /** One standard error on that. */
  se: number;
  height?: number;
}) {
  const half = DECK_SPEED.width * se;
  // The domain holds the card, its whole interval, and the decision band, and is
  // symmetric about flat so the two directions are never drawn at two scales.
  // A card at fifteen error bars would otherwise squash the band to nothing and
  // make every middle card look identical.
  const reach = Math.max(Math.abs(resid) + se, half) * 1.2;
  const domain: [number, number] = [-reach, reach];

  const turns = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

  return (
    <Plot
      height={height}
      // Below this the axis labels at both ends collide with the centre tick and
      // the drawing starts asserting a precision it is no longer drawing. The
      // numbers are the whole content, so the fallback is the same sentence.
      needs={260}
      instead={
        <p className="text-sm text-base-content/70">
          {turns(resid)} turns against other decks in its colours, ± {se.toFixed(2)}.
        </p>
      }
      label={`Game length against decks in the same colours, from ${turns(-reach)} to ${turns(reach)} turns. This card sits at ${turns(resid)}, give or take ${se.toFixed(2)}.`}
      legend={{
        none: "One number, three marks about it -- an estimate, its interval, and the flat it is measured from. Those are not three series, so a legend would name the same card three times and stand taller than the chart it explains.",
      }}
      tip={{
        none: "The one value position cannot give you is printed on the dot, and both ends of the scale are on the axis. There is nothing left for a cursor to add, and half the readers have no cursor.",
      }}
      margin={{ top: 20, right: 12, bottom: 26, left: 12 }}
    >
      {({ width, height: h }) => {
        const x = scaleLinear({ domain, range: [0, width] });
        const mid = h / 2;

        return (
          <>
            {/* The band where the answer is "neither", drawn under everything. */}
            <rect
              x={x(-half)}
              y={mid - MARK.band * 1.6}
              width={Math.max(0, x(half) - x(-half))}
              height={MARK.band * 3.2}
              fill={NEUTRAL.hollow}
              rx={2}
            />

            <ValueAxisBottom
              scale={x}
              top={h}
              values={[-reach, 0, reach]}
              format={turns}
            />

            <Reference at={x(0)} height={h} label="same as its colours" />

            {/* One standard error either side. Not the decision width: the band
                behind it already draws that, and two intervals of different
                widths on one row is a chart arguing with itself. */}
            <line
              x1={x(resid - se)}
              x2={x(resid + se)}
              y1={mid}
              y2={mid}
              stroke={INK.yours}
              strokeWidth={MARK.band}
              strokeLinecap="round"
              opacity={0.45}
            />
            <circle cx={x(resid)} cy={mid} r={MARK.dot / 2} fill={INK.yours} />

            {/* Direct-labelled, because the one value a reader cannot infer from
                position is the value itself. Kept clear of the axis ends. */}
            <text
              x={Math.min(Math.max(x(resid), 22), width - 22)}
              y={mid - MARK.dot - 6}
              textAnchor="middle"
              fill={INK.value}
              fontSize={12}
              fontWeight={600}
            >
              {turns(resid)}
            </text>

            <text x={0} y={-8} textAnchor="start" fill={INK.label} fontSize={11}>
              ends sooner
            </text>
            <text x={width} y={-8} textAnchor="end" fill={INK.label} fontSize={11}>
              runs longer
            </text>
          </>
        );
      }}
    </Plot>
  );
}

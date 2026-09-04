"use client";

import { scaleLinear } from "@visx/scale";
import { DECK_SPEED } from "@mtg-tutor/core";
import { useCursorTip } from "../components/CursorTip";
import { INK, MARK, NEUTRAL } from "./ink";
import { Plot, Reference, ValueAxisBottom } from "./Plot";

/**
 * Where one card sits on the axis it was measured on, with the band where the
 * data cannot tell it from flat.
 *
 * THE CLAIM THIS DRAWING MAKES is a comparison and not a quantity: this card's
 * games against the games of decks in the same colors. So flat is always on the
 * chart, labelled, and it is a `Reference` rather than a tick -- an unlabelled
 * rule here would be read as zero-the-number when it means "the same length as
 * its own colors", which is a different sentence.
 *
 * THE BAND IS THE VERDICT, NOT A DECORATION. It is `DECK_SPEED.width` error bars
 * either side of flat -- the same width `deckSpeedQuestions` calls the middle
 * answer with -- so a card whose dot sits inside the band IS a middle card and
 * the picture cannot disagree with the answer beside it. That is `DeckBands` in
 * the archetype quiz, doing the same job for the same reason.
 *
 * NO LEGEND, ON PURPOSE. Every mark here is about ONE number -- the estimate,
 * its interval, the region too small to matter, and the flat it is measured
 * from. Those are not series. Each is named where it is drawn: the dot carries
 * its own value, the band says "too close to call" beneath it, and the rule says
 * what flat means. A legend would be taller than the chart and would name the
 * same card four times.
 *
 * NOTHING NEEDED IS HIDDEN IN A HOVER, AND THERE IS STILL A HOVER. Those are not
 * the same rule and this chart shipped conflating them: the tip was switched off
 * with "there is nothing left for a cursor to add", which was simply false --
 * the games behind the number, the exact error bar and the band's width in turns
 * are none of them on the drawing, and on /dev there is no sentence beside it
 * either. Everything required to READ the chart is printed; the cursor carries
 * the longer form, which is what `useCursorTip` is for.
 *
 * NOTHING IS ENCODED IN HUE. The dot's position carries the answer, the interval
 * carries the precision, and the printed figure carries both again. The single
 * color is `INK.yours` for the card under discussion, which is what gold means
 * everywhere else in this app.
 */
export function SpeedRuler({
  resid,
  se,
  worthSaying,
  n,
  height = 104,
}: {
  /** Turns longer (+) or shorter (−) than this card's own colors ran. */
  resid: number;
  /** One standard error on that. */
  se: number;
  /**
   * How far from flat this SET calls worth saying, in turns. One number per set,
   * not per card -- see `DeckSpeedBank.worthSaying`.
   */
  worthSaying: number;
  /** Games behind the estimate. Absent on a specimen with no set behind it. */
  n?: number;
  height?: number;
}) {
  // The interval is drawn at the DECISION width rather than at one error bar, so
  // the reading every other chart in this app teaches -- does the span reach the
  // rule -- gives the right answer here. Drawn at one error bar it did not: a
  // card between one and two error bars out had a span clear of the rule and an
  // answer of "Neither", which is a picture contradicting the words beside it.
  const tip = useCursorTip();
  const half = DECK_SPEED.width * se;
  // The domain holds the card, its whole interval, and the decision band, and is
  // symmetric about flat so the two directions are never drawn at two scales.
  // A card at fifteen error bars would otherwise squash the band to nothing and
  // make every middle card look identical.
  const reach = Math.max(Math.abs(resid) + half, worthSaying, half) * 1.2;
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
          {turns(resid)} turns against other decks in its colors, ± {se.toFixed(2)}.
        </p>
      }
      label={`Game length against decks in the same colors, from ${turns(-reach)} to ${turns(reach)} turns. This card sits at ${turns(resid)}, give or take ${se.toFixed(2)}.`}
      legend={{
        none: "One number and four marks about it -- an estimate, its interval, the region too small to be worth saying, and the flat it is measured from. Not series. Each is labelled where it is drawn, so a legend would name the same card four times and stand taller than the chart.",
      }}
      tip={tip.node}
      margin={{ top: 20, right: 12, bottom: 40, left: 12 }}
    >
      {({ width, height: h }) => {
        const x = scaleLinear({ domain, range: [0, width] });
        const mid = h / 2;

        /**
         * What the pointer is nearest, and what that mark claims.
         *
         * Measured in pixels off the plot's own box rather than in turns, the
         * same shape `HabitTrack.describe` and `DeckBands` use: "am I on the
         * dot" is a question about the drawing, and the dot is eight pixels
         * whatever the scale.
         */
        const describe = (e: { clientX: number; currentTarget: Element }): string => {
          const box = e.currentTarget.getBoundingClientRect();
          const at = e.clientX - box.left;
          const under = x.invert((at / box.width) * width);
          const near = (v: number) => Math.abs(at - (x(v) / width) * box.width) < 10;

          if (near(resid)) {
            return (
              `${turns(resid)} turns against decks in the same colors` +
              (n ? `, over ${n.toLocaleString()} games.` : ".")
            );
          }
          if (near(0)) return "Decks in the same colors, which is what this is measured from.";
          if (Math.abs(under) <= worthSaying) {
            return `Inside ${worthSaying.toFixed(2)} turns of flat — too close for this set to call either way.`;
          }
          if (Math.abs(under - resid) <= half) {
            return `The slack ${n ? `${n.toLocaleString()} games` : "this sample"} leaves: ±${half.toFixed(2)} turns.`;
          }
          return `${turns(under)} turns, which is outside what this card's games can support.`;
        };

        return (
          <>

            {/* The region this set calls too small to be worth saying. One of
                the two things that make a card "Neither"; the other is the span
                below reaching the rule. Both are drawn, and both are named. */}
            <rect
              x={x(-worthSaying)}
              y={mid - MARK.band * 1.6}
              width={Math.max(0, x(worthSaying) - x(-worthSaying))}
              height={MARK.band * 3.2}
              fill={NEUTRAL.hollow}
              rx={2}
            />
            <text
              x={x(0)}
              y={mid + MARK.band * 1.6 + 12}
              textAnchor="middle"
              fill={INK.label}
              fontSize={11}
            >
              too close to call
            </text>

            <ValueAxisBottom
              scale={x}
              top={h}
              // No 0: the Reference below labels that point, and two labels on
              // one tick overlap by 2.5px at 1280 and say the same thing twice.
              values={[-reach, reach]}
              format={turns}
            />

            <Reference at={x(0)} height={h} label="same as its colors" />

            {/* The decision width, so "does the span reach the rule" answers the
                z test exactly. */}
            <line
              x1={x(resid - half)}
              x2={x(resid + half)}
              y1={mid}
              y2={mid}
              stroke={INK.yours}
              strokeWidth={MARK.band}
              strokeLinecap="round"
              opacity={0.45}
            />
            <circle cx={x(resid)} cy={mid} r={MARK.dot / 2} fill={INK.yours} />

            {/* Direct-labelled, and the ± is not decoration: the span was the one
                mark on this chart with no label at all, so a reader saw a gold
                bar under a dot and nothing said what its width meant. A value
                and its uncertainty are ONE figure, so they are one label rather
                than a second mark cluttering the track. */}
            <text
              x={Math.min(Math.max(x(resid), 40), width - 40)}
              y={mid - MARK.dot - 6}
              textAnchor="middle"
              fill={INK.value}
              fontSize={12}
              fontWeight={600}
            >
              {turns(resid)}
              <tspan fill={INK.label} fontWeight={400}>
                {" "}
                ± {half.toFixed(2)}
              </tspan>
            </text>

            <text x={0} y={-8} textAnchor="start" fill={INK.label} fontSize={11}>
              ends sooner
            </text>
            <text x={width} y={-8} textAnchor="end" fill={INK.label} fontSize={11}>
              runs longer
            </text>

            {/* THE HIT TARGET GOES LAST, WHICH IS THE WHOLE OF IT. SVG delivers
                a pointer event to the topmost painted element under it, so this
                rect drawn first — as it was — meant the band, the span and the
                dot each swallowed the pointer and none of them carries a
                handler. Hovering the three things a reader aims at did nothing
                at all. Last and `pointerEvents="all"`, so every pixel of the
                plot answers and the marks below stay purely visual. */}
            <rect
              x={0}
              y={0}
              width={width}
              height={h}
              fill="transparent"
              pointerEvents="all"
              {...tip.follow((e) => describe(e as { clientX: number; currentTarget: Element }))}
            />
          </>
        );
      }}
    </Plot>
  );
}

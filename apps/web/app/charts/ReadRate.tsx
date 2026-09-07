"use client";

import { scaleLinear } from "@visx/scale";
import type { ReadBin } from "@mtg-tutor/core";
import { useCursorTip } from "../components/CursorTip";
import { pct } from "../lib/format";
import { INK, MARK, NEUTRAL } from "./ink";
import { Baseline, Dot } from "./marks";
import { Plot, ValueAxisBottom, ValueAxisLeft } from "./Plot";

/**
 * How often a drill was read right, against how hard the question was.
 *
 * WHY THIS AXIS AND NOT A DATE. The obvious progress chart is accuracy over
 * time, and here it would be worse than nothing. Both drills rank their banks
 * clearest-first and deal forward, so the questions somebody meets get harder
 * the longer they play -- a raw percentage therefore FALLS as a player improves,
 * and a line of it going down would be the app telling somebody they were
 * getting worse at the thing they were getting better at. The confound is real
 * and it is not correctable by a caveat under the chart.
 *
 * Putting sharpness on the x-axis makes the confound the subject. At four error
 * bars everybody is right and the bar is not a compliment; below one there is
 * nothing to see and the answer is "the same" or "neither", which is the whole
 * lesson of both drills. The middle of the axis is where a read is worth
 * anything, and that is where a person should look to see themselves move.
 *
 * FIRST ANSWERS ONLY, decided in `readProgress` rather than here. The first time
 * a card is dealt is the only time memory of its reveal cannot be what answered
 * it.
 *
 * THE BAND IS A CONFIDENCE INTERVAL, WHICH RULING #26 SAYS TO BE CAREFUL ABOUT.
 * That ruling is about the archetype quiz's reveal, where a reader measures two
 * bands against a threshold and a 95% interval visibly disagrees with the
 * verdict printed underneath. Nothing is read off a threshold here: there is no
 * gate a band clears or fails, the only rule on the chart is chance, and what a
 * reader wants to know is how firmly one band's rate is pinned. So the
 * conventional interval is the right one -- Wilson rather than the normal
 * approximation, because these counts are small by construction and a band with
 * four answers in it is the ordinary case for weeks.
 *
 * ONE SERIES, SO NO LEGEND. A dot, its band and a rule are three claims about
 * one number rather than three series, and naming them in a key would cost four
 * lines under a chart this size. The count rides under each band instead, which
 * is what stops the pointer being load-bearing: a bin drawn from three answers
 * says "3" on the page.
 */

/** Chance, and it is one third in both drills -- each offers exactly three answers. */
const CHANCE = 1 / 3;

const AXIS_L = 34;
const AXIS_B = 34;
const TOP = 12;

/**
 * The narrowest width at which four bands and their counts still read.
 *
 * Below it the same numbers as a list, which is what a reader on a phone wanted
 * anyway -- and NOT a squeezed version of the drawing, because a chart squeezed
 * past its minimum is a wrong chart rather than a small one.
 */
const NEEDS = 300;

/** "0–1", "1–2", "2–3", "3+" -- the band a question's sharpness fell in. */
export const bandLabel = (bin: ReadBin): string =>
  bin.to == null ? `${bin.from}+` : `${bin.from}–${bin.to}`;

export function ReadRate({
  bins,
  height = 190,
}: {
  bins: ReadBin[];
  /** Fixed, like every chart here. */
  height?: number;
}) {
  const tip = useCursorTip();
  const filled = bins.filter((b) => b.answers > 0);

  return (
    <Plot
      height={height}
      needs={NEEDS}
      instead={
        <ul className="flex flex-col gap-1 py-1 text-sm">
          {bins.map((bin) => (
            <li key={bandLabel(bin)} className="flex justify-between gap-4 tabular-nums">
              <span className="text-base-content/60">
                {bandLabel(bin)} error bars
                <span className="ml-2 text-xs text-base-content/40">
                  {bin.answers} {bin.answers === 1 ? "card" : "cards"}
                </span>
              </span>
              <span className="font-semibold">{bin.rate == null ? "—" : pct(bin.rate)}</span>
            </li>
          ))}
        </ul>
      }
      label={
        `How often you read a card right, 0% to 100%, against how many error bars ` +
        `separated its answer — from under one, where the data has no opinion, to ` +
        `more than three, where it is not close. Chance is ${pct(CHANCE)}.`
      }
      legend={{
        none: "One series. The dot is your rate, the band is how firmly the cards behind it pin that rate, and the only rule is chance — three claims about one number, not three series.",
      }}
      // The interval in words, which is the one thing on this chart that is not
      // printed: the rate is on the y-axis, the count under each band, and the
      // band's own ends are a length nobody reads off a 190px plot. `Plot`
      // renders this outside its labelled picture, where a box that follows the
      // pointer belongs.
      tip={tip.node}
      margin={{ left: AXIS_L, bottom: AXIS_B, top: TOP, right: 8 }}
    >
      {({ width, height: h }) => {
        // Each band owns one unit of the domain and its mark sits at the middle
        // of it, so the ticks land under the marks rather than between them.
        const x = scaleLinear({ domain: [0, bins.length], range: [0, width] });
        const y = scaleLinear({ domain: [0, 1], range: [h, 0] });
        const at = (i: number) => x(i + 0.5);

        return (
          <>
            <ValueAxisLeft scale={y} numTicks={3} format={(v) => pct(v)} />
            <ValueAxisBottom
              scale={x}
              top={h}
              values={bins.map((_, i) => i + 0.5)}
              format={(v) => bandLabel(bins[Math.floor(v)])}
            />

            {/* Named, because an unlabelled rule reads as zero and this one is
                at a third. It is also the only line on the chart a reader can
                measure a claim against: a band sitting on it is somebody
                guessing. */}
            <Baseline x1={0} x2={width} y={y(CHANCE)} label="chance" />

            {bins.map((bin, i) => {
              if (bin.rate == null || bin.low == null || bin.high == null) {
                // A band nobody has answered in. Drawn as a hollow tick on the
                // axis rather than skipped, so the scale keeps all four of its
                // positions and a reader can see which end they have not
                // reached yet.
                return (
                  <line
                    key={bandLabel(bin)}
                    x1={at(i)}
                    x2={at(i)}
                    y1={h}
                    y2={h - 4}
                    stroke={NEUTRAL.rule}
                    strokeWidth={1}
                  />
                );
              }

              return (
                <g
                  key={bandLabel(bin)}
                  {...tip.follow(
                    () =>
                      `${bin.read} of ${bin.answers} read right in this band — ` +
                      `somewhere between ${pct(bin.low)} and ${pct(bin.high)} of the time.`,
                  )}
                >
                  {/* The whole column takes the pointer. The dot is eight pixels
                      and the band six wide; a reader aiming at either would
                      spend the hover missing. */}
                  <rect
                    x={x(i)}
                    y={0}
                    width={x(i + 1) - x(i)}
                    height={h}
                    fill="transparent"
                  />
                  <line
                    x1={at(i)}
                    x2={at(i)}
                    y1={y(bin.low)}
                    y2={y(bin.high)}
                    stroke={INK.yours}
                    strokeOpacity={0.35}
                    strokeWidth={MARK.band}
                    strokeLinecap="round"
                  />
                  <Dot cx={at(i)} cy={y(bin.rate)} ink={INK.yours} />
                  {/* Printed, so nothing on this chart needs a hover to be
                      read, and so a rate off three answers cannot be mistaken
                      for one off thirty.

                      `plain` and not `quiet`, which is the axis's ink: this is a
                      VALUE a reader has to read rather than a tick naming a
                      position, and `ink.ts` draws exactly that line -- quiet is
                      "present, deliberately second" and plain is the floor for
                      something legible. */}
                  <text
                    x={at(i)}
                    y={h + 22}
                    textAnchor="middle"
                    fontSize={10}
                    fill={NEUTRAL.plain}
                    fontFamily="inherit"
                  >
                    {bin.answers}
                  </text>
                </g>
              );
            })}

            {filled.length === 0 && (
              <text
                x={width / 2}
                y={h / 2}
                textAnchor="middle"
                fontSize={11}
                fill={NEUTRAL.quiet}
                fontFamily="inherit"
              >
                Nothing answered yet.
              </text>
            )}
          </>
        );
      }}
    </Plot>
  );
}

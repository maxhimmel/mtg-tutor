"use client";

import { scaleLinear } from "@visx/scale";
import type { ReadBin } from "@mtg-tutor/core";
import { useCursorTip } from "../components/CursorTip";
import { pct } from "../lib/format";
import { INK, MARK, NEUTRAL } from "./ink";
import { Baseline, Dot } from "./marks";
import { Plot, ValueAxisBottom, ValueAxisLeft } from "./Plot";

/**
 * How often the right end was named, among questions that HAD one.
 *
 * WHY THIS IS ONLY HALF THE PANEL. The first version banded every answer by how
 * many error bars separated it, and two of its four bands could only be answered
 * one way: both drills refuse to name an end until a question clears their gate,
 * so everything below it has "the same" or "Neither" as its correct answer BY
 * CONSTRUCTION. Somebody who always answered Neither scored 100% in those bands,
 * under a rule labelled "chance" drawn flat across the lot. So the flat
 * questions are not on this chart at all -- they are the discrimination reading
 * beside it, which is a different question with a different denominator.
 *
 * AND THE AXIS IS NOT ERROR BARS. Neither drill judges a question by its z score
 * alone. The archetype quiz's bar moves with how many decks a card was measured
 * in -- 2.34 at three, 3.16 at ten -- so at 2.5 error bars a card in three decks
 * has an answer and a card in ten does not, and a band on raw sigmas would hold
 * opposite questions. Deck speed needs a residual floor against the set's own
 * spread as well as a z test, so a five-sigma card can still be flat. `margin`
 * is what each drill actually judged the question by, over the bar it had to
 * clear: 1.0 is exactly on the gate whatever k is.
 *
 * THE FIRST BAND CARRIES THE BANK'S OWN ERROR RATE, and the panel says so rather
 * than leaving it to be read as the player. Trap #22's sequel measured about a
 * third of what gets served as a false positive, and a false positive sits just
 * past the gate by definition.
 *
 * FIRST ANSWERS ONLY, decided in `readProgress`. The first time a card is dealt
 * is the only time the reveal has not already shown its answer.
 *
 * ONE SERIES, SO NO LEGEND. A dot, its band and a rule are three claims about
 * one number rather than three series. The count rides under each band, which is
 * what stops the pointer being load-bearing.
 *
 * THE BAND IS A PLAIN WILSON INTERVAL, which is the one place this departs from
 * ruling #26. That ruling is about a band a reader measures against a threshold,
 * where a 95% interval visibly disagrees with the verdict printed under it.
 * Nothing is read off a threshold here: there is no gate a band clears, the only
 * line is a guessing rate, and what a reader wants is how firmly the rate is
 * pinned. Wilson rather than the normal approximation because these counts are
 * small by construction.
 */

/**
 * Guessing, among questions that have an answer.
 *
 * A THIRD, BECAUSE EACH DRILL OFFERS EXACTLY THREE ANSWERS -- two ends and the
 * flat one -- and this chart holds only the questions where one of the ends is
 * right. Somebody answering uniformly at random lands here. It is NOT the rate
 * for a player who never reaches for the flat answer; that person is guessing
 * between two and sits at a half. Which is why the rule is labelled with what it
 * is rather than left to be read as a zero.
 */
const CHANCE = 1 / 3;

/**
 * Room for the y labels, which is what the first version got wrong.
 *
 * `pct` emits "100.0%", and at 34px the leading digits fell outside the SVG, so
 * every tick rendered as "0.0%" -- a chart whose own accessible label promised
 * "0% to 100%" while drawing a false scale. `Plot`'s `edgeAnchor` guards the
 * bottom axis only; there is no equivalent on the left, so the margin is the
 * guard and it is measured against the widest label rather than guessed.
 */
const AXIS_L = 46;
/**
 * Room for TWO rows under the axis: the band's name, and its count.
 *
 * 34 held one, so the counts were stamped through the band labels and neither
 * could be read -- which took down both the no-legend argument and the claim
 * that nothing here needs a hover.
 */
const AXIS_B = 46;
const TOP = 12;

/** The narrowest width at which three bands and their counts still read. */
const NEEDS = 300;

/** "1–1.5", "1.5–2", "2+" -- multiples of the drill's own gate. */
export const bandLabel = (bin: ReadBin): string =>
  bin.to == null ? `${bin.from}+` : `${bin.from}–${bin.to}`;

export function ReadRate({
  bins,
  height = 200,
}: {
  bins: ReadBin[];
  /** Fixed, like every chart here. */
  height?: number;
}) {
  const tip = useCursorTip();
  const answered = bins.reduce((n, b) => n + b.answers, 0);

  return (
    <Plot
      height={height}
      needs={NEEDS}
      instead={
        <ul className="flex flex-col gap-1 py-1 text-sm">
          {bins.map((bin) => (
            <li key={bandLabel(bin)} className="flex justify-between gap-4 tabular-nums">
              <span className="text-base-content/60">
                {bandLabel(bin)}× the bar
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
        `How often you named the right end, 0% to 100%, against how far past its ` +
        `own bar the question sat — from just over it to more than twice it. ` +
        `Guessing is ${pct(CHANCE)}.`
      }
      legend={{
        none: "One series. The dot is your rate, the band is how firmly the cards behind it pin that rate, and the only rule is guessing — three claims about one number, not three series.",
      }}
      // The interval in words, which is the one thing here that is not printed:
      // the rate is on the y-axis and the count under each band, but a band's
      // own ends are a length nobody reads off a 200px plot.
      tip={tip.node}
      margin={{ left: AXIS_L, bottom: AXIS_B, top: TOP, right: 10 }}
    >
      {({ width, height: h }) => {
        // Each band owns one unit of the domain and its mark sits at the middle
        // of it, so the ticks land under the marks rather than between them.
        const x = scaleLinear({ domain: [0, bins.length], range: [0, width] });
        const y = scaleLinear({ domain: [0, 1], range: [h, 0] });
        const at = (i: number) => x(i + 0.5);

        return (
          <>
            {/* No decimal. "100%" is what the scale says; the tenth of a percent
                `pct` prints is a precision this chart does not have, and it is
                what made the labels too wide to fit inside their own margin. */}
            <ValueAxisLeft scale={y} numTicks={3} format={(v) => `${Math.round(v * 100)}%`} />
            <ValueAxisBottom
              scale={x}
              top={h}
              values={bins.map((_, i) => i + 0.5)}
              format={(v) => bandLabel(bins[Math.floor(v)])}
            />

            {/* Named, because an unlabelled rule reads as zero and this one is at
                a third. It is the only line a reader can measure a claim
                against: a band sitting on it is somebody guessing.

                Labelled at the RIGHT-hand end. At the left it sat on the first
                band's dot at the width /stats gives this chart, and the first
                band is exactly where a rate near the rule lands. */}
            <Baseline x1={0} x2={width} y={y(CHANCE)} label="guessing" labelAt="end" />

            {bins.map((bin, i) => {
              const empty = bin.rate == null || bin.low == null || bin.high == null;

              return (
                <g
                  key={bandLabel(bin)}
                  {...tip.follow(() =>
                    empty
                      ? "Nothing in this band yet — no question this far past its bar has come up."
                      : `${bin.read} of ${bin.answers} read right in this band — ` +
                        `somewhere between ${pct(bin.low ?? 0)} and ${pct(bin.high ?? 0)} of the time.`,
                  )}
                >
                  {/* The whole column takes the pointer. The dot is eight pixels
                      and the band six wide; a reader aiming at either would
                      spend the hover missing. */}
                  <rect x={x(i)} y={0} width={x(i + 1) - x(i)} height={h} fill="transparent" />

                  {!empty && (
                    <>
                      <line
                        x1={at(i)}
                        x2={at(i)}
                        y1={y(bin.low ?? 0)}
                        y2={y(bin.high ?? 0)}
                        stroke={INK.yours}
                        strokeOpacity={0.35}
                        strokeWidth={MARK.band}
                        strokeLinecap="round"
                      />
                      <Dot cx={at(i)} cy={y(bin.rate ?? 0)} ink={INK.yours} />
                    </>
                  )}

                  {/* The count, on its own row under the band's name. Printed for
                      an EMPTY band too, as a zero: the drawing has to be able to
                      say "nothing here yet" where its own fallback list says
                      "0 cards". The first version drew a hollow tick for that
                      instead, which landed underneath the axis's own tick in the
                      same ink and was invisible. */}
                  <text
                    x={at(i)}
                    y={h + 34}
                    textAnchor="middle"
                    fontSize={10}
                    fill={empty ? NEUTRAL.quiet : NEUTRAL.plain}
                    fontFamily="inherit"
                  >
                    {bin.answers}
                  </text>
                </g>
              );
            })}

            {answered === 0 && (
              <text
                x={width / 2}
                y={h / 2}
                textAnchor="middle"
                fontSize={11}
                fill={NEUTRAL.quiet}
                fontFamily="inherit"
              >
                No card with an answer yet.
              </text>
            )}
          </>
        );
      }}
    </Plot>
  );
}

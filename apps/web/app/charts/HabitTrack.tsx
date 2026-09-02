"use client";

import { scaleLinear } from "@visx/scale";
import { DRAFTER_TAU } from "@mtg-tutor/core";
import { INK, MARK } from "./ink";
import { Plot, Reference, TICK_TEXT, ValueAxisBottom } from "./Plot";

/**
 * Where a drafter sits against the field, on one dial per row.
 *
 * WHY THIS IS NOT `GapMark` STACKED, WHICH IS WHAT IT WAS FIRST
 *
 * `GapMark` earns its missing axis with one sentence in its own docblock: it
 * "rides inside an eyebrow beside the numbers it draws", so the marks carry the
 * relation and the text carries the values. The habits panel took that mark and
 * deliberately printed no numbers -- which removes the exact thing the exemption
 * rests on and leaves a rule, a dot and a span with nothing on screen saying
 * what any of them are worth.
 *
 * Two more followed from it, and both are in the house rules by name. The rule
 * here is at ONE, not zero, and `Reference` exists because "an unlabelled
 * reference line is a mark the reader has to guess the meaning of, and the guess
 * is usually zero". And `GapMark` computes its own `reach` per call, which is
 * right for one mark alone in an eyebrow and wrong the moment there are two
 * stacked: each row would be drawn on its own scale, they would look comparable,
 * and nothing would say they were not.
 *
 * So: one frame, one scale for every row, both ends of it printed, and the field
 * drawn as a labelled rule.
 *
 * THE GRAMMAR OF THE MARK IS STILL `GapMark`'S, on purpose. A thin span with a
 * serif at each end and a point estimate on it -- a SPAN and a POINT as
 * different shapes rather than one shape at two thicknesses, which is the fix
 * that stopped the first version reading as a toggle switch. A reader who has
 * learned the mark on the review screen has already learned this one, and the
 * question is the same question: does the span reach the rule.
 */

/**
 * Half the width of the scale, and why it is this number.
 *
 * A dial with NO information comes back at the prior: sitting on the field, with
 * the prior's own width as its interval. So `1.96 * tau` is the widest interval
 * this chart can ever be handed, and a domain narrower than it would crop the
 * one case the chart most has to draw honestly -- somebody with two drafts, who
 * is most people. Deriving the floor from `DRAFTER_TAU` rather than picking one
 * also means it moves if the prior is ever remeasured.
 *
 * It grows for a drafter further out than that, because `GapMark` is right that
 * the whole bar has to be on screen: the reading is whether the span reaches the
 * rule, and a cropped span answers a question nobody asked.
 */
const FLOOR = 1.96 * DRAFTER_TAU;

const ROW = 22;
const SERIF = 4;
const SPAN_W = 1.5;
const MARGIN = { top: 8, right: 10, bottom: 26, left: 64 };

/** A multiple of what the field weighs something at. */
const times = (v: number) => `${v.toFixed(2)}×`;

export interface HabitRow {
  /** Short enough to sit in the left margin: "Colours", "Signals". */
  label: string;
  /** 1 is the field. */
  value: number;
  se: number;
  called: boolean;
}

export function HabitTrack({ rows }: { rows: HabitRow[] }) {
  const half = Math.max(
    FLOOR,
    ...rows.map((r) => Math.abs(r.value - 1) + 1.96 * r.se),
  );
  const low = 1 - half;
  const high = 1 + half;
  const height = rows.length * ROW + MARGIN.top + MARGIN.bottom;

  return (
    <Plot
      height={height}
      // Sixty-four of left margin before a track starts, and a track under about
      // 150px cannot show an interval, its ends and a dot as separate things.
      needs={280}
      // The sentences alone, which is what a reader on a phone wanted anyway --
      // and they carry the whole reading, since the chart's job here is to show
      // how much of it is margin.
      instead={
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className={r.called ? "" : "text-base-content/55"}>
              {r.label}: {r.called ? times(r.value) : "inside the margin"}
            </li>
          ))}
        </ul>
      }
      label={
        `How much you weigh each thing against a typical drafter, ` +
        `${times(low)} to ${times(high)}, with the field at ${times(1)}. ` +
        `Each row is an estimate and the interval around it; a row whose ` +
        `interval covers the field is one the data cannot call.`
      }
      // One series -- every row is the same quantity about a different thing --
      // and each is direct-labelled in the left margin. A key would name the
      // colour of the only ink on the chart.
      legend={{ none: "One series, and every row is labelled where it sits." }}
      // The scale is printed, the field is labelled, and the sentence under the
      // chart says the reading for each row in words. There is nothing a hover
      // could add that is not already on screen.
      tip={{ none: "Every row is direct-labelled and read out in the list below it." }}
      margin={MARGIN}
    >
      {({ width, height: inner }) => {
        const x = scaleLinear({ domain: [low, high], range: [0, width] });
        const mid = (i: number) => i * ROW + ROW / 2;

        return (
          <>
            {rows.map((row, i) => {
              // Hollow where the interval covers the field, filled where it
              // clears -- the same pairing `GapMark` uses, and the second
              // channel beside position so the reading never rests on hue.
              const ink = row.called ? INK.yours : INK.hollow;
              const y = mid(i);
              return (
                <g key={row.label}>
                  <text
                    x={-8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    {...TICK_TEXT}
                    fill={row.called ? INK.value : INK.label}
                  >
                    {row.label}
                  </text>
                  <path
                    d={
                      `M ${x(row.value - 1.96 * row.se)} ${y - SERIF} V ${y + SERIF} ` +
                      `M ${x(row.value - 1.96 * row.se)} ${y} H ${x(row.value + 1.96 * row.se)} ` +
                      `M ${x(row.value + 1.96 * row.se)} ${y - SERIF} V ${y + SERIF}`
                    }
                    stroke={ink}
                    strokeWidth={SPAN_W}
                    fill="none"
                  />
                  <circle cx={x(row.value)} cy={y} r={MARK.dot / 2} fill={ink} />
                </g>
              );
            })}

            {/* Over the marks, because it is the thing they are measured
                against rather than a mark among them -- same ordering GapMark
                uses for its zero. */}
            <Reference at={x(1)} height={rows.length * ROW} label="the field" />

            {/* The ends of the domain and nothing between them. They ARE the
                fact being stated, and a tick at 1 would sit under the reference
                label saying the same thing twice. */}
            <ValueAxisBottom
              scale={x}
              top={rows.length * ROW}
              values={[low, high]}
              format={times}
            />
          </>
        );
      }}
    </Plot>
  );
}

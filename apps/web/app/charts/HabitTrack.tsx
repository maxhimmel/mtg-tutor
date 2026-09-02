"use client";

import { scaleLinear } from "@visx/scale";
import { DRAFTER_TAU } from "@mtg-tutor/core";
import { useCursorTip } from "../components/CursorTip";
import { Plot, Reference, ValueAxisBottom } from "./Plot";

/**
 * Where a drafter sits against the field, on one dial per row.
 *
 * WHY THE MARK IS A BAND AND NOT A HAIRLINE, WHICH IS WHAT IT WAS TWICE
 *
 * The first two versions drew each row as `GapMark`'s thin span with serifs on
 * the ends. That mark is eighty pixels wide and lives in an eyebrow with its
 * numbers printed beside it; here it is a track in a panel with no numbers on
 * it, and at that size a 1.5px rule with a 4px dot is not a small chart, it is
 * an empty one. Shrinking the frame did not fix that -- the proportions changed
 * and the drawing still had nothing in it to look at.
 *
 * `MARK.band` exists in `ink.ts` for exactly this and says so: "the band under a
 * dot: an interval, a margin, a range". And `DeckBands` in the archetype quiz is
 * the model CLAUDE.md names for showing uncertainty -- a 6px rounded band with
 * the estimate as a dot on it, a rule it either reaches or does not, and the
 * whole track taking the pointer. So this is that, and a reader who has met the
 * quiz has already met this.
 *
 * `GapMark`'S TOGGLE-SWITCH WARNING DOES NOT REACH HERE, and that is worth
 * arguing rather than quietly ignoring. Its first version read as a control
 * because it was a rounded lozenge with a knob in it, unlabelled, at the top of
 * a panel full of buttons. This has a named row beside it, an axis under it and
 * a labelled rule through it. What that warning is about is a mark with no
 * context; this one has three.
 *
 * AND IT CAN BE ASKED. Same reasoning `DeckBands` gives: the band, the dot and
 * the rule each carry a different claim, and no caption explains three claims at
 * once in a way anybody reads. `useCursorTip` is where the numbers live -- which
 * is the resolution to this chart printing none on its marks, rather than an
 * exception to it.
 */

/**
 * Half the width of the scale, and why it is this number.
 *
 * A dial with NO information comes back at the prior: sitting on the field, with
 * the prior's own width as its interval. So `1.96 * tau` is the widest interval
 * this chart can ever be handed, and a domain narrower than it would crop the
 * one case it most has to draw honestly -- somebody with two drafts, who is most
 * people. Deriving the floor from `DRAFTER_TAU` rather than picking a number
 * also means it moves if the prior is ever remeasured.
 *
 * It grows for a drafter further out than that: the reading is whether the band
 * reaches the rule, and a cropped band answers a question nobody asked.
 */
const FLOOR = 1.96 * DRAFTER_TAU;

/**
 * Room between the widest band and the edge.
 *
 * Without it the row that SETS the domain has its end drawn on the axis's first
 * pixel, which reads as a bar running off the chart rather than as the widest
 * thing on it.
 */
const BREATHE = 1.08;

const AXIS_H = 22;
/** Under this the axis is two numbers instead, and the rows carry on regardless. */
const AXIS_NEEDS = 200;
/** The label column, wide enough for the longest dial name at this size. */
const NAME = "w-[4.5rem]";

/** A multiple of what the field weighs something at. */
const times = (v: number) => `${v.toFixed(2)}×`;

export interface HabitRow {
  /** Short enough for the label column: "Colors", "Signals". */
  label: string;
  /** What this dial is about, for the pointer: "how early you commit". */
  about: string;
  /** 1 is the field. */
  value: number;
  se: number;
  called: boolean;
}

export function HabitTrack({ rows, picks }: { rows: HabitRow[]; picks: number }) {
  const tip = useCursorTip();

  const half =
    Math.max(FLOOR, ...rows.map((r) => Math.abs(r.value - 1) + 1.96 * r.se)) * BREATHE;
  const domain: [number, number] = [1 - half, 1 + half];

  // Per cent rather than pixels, which is what keeps the marks as HTML: a row
  // carries a name in real text beside its track, and a span cannot be placed in
  // pixels by a parent nothing has measured. The axis below maps the SAME domain
  // onto its own box in pixels -- two scales, one domain, and the domain is the
  // thing that must not be duplicated.
  const x = scaleLinear({ domain, range: [0, 100] });
  const field = x(1);

  /**
   * What the pointer is nearest, and what that mark claims.
   *
   * Measured in pixels off the track's own box rather than in dial units,
   * because "am I on the dot" is a question about the drawing: the dot is eight
   * pixels whatever the scale, and a reader aiming at it is aiming at what they
   * can see. Same shape as `DeckBands.describe`, deliberately.
   */
  function describe(row: HabitRow, e: { clientX: number; currentTarget: Element }): string {
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientX - box.left;
    const under = x.invert((at / box.width) * 100);
    const margin = 1.96 * row.se;
    const near = (v: number) => Math.abs(at - (x(v) / 100) * box.width) < 8;

    if (near(row.value)) {
      return `You weigh ${row.about} ${times(row.value)} what a typical drafter does.`;
    }
    if (near(1)) {
      return "A typical drafter of the sets you played, from 17Lands. Every row is measured from here.";
    }
    if (Math.abs(under - row.value) <= margin) {
      return row.called
        ? `The slack ${picks} picks leave. It clears the line, so the reading holds.`
        : `The slack ${picks} picks leave. While it covers the line there is nothing to call, whichever side the dot is on.`;
    }
    return `${times(under)}, which is outside what ${picks} picks can support.`;
  }

  return (
    <div>
      <ul className="relative flex flex-col gap-1">
        {rows.map((row) => {
          const margin = 1.96 * row.se;
          const lo = row.value - margin;
          const hi = row.value + margin;

          return (
            <li key={row.label} className="flex items-center gap-3">
              <span
                className={`${NAME} shrink-0 text-xs ${
                  row.called ? "text-base-content/80" : "text-base-content/45"
                }`}
              >
                {row.label}
              </span>

              {/* The whole track takes the pointer, not the marks: the dot is
                  eight pixels and the band six tall, and a reader aiming at
                  either would spend the hover missing. */}
              <span
                className="relative h-5 min-w-0 flex-1"
                role="img"
                aria-label={
                  `${row.label}: you weigh ${row.about} ${times(row.value)} what a typical ` +
                  `drafter does, give or take ${margin.toFixed(2)} — ` +
                  (row.called
                    ? "a reading that clears the field."
                    : "a margin that still covers the field, so there is nothing to call.")
                }
                {...tip.follow((e) => describe(row, e))}
              >
                <span
                  aria-hidden
                  className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${
                    row.called ? "bg-primary/30" : "bg-base-content/15"
                  }`}
                  style={{ left: `${x(lo)}%`, width: `${x(hi) - x(lo)}%` }}
                />
                <span
                  aria-hidden
                  className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    row.called ? "bg-primary" : "bg-base-content/40"
                  }`}
                  style={{ left: `${x(row.value)}%` }}
                />
              </span>
            </li>
          );
        })}

        {/* The field, running the height of the list inside a spacer laid out to
            the same columns as a row -- so it lands on the tracks' own scale
            without anything having to know what the columns add up to. Same
            trick `DeckBands` uses for its zero. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-stretch gap-3">
          <span className={`${NAME} shrink-0`} />
          <span className="relative min-w-0 flex-1">
            <span
              className="absolute inset-y-0 w-px bg-base-content/45"
              style={{ left: `${field}%` }}
            />
          </span>
        </span>
      </ul>

      {/* The scale, in numbers, on the tracks' own box. The spacer columns are
          the same trick again, so the axis is drawn at the width it is aligned
          to rather than at a width anything here had to work out. */}
      <div className="flex items-start gap-3 pt-0.5">
        <span className={`${NAME} shrink-0`} />
        <div className="min-w-0 flex-1">
          <Plot
            height={AXIS_H}
            needs={AXIS_NEEDS}
            instead={
              <p className="eyebrow pt-1">
                {times(domain[0])} to {times(domain[1])}, field at {times(1)}
              </p>
            }
            label={
              `How much you weigh each thing against a typical drafter, ` +
              `${times(domain[0])} to ${times(domain[1])}, with the field at ${times(1)}.`
            }
            // This `Plot` is the AXIS ONLY -- the marks are the HTML rows above,
            // because a row carries a name in real text -- so both guides belong
            // to the chart rather than to the frame, and saying so here is what
            // stops a second key appearing under a rule.
            legend={{
              none: "One series; every row is named where it sits and the rule is labelled on the axis.",
            }}
            tip={{
              none: "The rows own the pointer: `useCursorTip` is wired onto each track above, where the marks a reader is aiming at actually are.",
            }}
          >
            {({ width }) => {
              const px = scaleLinear({ domain, range: [0, width] });
              return (
                <>
                  <ValueAxisBottom
                    scale={px}
                    top={1}
                    values={[domain[0], domain[1]]}
                    format={times}
                  />
                  {/* Continues the rule through the axis and names it. An
                      unlabelled reference gets read as a zero, and this one is
                      at one. */}
                  <Reference at={px(1)} height={1} label="the field" />
                </>
              );
            }}
          </Plot>
        </div>
      </div>

      {tip.node}
    </div>
  );
}

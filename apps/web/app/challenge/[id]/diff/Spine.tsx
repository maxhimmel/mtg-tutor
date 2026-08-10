"use client";

import { useRef } from "react";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import {
  CORD,
  SEAM,
  STRAND,
  TOGETHER,
  cordInk,
  isFork,
  opennessOf,
  pickAxis,
  spans,
  spoken,
  titleOf,
} from "./braidGeometry";
import { BraidCaption } from "./Braid";
import { Explain, type ExplainMode } from "./Explain";
import { Dot } from "./sides";
import { stateOf } from "./track";

/**
 * PARKED. NOTHING IMPORTS THIS, AND THAT IS DELIBERATE.
 *
 * The braid stood on end as a full-height rail. It was built, wired into two
 * layouts, looked at, and rejected on sight: the drawing does not survive the
 * rotation. It is kept because the IDEA it was testing did survive -- what
 * `console` pins across the top of the page is this experiment's finding, that
 * an instrument which never leaves the screen is worth a whole edge -- and
 * because the next attempt should start from the diagnosis rather than from a
 * blank file.
 *
 * WHAT ACTUALLY WENT WRONG, as far as one look can tell, so the next pass is not
 * a redraw of the same thing:
 *
 * - The cross-axis is starved and the long axis is not. Forty-two picks down a
 *   viewport is generous; 116 units of width for two ropes that must open to
 *   fifty and still read as two cords each is not. Laid across a page the rope
 *   has a foot of room to open into and the eye reads the OPENING; stood up it
 *   has a thumb's width, and the eye reads a stripe with wobble in it.
 * - Which means the amplitude bump to 24 was the wrong lever. It made the
 *   openings wider in a box that was already too narrow for them, so the strands
 *   spend most of the draft near the walls instead of near each other, and
 *   "together" stops being the resting state a parting departs from.
 * - The entrance curve does not survive either. Across a page the run-up is a
 *   long shallow easing under a name; down a rail it is a hook in the top two
 *   inches, and both names sit above a chart narrow enough that they nearly
 *   touch.
 * - `preserveAspectRatio="none"` is doing more work here than it does across the
 *   page. The y-scale is roughly 0.8 and every curve is squashed by it, so the
 *   eases that read as a rope opening read as corners.
 *
 * The honest next move is probably not "rotate it better" but "draw a different
 * thing for a rail" -- the rail's real job is where-am-I plus what-kind-of-pick,
 * and the two-cords-per-strand colour story may simply not be a rail's to tell.
 * Which is a design question, not a geometry one, and it is why this is parked
 * rather than tuned.
 *
 * What follows is the original reasoning, unchanged, because it is the argument
 * the next attempt has to beat:
 *
 * THE ROTATION IS THE WHOLE IDEA, and it is worth being explicit about what it
 * buys, because turning a timeline ninety degrees is normally a mistake. A
 * comparison of two drafts is read by moving through forty-two picks, and the
 * page is what moves. Laid across a panel, the drawing of those forty-two picks
 * scrolls away after the second one -- so the instrument that says where you are
 * is on screen for the first section and gone for the other four, and the app
 * answered that by drawing the draft three separate times. Laid along the page's
 * own axis it can simply stay: where you are in the DRAFT and where you are in
 * the PAGE become one fact, held in one object, at all times.
 *
 * It costs nothing in resolution. Forty-two picks down 880 pixels of viewport is
 * about twenty pixels each, which is more room per pick than the panel gets
 * across fifteen hundred pixels once its name gutter is taken off.
 *
 * SAME INSTRUMENT, NOT A SECOND ONE. Everything about the rope -- cord width,
 * seam, colour per pick, how far a parting opens -- comes from `braidGeometry`,
 * and the pack measure comes from the same `pickAxis` the panel lays along x.
 * The only thing this file decides is that the draft runs down and the strands
 * open sideways. A reader who learnt one has learnt the other.
 *
 * WHAT THE RAIL DROPS, deliberately. The panel's caption is four sentences and a
 * rail has no room for prose, so it goes behind the mark at the head -- which is
 * the same passage, in the same words, one hover away. The pack ruler survives
 * because it is a measure rather than a sentence: it runs down the left edge
 * with the pack names set INTO the rule, reading top to bottom, which is what a
 * dimension line does when it is stood up.
 *
 * WHAT IT ADDS is the readout at the foot. A rail is on screen the whole time
 * and therefore has to be able to answer "which pick am I on" without the reader
 * looking anywhere else -- the panel never needed that, because the pick-by-pick
 * shelf it drives was usually in view when it was.
 *
 * ONE TAB STOP, and the arrows step it, exactly as PickTrack contracts. Forty-two
 * focus stops in a rail that is on screen for the whole page would be forty-two
 * presses between a reader and everything below it -- and the fully labelled,
 * per-tick navigable copy of this draft is still down in the shelf's stepper,
 * where a keyboard reader ends up anyway. The rail is the instrument; the
 * stepper is the control. Said out loud on the rail's own label.
 */

// The cross-axis, which is the one measurement the two orientations do NOT
// share. A rail is generous across and tight along; a panel is the reverse. So
// the rope gets more room to open here (24 against the panel's 16) and the same
// opening reads at the same strength in a box a fifth as wide.
const OPEN = 24;
const WELL_W = 116;
// Clear air either side of the wells: the causal arc lives in the right-hand
// one, and the left is what keeps the drawing symmetric about its own middle so
// the two names come in as one curve mirrored.
const CHANNEL = 22;
const W = CHANNEL * 2 + WELL_W;
const MID = W / 2;

// The draft's own axis, in a thousand units stretched to whatever height the
// viewport gives it.
const SPAN = 1000;
const LEAD = 56;
const PAD = 14;
const PACK_GAP = 14;

// Where a name sits, and therefore where its rope comes in: exactly level with
// the left or right edge of the floor its rope is about to run along.
const NAME_X = { yours: MID - WELL_W / 2, theirs: MID + WELL_W / 2 };

// The pack rule's gutter and the thread between it and the chart, as one figure
// -- it is the offset every label in the head has to clear, and it is stated
// once so the head cannot drift off the chart it names. `w-7` plus `gap-1`.
const RULE_W = "2rem";

/**
 * How wide the whole rail wants to be.
 *
 * The chart is a fixed 160 units, the pack rule's gutter is another 32, and the
 * rest is what a NAME needs: the two of them are centred on their own lanes, the
 * far one sits 22 units from the chart's right edge, and the other drafter is
 * called "Your challenger" whenever nobody named them. Sized so that label has
 * somewhere to be rather than being truncated into the thing it exists to say.
 */
export const SPINE_W = "14rem";

export function Spine({
  rows,
  tally,
  them,
  at,
  onSelect,
  explain,
  className,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  at: number;
  onSelect: (pickIndex: number, from: "braid", scroll: boolean) => void;
  explain: ExplainMode;
  className?: string;
}) {
  // A click has to take you to what you clicked. An arrow key must not: the rail
  // keeps focus while it steps, and scrolling on every press would carry the
  // focus ring off a rail the reader is still holding.
  const byPointer = useRef(false);

  if (rows.length === 0) return null;

  const causingFork =
    tally.firstDrift === undefined
      ? undefined
      : [...tally.forks].reverse().find((f) => f.pickIndex < (tally.firstDrift ?? 0));

  const {
    step,
    at: bandT,
    end: bandB,
    mid: cy,
    wells,
  } = pickAxis(rows, { span: SPAN, lead: LEAD, pad: PAD, gap: PACK_GAP });

  const open = opennessOf(rows);

  const laneX = (i: number, side: "yours" | "theirs") =>
    side === "yours"
      ? MID - TOGETHER / 2 - OPEN * open[i]
      : MID + TOGETHER / 2 + OPEN * open[i];

  const leanOf = (row: DiffRow, side: "yours" | "theirs") =>
    side === "yours" ? row.yourLean : row.theirLean;

  const strandPath = (side: "yours" | "theirs", cord: 0 | 1) => {
    const off = (cord === 0 ? -1 : 1) * ((CORD + SEAM) / 2);
    const x0 = laneX(0, side) + off;
    const nx = NAME_X[side] + off;

    // In from under its own name at the head of the rail, in the same smooth
    // step every lane change uses -- so the name and the rope are one object.
    const head = `M ${nx} 0 C ${nx} ${LEAD / 2} ${x0} ${LEAD / 2} ${x0} ${LEAD}`;

    const body = rows
      .map((_, i) => {
        const y = cy(i);
        const x = laneX(i, side) + off;
        if (i === 0) return `L ${x} ${y}`;
        const py = cy(i - 1);
        const px = laneX(i - 1, side) + off;
        const my = (py + y) / 2;
        return px === x ? `L ${x} ${y}` : `C ${px} ${my} ${x} ${my} ${x} ${y}`;
      })
      .join(" ");

    return `${head} ${body}`;
  };

  // Two stops per pick at the offsets its own band spans, so each pick's colour
  // ends exactly where the next begins and nothing is painted a blend of two
  // colour pairs neither deck ever was.
  const stops = (side: "yours" | "theirs", cord: 0 | 1) =>
    rows.flatMap((row, i) => {
      const color = cordInk(leanOf(row, side), cord);
      return [
        { key: `${i}a`, offset: i / rows.length, color },
        { key: `${i}b`, offset: (i + 1) / rows.length, color },
      ];
    });

  const cords = [0, 1] as const;

  const drifted = wells.flatMap((well) =>
    spans(rows, (r) => !r.samePack, well.from, well.to).map((run) => ({
      key: `${run.from}`,
      y: bandT(run.from),
      height: bandB(run.to - 1) - bandT(run.from),
    })),
  );

  const here = Math.min(at, rows.length - 1);
  const row = rows[here];
  const last = rows[rows.length - 1];
  const state = stateOf(row);

  const move = (to: number) => {
    byPointer.current = false;
    onSelect(Math.max(0, Math.min(rows.length - 1, to)), "braid", false);
  };

  return (
    <section
      className={`card flex h-full flex-col border border-base-300 bg-base-200 ${className ?? ""}`}
    >
      {/* The head is the panel's header rule, kept -- and it is where the two
          names live, because this is the end the ropes come in at. */}
      <div className="flex items-center justify-between gap-2 border-b border-base-300 px-3 py-2.5">
        <h2 className="eyebrow truncate">The draft</h2>
        <Explain mode={explain} subject="how to read the braid" align="end">
          <BraidCaption rows={rows} tally={tally} causingFork={causingFork} />
        </Explain>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {/* Each name centred over the lane its rope leaves from, in the SVG's own
            percentages -- so the word and the rope under it cannot drift apart
            when the rail is resized. */}
        <div className="relative h-7 shrink-0">
          <LaneName x={NAME_X.yours} label="You" mine />
          <LaneName x={NAME_X.theirs} label={them} />
        </div>

        <div
          className="flex min-h-0 flex-1 gap-1"
          tabIndex={0}
          role="group"
          aria-label={`The whole draft as two strands, ${rows.length} picks from top to bottom. Up and down arrows step through it; the pick-by-pick track lower on the page names every pick.`}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              move(here - 1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(here + 1);
            }
            if (e.key === "Home") {
              e.preventDefault();
              move(0);
            }
            if (e.key === "End") {
              e.preventDefault();
              move(rows.length - 1);
            }
          }}
        >
          <PackRule wells={wells} />

          <svg
            viewBox={`0 0 ${W} ${SPAN}`}
            preserveAspectRatio="none"
            className="h-full shrink-0"
            style={{ width: W }}
            role="img"
            aria-label={`Two strands running down ${rows.length} picks, together where you took the same card and opening where you did not — wider the longer the parting held. You finished ${spoken(
              last.yourLean,
            )}; ${them} finished ${spoken(last.theirLean)}. ${
              tally.forks.length
            } of the partings were on the same pack; the shaded stretches are the ${
              tally.rows - tally.comparable
            } picks where you were not looking at the same cards at all.`}
          >
            <defs>
              {(["yours", "theirs"] as const).flatMap((side) =>
                cords.map((cord) => (
                  <linearGradient
                    key={`${side}-${cord}`}
                    id={`spine-${side}-${cord}`}
                    gradientUnits="userSpaceOnUse"
                    x1={0}
                    x2={0}
                    y1={LEAD}
                    y2={SPAN - PAD}
                  >
                    {stops(side, cord).map((s) => (
                      <stop key={s.key} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                )),
              )}
            </defs>

            {wells.map((well) => (
              <rect
                key={well.packNo}
                x={CHANNEL}
                y={well.at}
                width={WELL_W}
                height={well.length}
                rx={2}
                className="fill-base-100/70"
              />
            ))}

            <rect
              x={CHANNEL}
              y={bandT(here)}
              width={WELL_W}
              height={step}
              className="fill-base-content/[0.08] stroke-base-content/25"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />

            {drifted.map((band) => (
              <rect
                key={band.key}
                x={CHANNEL}
                y={band.y}
                width={WELL_W}
                height={band.height}
                className="fill-warning/[0.13]"
              />
            ))}

            {tally.firstDrift !== undefined && (
              <>
                <line
                  x1={CHANNEL}
                  y1={bandT(tally.firstDrift)}
                  x2={CHANNEL + WELL_W}
                  y2={bandT(tally.firstDrift)}
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className="text-warning/60"
                />
                {causingFork && (
                  // The delay, in the right-hand channel: cause above, eight or
                  // more picks of nothing visible, effect below, landing exactly
                  // on the edge of the region it caused.
                  <path
                    d={`M ${CHANNEL + WELL_W + 1} ${cy(causingFork.pickIndex)} C ${W - 1} ${cy(
                      causingFork.pickIndex,
                    )} ${W - 1} ${bandT(tally.firstDrift)} ${CHANNEL + WELL_W + 1} ${bandT(
                      tally.firstDrift,
                    )}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                    className="text-warning/75"
                  />
                )}
              </>
            )}

            {/* One target per pick, beneath the strands, with the strands
                transparent to the pointer -- the same arrangement the panel
                settled on and for the same two reasons: a hover wash over the
                rope dulls it, and a rope over the target swallows the click. */}
            {rows.map((r, i) => (
              <g
                key={i}
                className="group cursor-pointer"
                onClick={() => {
                  byPointer.current = true;
                  onSelect(i, "braid", true);
                }}
              >
                <rect
                  x={CHANNEL}
                  y={bandT(i)}
                  width={WELL_W}
                  height={step}
                  className="fill-transparent transition-colors group-hover:fill-base-content/[0.12]"
                />
                {isFork(r) && (
                  <line
                    x1={laneX(i, "yours") + STRAND / 2 + 3}
                    y1={cy(i)}
                    x2={laneX(i, "theirs") - STRAND / 2 - 3}
                    y2={cy(i)}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-primary [stroke-width:3] transition-[stroke-width] group-hover:[stroke-width:5]"
                  />
                )}
                <title>{titleOf(r)}</title>
              </g>
            ))}

            {(["yours", "theirs"] as const).flatMap((side) =>
              cords.map((cord) => (
                <path
                  key={`${side}-${cord}`}
                  d={strandPath(side, cord)}
                  fill="none"
                  stroke={`url(#spine-${side}-${cord})`}
                  strokeWidth={CORD}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )),
            )}
          </svg>
        </div>
      </div>

      {/* The readout. A rail is on screen for the whole page, so it has to be
          able to say which pick it is lit on without the reader looking anywhere
          else -- which is the one thing the panel never had to do. */}
      <div className="flex flex-col gap-1.5 border-t border-base-300 px-3 py-2.5">
        <span className="font-display text-sm font-semibold tabular-nums">
          Pack {row.packNo}, pick {row.pickNo}
        </span>
        <span
          className={`badge badge-sm self-start ${
            state === "fork"
              ? "badge-primary"
              : state === "apart"
                ? "badge-warning badge-outline"
                : "badge-ghost"
          }`}
        >
          {state === "fork"
            ? "Fork — same pack"
            : state === "apart"
              ? "Different packs"
              : "Same card"}
        </span>
      </div>
    </section>
  );
}

/**
 * A name, over the lane its own rope leaves from.
 *
 * The chart's own units are pixels here -- the rail is a fixed width and only
 * its height is fluid -- so a lane's x IS an offset in the label row, once the
 * pack rule's gutter is added back. Nothing to keep in sync by hand.
 *
 * Centred on its lane rather than pinned to an edge, and allowed to wrap: the
 * other drafter is called "Your challenger" whenever nobody named them, and a
 * label that exists to say whose rope this is must not render as "YOUR CHA…".
 */
function LaneName({ x, label, mine }: { x: number; label: string; mine?: boolean }) {
  return (
    <span
      className="absolute top-0 flex w-[4.5rem] -translate-x-1/2 flex-col items-center gap-1 text-center"
      style={{ left: `calc(${RULE_W} + ${x}px)` }}
    >
      <Dot mine={mine} />
      <span className="eyebrow leading-tight">{label}</span>
    </span>
  );
}

/**
 * The draft as one measured length, stood up.
 *
 * The panel's ruler with its axis turned: one rule down the whole drafted span,
 * a single tick at each seam, and the pack names set INTO the rule with the
 * panel's own colour behind them. They read top to bottom, which is what lets a
 * name a dozen characters long sit inside a gutter two characters wide -- and it
 * is also the direction the draft is running, so the label and the thing it
 * measures point the same way.
 */
function PackRule({ wells }: { wells: { packNo: number; at: number; length: number }[] }) {
  const seams = wells
    .slice(0, -1)
    .map((well, i) => (well.at + well.length + wells[i + 1].at) / 2);

  return (
    <div className="relative w-7 shrink-0" aria-hidden>
      <span
        className="absolute left-1/2 w-px -translate-x-1/2 bg-base-content/20"
        style={{ top: `${(LEAD / SPAN) * 100}%`, bottom: `${(PAD / SPAN) * 100}%` }}
      />
      {seams.map((y) => (
        <span
          key={y}
          className="absolute left-1/2 h-px w-2.5 -translate-x-1/2 -translate-y-1/2 bg-base-content/45"
          style={{ top: `${(y / SPAN) * 100}%` }}
        />
      ))}
      {wells.map((well) => (
        <span
          key={well.packNo}
          className="eyebrow absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-base-200 py-2 [writing-mode:vertical-rl]"
          style={{ top: `${((well.at + well.length / 2) / SPAN) * 100}%` }}
        >
          Pack {well.packNo}
        </span>
      ))}
    </div>
  );
}

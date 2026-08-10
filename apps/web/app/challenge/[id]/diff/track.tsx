"use client";

import type { DiffRow } from "@mtg-tutor/core";
import { PickTrack, type Tick, type TickState } from "../../../components/PickTrack";

/**
 * The whole comparison as forty-two marks.
 *
 * This screen used to say what it was in prose -- a warning-ruled paragraph
 * about drift, a second sentence about which rows were the same question, a
 * count buried in a panel header -- and then offered three separate lists of
 * places to go. The paragraph is the thing a reader skips and the thing they
 * most need, so it is drawn instead: one mark per pick, three states, in draft
 * order with the pack breaks showing.
 *
 * It is the same PickTrack the draft board and both review surfaces use, which
 * is the point. A reader arriving here has already learnt that a run of ticks is
 * their draft and that the lit one is where they are; the only new thing to
 * learn is what the three tones mean, and the legend beside it says so.
 *
 * Navigation, not decoration -- so the ticks are also what fixes the known gap
 * that the braid's forks could not be reached from a keyboard. PickTrack takes
 * one tab stop for the whole run and arrows within it.
 */

/**
 * Comparability first, agreement second, and in that order for a reason.
 *
 * `apart` swallows both of its cases -- two people who happened to take the same
 * card off different packs did not agree about anything, and drawing that as
 * agreement is the exact false claim this whole feature is shaped to avoid.
 */
export type DiffState = Extract<TickState, "agreed" | "fork" | "apart">;

export const stateOf = (row: DiffRow): DiffState =>
  !row.samePack ? "apart" : row.agree ? "agreed" : "fork";

/** One group per pack, which is what draws the breaks between them. */
export function trackGroups(rows: DiffRow[], them: string): Tick[][] {
  const groups = new Map<number, Tick[]>();

  for (const row of rows) {
    const state = stateOf(row);
    // Said in full: a screen reader gets this as the button's name with nothing
    // around it, so "P2P5" and a colour would be no sentence at all.
    const what =
      state === "agreed"
        ? `you both took ${row.yours.pickedName}`
        : state === "fork"
          ? `same pack — you took ${row.yours.pickedName}, ${them} took ${row.theirs.pickedName}`
          : `different packs — you took ${row.yours.pickedName}, ${them} took ${row.theirs.pickedName}`;

    const group = groups.get(row.packNo) ?? [];
    group.push({ state, label: `Pack ${row.packNo}, pick ${row.pickNo} — ${what}` });
    groups.set(row.packNo, group);
  }

  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, ticks]) => ticks);
}

export function DiffTrack({
  rows,
  them,
  at,
  onAt,
  label = "Every pick in both drafts, in order. Select one opens it in the pick-by-pick panel.",
  packLabels = true,
}: {
  rows: DiffRow[];
  them: string;
  at: number;
  onAt: (index: number) => void;
  // Two of these are drawn on the page, and which panel each one drives is the
  // only thing that differs between them -- exactly the part a screen reader
  // has no other way to know.
  //
  // IT NAMES THE PANEL AND NEVER A DIRECTION. These said "read it below" and
  // "read it above", which was true of one arrangement of the sections and was
  // quietly false the first time two of them traded places -- twice now. A
  // label that encodes the page's running order has to be re-checked every time
  // that order is touched, by somebody who has no reason to think of it, and it
  // is wrong in the meantime for the one reader who cannot see the layout and
  // so has to take it on trust. A panel's NAME survives being moved.
  label?: string;
  /**
   * Whether the track names its own packs and sits them in wells.
   *
   * Off under the braid, where the chart above has already drawn a floor per
   * pack and the ruler between them has already named it -- a third statement of
   * the same boundary, in a third notation. The wells also carry an inset, and
   * an inset is exactly what stops a tick landing under the pick it names.
   */
  packLabels?: boolean;
}) {
  // Off the rows' own pack numbers rather than counted from one, so the labels
  // cannot drift from the groups if a draft ever has fewer than three packs.
  const packNos = [...new Set(rows.map((r) => r.packNo))].sort((a, b) => a - b);

  return (
    <PickTrack
      groups={trackGroups(rows, them)}
      label={label}
      onSelect={onAt}
      here={Math.min(at, rows.length - 1)}
      groupLabels={packLabels ? packNos.map((n) => `Pack ${n}`) : undefined}
    />
  );
}

/**
 * The same track again, as the shelf's own footer, with the two arrows that make
 * it a stepper.
 *
 * The pick-by-pick panel is the one thing on this screen driven entirely from
 * somewhere else: the fork list and the braid's own track are both in other
 * sections, and by the time you have read one pack of fifteen cards neither is
 * on screen. Going to the next pick meant scrolling off to find a control, and
 * that is where a reader stops stepping. Which way you have to scroll depends on
 * an order that has changed twice; that there is nothing to hand does not.
 *
 * Drawn as the track and not as some new widget, because a reader who learnt the
 * ticks at the top of the page should not have to learn a second thing at the
 * bottom of it. Inside the panel rather than under it, because a transport that
 * floats loose beneath a bordered box belongs to the page, and this one belongs
 * to the shelf.
 *
 * The arrows carry where they go, in the shorthand drafters already use for it,
 * broken over two lines: the pack above the pick. Set as one run, P1P13 is a
 * different width at every pick, so the buttons breathed and the track between
 * them was re-measured on every step -- the one thing a reader stepping through
 * forty-two picks must never see. Stacked inside a button of FIXED width, the
 * same fact costs nothing: the longest line is three characters, the box is
 * sized for it once, and every step lands on a button that has not moved.
 *
 * The two of them and the track rest on one floor. A track centred against
 * something taller than it reads as floating in the strip rather than sitting at
 * the foot of the panel.
 *
 * No counter. The tones are named once, on the split rule at the top of the
 * page, and this copy carries its own pack labels -- a reader down here can
 * see which pack they are in and how far along it. Anything more would be the
 * panel's own header rule, restated.
 */
export function TrackStepper({
  rows,
  them,
  at,
  onAt,
}: {
  rows: DiffRow[];
  them: string;
  at: number;
  onAt: (index: number) => void;
}) {
  const here = Math.min(at, rows.length - 1);

  return (
    <div className="flex flex-col gap-2">
      {/* Above the control and not below it, so nothing sits between the track
          and the bottom of the panel. The house form for a key, per the draft
          board and the glossary. "Anywhere on the page" is the part worth
          saying: the page listens for these, so a reader does not have to find
          and focus the track first -- which is the whole reason to press a key
          instead of aiming at a tick. */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-base-content/45">
        <kbd className="kbd kbd-xs">←</kbd>
        <kbd className="kbd kbd-xs">→</kbd>
        to step, anywhere on the page
      </p>

      {/* Flanking at every width, which is what says the arrows step ALONG the
          track rather than sitting near it. They cost the ticks 120px, and
          dropping them to their own row on a narrow screen bought that back as
          two orphan buttons on an empty line -- a worse trade than thinner
          ticks. */}
      <div className="flex items-end gap-2">
        <Step way="Previous" glyph="←" to={rows[here - 1]} onClick={() => onAt(here - 1)} />
        <div className="min-w-0 flex-1">
          <DiffTrack
            rows={rows}
            them={them}
            at={here}
            onAt={onAt}
            label="Every pick in both drafts, in order. Select one to read it in this panel."
          />
        </div>
        <Step way="Next" glyph="→" trailing to={rows[here + 1]} onClick={() => onAt(here + 1)} />
      </div>
    </div>
  );
}

function Step({
  way,
  glyph,
  trailing,
  to,
  onClick,
}: {
  way: "Previous" | "Next";
  glyph: string;
  // The arrow sits on the side the reader is travelling towards.
  trailing?: boolean;
  // The pick it goes to, absent at the two ends of the draft -- which is what
  // disables the button, and what empties it back down to a bare arrow in a box
  // that is still exactly as wide as it was.
  to?: DiffRow;
  onClick: () => void;
}) {
  const coordinate = to && (
    <span aria-hidden className="flex flex-col items-center leading-tight tabular-nums">
      <span>P{to.packNo}</span>
      <span>P{to.pickNo}</span>
    </span>
  );

  return (
    <button
      type="button"
      // h-auto/min-h-0 because a daisyUI button is one line tall by contract and
      // this one is two. The width is fixed rather than fitted, which is the
      // whole point of stacking the label.
      className="btn btn-ghost h-auto min-h-0 w-[3.75rem] shrink-0 gap-1.5 border-base-300 px-2 py-1.5 text-[0.6875rem] font-semibold"
      aria-label={to ? `${way} pick — pack ${to.packNo}, pick ${to.pickNo}` : `${way} pick`}
      disabled={!to}
      onClick={onClick}
    >
      {!trailing && <Glyph>{glyph}</Glyph>}
      {coordinate}
      {trailing && <Glyph>{glyph}</Glyph>}
    </button>
  );
}

const Glyph = ({ children }: { children: string }) => (
  <span aria-hidden className="text-base font-normal leading-none text-base-content/50">
    {children}
  </span>
);

/**
 * Every pick sorted into the three things a pick can be, as one rule.
 *
 * This replaces a legend -- three swatches with three counts beside them -- and
 * the two sentences that were doing the same arithmetic in prose a few lines
 * above it ("you took the same card on 34 of 42 picks", "8 of 42 picks had the
 * same cards in front of both of you"). Three counts of one whole is a
 * proportion, and a reader should not have to do the division: 34, 5 and 3 in a
 * row says almost nothing, while a rule that is mostly one tone with two short
 * stretches in it says the whole finding at a glance -- you drafted this set
 * nearly the same way, and here is exactly how much of it was actually a
 * comparison.
 *
 * It is the page's legend as well, and it is placed first for that reason: the
 * three tones are learnt here, once, and then the braid and the track spend them
 * without explaining themselves again.
 *
 * COUNTED FROM `stateOf`, NOT FROM THE TALLY, and that is a correction rather
 * than a shortcut. `tally.agreed` is every row where the two of you took the
 * same card, INCLUDING rows where you were looking at different packs -- so
 * agreed + forks + apart could come to more than there are picks, and a bar
 * claiming to be a partition would have been quietly lying by a pick or two.
 * `stateOf` is the rule the track and the braid already draw by, and it does
 * partition: same pack and same card, same pack and not, or not the same pack.
 */
export function PickSplit({
  rows,
  orientation = "horizontal",
}: {
  rows: DiffRow[];
  /**
   * Which way the whole is divided.
   *
   * Vertical is not a second chart, it is this one stood up for a rail -- and
   * the legend goes with it: each entry grows by its own count exactly as its
   * segment does, so a label sits level with the stretch of rule it names and
   * the pair reads as one object rather than as a chart and a key. Laid across,
   * that trick is not available (the labels are wider than most segments), which
   * is why the horizontal form wraps its legend underneath instead.
   */
  orientation?: "horizontal" | "vertical";
}) {
  if (rows.length === 0) return null;

  const counts: Record<DiffState, number> = { agreed: 0, fork: 0, apart: 0 };
  for (const row of rows) counts[stateOf(row)]++;

  const parts = [
    {
      key: "agreed" as const,
      count: counts.agreed,
      tone: "bg-base-content/25",
      label: <>same card</>,
      spoken: "took the same card off the same pack",
    },
    {
      key: "fork" as const,
      count: counts.fork,
      tone: "bg-primary",
      label: (
        <>
          <span className="text-base-content/80">fork{counts.fork === 1 ? "" : "s"}</span> —
          same pack, you chose differently
        </>
      ),
      spoken: "forks: the same pack, and you chose differently",
    },
    {
      key: "apart" as const,
      count: counts.apart,
      tone: "bg-warning/45",
      label: <>different packs — not the same question</>,
      spoken: "off different packs, so not the same question",
    },
  ].filter((part) => part.count > 0);

  const spokenAll = `All ${rows.length} picks: ${parts
    .map((part) => `${part.count} ${part.spoken}`)
    .join("; ")}.`;

  if (orientation === "vertical") {
    return (
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          className="flex w-2 shrink-0 flex-col gap-[3px]"
          role="img"
          aria-label={spokenAll}
        >
          {parts.map((part) => (
            <span
              key={part.key}
              style={{ flexGrow: part.count, flexBasis: 0, minHeight: "0.375rem" }}
              className={`rounded-full ${part.tone}`}
            />
          ))}
        </div>

        <ul aria-hidden className="flex min-w-0 flex-1 flex-col text-xs text-base-content/60">
          {parts.map((part) => (
            <li
              key={part.key}
              // The same grow factor as its own segment, so the label is centred
              // against the stretch of rule it names -- with a floor, because a
              // single fork in forty-two is a fortieth of the rail and a label
              // squeezed under its own line height would sit on top of its
              // neighbour. The bar keeps the exact proportion either way; below
              // the floor the label is merely NEAR its segment rather than level
              // with it, which is the right thing to give up.
              style={{ flexGrow: part.count, flexBasis: 0, minHeight: "1.75rem" }}
              className="flex min-h-0 items-center"
            >
              <span className="leading-snug">
                <span className="font-semibold tabular-nums text-base-content/80">
                  {part.count}
                </span>{" "}
                {part.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* One rule, split where the draft splits. Each segment grows by its own
          count, so the widths ARE the proportions -- and they are parted by a
          hairline of page rather than butted, because three tones meeting edge
          to edge read as one bar with a gradient in it. */}
      <div
        className="flex h-2 gap-[3px]"
        role="img"
        aria-label={spokenAll}
      >
        {parts.map((part) => (
          <span
            key={part.key}
            // A floor, because a single fork in forty-two is a fortieth of the
            // rule and would round away to a smudge on a narrow screen -- and
            // one fork is exactly the case where a reader most needs to see
            // that there was one. Two picks of width costs the long segment
            // nothing anybody can measure.
            style={{ flexGrow: part.count, flexBasis: 0, minWidth: "0.375rem" }}
            className={`rounded-full ${part.tone}`}
          />
        ))}
      </div>

      <ul
        aria-hidden
        className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/60"
      >
        {parts.map((part) => (
          <li key={part.key} className="flex items-center gap-2">
            {/* The segment itself, cut short -- not a differently-shaped chip
                that happens to share a colour. */}
            <span aria-hidden className={`h-2 w-3 shrink-0 rounded-full ${part.tone}`} />
            <span>
              <span className="font-semibold tabular-nums text-base-content/80">
                {part.count}
              </span>{" "}
              {part.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

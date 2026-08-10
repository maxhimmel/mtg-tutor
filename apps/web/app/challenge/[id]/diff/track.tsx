"use client";

import type { ReactNode } from "react";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
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
export const stateOf = (row: DiffRow): TickState =>
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
  label = "Every pick in both drafts, in order. Select one to read it below.",
}: {
  rows: DiffRow[];
  them: string;
  at: number;
  onAt: (index: number) => void;
  // Two of these are drawn on the page now, and where the panel they drive sits
  // is the only thing that differs between them -- which is exactly the part a
  // screen reader has no other way to know.
  label?: string;
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
      groupLabels={packNos.map((n) => `Pack ${n}`)}
    />
  );
}

/**
 * The same track again, as the shelf's own footer, with the two arrows that make
 * it a stepper.
 *
 * The pick-by-pick panel is the one thing on this screen driven entirely from
 * somewhere else: the summary's track, the fork cards and the braid all sit
 * above it, and by the time you have read one pack of fifteen cards every one of
 * them is off the top of the window. Going to the next pick meant scrolling back
 * up to find a control, and that is where a reader stops stepping.
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
 * No counter. The tones are named once, beside the track that is a picture of
 * the draft, and this copy carries its own pack labels -- a reader down here can
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
            label="Every pick in both drafts, in order. Select one to read it above."
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
 * What the three tones mean, with the count that makes each one worth a look.
 *
 * The swatch is the tick itself at the height the track draws it, not a
 * differently-shaped chip that happens to share a colour -- a legend whose marks
 * are not the marks is a second thing to decode.
 */
export function TrackLegend({ tally }: { tally: DiffTally }) {
  const apart = tally.rows - tally.comparable;

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/60">
      <Swatch state="agreed" count={tally.agreed}>
        same card
      </Swatch>
      <Swatch state="fork" count={tally.forks.length}>
        <span className="text-base-content/80">
          fork{tally.forks.length === 1 ? "" : "s"}
        </span>{" "}
        — same pack, you chose differently
      </Swatch>
      <Swatch state="apart" count={apart}>
        different packs — not the same question
      </Swatch>
    </ul>
  );
}

function Swatch({
  state,
  count,
  children,
}: {
  state: "agreed" | "fork" | "apart";
  count: number;
  children: ReactNode;
}) {
  const tone =
    state === "agreed" ? "h-0.5 bg-base-content/25" : state === "fork" ? "h-1.5 bg-primary" : "h-1.5 bg-warning/45";

  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="flex h-1.5 w-3 items-end">
        <span className={`w-full rounded-full ${tone}`} />
      </span>
      <span>
        <span className="font-semibold tabular-nums text-base-content/80">{count}</span> {children}
      </span>
    </li>
  );
}

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
}: {
  rows: DiffRow[];
  them: string;
  at: number;
  onAt: (index: number) => void;
}) {
  // Off the rows' own pack numbers rather than counted from one, so the labels
  // cannot drift from the groups if a draft ever has fewer than three packs.
  const packNos = [...new Set(rows.map((r) => r.packNo))].sort((a, b) => a - b);

  return (
    <PickTrack
      groups={trackGroups(rows, them)}
      label="Every pick in both drafts, in order. Select one to read it below."
      onSelect={onAt}
      here={Math.min(at, rows.length - 1)}
      groupLabels={packNos.map((n) => `Pack ${n}`)}
    />
  );
}

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

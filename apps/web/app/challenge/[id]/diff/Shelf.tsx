"use client";

import type { ReactNode } from "react";
import type { DiffRow } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { gradeColor } from "../../../lib/format";
import { FaceCard, type Face } from "./faces";
import { Who } from "./sides";
import { stateOf } from "./track";

// Copied from the draft board so a pack reads at the same density it did when
// it was in front of you.
const PACK_GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5";

/**
 * One pick, with the whole shelf both cards came off.
 *
 * This exists because "they took the better card" and "they took the only other
 * playable in a bad pack" are different lessons, and nothing that renders two
 * cards can tell them apart. Fully controlled, so the pinned track, the fork
 * cards and the braid all drive it -- the overview and the detail are one
 * screen.
 *
 * The header used to say what happened in two runs of small grey text opposite
 * the title -- "different packs" and "Foo vs Bar" -- which is the least readable
 * place on the panel for the two facts a reader most needs. Both picks are now
 * named in full underneath it, each behind the dot that says whose it is.
 */
export function Shelf({
  rows,
  them,
  at,
  faceOf,
  footer,
}: {
  rows: DiffRow[];
  them: string;
  at: number;
  faceOf: (name: string, colors: readonly string[]) => Face;
  // Whatever moves it, drawn on its own bottom rule. Passed in rather than built
  // here because the shelf does not own `at` -- it is told which pick to show,
  // and a control it rendered itself would be reaching past its own props.
  footer?: ReactNode;
}) {
  const row = rows[Math.min(at, rows.length - 1)];
  if (!row) return null;

  const state = stateOf(row);
  const theirCardOnYourShelf = row.yours.pack.some((c) => c.name === row.theirs.pickedName);

  return (
    <Panel
      // The SECTION, named on its own header rule -- which is how the other
      // four on this page say what they are, and this one was the only one
      // naming itself on a loose line above the box while spending its header
      // on a coordinate. Which pick you are looking at is the thing that
      // changes, so it sits opposite the name, where the counts and badges on
      // every other panel sit.
      title="Pick by pick"
      aside={
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-xs font-semibold tabular-nums text-base-content/70">
            Pack {row.packNo}, pick {row.pickNo}
          </span>
          <span
            className={`badge badge-sm shrink-0 ${
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
        </span>
      }
      bodyClassName="gap-4"
      footer={footer}
    >
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-base-300 pb-3 text-sm">
        <Took mine label="You took" name={row.yours.pickedName} grade={row.yours.grade} />
        <Took label={`${them} took`} name={row.theirs.pickedName} grade={row.theirs.grade} />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className={`${PACK_GRID} flex-1`}>
          {row.yours.pack.map((c) => {
            const face = faceOf(c.name, c.colors);
            const mine = c.name === row.yours.pickedName;
            const theirs = c.name === row.theirs.pickedName;
            const marked = mine || theirs;

            return (
              <div key={c.name} className="flex flex-col gap-1.5">
                {/* Dimmed, not hidden -- and still hoverable, because "there
                    was nothing else playable in this pack" is a claim you can
                    only check by reading the cards nobody took. */}
                <span className={marked ? "" : "opacity-35 saturate-50 hover:opacity-100"}>
                  <FaceCard
                    face={face}
                    compact
                    className={mine ? "card-lit" : undefined}
                  />
                </span>
                {marked && (
                  <span className="flex flex-wrap gap-1">
                    {mine && (
                      <span className="badge badge-xs badge-primary">
                        You · {row.yours.grade}
                      </span>
                    )}
                    {theirs && (
                      <span className="badge badge-xs badge-outline">
                        {them} · {row.theirs.grade}
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* The single most useful thing on this screen, per the lab: their
            card shown BESIDE the shelf it is missing from. Without it a
            reader assumes they passed on your pack; with it they can see
            there was no choice here to compare theirs against. */}
        {!theirCardOnYourShelf && !row.agree && (
          <aside className="flex shrink-0 flex-col gap-2 rounded-box border border-warning/40 bg-base-100 p-3 xl:w-[13rem]">
            <span className="eyebrow text-warning">Not on this shelf</span>
            <TheirCard row={row} them={them} faceOf={faceOf} />
            <p className="text-xs leading-relaxed text-base-content/65">
              <strong className="font-semibold">{row.theirs.pickedName}</strong> was never
              in your pack. By this pick their pod had drifted from yours, so they took it
              off a pack you never saw — there is no choice here to compare theirs against.
            </p>
          </aside>
        )}
      </div>
    </Panel>
  );
}

function Took({
  mine,
  label,
  name,
  grade,
}: {
  mine?: boolean;
  label: string;
  name: string;
  grade: string;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <Who mine={mine}>{label}</Who>
      <strong className="font-semibold">{name}</strong>
      <span
        className="font-display text-sm font-semibold tabular-nums"
        style={{ color: gradeColor(grade) }}
      >
        {grade}
      </span>
    </span>
  );
}

function TheirCard({
  row,
  them,
  faceOf,
}: {
  row: DiffRow;
  them: string;
  faceOf: (name: string, colors: readonly string[]) => Face;
}) {
  const colors = row.theirs.pack.find((c) => c.name === row.theirs.pickedName)?.colors ?? [];
  const face = faceOf(row.theirs.pickedName, colors);

  return (
    <span className="flex flex-col gap-1.5">
      <FaceCard face={face} compact />
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <Who>{them} took</Who>
        <span
          className="font-display text-sm font-semibold tabular-nums"
          style={{ color: gradeColor(row.theirs.grade) }}
        >
          {row.theirs.grade}
        </span>
      </span>
    </span>
  );
}

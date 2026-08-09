"use client";

import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { CardFace } from "../../../components/CardTile";
import { Panel } from "../../../components/Panel";
import { gradeColor } from "../../../lib/format";
import type { Face } from "./faces";

// Copied from the draft board so a pack reads at the same density it did when
// it was in front of you.
const PACK_GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5";

/**
 * One pick, with the whole shelf both cards came off.
 *
 * This exists because "they took the better card" and "they took the only other
 * playable in a bad pack" are different lessons, and nothing that renders two
 * cards can tell them apart. Fully controlled, so the hero's forks and the
 * braid's nodes drive it -- the overview and the detail are one screen.
 */
export function Shelf({
  rows,
  tally,
  at,
  faceOf,
  onAt,
  onTick,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  at: number;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onAt: (index: number) => void;
  onTick: (index: number) => void;
}) {
  const row = rows[Math.min(at, rows.length - 1)];
  if (!row) return null;

  const forkIndices = tally.forks.map((f) => f.pickIndex);
  const theirCardOnYourShelf = row.yours.pack.some((c) => c.name === row.theirs.pickedName);

  return (
    <>
      <Panel
        title={`Pack ${row.packNo}, pick ${row.pickNo}`}
        aside={
          <span className="flex items-center gap-2 text-xs">
            {row.samePack ? (
              <span className="text-base-content/50">same pack</span>
            ) : (
              <span className="text-warning">different packs</span>
            )}
            <span className={row.agree ? "text-base-content/50" : "text-warning"}>
              {row.agree
                ? `you both took ${row.yours.pickedName}`
                : `${row.yours.pickedName} vs ${row.theirs.pickedName}`}
            </span>
          </span>
        }
      >
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className={`${PACK_GRID} flex-1`}>
            {row.yours.pack.map((c) => {
              const face = faceOf(c.name, c.colors);
              const mine = c.name === row.yours.pickedName;
              const theirs = c.name === row.theirs.pickedName;
              const marked = mine || theirs;

              return (
                <div key={c.name} className="flex flex-col gap-1.5">
                  <span className={marked ? "" : "opacity-35 saturate-50"}>
                    {face.card ? (
                      <CardFace card={face.card} className={mine ? "card-lit" : undefined} />
                    ) : (
                      <span className="card-aspect flex w-full items-center justify-center rounded-xl border border-dashed border-base-content/25 bg-base-200 p-2 text-center text-xs">
                        {face.name}
                      </span>
                    )}
                  </span>
                  {marked && (
                    <span className="flex flex-wrap gap-1">
                      {mine && (
                        <span className="badge badge-xs badge-primary">
                          you · {row.yours.grade}
                        </span>
                      )}
                      {theirs && (
                        <span className="badge badge-xs badge-outline">
                          them · {row.theirs.grade}
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
              <TheirCard row={row} faceOf={faceOf} />
              <p className="text-xs leading-relaxed text-base-content/65">
                <strong className="font-semibold">{row.theirs.pickedName}</strong> was never
                in your pack. By this pick their pod had drifted from yours, so they took it
                off a pack you never saw — there is no choice here to compare theirs against.
              </p>
            </aside>
          )}
        </div>
      </Panel>

      {/* Three ways into the same place, and the bar is the one that shows the
          shape of the draft: every fork ticked along it at once. */}
      <div className="popup-surface sticky bottom-4 z-30 mt-3 flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={rows.length - 1}
            value={Math.min(at, rows.length - 1)}
            onChange={(e) => onAt(Number(e.currentTarget.value))}
            aria-label="Pick"
            className="range range-xs flex-1"
          />
          <span className="whitespace-nowrap text-xs tabular-nums text-base-content/60">
            {row.pickIndex + 1} / {rows.length}
          </span>
        </div>

        {forkIndices.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {forkIndices.map((i) => (
              <button
                key={i}
                aria-label={`Fork at pick ${i + 1}`}
                onClick={() => onTick(i)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i === row.pickIndex ? "bg-primary" : "bg-base-content/30 hover:bg-base-content/60"
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-base-content/45">
              ← → step a pick · {forkIndices.length} fork
              {forkIndices.length === 1 ? "" : "s"}, marked here
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function TheirCard({
  row,
  faceOf,
}: {
  row: DiffRow;
  faceOf: (name: string, colors: readonly string[]) => Face;
}) {
  const colors = row.theirs.pack.find((c) => c.name === row.theirs.pickedName)?.colors ?? [];
  const face = faceOf(row.theirs.pickedName, colors);

  return (
    <span className="flex flex-col gap-1.5">
      {face.card ? (
        <CardFace card={face.card} />
      ) : (
        <span className="card-aspect flex w-full items-center justify-center rounded-xl border border-dashed border-base-content/25 bg-base-200 p-2 text-center text-xs">
          {face.name}
        </span>
      )}
      <span className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">They took</span>
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

"use client";

import { releaseDate } from "../lib/format";
import type { SetSummary } from "../lib/sets";
import { SetIcon } from "./SetIcon";

// The browsing half of the picker: one plate per set, scanned by symbol and
// name. Lifted out of page.tsx unchanged when the list view landed beside it --
// the two views are peers, so neither should be the one that lives inline.
export function SetGrid({
  sets,
  starting,
  onStart,
}: {
  sets: SetSummary[];
  // Code of the set currently being opened, if any.
  starting: string | null;
  onStart: (setCode: string, format: string) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {sets.map((s) => (
        <button
          key={`${s.code}-${s.format}`}
          type="button"
          className="group card relative cursor-pointer overflow-hidden border border-base-300 bg-base-200 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onStart(s.code, s.format)}
          disabled={starting !== null}
        >
          {/* A set symbol is the mark a set stamps on every card in it, so it
              gets to be the thing that identifies the set here too -- oversized
              and bled off the corner, behind the type rather than beside it. */}
          <SetIcon
            uri={s.iconUri}
            className="pointer-events-none absolute -right-4 -top-3 size-28 text-base-content/[0.07] transition-colors group-hover:text-primary/20"
          />

          <span className="relative flex flex-col gap-1">
            <span className="font-display text-lg font-semibold leading-tight">
              {s.name ?? s.code.toUpperCase()}
            </span>
            <span className="eyebrow">
              {s.code.toUpperCase()} · {s.format}
            </span>
            <span className="mt-2 text-sm tabular-nums text-base-content/60">
              {s.cardCount} cards · {s.ratedCardCount} with 17Lands data
            </span>
            <span className="text-sm text-base-content/60">
              {starting === s.code ? "Starting…" : releaseDate(s.releasedAt)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

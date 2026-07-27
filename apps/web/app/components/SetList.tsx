"use client";

import { useMemo, useState } from "react";
import { releaseDate } from "../lib/format";
import type { SetSummary } from "../lib/sets";
import { SetIcon } from "./SetIcon";

type SortKey = "name" | "releasedAt" | "cardCount" | "ratedCardCount";
type Direction = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Set" },
  { key: "releasedAt", label: "Released" },
  { key: "cardCount", label: "Cards", numeric: true },
  { key: "ratedCardCount", label: "17Lands", numeric: true },
];

// Which way a column runs the first time it is clicked. Counts and dates open
// on their largest value, because "newest" and "best covered" are what anyone
// asks a set list first; names open alphabetically.
const OPENING_DIRECTION: Record<SortKey, Direction> = {
  name: "asc",
  releasedAt: "desc",
  cardCount: "desc",
  ratedCardCount: "desc",
};

const sortValue = (set: SetSummary, key: SortKey): string | number | undefined => {
  switch (key) {
    case "name":
      return (set.name ?? set.code).toLowerCase();
    case "releasedAt":
      return set.releasedAt;
    case "cardCount":
      return set.cardCount;
    case "ratedCardCount":
      return set.ratedCardCount;
  }
};

// A set missing the sorted field sorts last in both directions rather than
// riding to the top on a reverse -- the same rule `sets.list` already applies to
// undated sets, and the only one that keeps "sorted by X" honest for rows that
// have no X at all.
function compareSets(
  a: SetSummary,
  b: SetSummary,
  key: SortKey,
  direction: Direction,
): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);

  if (left == null || right == null) {
    if (left == null && right == null) return a.code.localeCompare(b.code);
    return left == null ? 1 : -1;
  }

  const order =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right));

  return (direction === "asc" ? order : -order) || a.code.localeCompare(b.code);
}

export function SetList({
  sets,
  starting,
  onStart,
}: {
  sets: SetSummary[];
  // Code of the set currently being opened, if any.
  starting: string | null;
  onStart: (setCode: string, format: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({
    key: "releasedAt",
    direction: "desc",
  });

  const sorted = useMemo(
    () => [...sets].sort((a, b) => compareSets(a, b, sort.key, sort.direction)),
    [sets, sort],
  );

  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: OPENING_DIRECTION[key] },
    );

  return (
    <div className="card overflow-x-auto border border-base-300 bg-base-200">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={column.numeric ? "text-right" : undefined}
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={`eyebrow inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-base-content ${
                      active ? "text-primary" : ""
                    }`}
                  >
                    {column.label}
                    <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                      {sort.direction === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th scope="col">
              <span className="sr-only">Start a draft</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((set) => {
            const isStarting = starting === set.code;
            const name = set.name ?? set.code.toUpperCase();

            return (
              <tr
                key={`${set.code}-${set.format}`}
                className="transition-colors hover:bg-base-300/40"
              >
                <th scope="row" className="font-normal">
                  <span className="flex items-center gap-3">
                    <SetIcon uri={set.iconUri} className="size-6 text-base-content/50" />
                    <span className="flex flex-col">
                      <span className="font-display font-semibold leading-tight">
                        {name}
                      </span>
                      <span className="eyebrow">
                        {set.code.toUpperCase()} · {set.format}
                      </span>
                    </span>
                  </span>
                </th>

                <td className="whitespace-nowrap tabular-nums text-base-content/70">
                  {releaseDate(set.releasedAt) ?? "—"}
                </td>

                <td className="text-right tabular-nums text-base-content/70">
                  {set.cardCount}
                </td>

                {/* Zero here is not a small number, it is a different kind of
                    set: 17Lands stops publishing win rates once a format leaves
                    rotation, and those grades fall back to rarity alone. */}
                <td
                  className={`text-right tabular-nums ${
                    set.ratedCardCount === 0 ? "text-warning" : "text-base-content/70"
                  }`}
                >
                  {set.ratedCardCount}
                </td>

                <td className="text-right">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => onStart(set.code, set.format)}
                    disabled={starting !== null}
                    aria-label={`Draft ${name}`}
                  >
                    {isStarting ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        Opening…
                      </>
                    ) : (
                      "Draft"
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
            <th scope="col" className="w-0">
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
                className={`group relative transition-colors has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-primary ${
                  starting === null ? "hover:bg-base-300/40" : ""
                } ${isStarting ? "bg-base-300/40" : ""}`}
              >
                <th scope="row" className="font-normal">
                  <span className="flex items-center gap-3">
                    <SetIcon
                      uri={set.iconUri}
                      className={`size-6 transition-colors ${
                        isStarting ? "text-primary" : "text-base-content/50"
                      } ${
                        starting === null ? "group-hover:text-primary" : ""
                      }`}
                    />
                    <span className="flex flex-col">
                      {/* The row is the button: a real <button> keeps the
                          keyboard and screen-reader path intact, and its
                          stretched ::after is what makes the whole row the hit
                          target. */}
                      <button
                        type="button"
                        onClick={() => onStart(set.code, set.format)}
                        disabled={starting !== null}
                        aria-label={`Draft ${name}`}
                        className={`text-left font-display font-semibold leading-tight transition-colors after:absolute after:inset-0 after:content-[''] focus-visible:outline-none ${
                          starting === null
                            ? "cursor-pointer group-hover:text-primary"
                            : "cursor-not-allowed after:cursor-default"
                        }`}
                      >
                        {name}
                      </button>
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

                {/* Not a second control. At rest the row only carries a
                    dog-eared corner -- the crease a page keeps when someone
                    has been turning it -- and the fold peels further open,
                    with the word it stands for, once the row is live. */}
                <td className="relative whitespace-nowrap pr-7 text-right">
                  {isStarting ? (
                    <span className="inline-flex items-center gap-2 text-xs text-primary">
                      <span className="loading loading-spinner loading-xs" />
                      Opening…
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary opacity-0 transition-opacity ${
                        starting === null
                          ? "group-hover:opacity-100 group-has-[button:focus-visible]:opacity-100"
                          : ""
                      }`}
                    >
                      Draft
                    </span>
                  )}

                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute bottom-0 right-0 transition-all duration-200 before:absolute before:inset-0 before:bg-base-200 before:[clip-path:polygon(100%_0,100%_100%,0_100%)] after:absolute after:inset-0 after:transition-colors after:[clip-path:polygon(0_0,100%_0,0_100%)] ${
                      isStarting
                        ? "size-5 after:bg-primary"
                        : `size-3 after:bg-base-content/15 ${
                            starting === null
                              ? "group-hover:size-5 group-hover:after:bg-primary group-has-[button:focus-visible]:size-5 group-has-[button:focus-visible]:after:bg-primary"
                              : ""
                          }`
                    }`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

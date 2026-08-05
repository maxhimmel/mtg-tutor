"use client";

import { useRef, type KeyboardEvent } from "react";

// A draft, drawn as the thing it is: a run of picks in order.
//
// This is the app's one structural mark, and it is the same on the board and in
// the review because it says the same thing in both -- here is the sequence,
// here is where you are in it. On the board the ticks are only position; in the
// review they also carry how each pick went, which is the review's whole
// subject.
//
// It is drawn AS the page heading's rule rather than under one, so it costs no
// height beyond the border it replaces.
export type TickState = "ahead" | "past" | "current" | "hit" | "miss";

export interface Tick {
  state: TickState;
  // What this tick is, said in full -- a screen reader gets it as the button's
  // name, so it has to stand alone: "Pack 2, pick 5" and not "5".
  label: string;
}

// Ahead and past differ by weight alone, so the track reads as a rule that has
// been filled up to a point. The graded pair are the app's own grade colours
// (see gradeColor in lib/format), and gold is where you are -- the same thing it
// means on a card you are holding.
const TONE: Record<TickState, string> = {
  ahead: "bg-base-content/15",
  past: "bg-base-content/40",
  current: "bg-primary",
  hit: "bg-success/60",
  miss: "bg-warning/70",
};

const bar = (state: TickState) =>
  `w-full rounded-full ${TONE[state]} ${state === "current" ? "h-1.5" : "h-0.5"}`;

/**
 * @param groups One array per pack. The gaps between them are the pack breaks,
 * which is the only thing that says where one pack ended and the next began.
 * @param label The whole track in one sentence, for anyone who cannot see it.
 * @param onSelect Makes every tick a place to go. Omitted, the track is a
 * picture: forty-two focus stops that lead nowhere is not navigation.
 */
export function PickTrack({
  groups,
  label,
  onSelect,
}: {
  groups: Tick[][];
  label: string;
  onSelect?: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const flat = groups.flat();

  // One tab stop for the whole track, arrows to move within it -- the same
  // bargain a radio group makes, and for the same reason: a review has twenty-odd
  // decisions in it, and tabbing past twenty-odd ticks to reach the page is worse
  // than not being able to reach them at all. The stop is wherever you are; with
  // nothing current (a finished review) it is the start.
  const stop = Math.max(
    0,
    flat.findIndex((tick) => tick.state === "current"),
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect) return;
    const to =
      e.key === "ArrowLeft"
        ? stop - 1
        : e.key === "ArrowRight"
          ? stop + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? flat.length - 1
              : null;
    if (to === null) return;

    e.preventDefault();
    const next = Math.min(flat.length - 1, Math.max(0, to));
    onSelect(next);
    // Moved by hand rather than left to the render: the buttons are a stable
    // list, so this one is already on screen and only its tabIndex is about to
    // change under it.
    ref.current?.querySelectorAll("button")[next]?.focus();
  }

  // Where each group starts in the flat run of picks, so a tick can report the
  // index its caller thinks in without every caller passing one.
  let offset = 0;

  return (
    <div
      ref={ref}
      className="flex items-end gap-3"
      // A picture of a draft, or a set of places to go. Nothing in between.
      {...(onSelect ? { role: "group", onKeyDown } : { role: "img" })}
      aria-label={label}
    >
      {groups.map((ticks, group) => {
        const start = offset;
        offset += ticks.length;

        return (
          <div key={group} className="flex flex-1 items-end gap-[3px]">
            {ticks.map((tick, i) =>
              onSelect ? (
                <button
                  key={i}
                  type="button"
                  // Padding rather than a taller bar: a 2px line is not a click
                  // target, and growing it to be one would make the rule heavy
                  // enough to compete with the page it sits under.
                  className="group flex flex-1 cursor-pointer items-end rounded-sm py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/70"
                  aria-label={tick.label}
                  aria-current={tick.state === "current" ? "true" : undefined}
                  tabIndex={start + i === stop ? 0 : -1}
                  onClick={() => onSelect(start + i)}
                >
                  {/* Grows rather than changes colour: the colours already mean
                      something here, and hover only means "this is where you
                      would land". */}
                  <span
                    className={`${bar(tick.state)} motion-safe:transition-[height] group-hover:h-1.5`}
                  />
                </button>
              ) : (
                <span key={i} className={bar(tick.state)} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

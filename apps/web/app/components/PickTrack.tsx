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
//
// The two plain states are pushed as far apart as they go, and the reason is
// that finding yourself on this track used to mean hunting a 6px gold sliver
// among forty-five hairlines. It is not the gold that should be doing that work:
// with picks made bright and picks ahead almost invisible, the boundary between
// them IS the position, readable across the whole width at a glance. The gold
// then only has to say exactly which pick, over a distance of one tick.
const TONE: Record<TickState, string> = {
  ahead: "bg-base-content/10",
  past: "bg-base-content/65",
  current: "bg-primary",
  hit: "bg-success/60",
  miss: "bg-warning/70",
};

// Height carries the same boundary the tone does, and it is the half that works
// on the first pick of a draft. Tone alone says nothing until there is something
// past to be brighter than: at P1P1 every tick is `ahead` and the fill has
// nothing to fill, so the track looked identical to the one before it. A made
// pick standing twice as tall as an unmade one is a silhouette, and a silhouette
// is legible at a glance in a way that a tone step on a 2px line is not.
const HEIGHT: Record<TickState, string> = {
  ahead: "h-0.5",
  past: "h-1",
  current: "h-2",
  hit: "h-1",
  miss: "h-1",
};

// `ahead` is the one tone that depends on what the track IS, and the same
// `onSelect` that decides picture-or-navigation decides this. On the board a
// pick not yet made can recede to almost nothing, because that is what opens the
// boundary the position is read from. In the review every tick is a place to go,
// and a target you cannot see is not one -- so there, ahead stays aimable.
const AHEAD_NAVIGABLE = "bg-base-content/30";

// `relative` only so the ticks paint over the pack numeral behind them. An
// absolutely positioned element paints after every static sibling regardless of
// DOM order, so without this the numeral would sit on top of the rule it is
// meant to be stamped behind.
const bar = (state: TickState, navigable: boolean) =>
  `relative w-full rounded-full ${
    state === "ahead" && navigable ? AHEAD_NAVIGABLE : TONE[state]
  } ${HEIGHT[state]}`;

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
          <div key={group} className="relative flex flex-1 items-end gap-[3px]">
            {/* Which pack, stamped behind its own run of ticks. Absolutely
                positioned and centred on the rule, so the numeral bleeds into
                the whitespace the heading already has above and below and the
                track costs no more height than the border it replaces.

                It began at the same few percent the set's mark is drawn at
                behind the pack, and was invisible. That opacity works there
                because the mark is some seventeen hundred pixels tall -- area is
                what lets a low-contrast thing read, and a 24px glyph has none of
                it. At 9% this sat about six points of lightness above the page,
                which is nothing you can see. 22% is roughly fifteen, which is a
                ghost you can actually read, and the made ticks at 65% still draw
                cleanly over the top of it.

                Only where there is more than one group. A lone "1" names
                nothing; it is the three of them together that turn the gaps
                into pack breaks rather than an unexplained rhythm. */}
            {groups.length > 1 && (
              <span
                aria-hidden
                // Hung off the bottom edge rather than the middle, because the
                // middle moves: a group's height is whatever its tallest tick
                // is, so the pack holding the current pick is taller than the
                // others and its numeral would sit a few pixels low. `items-end`
                // means the bottom edge is the one line all three groups share.
                className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 select-none font-display text-2xl font-semibold leading-none tracking-tight text-base-content/[0.22]"
              >
                {group + 1}
              </span>
            )}
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
                    className={`${bar(tick.state, true)} motion-safe:transition-[height] group-hover:h-2`}
                  />
                </button>
              ) : (
                <span key={i} className={bar(tick.state, false)} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

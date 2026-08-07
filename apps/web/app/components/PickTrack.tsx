"use client";

import { useRef, type KeyboardEvent } from "react";

// A draft, drawn as the thing it is: a run of picks in order.
//
// It has two forms, and which one you get follows from what the caller passes
// rather than from a flag.
//
// A track of PACKS -- more than one group, and no onSelect -- draws as the packs
// themselves. The one you are in is open, showing its picks; the other two are
// folded shut into card marks, filled where the pack is spent. That is the draft
// board, and it is the only caller shaped that way. Folding is what makes the
// current pick findable: fourteen ticks across most of the width instead of
// forty-two across all of it, so the pick you are on is one of fourteen.
//
// A single run -- one group -- draws as a rule that fills up to a point. Both
// review surfaces are that: a flat sequence of decision picks with no pack
// structure to fold, where the ticks also carry how each pick went, which is the
// review's whole subject. Only there is the track ever navigation.
//
// The two conditions on folding are one idea, not two. A folded pack has no
// reachable ticks in it, so a track that folds cannot also be a set of places to
// go; a caller that wants both gets the flat form, which can be.
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
  ahead: "bg-base-content/10",
  past: "bg-base-content/65",
  current: "bg-primary",
  hit: "bg-success/60",
  miss: "bg-warning/70",
};

// `ahead` is the one tone that depends on what the track IS, and the same
// `onSelect` that decides picture-or-navigation decides this. A pick not yet
// made can recede to almost nothing where the track is a picture. In the review
// every tick is a place to go, and a target you cannot see is not one -- so
// there, ahead stays aimable.
const AHEAD_NAVIGABLE = "bg-base-content/30";

const bar = (state: TickState, navigable: boolean) =>
  `w-full rounded-full ${state === "ahead" && navigable ? AHEAD_NAVIGABLE : TONE[state]} ${
    state === "current" ? "tick-lit h-1.5" : "h-0.5"
  }`;

/**
 * @param groups One array per pack. The gaps between them are the pack breaks,
 * which is the only thing that says where one pack ended and the next began --
 * and with more than one group they are what folds.
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
  if (groups.length > 1 && !onSelect) {
    return <PackAccordion groups={groups} label={label} />;
  }
  return <FlatTrack groups={groups} label={label} onSelect={onSelect} />;
}

const CARD_W = "0.875rem"; // 14px: a pack seen closed, at a card's proportion
const OPEN_H = "1.75rem"; // 28px: a tick row with air around it
const SHUT_H = "1.25rem"; // 20px

// The fold. Everything that distinguishes an open pack from a closed one travels
// at once -- width, height, fill, border -- because they are one object doing one
// thing, not four properties being animated in sympathy.
//
// 500ms was checked against the real thing rather than reasoned about, and it
// stays. A pack break is also when the board sends fifteen cards across the
// screen (see animate-pass / animate-keep in DraftBoard), so both fire on the
// same beat -- which looked like one animation too many right up until it was
// drafted with, and is not. The two do not compete: the fold is a small object
// closing under the heading and the pack travels through the whole middle of the
// page, so they are separate events that happen to rhyme rather than two things
// asking for the same attention.
//
// If it is ever changed, change it here and nowhere else -- the tick fade below
// derives from it, and the ticks have to be gone before the box is narrow enough
// to smear them.
const FOLD_MS = 500;
const FOLD = `motion-safe:transition-[flex-grow,flex-basis,height,background-color,border-color] motion-safe:ease-[cubic-bezier(.22,1,.36,1)]`;

function PackFold({
  ticks,
  open,
  spent,
}: {
  ticks: Tick[];
  open: boolean;
  spent: boolean;
}) {
  return (
    <div
      aria-hidden
      style={{
        flexGrow: open ? 1 : 0,
        flexBasis: open ? 0 : CARD_W,
        height: open ? OPEN_H : SHUT_H,
        transitionDuration: `${FOLD_MS}ms`,
      }}
      className={`${FOLD} overflow-hidden rounded-[4px] border ${
        open
          ? "border-base-300 bg-base-200/60"
          : spent
            ? "border-base-content/45 bg-base-content/45"
            : "border-base-content/25"
      }`}
    >
      {/* Gone well before the box is narrow enough to crush it, which is the
          only reason the fold can be this quick without the ticks smearing. */}
      <div
        className={`flex h-full items-center gap-1.5 px-2.5 motion-safe:transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${Math.round(FOLD_MS * 0.3)}ms` }}
      >
        {ticks.map((tick, i) => (
          <span
            key={i}
            className={`flex-1 rounded-full ${
              tick.state === "current"
                ? "tick-lit h-2 bg-primary"
                : tick.state === "past"
                  ? "h-1 bg-base-content/65"
                  : "h-1 bg-base-content/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Chunkier than the flat track's ticks and further apart -- 4px at 25% with 6px
// gaps, against 2px at 10%. Inside a bordered card that is the right register: a
// row of objects rather than a hairline. The open pack has the width to afford
// it, which is the whole reason for folding the other two.
function PackAccordion({ groups, label }: { groups: Tick[][]; label: string }) {
  // The pack holding the current pick is the open one. Nothing current means the
  // draft is over and there is no pack to be in, so all of them fold and fill --
  // which is a finished draft saying so.
  const open = groups.findIndex((ticks) => ticks.some((t) => t.state === "current"));

  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={label}>
      {groups.map((ticks, i) => (
        <PackFold
          key={i}
          ticks={ticks}
          open={i === open}
          spent={open === -1 || i < open}
        />
      ))}
    </div>
  );
}

function FlatTrack({
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
                    className={`${bar(tick.state, true)} motion-safe:transition-[height] group-hover:h-1.5`}
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

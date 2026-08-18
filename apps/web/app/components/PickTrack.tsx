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
//
// The last three states belong to the challenge comparison, where a tick carries
// how one pick went for TWO drafters rather than one. They live here rather than
// in a track of the diff's own because a comparison is still a run of picks in
// order, and a second component drawing that would have been the app teaching
// two rules for one shape -- and would have had to reinvent the pack breaks, the
// single tab stop, and the halo that says where the reader is.
export type TickState =
  | "ahead"
  | "past"
  | "current"
  | "hit"
  | "miss"
  | "stood"
  | "agreed"
  | "fork"
  | "apart";

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
// A miss is `error`, not `warning`, and the reason is the page it sits on rather
// than the tick itself. The review marks a pack's cards with the same four
// colours every time: blue for the card you took, ORANGE FOR THE RAW-BEST, green
// for the card that was right for your deck. A track drawing its misses in
// orange therefore said "raw-best" a dozen times over about picks where the
// raw-best was the card you did not take -- the exact opposite claim, in the
// colour that makes it. Red is the one grade colour the marks do not use, and it
// is already what this app means by a pick that went wrong: gradeFor sends D and
// F here, and the walkthrough writes "✗ not this time" in it two inches away.
// `stood` belongs to the misses drill, where a question can come back a third
// way: you were dealt a pick you got wrong, and you made the same call again.
// That is not a hit and the drill refuses to call it a failure -- it is a
// disagreement with the grader rather than a slip. Blue rather than a fifth
// hue, because blue is already what this app marks THE CARD YOU TOOK with (see
// PickMarks), and standing by a pick is precisely answering with that card. The
// tick and the mark on the card it refers to are then the same colour saying
// the same thing, which is the test any new state here has to pass.
//
// The comparison's three read as one sentence: nothing happened, a decision
// happened, or the question was not the same one. Agreeing is the hairline,
// because forty of forty-two picks agree and a track that draws them all at full
// weight is a solid bar with the two interesting marks hidden in it.
//
// A fork is gold for the same reason `current` is: it is the pick with something
// in it for you. `apart` is warning because that is already the colour this
// feature says drift in -- and it is deliberately NOT one of the grade colours
// doing grade work, since a pick off a different pack has not been judged badly,
// it has not been judged at all.
const TONE: Record<TickState, string> = {
  ahead: "bg-base-content/10",
  past: "bg-base-content/65",
  current: "bg-primary",
  hit: "bg-success/60",
  miss: "bg-error/70",
  stood: "bg-info/60",
  agreed: "bg-base-content/25",
  fork: "bg-primary",
  apart: "bg-warning/45",
};

// `ahead` is the one tone that depends on what the track IS, and the same
// `onSelect` that decides picture-or-navigation decides this. A pick not yet
// made can recede to almost nothing where the track is a picture. In the review
// every tick is a place to go, and a target you cannot see is not one -- so
// there, ahead stays aimable.
const AHEAD_NAVIGABLE = "bg-base-content/30";

// A tick that carries a result is an object; a tick that only carries a position
// is a rule. So `hit`, `miss` and `current` all stand at the same height and the
// ungraded pair stay a hairline -- which is also what stops the review's two
// surfaces drawing the same draft at two different weights, the breakdown's
// graded track being a 2px line where the walkthrough's is 6px.
//
// Where you ARE is still not said with size. It is said with the halo (see
// tick-lit in globals.css), for the reason recorded there: a tick is too small
// for size or colour alone to be findable among forty-four siblings.
const TALL: TickState[] = ["current", "hit", "miss", "stood", "fork", "apart"];

// The tick you are ON is an object too, whatever it happens to say. That is the
// one exception, and it is not an exception to the idea above so much as the
// other half of it: where you are is a fact about the READER, and it does not
// get smaller because the pick it landed on was uneventful.
//
// The comparison is where that bit, because forty of its forty-two picks are
// agreements -- so the reader's own position was drawn at hairline weight almost
// every time they moved it, and stepping from a fork onto an agreement felt like
// the selection had shrunk rather than moved. The halo needs a body to sit on as
// well: over 2px it reads as a smudge on the rule instead of a mark on a tick.
//
// It costs no layout, for the same reason the swell does not: a track with any
// graded tick in it is already this tall, so promoting one changes nothing. A
// track of nothing but agreements is 4px taller from its first paint and stays
// there, since exactly one tick is here at a time.
const bar = (state: TickState, navigable: boolean, here: boolean) =>
  `w-full rounded-full ${state === "ahead" && navigable ? AHEAD_NAVIGABLE : TONE[state]} ${
    state === "current" ? "tick-lit h-1.5" : here || TALL.includes(state) ? "h-1.5" : "h-0.5"
  }`;

// The tick the page is scrolled to, which is not the same claim as `current`.
// `current` is where you are in the DRAFT -- the pick being stepped through, the
// one not yet made. This is where you are in the PAGE, and on the breakdown it
// is the only one of the two that exists: the draft is over, every tick is a
// result, and what moves is the reader.
//
// So it is drawn on top of whatever the tick already says rather than replacing
// it. A tick keeps its grade colour and gains the halo -- which is what the halo
// was for (see tick-lit in globals.css: a mark this small cannot be found by
// colour or height, and area is what the eye lands on).
//
// The swell is scaleY, not height, for the reason tick-arrive gives: a transform
// is painted and never measured, so the track does not change height as you
// scroll and the page under it does not move. Growing from the bottom, because
// the ticks sit on a common baseline.
const HERE = "tick-lit origin-bottom motion-safe:scale-y-[1.7] motion-safe:duration-200";

// The thread of page between one tick and the next, as padding on the tick's own
// box rather than as a gap in the row. Identical to look at -- the bar inside is
// exactly where a 3px gap put it -- and it buys the one thing a gap cannot: every
// tick's box is now exactly its share of the run, so a tick sits directly under
// the pick it names on any chart drawn to the same width. It also makes the two
// end ticks' targets a shade wider, which is free.
const TICK_X = "px-[1.5px]";

/**
 * @param groups One array per pack. The gaps between them are the pack breaks,
 * which is the only thing that says where one pack ended and the next began --
 * and with more than one group they are what folds.
 * @param label The whole track in one sentence, for anyone who cannot see it.
 * @param onSelect Makes every tick a place to go. Omitted, the track is a
 * picture: forty-two focus stops that lead nowhere is not navigation.
 * @param here The tick the page is scrolled to, lit on top of whatever it
 * already says. Only meaningful on a flat track long enough to scroll past.
 * @param groupLabels One name per group, drawn under it. For a navigable track
 * of several packs, where the gap between groups is the only thing saying a pack
 * ended and it is far too quiet a signal to count from -- the accordion form
 * says which pack you are in by opening it, and a flat track has no equivalent.
 * Left off, a track is unlabelled exactly as before.
 */
export function PickTrack({
  groups,
  label,
  onSelect,
  here,
  groupLabels,
}: {
  groups: Tick[][];
  label: string;
  onSelect?: (index: number) => void;
  here?: number;
  groupLabels?: string[];
}) {
  if (groups.length > 1 && !onSelect) {
    return <PackAccordion groups={groups} label={label} />;
  }
  return (
    <FlatTrack
      groups={groups}
      label={label}
      onSelect={onSelect}
      here={here}
      groupLabels={groupLabels}
    />
  );
}

const CARD_W = "0.875rem"; // 14px: a pack seen closed, at a card's proportion
const OPEN_H = "1.75rem"; // 28px: a tick row with air around it
const SHUT_H = "1.25rem"; // 20px

// The fold. Everything that distinguishes an open pack from a closed one travels
// at once -- width, height, fill, border -- because they are one object doing one
// thing, not four properties being animated in sympathy.
//
// Change it here and nowhere else: the tick fade below derives from it, and the
// ticks have to be gone before the box is narrow enough to smear them.
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
            // No bg-primary alongside tick-arrive: it paints a background-IMAGE
            // whose trailing end is translucent, and a gold fill underneath
            // would show through the part that has not been poured into yet.
            // Its resting position is the gold end of that gradient, so the
            // colour is right with or without the animation having run.
            //
            // The class living on `current` rather than on "the one that just
            // changed" is what makes it survive this screen. The coach streams
            // its answer token by token straight after a pick, re-rendering this
            // many times a second for seconds -- and across all of them the
            // current tick's className is byte-identical, so React leaves the
            // element alone and the animation plays out. A transient flag would
            // be cleared by the second render and cut it dead.
            className={`flex-1 rounded-full ${
              tick.state === "current"
                ? "tick-lit tick-arrive h-2"
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
  here,
  groupLabels,
}: {
  groups: Tick[][];
  label: string;
  onSelect?: (index: number) => void;
  here?: number;
  groupLabels?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const flat = groups.flat();

  // One tab stop for the whole track, arrows to move within it -- the same
  // bargain a radio group makes, and for the same reason: a review has twenty-odd
  // decisions in it, and tabbing past twenty-odd ticks to reach the page is worse
  // than not being able to reach them at all.
  //
  // The stop is wherever you are, by whichever of the two senses the caller has:
  // the pick being stepped through, or failing that the record being read. Only
  // when neither exists does it fall back to the start -- which on the breakdown
  // would have meant tabbing in at pick one from halfway down the page.
  const current = flat.findIndex((tick) => tick.state === "current");
  const stop = current >= 0 ? current : (here ?? 0);

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

  const track = (
    <div
      ref={ref}
      // The gap between packs is a variable so a caller drawing this UNDER a
      // chart of the same picks can set it in percent and have the two line up
      // exactly -- see the comparison's braid, where the track is the chart's
      // own axis. Everywhere else it is the 0.75rem it has always been.
      className="flex items-end gap-[var(--pick-track-gap,0.75rem)]"
      // A picture of a draft, or a set of places to go. Nothing in between.
      {...(onSelect ? { role: "group", onKeyDown } : { role: "img" })}
      aria-label={label}
    >
      {groups.map((ticks, group) => {
        const start = offset;
        offset += ticks.length;

        return (
          <div
            key={group}
            // Grown by its own pick count rather than by an equal share, so a
            // pack with fewer picks in it is narrower -- which is the true
            // thing, and the only way a track can sit under a chart of the same
            // draft and agree with it about where each pack ends.
            style={{ flexGrow: ticks.length, flexBasis: 0 }}
            className={`flex items-end ${
              // A labelled group is a pack you can point at, so it gets an edge
              // to be pointed at: the ticks sit in a shallow well rather than in
              // a gap.
              //
              // The edge is tinted with base-content and not base-300, for the
              // reason popup-surface gives: base-300 against base-200 is nearly
              // invisible in this theme, and the accordion gets away with it
              // only because it sits on base-100. Inside a panel it did not read
              // as a frame at all.
              groupLabels
                ? "rounded-[4px] border border-base-content/20 bg-base-100/40 px-1.5"
                : ""
            }`}
          >
            {ticks.map((tick, i) => {
              const isHere = start + i === here;
              const lit = isHere ? HERE : "";

              return onSelect ? (
                <button
                  key={i}
                  type="button"
                  // Padding rather than a taller bar: a 2px line is not a click
                  // target, and growing it to be one would make the rule heavy
                  // enough to compete with the page it sits under.
                  //
                  // The hover mark is on the TARGET, not on the tick. Growing
                  // the bar was the whole of it, and growth can only be seen on
                  // a tick that is short -- every state in TALL is already at
                  // the height hover was taking it to, so the graded ticks and
                  // the forks, which are the ones anybody actually aims at, had
                  // no hover feedback at all. Lighting the padding box instead
                  // works the same on every state, and it says the true thing:
                  // this is the area that will take the click.
                  //
                  // Deliberately not the halo. `tick-lit` is how the track says
                  // WHERE YOU ARE, and it can only keep saying that while it is
                  // the one thing on the track that glows -- see globals.css,
                  // where the halo is area precisely because a mark this small
                  // cannot be found any other way.
                  className={`group flex flex-1 cursor-pointer items-end rounded-sm py-1.5 ${TICK_X} transition-colors hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/70`}
                  aria-label={tick.label}
                  aria-current={tick.state === "current" ? "true" : undefined}
                  tabIndex={start + i === stop ? 0 : -1}
                  onClick={() => onSelect(start + i)}
                >
                  {/* Still grows, where there is room to: a hairline tick coming
                      up to full height is a good extra cue and costs nothing.
                      It is no longer the only cue. */}
                  <span
                    className={`${bar(tick.state, true, isHere)} ${lit} motion-safe:transition-[height,transform] group-hover:h-1.5`}
                  />
                </button>
              ) : (
                // Same box the navigable form's button is, padding included, so
                // the track occupies one height on every page that draws one --
                // whether or not its ticks are places to go.
                <span key={i} className={`flex flex-1 items-end py-1.5 ${TICK_X}`}>
                  <span
                    className={`${bar(tick.state, false, isHere)} ${lit} motion-safe:transition-[height,transform]`}
                  />
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  if (!groupLabels) return track;

  return (
    <div className="flex flex-col gap-1">
      {track}
      {/* One label per group, on the same flex-1 basis the groups sit on, so
          each name is centred under its own well however the packs are sized.
          aria-hidden: every tick already announces its pack in full. */}
      <div aria-hidden className="flex gap-[var(--pick-track-gap,0.75rem)]">
        {groups.map((ticks, group) => (
          <span
            key={group}
            style={{ flexGrow: ticks.length, flexBasis: 0 }}
            className="eyebrow text-center"
          >
            {groupLabels[group] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

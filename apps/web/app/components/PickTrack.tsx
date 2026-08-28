"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Key } from "../charts/Key";

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

// What a tick is painted with and how it is built, in one table.
//
// ONE TABLE AND NOT THREE, because the legend has to read from the same place
// the track paints from. A tone list in Tailwind classes and a legend in CSS
// colours are two copies of one decision, and the day one of them moves nobody
// finds out -- which is a worse bug than the one the legend was added to fix.
// `TrackKey` at the foot of this file is the only other reader.
const mix = (token: string, percent: number) =>
  `color-mix(in oklab, var(--color-${token}) ${percent}%, transparent)`;

interface TickPaint {
  /** The paint. A theme token through `mix`, never a literal colour. */
  ink: string;
  /** An outline with nothing in it, rather than a filled body. */
  hollow?: boolean;
  /** An object -- 6px -- rather than a rule. */
  tall?: boolean;
}

// Ahead and past differ by weight alone, so the track reads as a rule that has
// been filled up to a point. Gold is where you are -- the same thing it means on
// a card you are holding.
//
// A HIT IS HOLLOW AND A MISS IS FILLED, WHICH IS THE FIX. These were success
// and error at the same height: green against red, six pixels tall, with nothing
// on either review surface saying which was which. Hue was the only channel and
// it was the one pair of hues a red-green reader cannot separate. Fill against
// hollow survives greyscale, survives 4px of width, and says the right thing
// besides -- a miss is an object, the thing you came back to look at, and a hit
// is a pick with nothing left in it.
//
// AND THE GREEN LEFT THE TRACK RATHER THAN THE CARDS. That is a vocabulary
// decision, not a palette one. The walkthrough draws `PickMarksKey` a few inches
// under this track teaching green for the CONTEXT-BEST card, orange for the
// raw-best and blue for the one you took -- so one page said green twice about
// two different things. On the breakdown it was worse: a hit there means you
// took the card the marks draw in ORANGE, so the tick and the card disagreed
// outright.
//
// PickMarks wins, and this file had already conceded the point once. `stood`
// below is blue because blue is what PickMarks marks the card you took with,
// and the rule it set -- the tick and the mark on the card it refers to are the
// same colour saying the same thing -- is a test `hit` never passed. The marks
// are also older, wider (both review surfaces, the misses drill, and the CLI
// reveal share the words and the colours) and drawn ON THE CARDS, which is where
// the lesson is.
//
// So the graded pair is a claim about HOW A PICK CAME OUT rather than about
// which card was which, and it is drawn in what the card vocabulary does not
// spend: a neutral outline for right, red for wrong. Red is the one grade colour
// the marks never use, it is already what this app means by a pick that went
// wrong -- gradeFor sends D and F there, and the walkthrough writes "✗ not this
// time" in it two inches away -- and it is the tone the eye should land on,
// since the misses are what both review surfaces are for.
//
// `stood` keeps its blue, and it is the exception that proves the split. It
// belongs to the misses drill, where a question can come back a third way: you
// were dealt a pick you got wrong and you made the same call again. That is not
// a hit and the drill refuses to call it a failure -- it is a disagreement with
// the grader rather than a slip. It is also the one graded tick that IS a claim
// about a card ("you answered with the one you took"), so it belongs in the card
// vocabulary and stays in it.
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
//
// `tall` is the other half of the old height rule: a tick that carries a result
// is an object, a tick that only carries a position is a rule. That is what
// stops the review's two surfaces drawing the same draft at two different
// weights. Where you ARE is still never said with size -- it is said with the
// halo (see tick-lit in globals.css), because a tick is too small for size or
// colour alone to be findable among forty-four siblings.
const PAINT: Record<TickState, TickPaint> = {
  ahead: { ink: mix("base-content", 10) },
  past: { ink: mix("base-content", 65) },
  current: { ink: "var(--color-primary)", tall: true },
  hit: { ink: mix("base-content", 70), hollow: true, tall: true },
  miss: { ink: mix("error", 70), tall: true },
  stood: { ink: mix("info", 60), tall: true },
  agreed: { ink: mix("base-content", 25) },
  fork: { ink: "var(--color-primary)", tall: true },
  apart: { ink: mix("warning", 45), tall: true },
};

// `ahead` is the one tone that depends on what the track IS, and the same
// `onSelect` that decides picture-or-navigation decides this. A pick not yet
// made can recede to almost nothing where the track is a picture. In the review
// every tick is a place to go, and a target you cannot see is not one -- so
// there, ahead stays aimable.
const AHEAD_NAVIGABLE = mix("base-content", 30);

const paintOf = (state: TickState, navigable: boolean): TickPaint =>
  state === "ahead" && navigable ? { ink: AHEAD_NAVIGABLE } : PAINT[state];

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
// Split into a class and a style because the paint is now a value rather than a
// utility: a hollow tick spends its ink on a border and a filled one on a
// background, and Tailwind has no way to say "this colour, either way round".
const bar = (state: TickState, navigable: boolean, here: boolean) => {
  const paint = paintOf(state, navigable);
  return {
    className: `w-full rounded-full ${state === "current" ? "tick-lit " : ""}${
      here || paint.tall ? "h-1.5" : "h-0.5"
    }`,
    style: paint.hollow
      ? { border: `1px solid ${paint.ink}` }
      : { backgroundColor: paint.ink },
  };
};

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
              const mark = bar(tick.state, onSelect != null, isHere);

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
                  // The same sentence the screen reader gets, for a reader who
                  // can point. It is the LONGER form and never the only one:
                  // `title` does not exist on a touch screen, so what a tick
                  // means is said by the key beside the track and this only ever
                  // adds which pick it is.
                  title={tick.label}
                  aria-current={tick.state === "current" ? "true" : undefined}
                  tabIndex={start + i === stop ? 0 : -1}
                  onClick={() => onSelect(start + i)}
                >
                  {/* Still grows, where there is room to: a hairline tick coming
                      up to full height is a good extra cue and costs nothing.
                      It is no longer the only cue. */}
                  <span
                    className={`${mark.className} ${lit} motion-safe:transition-[height,transform] group-hover:h-1.5`}
                    style={mark.style}
                  />
                </button>
              ) : (
                // Same box the navigable form's button is, padding included, so
                // the track occupies one height on every page that draws one --
                // whether or not its ticks are places to go.
                <span key={i} className={`flex flex-1 items-end py-1.5 ${TICK_X}`} title={tick.label}>
                  <span
                    className={`${mark.className} ${lit} motion-safe:transition-[height,transform]`}
                    style={mark.style}
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

/**
 * What the tones on a track mean, with the count of each beside them.
 *
 * WHY IT IS HERE AND NOT AT THE CALL SITES. A legend that transcribes a chart's
 * colours is a second copy of them, and the copy is wrong from the first time
 * anybody re-tones a state -- silently, because a legend cannot look wrong. This
 * one reads `PAINT`, the table the ticks themselves are painted from, so the two
 * cannot disagree and a new state gets a legend entry for free.
 *
 * IT CARRIES COUNTS BECAUSE THE TRACK IS THE ONLY PLACE SOME OF THEM ARE SAID.
 * Both drills refuse to print a fraction on purpose -- a run is a set of packs
 * you have now seen the answer to, not a test -- on the grounds that the track
 * has already said how it went. That was only true while the track was legible.
 * `aside` is the same slot `PickSplit` prints its counts in, and for the same
 * reason: three counts beside three swatches is the split, which is what a
 * reader wanted, and it is not a score.
 *
 * The shape follows the tick: a hollow tick gets a hollow swatch, so the second
 * channel is in the key as well as on the chart.
 */
export function TrackKey({
  entries,
  className,
}: {
  entries: {
    state: TickState;
    /** The word the rest of the screen uses for this outcome. */
    label: string;
    /** How many of them. Printed beside the swatch. */
    aside?: ReactNode;
    /** What it means, where the label alone is a verdict rather than a fact. */
    means?: string;
  }[];
  className?: string;
}) {
  return (
    <Key
      className={className}
      entries={entries.map((entry) => ({
        label: entry.label,
        ink: PAINT[entry.state].ink,
        shape: PAINT[entry.state].hollow ? "hollow" : "bar",
        aside: entry.aside,
        means: entry.means,
      }))}
    />
  );
}

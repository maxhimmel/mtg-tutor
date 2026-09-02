"use client";

import type { ShownDialId } from "@mtg-tutor/core";
import { HabitTrack, type HabitRow } from "../charts/HabitTrack";
import { Panel } from "./Panel";

/**
 * What the app has noticed about how you draft, and what it refuses to say.
 *
 * A CHART, THEN THE SENTENCES, AND THE SPLIT IS THE POINT
 *
 * The first version put one `GapMark` inline beside each sentence, and that was
 * wrong three ways, all of them in the house rules by name. `GapMark` earns its
 * missing axis by riding inside an eyebrow beside the numbers it draws, and this
 * panel prints no numbers, so the exemption did not come with it. Its reference
 * rule sits at ONE here rather than at zero and was unlabelled, which is exactly
 * the mark a reader guesses is a zero. And it sizes its own scale per call --
 * right for one mark alone in an eyebrow, wrong the moment two are stacked,
 * where the rows looked comparable and were drawn on different scales.
 *
 * So the marks live in one `HabitTrack` with a single scale, both ends of it
 * printed, the field drawn as a labelled rule, and every track answering the
 * pointer -- which is where the numbers live, since none are printed on a mark.
 * The sentences sit under it.
 * The chart says how much of each reading is margin; the list says what the
 * reading means -- and only where there IS one. A quiet dial keeps its row on the
 * chart, hollow and muted with its interval over the field, and gets no prose:
 * printing "nothing yet" beside a mark already saying so was how a careful panel
 * came to look like a broken one.
 *
 * WHY THERE ARE TWO ROWS AND NOT SIX
 *
 * `SHOWN_DIALS` decides that, in core, with a measurement behind every name it
 * leaves out. Nothing here filters anything: a panel that quietly dropped a dial
 * would be a second opinion about what is measurable, free to disagree with the
 * one that was actually derived.
 *
 * AND WHY NO NUMBER IS PRINTED PER ROW
 *
 * The axis states the scale, which is the thing that has to be on screen. What
 * is not on screen is a figure beside each dot, because a drafter's next ten
 * drafts move it and "1.28" invites a precision the measurement does not have --
 * the honest resolution here is a side of the rule and a margin, not three
 * decimal places. A reader who wants the value can read it off the axis, which
 * is what an axis is for.
 *
 * Sharpness is a DIRECTION with no figure at all, and that is not squeamishness.
 * The one-step estimate off stored curvature is biased -- 0.24 against a truth
 * of 0.50 on a drafter who is half as decisive -- so the sign survives the
 * approximation and the value does not. The type it arrives in has no number on
 * it, which is what stops this file printing one.
 */

/**
 * How each dial reads in either direction, in words a drafter uses.
 *
 * Two strings, not three: there is no "nothing yet" line, because the chart
 * already draws that state -- hollow dot, muted label, an interval visibly over
 * the field -- and a sentence repeating it was one of the three that made the
 * empty panel read as broken.
 *
 * "Lane" is what the code calls it and is NOT in `vernacular.yaml`; a player
 * says colors, committing, staying open. `signals` and `open` are both in the
 * corpus and are used as they are defined there.
 */
const SAYS: Record<ShownDialId, { above: string; below: string }> = {
  lane: {
    above: "You commit to your colors sooner than most drafters do.",
    below: "You stay open longer than most drafters do.",
  },
  signal: {
    above: "You read signals harder than most drafters do — what is flowing moves your picks.",
    below: "You read signals less than most drafters do — you take the card in front of you.",
  },
};

/**
 * The short name each dial goes by in the chart's left margin.
 *
 * Two syllables, because it sits in 64px beside a track. The sentence below the
 * chart is where the idea gets said properly; this is only the handle that ties
 * a row to its line.
 */
const TRACK: Record<ShownDialId, { label: string; about: string }> = {
  lane: { label: "Colors", about: "committing to your colors" },
  signal: { label: "Signals", about: "reading what is flowing" },
};

const rowFor = (dial: {
  id: ShownDialId;
  value: number;
  se: number;
  called: boolean;
}): HabitRow => ({ ...TRACK[dial.id], ...dial });

export interface HabitsData {
  drafts: number;
  picks: number;
  skipped: { unmeasured: number; stale: number; newSet: number };
  dials: { id: ShownDialId; value: number; se: number; called: boolean }[];
  sharpness: { above: boolean; called: boolean };
}

export function Habits({ habits }: { habits: HabitsData | null }) {
  // Null is "nothing could be pooled", which is a different sentence from "you
  // are average" and gets a different panel -- see `stats.overview`.
  if (!habits) return null;

  const said = [
    ...habits.dials.filter((d) => d.called).map((d) => (d.value > 1 ? SAYS[d.id].above : SAYS[d.id].below)),
    ...(habits.sharpness.called
      ? [
          habits.sharpness.above
            ? "You pick more consistently than most drafters — the same pack twice gets the same card."
            : "You pick less consistently than most drafters — close calls go either way.",
        ]
      : []),
  ];

  return (
    <Panel
      title="How you draft"
      aside={
        <span className="eyebrow">
          {habits.drafts} draft{habits.drafts === 1 ? "" : "s"} · {habits.picks} picks
        </span>
      }
      bodyClassName="gap-3"
    >
      {/* CAPPED, AND THAT IS THE FIX THE FIRST VERSION MOST NEEDED. The panel is
          the width of the page, and a two-row dot-and-interval chart handed
          nineteen hundred pixels draws two hairlines an inch apart in an acre of
          dark -- every mark tiny, the row labels stranded a hand's width from the
          marks they name, and the two axis ticks so far apart the eye has nothing
          to measure between them. The chart is responsive; how much room it
          DESERVES is this panel's business, and it is about as wide as the prose
          under it. */}
      <div className="max-w-md">
        <HabitTrack rows={habits.dials.map(rowFor)} picks={habits.picks} />
      </div>

      {/* ONE LINE PER THING WORTH SAYING, WHICH IS NOT ONE LINE PER DIAL. The
          first version printed a sentence for every dial and then a summary, so
          a new player read "nothing yet", "nothing yet", and "nothing clears
          yet" stacked -- three ways of saying the same thing, which reads as a
          screen that has broken rather than one that is being careful.

          The chart already shows a quiet row: its dot is hollow, its label is
          muted, and its interval visibly covers the field. So the prose says
          only what the chart cannot -- what a reading MEANS -- and where there
          is no reading it says the one useful thing instead, which is how many
          drafts it takes. */}
      {said.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-base-300 pt-3">
          {said.map((line) => (
            <li key={line} className="max-w-prose text-sm leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      )}

      {said.length === 0 && (
        // The empty state names DRAFTS, because that is the thing a person can go
        // and do about it. "Not enough data" is true and useless; five is a
        // number, and it is a measured one -- `fit-drafter` put committing at
        // about five drafts and signals at about ten.
        <p className="max-w-prose text-sm leading-relaxed text-base-content/55">
          Neither reading clears its margin yet — committing to colors usually
          shows after about five drafts, and reading signals after ten.
        </p>
      )}

      {habits.skipped.newSet > 0 && (
        // Not a technicality, and the reason it is said out loud: a set nobody
        // has measured has an unknown offset, routinely larger than what is
        // being read about the person. Silently including those drafts would put
        // a fact about the format inside a sentence about them.
        <p className="max-w-prose text-xs leading-relaxed text-base-content/45">
          {habits.skipped.newSet} draft{habits.skipped.newSet === 1 ? "" : "s"} left out:
          nobody has measured how the average drafter plays{" "}
          {habits.skipped.newSet === 1 ? "that set" : "those sets"} yet, so it would
          say more about the format than about you.
        </p>
      )}
    </Panel>
  );
}

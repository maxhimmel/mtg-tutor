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
 * printed, and the field drawn as a labelled rule. The sentences sit under it.
 * The chart says how much of each reading is margin; the list says what the
 * reading means. A row whose interval covers the field still gets its sentence,
 * saying there is nothing yet -- a missing row is not a sentence.
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
 * "Lane" is what the code calls it and is NOT in `vernacular.yaml`; a player
 * says colours, committing, staying open. `signals` and `open` are both in the
 * corpus and are used as they are defined there.
 */
const SAYS: Record<ShownDialId, { above: string; below: string; quiet: string }> = {
  lane: {
    above: "You commit to your colours sooner than most drafters do.",
    below: "You stay open longer than most drafters do.",
    quiet: "Nothing yet on how early you commit to your colours.",
  },
  signal: {
    above: "You read signals harder than most drafters do — what is flowing moves your picks.",
    below: "You read signals less than most drafters do — you take the card in front of you.",
    quiet: "Nothing yet on how much you read signals.",
  },
};

/**
 * The short name each dial goes by in the chart's left margin.
 *
 * Two syllables, because it sits in 64px beside a track. The sentence below the
 * chart is where the idea gets said properly; this is only the handle that ties
 * a row to its line.
 */
const TRACK_LABEL: Record<ShownDialId, string> = {
  lane: "Colours",
  signal: "Signals",
};

const rowFor = (dial: {
  id: ShownDialId;
  value: number;
  se: number;
  called: boolean;
}): HabitRow => ({ label: TRACK_LABEL[dial.id], ...dial });

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

  const quiet = habits.dials.every((d) => !d.called) && !habits.sharpness.called;

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
      {/* The chart carries the scale and how much of each reading is margin;
          the list under it carries what that means in words. Splitting them is
          what lets the chart have ONE axis for every row -- stacked marks each
          sized to their own row looked comparable and were not. */}
      <HabitTrack rows={habits.dials.map(rowFor)} />

      <ul className="flex flex-col gap-2 border-t border-base-300 pt-3">
        {habits.dials.map((dial) => (
          <li
            key={dial.id}
            className={`max-w-prose text-sm leading-relaxed ${
              dial.called ? "" : "text-base-content/55"
            }`}
          >
            {dial.called
              ? dial.value > 1
                ? SAYS[dial.id].above
                : SAYS[dial.id].below
              : SAYS[dial.id].quiet}
          </li>
        ))}

        {/* In the list and not on the chart, because it is the only reading here
            that is not a measured quantity with an interval -- giving it a row
            on a scale would draw an accuracy it does not have. */}
        {habits.sharpness.called && (
          <li className="max-w-prose text-sm leading-relaxed">
            {habits.sharpness.above
              ? "You pick more consistently than most drafters — the same pack twice gets the same card."
              : "You pick less consistently than most drafters — close calls go either way."}
          </li>
        )}
      </ul>

      {quiet && (
        // The empty state has to be a sentence about DRAFTS, because that is the
        // thing a person can do something about. "Not enough data" is true and
        // useless; five drafts is a number they can go and get -- and it is
        // measured rather than guessed, which is what the whole first phase was
        // for.
        <p className="max-w-prose text-sm leading-relaxed text-base-content/55">
          Nothing here clears its margin yet. Committing to colours usually takes
          about five drafts to show, and reading signals about ten.
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

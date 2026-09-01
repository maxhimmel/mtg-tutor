"use client";

import type { ShownDialId } from "@mtg-tutor/core";
import { GapMark } from "../charts/GapMark";
import { Panel } from "./Panel";

/**
 * What the app has noticed about how you draft, and what it refuses to say.
 *
 * ONE SENTENCE PER DIAL, AND ONLY WHERE THE INTERVAL EARNS IT
 *
 * Every row is the same picture as `GapMark` everywhere else in the app: a
 * span, a point on it, and a rule the span either reaches or does not. The rule
 * is the field rather than zero, and the reading is unchanged -- if the span
 * touches it, the app has nothing to say and says so in the row rather than
 * hiding it. A reader who has learned the mark on the review screen has already
 * learned this one.
 *
 * WHY THERE ARE TWO ROWS AND NOT SIX
 *
 * `SHOWN_DIALS` decides that, in core, with a measurement behind every name it
 * leaves out. Nothing here filters anything: a panel that quietly dropped a dial
 * would be a second opinion about what is measurable, free to disagree with the
 * one that was actually derived.
 *
 * AND WHY THE NUMBERS ARE NOT PRINTED
 *
 * A dial is a multiple of what the field weighs something at, and "1.28" is a
 * figure with no unit anybody can hold. The mark carries the relation, which is
 * the whole of what a reader can act on -- more than the field, less, or not
 * enough drafts to tell. Printing 1.28 beside it would invite a precision the
 * measurement does not have: the same drafter's next ten drafts move it, and
 * `notes.md` records that the honest resolution here is three claims, not three
 * decimal places.
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

/** A multiple of what the field weighs something at, said out loud. */
const asMultiple = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} against the field`;

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
      <ul className="flex flex-col gap-3">
        {habits.dials.map((dial) => (
          <li key={dial.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <GapMark
              gap={dial.value - 1}
              margin={1.96 * dial.se}
              describe={asMultiple}
            />
            <p
              className={`max-w-prose flex-1 text-sm leading-relaxed ${
                dial.called ? "" : "text-base-content/55"
              }`}
            >
              {dial.called
                ? dial.value > 1
                  ? SAYS[dial.id].above
                  : SAYS[dial.id].below
                : SAYS[dial.id].quiet}
            </p>
          </li>
        ))}

        {/* Below the dials and without a mark, because it is the only line here
            that is not a measured quantity with an interval. Giving it one would
            be drawing an accuracy it does not have. */}
        {habits.sharpness.called && (
          <li className="border-t border-base-300 pt-3 text-sm leading-relaxed">
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

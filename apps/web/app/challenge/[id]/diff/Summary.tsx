"use client";

import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { Who } from "./sides";
import { PickSplit } from "./track";

/**
 * The whole comparison, at a glance.
 *
 * What was here before opened with a scoreboard and then spent a paragraph
 * taking most of it back: "you came out 3 points ahead" sat directly above a
 * warning-ruled clause explaining that only some of the picks were the same
 * question. Both were true and the reader had to hold them at once, in prose, in
 * the first four seconds on the page.
 *
 * So the two claims are now separated and each is given the form it deserves.
 * How well each of you drafted is a number, and it is honest over all forty-two
 * picks because it does not depend on the packs matching -- it says so under
 * itself. What the forty-two picks WERE is not a number at all, it is a
 * proportion, so it is a rule split into the three things a pick can be.
 *
 * THE TRACK IS NOT HERE ANY MORE, which is the change that turned this panel
 * from a screenful into a band. It was drawn here, again in the braid, and a third
 * time in the shelf's stepper -- three pictures of forty-two picks with two
 * legends between them, and the braid's is the one that carries strictly more
 * (the same three states, plus each side's colours, plus how long each parting
 * held, plus the causal arc). The track's own irreplaceable job is being a set of
 * places to go from a keyboard, and it now does that from directly under the
 * braid, on the braid's own axis. What is left up here is what a reader needs
 * before they look at anything: who came out ahead, and what was actually
 * compared.
 *
 * The prose that survives is one caption. Every sentence that was doing
 * arithmetic a reader can see faster -- how many picks agreed, how many were
 * comparable, where the packs first came apart -- either became the split rule
 * below or moved to the braid, which draws it.
 */
export function Summary({
  rows,
  tally,
  them,
  className,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  className?: string;
}) {
  const lead = tally.yourAverage - tally.theirAverage;

  return (
    <Panel title="The short version" className={className} bodyClassName="gap-4">
      <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
        {lead === 0
          ? "A dead heat."
          : lead > 0
            ? `You came out ${lead} points ahead.`
            : `They came out ${Math.abs(lead)} points ahead.`}
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-base-300 pb-4">
        <Score mine label="You" value={tally.yourAverage} />
        <Score label={them} value={tally.theirAverage} />
        {/* The unit and the base, beside the numbers rather than in a footnote.
            "Points" said nothing about what was being counted or what a good one
            would be, and a score with neither is a score nobody can use.

            Directly beside them, not pushed to the far edge. It was set with
            `ml-auto` back when this panel was a half-width column, where the
            two ends of a row are a hand's width apart; across the whole page
            that put the sentence explaining the numbers a metre away from the
            numbers, with nothing in between. */}
        <span className="max-w-[22rem] text-xs leading-relaxed text-base-content/50">
          Average pick score out of 100, across all {tally.rows} picks — how each of you
          drafted, whatever was in front of you.
        </span>
      </div>

      <PickSplit rows={rows} />
    </Panel>
  );
}

function Score({ mine, label, value }: { mine?: boolean; label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Who mine={mine}>{label}</Who>
      <span
        className={`font-display text-3xl font-semibold tabular-nums leading-none ${
          mine ? "text-primary" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

"use client";

import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { Explain } from "./Explain";
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
 *
 * TWO SHAPES, ONE COMPONENT. Laid across the page it is a band: the lead
 * sentence, the two scores on a row, the split rule under them. Stood up as a
 * rail it is the same four things in the same order down a column, and the split
 * rule stands with it. They are not two panels that happen to say the same
 * thing -- there is exactly one place the numbers are chosen and one place the
 * sentence is written, because a reader who switches layouts and finds the
 * screen making a different claim has been told the layouts are different
 * screens.
 */
export function Summary({
  rows,
  tally,
  them,
  orientation = "horizontal",
  className,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const lead = tally.yourAverage - tally.theirAverage;

  const headline =
    lead === 0
      ? "A dead heat."
      : lead > 0
        ? `You came out ${lead} points ahead.`
        : `They came out ${Math.abs(lead)} points ahead.`;

  // The unit and the base. "Points" said nothing about what was being counted or
  // what a good one would be, and a score with neither is a score nobody can
  // use -- so it travels with the numbers in both shapes, whether as the
  // sentence beside them or as the mark on their rule.
  const basis = (
    <>
      Average pick score out of 100, across all {tally.rows} picks — how each of you drafted,
      whatever was in front of you.
    </>
  );

  if (orientation === "vertical") {
    return (
      <Panel
        title="The short version"
        className={`flex h-full flex-col ${className ?? ""}`}
        bodyClassName="min-h-0 flex-1 gap-5"
        // The rail is the shape where this sentence costs something: four
        // lines out of a column that has to hold the proportion as well.
        aside={
          <Explain subject="the score" align="end">
            {basis}
          </Explain>
        }
      >
        {/* EXPLICITLY UNGROWABLE, both of them, and the reason is a rule nobody
            wrote here: daisyUI's `.card-body` sets `& p { flex-grow: 1 }` on any
            paragraph inside it. Everywhere else in this app that is invisible,
            because a panel is as tall as its contents and there is no free space
            to distribute. In a rail the panel is as tall as the VIEWPORT, and
            the headline quietly claimed every pixel between itself and the
            scores -- half a screen of nothing, with the split rule pushed off
            the bottom edge.

            So the three parts declare what they are: the sentence and the scores
            are as tall as they read, and the proportion takes everything left,
            which is what makes it run the length of the screen.

            AS AN INLINE STYLE, NOT A `grow-0` CLASS, and that is the one place
            this file is allowed to reach for one. `.card-body p` is a two-token
            selector and `.grow-0` is one, so the class only wins if daisyUI's
            nested cascade layer sorts below Tailwind's utilities -- which it
            does today, and which is not a thing worth betting this panel's
            layout on across a daisyUI upgrade. An inline declaration is outside
            the argument. */}
        <p
          style={{ flexGrow: 0 }}
          className="shrink-0 font-display text-xl font-semibold leading-snug tracking-tight"
        >
          {headline}
        </p>

        <div className="flex shrink-0 flex-col gap-3 border-b border-base-300 pb-4">
          <Score mine label="You" value={tally.yourAverage} />
          <Score label={them} value={tally.theirAverage} />
        </div>

        <PickSplit rows={rows} orientation="vertical" />
      </Panel>
    );
  }

  return (
    <Panel title="The short version" className={className} bodyClassName="gap-4">
      <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
        {headline}
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-base-300 pb-4">
        <Score mine label="You" value={tally.yourAverage} />
        <Score label={them} value={tally.theirAverage} />
        {/* THE SENTENCE, not the mark, which is the one place on this screen
            the prose stayed put. A mark earns its place where a passage costs
            something -- four lines out of the rail's scarce column, a caption
            under an instrument somebody has already learnt to read. Across the
            whole width of the page this sentence costs nothing: it sits in space
            that was empty, beside the two numbers it is about, and hiding it
            would be spending a hover to reclaim room nobody wanted.

            Directly beside the numbers, not pushed to the far edge. It was set
            with `ml-auto` back when this panel was a half-width column, where
            the two ends of a row are a hand's width apart; across the whole page
            that put the sentence explaining the numbers a metre away from the
            numbers, with nothing in between. */}
        <span className="max-w-[22rem] text-xs leading-relaxed text-base-content/50">
          {basis}
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

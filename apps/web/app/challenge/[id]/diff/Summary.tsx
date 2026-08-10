"use client";

import { useRef } from "react";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { Who } from "./sides";
import { DiffTrack, TrackLegend } from "./track";

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
 * itself. Which picks were comparable is not a number at all, it is a shape, so
 * it is the track: the drift is something you see the moment the page loads
 * rather than something you read.
 *
 * The track is here, in the panel, and not pinned. It was tried both as a second
 * copy rising out of the bottom of the window and as one bar that stuck to the
 * top and swapped its caption for the pick you were on. Both worked and neither
 * was worth its complexity -- a bar that follows you is only worth having if you
 * notice it is there, and this one read as page furniture. What is left is the
 * thing that was good on its own: a track where the summary is, in the panel
 * that is the summary.
 */
export function Summary({
  rows,
  tally,
  them,
  at,
  onAt,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  at: number;
  onAt: (index: number, scroll: boolean) => void;
}) {
  const lead = tally.yourAverage - tally.theirAverage;

  /**
   * Whether the selection came from a pointer, which decides whether the page
   * moves to the pick you chose.
   *
   * A click has to take you to what you clicked or it reads as dead. An ARROW
   * KEY must not: the track keeps focus while it moves, so scrolling on every
   * press would carry the focus ring off the top of the screen and leave a
   * keyboard reader stepping through something they can no longer see.
   */
  const byPointer = useRef(false);

  return (
    <Panel title="The short version" bodyClassName="gap-3">
      <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
        {lead === 0
          ? "A dead heat."
          : lead > 0
            ? `You came out ${lead} points ahead.`
            : `They came out ${Math.abs(lead)} points ahead.`}
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-base-300 pb-3">
        <Score mine label="You" value={tally.yourAverage} />
        <Score label={them} value={tally.theirAverage} />
        {/* The unit and the base, beside the numbers rather than in a footnote.
            "Points" said nothing about what was being counted or what a good one
            would be, and a score with neither is a score nobody can use. */}
        <span className="ml-auto max-w-[16rem] text-xs leading-relaxed text-base-content/50">
          Average pick score out of 100, across all {tally.rows} picks — how each of you
          drafted, whatever was in front of you.
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="text-base-content/70">
          You took the same card on {tally.agreed} of {tally.rows} picks.
        </p>
        <div
          onPointerDown={() => {
            byPointer.current = true;
          }}
          onKeyDown={() => {
            byPointer.current = false;
          }}
        >
          <DiffTrack rows={rows} them={them} at={at} onAt={(i) => onAt(i, byPointer.current)} />
        </div>
        <TrackLegend tally={tally} />
      </div>

      {/* The honesty clause, still here and still prose, but a sentence rather
          than a paragraph: the track above now carries the shape of it, and this
          only has to name what the reader is looking at. */}
      <p className="border-l-2 border-warning/50 pl-3 text-sm leading-relaxed text-base-content/70">
        {tally.firstDrift === undefined ? (
          <>
            Both pods stayed in step the whole way — every pick above came off the same
            cards, so all {tally.rows} are the two of you answering one question.
          </>
        ) : (
          <>
            The first {tally.guaranteedThrough + 1} picks came off identical packs. After
            that your pods drift in and out of step, because your own earlier pick changed
            what the bots passed on.{" "}
            <strong className="font-semibold text-base-content/85">
              {tally.comparable} of {tally.rows}
            </strong>{" "}
            picks had the same cards in front of both of you; the orange marks are the ones
            that did not.
          </>
        )}
      </p>
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

"use client";

import type { MouseEvent } from "react";
import { scaleLinear } from "@visx/scale";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { useCursorTip } from "../../../components/CursorTip";
import { Plot, ValueAxisBottom } from "../../../charts/Plot";
import { INK, MARK, NEUTRAL } from "../../../charts/ink";
import { Explain } from "./Explain";
import { Who } from "./sides";
import { PickSplit, stateOf } from "./track";

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
 * AND THE COMPARISON IS DRAWN, WHICH IT WAS NOT. "You came out 3 points ahead"
 * stood at the top of the page with two bare numerals under it and no mark
 * anywhere -- the one comparison the whole screen is named for, left entirely to
 * prose, on a panel that draws a proportion of forty-two picks two inches
 * further down. So the pair is a dumbbell now, on a stated window of the score,
 * with the two of you told apart by the app's own filled-against-hollow rule
 * rather than by a second colour.
 *
 * THE WINDOW IS A FIXED WIDTH AND THE FIXED WIDTH IS THE POINT. An axis running
 * the full 0 to 100 draws a three-point lead as three per cent of a bar, which
 * is a mark nobody can read; an axis fitted to the pair draws EVERY lead the
 * same size, which is the saturation defect the braid's amplitude scale was just
 * repaired for. So the axis is twenty points wide -- a fifth of the score --
 * centred on the two of you, and both of its ends are printed. A one-point lead
 * is a short bar and a nine-point lead is a long one, on this comparison and on
 * anybody else's.
 *
 * AND IT IS HELD TO `Verdict`'S STANDARD, which is the part that matters more
 * than the mark. That panel refuses to state a per-pick gap without its error
 * bars, on the grounds that being told you were wrong by an amount the data
 * cannot see is the one way this flow could teach something false -- and this
 * one was stating a three-point difference of two forty-two-pick averages
 * flatly, at the top of the page, as the first thing anybody reads.
 *
 * There are no error bars to put on it. What there is instead is the
 * DECOMPOSITION, which is exact and needs no distribution: on every pick where
 * the two of you took the same card off the same pack, the two scores are the
 * same number, so those picks contribute nothing to the gap whatever. The whole
 * of it comes from the handful where you differed -- and some of those were not
 * the same question at all. That sentence sits under the mark and is not
 * optional, because the honest reading of a three-point lead built out of five
 * picks is "these two drafts differ", not "this person drafts better".
 *
 * TWO SHAPES, ONE COMPONENT. Laid across the page it is a band: the lead
 * sentence, the two scores on a row, the mark and its caveat, the split rule
 * under them. Stood up as a rail it is the same things in the same order down a
 * column, and the split rule stands with it. They are not two panels that happen
 * to say the same thing -- there is exactly one place the numbers are chosen and
 * one place the sentence is written, because a reader who switches layouts and
 * finds the screen making a different claim has been told the layouts are
 * different screens.
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
          <Margin rows={rows} tally={tally} them={them} />
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

      <Margin rows={rows} tally={tally} them={them} />

      <PickSplit rows={rows} />
    </Panel>
  );
}

// The plot's own margins, named because the pointer has to undo them: a
// readout that says which score the cursor is over reads x back through the
// same scale the marks were drawn with, and a margin copied into two places is
// a readout that drifts half a tick off its own axis.
const PAD = { top: 10, right: 12, bottom: 18, left: 12 };

// A fifth of the score, which is the window the two averages are drawn in. Wide
// enough that a one-point lead is a mark rather than a rounding error, narrow
// enough that a nine-point one is not off the end -- and FIXED, so the size of
// the bar means the same thing on every comparison anybody runs.
const WINDOW = 20;

/**
 * The two averages as one mark, and what the mark is not allowed to claim.
 *
 * `pct` and `points` are both wrong for this figure and that is worth saying
 * once: those are for rates and for differences of rates, and a pick score is
 * neither -- it is a number out of a hundred that `scorePick` assigns to a
 * pick. So the unit is written out, and it is written out HERE, on the mark,
 * because "3 points" with no scale attached is exactly the sort of figure a
 * reader carries away meaning something it does not.
 */
function Margin({
  rows,
  tally,
  them,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
}) {
  const tip = useCursorTip();

  const yours = tally.yourAverage;
  const theirs = tally.theirAverage;
  const lead = yours - theirs;

  // The window, centred on the pair and slid back inside the scale at either
  // end. It only ever widens to hold a gap that will not fit, and when it does
  // the axis says so itself by printing its own ends.
  //
  // BOTH ENDS ARE ROUND TENS, which is not tidiness. d3 chooses tick values near
  // the count you ask for and it chooses round ones, so an axis running 53 to 73
  // is ticked at 55, 60, 65, 70 -- and neither end of the scale appears on the
  // drawing, which is the one thing the house rule requires of it. Snapped to
  // ten, the ends ARE ticks.
  const span = Math.min(100, Math.max(WINDOW, Math.ceil((Math.abs(lead) * 1.6) / 10) * 10));
  const mid = (yours + theirs) / 2;
  const from = Math.max(0, Math.min(100 - span, Math.round((mid - span / 2) / 10) * 10));
  const to = from + span;

  // The picks that cannot have moved the gap, exactly: same pack and same card
  // means the same pick scored the same way, so the two averages are built from
  // the identical number there. Whatever separates them comes from the rest.
  const counts = { agreed: 0, fork: 0, apart: 0 };
  for (const row of rows) counts[stateOf(row)]++;
  const differed = counts.fork + counts.apart;

  const gapWords =
    lead === 0
      ? "level"
      : `${lead > 0 ? "you" : them} ${Math.abs(lead)} point${Math.abs(lead) === 1 ? "" : "s"} ahead`;

  /**
   * What the cursor is over, which on a scale is a PLACE and not a mark.
   *
   * The two dots are eight pixels on a track a foot wide, so a reader aiming at
   * one spends the hover missing -- the same finding the archetype quiz wrote
   * down when it moved its tooltip off the marks and onto the whole row. What a
   * spot on this axis means is a score, and the two dots are near enough that
   * naming whichever one the pointer is closest to is the reading somebody
   * pointing between them actually wants.
   *
   * Both numbers are printed above this in full, so nothing here is only
   * available to a pointer. This is the longer form.
   */
  const say = (e: MouseEvent<Element>): string | null => {
    const box = e.currentTarget.getBoundingClientRect();
    const inner = box.width - PAD.left - PAD.right;
    if (inner <= 0) return null;
    const at = from + ((e.clientX - box.left - PAD.left) / inner) * span;
    if (at < from || at > to) return null;

    const near = Math.abs(at - yours) <= Math.abs(at - theirs) ? "yours" : "theirs";
    const whose = near === "yours" ? "you" : them;
    const score = near === "yours" ? yours : theirs;
    const between = at > Math.min(yours, theirs) && at < Math.max(yours, theirs);
    return `${Math.round(at)} of 100 — ${between ? `inside the gap, ${gapWords}. ` : ""}${whose} averaged ${score}.`;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* The pointer is taken on the box rather than on the marks, for the
          reason `say` records. `Plot` owns its own div, so the handlers go on
          one wrapped around it -- and the box the readout measures from is
          therefore exactly the box the SVG is drawn in. */}
      <div className="max-w-[26rem]" {...tip.follow(say)}>
        <Plot
          height={52}
          // Two dots, a bar between them and three axis numbers. Under this the
          // numbers collide with each other and with their own scale, and the two
          // averages are printed in full a line above in any case.
          needs={260}
          instead={
            <p className="text-xs leading-relaxed text-base-content/60">
              Average pick score out of 100: you {yours}, {them} {theirs} — {gapWords}.
            </p>
          }
          label={`Average pick score for both drafters on a ${span}-point window of the 0 to 100 scale, from ${from} to ${to}. You ${yours}, ${them} ${theirs} — ${gapWords}.`}
          // Filled gold against a hollow ring is how this screen has said "yours"
          // and "theirs" since `sides.tsx`, and it is a real second channel --
          // fill against outline, not two hues. What it was missing is anywhere
          // saying so: the mark is unlabelled on the drawing, and the sentence
          // that explained it lived in a code comment. The counts ride on it, so
          // neither average needs a hover to be read.
          legend={[
            { label: "You", ink: INK.yours, shape: "dot", aside: yours },
            {
              label: them,
              ink: INK.theirs,
              // `Key`'s own hollow swatch is a bar, which is the wrong shape for a
              // point estimate -- the mark on the chart is a ring.
              swatch: (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full border-[1.5px]"
                  style={{ borderColor: INK.theirs }}
                />
              ),
              aside: theirs,
            },
            {
              label: "the gap",
              ink: NEUTRAL.hollow,
              shape: "bar",
              aside: gapWords,
              means: "out of 100, over all " + rows.length + " picks",
            },
          ]}
          tip={tip.node}
          margin={PAD}
        >
          {(box) => {
            const x = scaleLinear({ domain: [from, to], range: [0, box.width] });
            const y = box.height / 2;

            return (
              <>
                {/* The gap itself, as the thing between the two of you rather than
                    as two marks a reader has to subtract. */}
                <rect
                  x={Math.min(x(yours), x(theirs))}
                  y={y - MARK.band / 2}
                  width={Math.abs(x(yours) - x(theirs))}
                  height={MARK.band}
                  rx={MARK.band / 2}
                  fill={NEUTRAL.hollow}
                />
                {/* Filled gold against a hollow ring, which is how this screen has
                    said "yours" and "theirs" since `sides.tsx` -- so the mark needs
                    no key and no second hue, and it survives being read by
                    somebody who cannot separate gold from anything.

                    The ring goes on last so that a dead heat, where the two dots
                    are the same dot, still shows both of them. */}
                <circle cx={x(yours)} cy={y} r={MARK.dot / 2} fill={INK.yours} />
                <circle
                  cx={x(theirs)}
                  cy={y}
                  r={MARK.dot / 2}
                  fill="none"
                  stroke={INK.theirs}
                  strokeWidth={1.5}
                />
                <ValueAxisBottom scale={x} top={box.height} numTicks={3} />
              </>
            );
          }}
        </Plot>
      </div>

      {/* NOT A CAVEAT ON THE MARK -- the reading of it. A lead built out of five
          picks and a lead built out of forty are different findings, and only
          one of them is about drafting. */}
      <p className="max-w-[34rem] text-xs leading-relaxed text-base-content/60">
        {differed === 0 ? (
          <>Identical drafts, pick for pick, so the two averages are the same number.</>
        ) : (
          <>
            On the {counts.agreed} picks where you both took the same card off the same pack,
            the two scores are the same number — so all of this gap comes from the other{" "}
            {differed}: {counts.fork} where you chose differently off one pack
            {counts.apart > 0 && <> and {counts.apart} that were not the same question</>}.
            It is a difference between two drafts, not a measure of who drafts better.
          </>
        )}
      </p>
    </div>
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

"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";
import { ReadRate } from "../charts/ReadRate";
import { Panel } from "../components/Panel";
import { releaseDate } from "../lib/format";

export type DrillProgress = FunctionReturnType<typeof api.drills.progress.progress>;
type OneDrill = DrillProgress["archetypes"];

// What the two set drills say about how somebody reads a card.
//
// A SECOND PANEL RATHER THAN A SECTION OF `ProgressPanel`, and the two are not
// the same subject. That one is picks coming back -- your own mistakes, out of
// your own drafts, re-dealt. This is reading a set: cards nobody has any history
// with, answered against what the set's own statistics say. Folding them would
// put two subjects under one heading and one of them would have to lose its
// words.
//
// AND IT DRAWS, WHERE `ProgressPanel` DELIBERATELY DOES NOT. That panel argues
// its four-way split is a tally of counts that start at zero and reach double
// figures slowly, so a bar at n = 4 would state a scale it cannot support. The
// difference here is that there IS a distribution: every answer carries how
// sharp its question was, the bands are a real axis, and the interval on each
// band is what keeps a rate off three answers from being read as a rate. When
// the counts are small the chart says so, in the band's width and in the number
// printed under it.
//
// THE HEADLINE IS THE SHAPE, NOT A NUMBER. There is no single percentage here on
// purpose: both banks deal their clearest questions first, so a percentage over
// everything falls as somebody improves. The counts under the chart are the two
// things a number can honestly say -- how much of the drill is behind them, and
// what happened when a card came back.

export function ReadPanel({ progress }: { progress: DrillProgress }) {
  const total = progress.archetypes.asked + progress.deckSpeed.asked;

  if (total === 0) {
    return (
      <Panel title="Reading a set">
        <p className="max-w-prose text-sm text-base-content/60">
          Nothing yet. Two of the drills ask about a card and a set rather than about a
          draft, so they can be played on a set you have never seen — and once you have
          answered a few, this is where how you read them adds up.
        </p>
        <Link href="/practice" className="btn btn-sm btn-primary mt-4 self-start">
          Play a drill
        </Link>
      </Panel>
    );
  }

  const since = earliest(progress);

  return (
    <Panel
      title="Reading a set"
      aside={
        since ? (
          <span className="text-xs text-base-content/50">
            since {releaseDate(since) ?? since}
          </span>
        ) : undefined
      }
      bodyClassName="gap-5"
    >
      <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
        How often you read a card right, against how far apart the data could tell its
        answers. The drills deal their clearest questions first, so a single percentage
        would fall as you got better — this is the same thing with that taken out.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Drill title="Which deck wants it?" drill={progress.archetypes} />
        <Drill title="How fast is this card's deck?" drill={progress.deckSpeed} />
      </div>
    </Panel>
  );
}

function Drill({ title, drill }: { title: string; drill: OneDrill }) {
  return (
    <section className="flex flex-col gap-2">
      {/* The chart's own name, which is what a one-series chart gets instead of
          a legend. */}
      <h3 className="text-sm font-semibold">{title}</h3>
      {drill.asked === 0 ? (
        <p className="text-sm text-base-content/55">Not played yet.</p>
      ) : (
        <>
          <ReadRate bins={drill.bins} />
          <p className="text-xs leading-relaxed text-base-content/50">
            {drill.asked} {drill.asked === 1 ? "card" : "cards"} asked, first answers only —
            the first time a card comes up is the only time the reveal has not already told
            you.{" "}
            {drill.askedAgain === 0
              ? "None has come back yet: a card returns a day after you misread it, and the drill leads with what you have never seen."
              : `Of the ${drill.askedAgain} that came back, you took ${drill.tookBack} of them.`}
          </p>
        </>
      )}
    </section>
  );
}

/** When the record starts, over both drills. */
const earliest = (progress: DrillProgress): string | undefined =>
  [progress.archetypes.since, progress.deckSpeed.since]
    .filter((s): s is string => s != null)
    .sort()[0];

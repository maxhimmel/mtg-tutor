"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";
import { ReadRate } from "../charts/ReadRate";
import { Panel } from "../components/Panel";
import { pct, releaseDate } from "../lib/format";

export type DrillProgress = FunctionReturnType<typeof api.drills.progress.progress>;
type OneDrill = DrillProgress["archetypes"];

// What the two set drills say about how somebody reads a card.
//
// A SECOND PANEL RATHER THAN A SECTION OF `ProgressPanel`, and the two are not
// the same subject. That one is picks coming back -- your own mistakes, out of
// your own drafts, re-dealt. This is reading a set: cards nobody has any history
// with, answered against what the set's own statistics say.
//
// TWO READINGS AND NOT ONE ACCURACY, which is the whole shape of this panel and
// was the first version's mistake. Most questions in both drills are flat -- the
// data has no opinion about most cards -- so a single percentage mostly measures
// how willing somebody is to answer "Neither", and a player who answers it every
// time looks competent. Both drills already name the two mistakes that separates
// (`saw-difference` and `saw-none`), so the panel counts those against their own
// denominators first, and only then asks how well the real answers were read.
//
// AND IT DRAWS, WHERE `ProgressPanel` DELIBERATELY DOES NOT. That panel argues
// its four-way split is a tally of counts that start at zero and reach double
// figures slowly, so a bar at n = 4 would state a scale it cannot support. The
// difference here is that there IS a distribution: every answer carries how far
// past its own bar the question sat, and the interval on each band is what keeps
// a rate off three answers from being read as a rate.

export function ReadPanel({ progress }: { progress: DrillProgress }) {
  const total = progress.archetypes.asked + progress.deckSpeed.asked;

  if (total === 0) {
    return (
      <Panel title="Reading a set">
        <p className="max-w-prose text-sm text-base-content/60">
          Nothing yet. Two of the drills ask about a card and a set rather than a draft, so
          you can play them on a set you have never seen. Answer a few and this is where
          they add up.
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
          <span className="text-xs text-base-content/50">since {onlyDate(since)}</span>
        ) : undefined
      }
      bodyClassName="gap-5"
    >
      <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
        Most cards have no deck that wants them more and no clock of their own, so the first
        thing worth knowing is whether you can tell those apart from the ones that do. Then,
        on the cards with a real answer, whether you name the right end.
      </p>

      <div className="grid gap-8 sm:grid-cols-2">
        <Drill title="Which deck wants it?" drill={progress.archetypes} />
        <Drill title="How fast is this card's deck?" drill={progress.deckSpeed} />
      </div>
    </Panel>
  );
}

function Drill({ title, drill }: { title: string; drill: OneDrill }) {
  const d = drill.discrimination;

  return (
    <section className="flex flex-col gap-3">
      {/* The chart's own name, which is what a one-series chart gets instead of
          a legend. */}
      <h3 className="text-sm font-semibold">{title}</h3>

      {drill.asked === 0 ? (
        <p className="text-sm text-base-content/55">Not played yet.</p>
      ) : (
        <>
          {/* THE TWO MISTAKES, EACH OVER ITS OWN DENOMINATOR. One rate cannot
              hold them: a player who always says "the same" is perfect on the
              first row and blind on the second, and that pattern is invisible in
              any single accuracy figure. They are the drill's own two words for
              being wrong, counted over a history. */}
          <dl className="flex flex-col gap-1 text-sm">
            <Mistake
              term="Called it a difference"
              of={d.flat}
              n={d.calledSharp}
              means="when the decks wanted it the same"
            />
            <Mistake
              term="Called it the same"
              of={d.sharp}
              n={d.calledFlat}
              means="when one deck really did want it"
            />
          </dl>

          <div className="border-t border-base-300 pt-3">
            <p className="mb-1 text-xs text-base-content/50">
              On the cards with a real answer, by how far past its own bar the question sat.
            </p>
            <ReadRate bins={drill.bins} />
          </div>

          <p className="text-xs leading-relaxed text-base-content/50">
            {drill.asked} {drill.asked === 1 ? "card" : "cards"} asked, first answers only —
            the first time a card comes up is the only time you have not already been shown
            the answer. About a third of the cards that clear the bar only just clear it by
            chance, so the leftmost band sits lower than a reader does.{" "}
            {drill.askedAgain === 0
              ? "None has come back yet: a card returns a day after you misread it, and the drill leads with what you have never seen."
              : `Of the ${drill.askedAgain} that came back, you took ${drill.tookBack} back — and that number counts only cards you had already got wrong, so it starts from the bottom rather than from your standing.`}
            {drill.moved > 0 &&
              ` ${drill.moved} more came back after their answer had moved, and are left out of that count.`}
          </p>
        </>
      )}
    </section>
  );
}

/** One of the two mistakes, with the denominator that makes it mean something. */
function Mistake({
  term,
  of,
  n,
  means,
}: {
  term: string;
  /** The questions it could have happened on. */
  of: number;
  n: number;
  means: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base-content/60">
        {term}
        <span className="ml-2 text-xs text-base-content/40">{means}</span>
      </dt>
      <dd className="shrink-0 tabular-nums">
        {of === 0 ? (
          <span className="text-base-content/40">none yet</span>
        ) : (
          <>
            <span className="font-semibold">{pct(n / of)}</span>
            <span className="ml-1.5 text-xs text-base-content/40">
              {n}/{of}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * The day out of a stored timestamp.
 *
 * `releaseDate` only matches a bare yyyy-mm-dd, and `at` is a full
 * `toISOString`, so handing it one printed the raw stamp: "since
 * 2026-09-01T18:40:00.000Z".
 */
const onlyDate = (at: string): string => {
  const day = at.slice(0, 10);
  return releaseDate(day) ?? day;
};

/** When the record starts, over both drills. */
const earliest = (progress: DrillProgress): string | undefined =>
  [progress.archetypes.since, progress.deckSpeed.since]
    .filter((s): s is string => s != null)
    .sort()[0];

"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";
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
// AND IT DRAWS NOTHING, WHICH IS THE SECOND THING REVIEW CHANGED. There was a
// chart here: how often the right end was named, banded by how far past its own
// bar each question sat. It worked for one drill and not the other. Measured
// over all 25 sets, the archetype quiz has 242 separable questions with a median
// margin of 1.13 and a maximum of 2.39 -- 226 of them in the first band, one in
// the last -- so the chart was one dot beside two permanent zeroes, forever.
// Deck speed spreads properly (33/26/41), and the two are not the same quantity
// anyway: 56% of deck-speed margins are bound by its effect-size floor and the
// archetype quiz has no effect-size floor at all. Drawn side by side under one
// axis label, that is two different numbers wearing one scale.
//
// So the rows are the whole panel. They need no cut points, no cross-drill
// comparison and no borrowed noise figure, and they answer the question somebody
// opens this page with. `ProgressPanel` beside it draws nothing either, for its
// own reason -- a tally of small counts states a scale it cannot support -- and
// two panels declining to chart is not a house style, it is two numbers that are
// legible as numbers.

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
        Most cards have no deck that wants them more, and pull the game neither shorter nor
        longer. So the first thing worth knowing is whether you can tell those from the cards
        that do. Then, on the ones with a real answer, whether you name the right end.
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

          <p className="border-t border-base-300 pt-3 text-xs leading-relaxed text-base-content/50">
            {drill.asked} {drill.asked === 1 ? "card" : "cards"} asked
            {drill.sets > 1 ? ` across ${drill.sets} sets` : ""}, first answers only — the
            first time a card comes up is the only time you have not already been shown the
            answer.{" "}
            {drill.askedAgain === 0
              ? "Nothing has come back yet: a card returns a day after you misread it, and the drill leads with what you have never seen."
              : `Of the ${drill.askedAgain} that came back, you got ${drill.tookBack} right this time — and that counts only cards you had already got wrong, so it starts from the bottom rather than from how you normally do.`}
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

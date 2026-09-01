"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";
import { Panel } from "../components/Panel";
import { releaseDate } from "../lib/format";

export type Progress = FunctionReturnType<typeof api.stats.progress>;

// The one panel on this page that is about a direction rather than a standing.
//
// Everything else here averages drafts, and a draft is a different set, a
// different pack and a different pod every time -- so a run of them can say how
// somebody is doing and cannot say whether they are getting better. The drill
// is the one place the app asks the SAME question twice, out of the same pool,
// against an answer written down at the time, which is the only comparison
// available with no set-to-set variance in it.
//
// AND IT DRAWS NOTHING, deliberately. A four-way split of a count is a natural
// stacked bar and it would be a picture of numbers already legible beside it:
// these are counts of questions, they start at zero and reach double figures
// slowly, and a bar at n = 4 states a scale it cannot support. When there is a
// distribution here rather than a tally, that is the moment for `app/charts`.
//
// The caveat is printed rather than kept in a comment, because it is the whole
// reading of the headline: the first time one of these was dealt, the reveal
// named the card, so a second answer can be memory as much as a better read.

export function ProgressPanel({ progress }: { progress: Progress }) {
  if (progress.asked === 0) {
    return (
      <Panel title="Coming back to them">
        <p className="max-w-prose text-sm text-base-content/60">
          Nothing yet. The misses drill deals your worst picks back as the packs they came
          from, and once you have answered one it starts leading with the ones you have not
          taken back — this is where that adds up.
        </p>
        <Link href="/practice/misses" className="btn btn-sm btn-primary mt-4 self-start">
          Take a pick back
        </Link>
      </Panel>
    );
  }

  const since = progress.since?.slice(0, 10);

  return (
    <Panel
      title="Coming back to them"
      aside={
        since ? (
          <span className="text-xs text-base-content/50">
            since {releaseDate(since) ?? since}
          </span>
        ) : undefined
      }
      bodyClassName="gap-4"
    >
      {progress.askedAgain === 0 ? (
        // Answered some, none of them twice. Not an empty state -- there is a
        // real standing to print -- but the headline this panel is for cannot
        // be computed yet, and a "0 of 0" in large type reads as a failure
        // rather than as a beginning.
        <p className="max-w-prose text-sm text-base-content/70">
          You have answered <Count n={progress.asked} of="pick" /> so far and taken back{" "}
          {progress.fixed}. None has come round a second time yet — the drill deals what you
          have never answered first, so the repeats start once you are through those.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums">
              {progress.tookBack}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">
              / {progress.askedAgain}
            </span>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
            Picks you were dealt a second time having missed them the first, and took back on
            the way round.
          </p>

          {/* The four ways a repeat can go, which sum to the count above -- so a
              reader can add them up and find nothing missing. Printed in the
              drill's own words, since these are the same three outcomes its
              track draws, said about a pick's whole history instead of one run. */}
          <dl className="flex flex-col border-t border-base-300 pt-3 text-sm">
            {[
              ["Took it back", progress.tookBack, "missed it, then found the card"],
              ["Held on to it", progress.heldOn, "had it right, and again"],
              ["Let it go", progress.slipped, "had it right, and not the second time"],
              ["Still short", progress.stillWrong, "missed it both times"],
            ].map(([term, value, means]) => (
              <div key={String(term)} className="flex justify-between gap-4 py-1">
                <dt className="text-base-content/60">
                  {term}
                  <span className="ml-2 text-xs text-base-content/40">{means}</span>
                </dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <p className="max-w-prose border-t border-base-300 pt-3 text-xs leading-relaxed text-base-content/50">
        Out of <Count n={progress.asked} of="pick" /> the drill has put to you, {progress.fixed}{" "}
        stand answered with the card the pick was graded against. The first time you saw any of
        them the reveal named that card, so a second answer can be memory as much as a better
        read — the number that cannot be is how you did on a pick the first time it was dealt.
      </p>
    </Panel>
  );
}

const Count = ({ n, of }: { n: number; of: string }) => (
  <span className="tabular-nums">
    {n} {of}
    {n === 1 ? "" : "s"}
  </span>
);

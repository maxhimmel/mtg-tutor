"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { gradeFor } from "@mtg-tutor/core";
import { ColorPips } from "../components/ColorPips";
import { PageShell } from "../components/PageShell";
import { SetIcon } from "../components/SetIcon";
import { gradeColor, pct, releaseDate } from "../lib/format";
import { reviewListSeen } from "../lib/analytics";

export default function ReviewIndex() {
  return (
    <PageShell>
      <Unauthenticated>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Review a draft.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Step back through a finished draft pick by pick, guess which card was the
            better take, and let the coach explain the ones you missed.
          </p>
          {/* Both actions here too: this page is reachable directly, and a lone
              sign-in button is a dead end for anyone who has no account yet. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/sign-in">
              Sign in
            </a>
            <Link href="/sign-up" className="btn btn-outline">
              Ask for an invite
            </Link>
          </div>
          <p className="mt-4 text-sm text-base-content/60">
            Accounts are invite only while this is in beta.
          </p>
        </section>
      </Unauthenticated>

      <Authenticated>
        <DraftList />
      </Authenticated>
    </PageShell>
  );
}

function DraftList() {
  const drafts = useQuery(api.review.list, {});
  // Only for the set symbol. `review.list` carries the set code but not its
  // icon, and the rest of the app identifies a set by its symbol first.
  const sets = useQuery(api.sets.list);

  const icons = useMemo(
    () => new Map((sets ?? []).map((s) => [`${s.code}:${s.format}`, s])),
    [sets],
  );

  // Once per visit, not once per render: `review.list` is a live subscription
  // and re-answers whenever any session on the page is written to, which would
  // otherwise report the same list several times over one reading of it.
  const counted = useRef(false);
  useEffect(() => {
    if (!drafts || counted.current) return;
    counted.current = true;
    reviewListSeen({
      shown: drafts.length,
      stale: drafts.filter((d) => d.stale === true).length,
      unknown: drafts.filter((d) => d.stale === undefined).length,
    });
  }, [drafts]);

  if (drafts === undefined) {
    return <p className="text-base-content/60">Loading drafts…</p>;
  }

  if (drafts.length === 0) {
    return (
      <section className="max-w-2xl py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          No finished drafts yet
        </h1>
        <p className="mt-3 text-base-content/70">
          A draft becomes reviewable once you have made all 45 picks.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Draft a set
        </Link>
      </section>
    );
  }

  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight">
        Pick a draft to review
      </h1>

      <div className="card overflow-x-auto border border-base-300 bg-base-200">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <span className="eyebrow">Draft</span>
              </th>
              <th scope="col">
                <span className="eyebrow">Drafted</span>
              </th>
              <th scope="col" className="text-right">
                <span className="eyebrow">Score</span>
              </th>
              <th scope="col" className="text-right">
                <span className="eyebrow">Accuracy</span>
              </th>
              <th scope="col">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {drafts.map((draft) => {
              const set = icons.get(`${draft.setCode}:${draft.format}`);
              const name = set?.name ?? draft.setCode.toUpperCase();

              return (
                <tr key={draft.id} className="transition-colors hover:bg-base-300/40">
                  <th scope="row" className="font-normal">
                    <span className="flex items-center gap-3">
                      <SetIcon uri={set?.iconUri} className="size-6 text-base-content/50" />
                      <span className="flex flex-col">
                        <span className="flex items-center gap-2 font-display font-semibold leading-tight">
                          {name}
                          <ColorPips colors={draft.colorPair} />
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="eyebrow">
                            {draft.setCode.toUpperCase()} · {draft.pickCount} picks
                          </span>
                          {/* Every action on this row replays, so a re-ingested
                              set makes the whole row refuse rather than one
                              button. Said here, once, instead of three times.
                              Absent when unknowable -- see review.list. */}
                          {draft.stale === true && (
                            <span
                              className="badge badge-sm badge-warning"
                              title="This set has been re-ingested since you drafted it, so its packs would now deal differently and the draft can no longer be rebuilt."
                            >
                              set has changed
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                  </th>

                  <td className="whitespace-nowrap tabular-nums text-base-content/70">
                    {releaseDate(draft.createdAt.slice(0, 10)) ?? "—"}
                  </td>

                  <td
                    className="text-right font-display text-lg font-semibold tabular-nums"
                    style={{ color: gradeColor(gradeFor(draft.overallScore)) }}
                  >
                    {draft.overallScore.toFixed(1)}
                  </td>

                  <td className="text-right tabular-nums text-base-content/70">
                    {pct(draft.accuracy)}
                  </td>

                  {/* Every slot is a fixed track. The deck action is the only
                      label on this table that changes between rows, and left to
                      size itself it moved the two buttons beside it as well --
                      so a column of rows disagreed about where its own actions
                      were. Widths hold the longest label each slot can carry. */}
                  <td className="whitespace-nowrap">
                    <span className="flex justify-end gap-1.5">
                      <Link
                        href={`/review/${draft.id}`}
                        className="btn btn-sm btn-primary w-[5.5rem]"
                      >
                        Review
                      </Link>
                      <Link
                        href={`/review/${draft.id}/breakdown`}
                        className="btn btn-sm btn-ghost w-[6.5rem]"
                      >
                        Breakdown
                      </Link>
                      {/* The other two are about the picks. This is about what
                          the picks became, and until now nothing led back to it
                          once the results screen had been left.

                          A draft can also be finished and never built, and then
                          the deck is still to be made rather than to be read --
                          which is a different KIND of thing to click, so it does
                          not look like its neighbours. Dashed because that is
                          already what a dashed outline means on the screen this
                          leads to: a side with nothing on it yet. */}
                      <Link
                        href={`/review/${draft.id}/deck`}
                        className={`btn btn-sm w-[8rem] ${
                          draft.built
                            ? "btn-ghost"
                            : "btn-outline border-dashed border-base-content/25 font-normal text-base-content/70"
                        }`}
                      >
                        {draft.built ? "Deck" : "Build the deck"}
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

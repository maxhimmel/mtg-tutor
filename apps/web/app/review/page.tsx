"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { gradeFor } from "@mtg-tutor/core";
import { AppHeader } from "../components/AppHeader";
import { SetIcon } from "../components/SetIcon";
import { gradeColor, pct, releaseDate } from "../lib/format";

export default function ReviewIndex() {
  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <AppHeader />

      <Unauthenticated>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Review a draft.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Step back through a finished draft pick by pick, guess which card was the
            better take, and let the coach explain the ones you missed.
          </p>
          <a className="btn btn-primary mt-7" href="/sign-in">
            Sign in
          </a>
        </section>
      </Unauthenticated>

      <Authenticated>
        <DraftList />
      </Authenticated>
    </main>
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
                        <span className="font-display font-semibold leading-tight">
                          {name} · {draft.colorPair || "—"}
                        </span>
                        <span className="eyebrow">
                          {draft.setCode.toUpperCase()} · {draft.pickCount} picks
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

                  <td className="text-right whitespace-nowrap">
                    <Link href={`/review/${draft.id}`} className="btn btn-sm btn-primary">
                      Review
                    </Link>
                    <Link
                      href={`/review/${draft.id}/report`}
                      className="btn btn-sm btn-ghost ml-1.5"
                    >
                      Report
                    </Link>
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

"use client";

import Link from "next/link";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { PageShell } from "../components/PageShell";
import { Panel } from "../components/Panel";
import { SignedOut } from "../components/SignedOut";
import { pct } from "../lib/format";

export default function StatsIndex() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Every draft, averaged.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            One grade per pick adds up to a picture of how you draft — which pack you slip
            in, how deep into it you start guessing, and the cards you keep passing.
          </p>
          {/* Both actions, as on /review and /challenge: a lone sign-in button is
              a dead end for anybody who has no account yet. */}
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
      </SignedOut>

      <Authenticated>
        <Overview />
      </Authenticated>
    </PageShell>
  );
}

function Overview() {
  const data = useQuery(api.stats.overview, {});

  if (data === undefined) {
    return <p className="text-base-content/60">Tallying up…</p>;
  }

  const { overall } = data;

  // Nobody arrives here having finished a draft on their first visit, so this is
  // the state the page opens in for every new friend. It has to name the one
  // thing that fills it and lead straight to doing that -- a page of dashes is
  // how somebody decides a section of the app is broken.
  if (overall.drafts === 0) {
    return (
      <section className="max-w-2xl py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Nothing to average yet
        </h1>
        <p className="mt-3 text-base-content/70">
          These numbers come from finished drafts — all forty-five picks made. Take one and
          this page fills in.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Draft a set
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* The same arrangement a finished draft's result uses: what the screen is
          about on the left, the number it comes to on the right. This is that
          verdict one scale up, so it is set the same way. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <header className="flex flex-col gap-1.5">
          <p className="eyebrow">Stats</p>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Every draft you have finished, averaged.
          </h1>
          <p className="max-w-prose text-sm text-base-content/60">
            A pick is graded on how far its win rate fell short of the best card in the pack
            for your deck. Everything here is that one number, cut a few ways.
          </p>
        </header>

        <Panel title="Overall" bodyClassName="gap-3" className="lg:w-60 lg:shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold leading-none tracking-tight">
              {overall.avgScore.toFixed(1)}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">/100</span>
          </div>

          <dl className="flex flex-col border-t border-base-300 pt-2 text-sm">
            {[
              ["Best-pick accuracy", pct(overall.avgAccuracy)],
              ["Drafts", String(overall.drafts)],
              ["Picks", String(overall.totalPicks)],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 py-1 tabular-nums">
                <dt className="text-base-content/60">{term}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}

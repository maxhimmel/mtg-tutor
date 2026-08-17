"use client";

import Link from "next/link";
import { Authenticated, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@mtg-tutor/backend";
import { PageShell } from "../components/PageShell";
import { Panel } from "../components/Panel";
import { SignedOut } from "../components/SignedOut";
import { pct } from "../lib/format";
import { ScorePlot, type ScoreColumn } from "./ScorePlot";

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

      <Breakdowns data={data} />
    </div>
  );
}

type Stats = FunctionReturnType<typeof api.stats.overview>;

/** One plot's worth of columns, said as a sentence for anyone who cannot see it. */
const spoken = (subject: string, columns: ScoreColumn[]): string =>
  `${subject} — ${columns.map((c) => c.title).join("; ")}`;

/**
 * The two cuts of the same number, side by side and drawn to one axis.
 *
 * They are together because they are a pair of questions about the same slip:
 * whether it happens in a particular pack, or at a particular depth into every
 * pack. Either one alone invites the wrong reading of the other.
 *
 * Both come from the per-draft digests rather than from the summaries above,
 * and a draft that finished before digests existed has none -- so the panels say
 * what they are actually built on rather than inheriting the header's count.
 */
function Breakdowns({ data }: { data: Stats }) {
  const { byPackNo, byPickNo, overall, countedDrafts } = data;

  if (countedDrafts === 0) {
    return (
      <Panel title="Pick by pick">
        <p className="max-w-prose text-sm text-base-content/60">
          No per-pick detail yet. It is written when a draft finishes, and none of yours
          finished after that started being recorded — your next one fills these in.
        </p>
      </Panel>
    );
  }

  const coverage =
    countedDrafts < overall.drafts ? (
      <span className="text-xs tabular-nums text-base-content/50">
        {countedDrafts} of {overall.drafts} drafts
      </span>
    ) : undefined;

  const packs: ScoreColumn[] = byPackNo.map((row) => ({
    key: String(row.packNo),
    label: `Pack ${row.packNo}`,
    score: row.avgScore,
    title: `Pack ${row.packNo}: ${row.avgScore.toFixed(1)} average`,
  }));

  const picks: ScoreColumn[] = byPickNo.map((row) => ({
    key: String(row.pickNo),
    label: String(row.pickNo),
    score: row.avgScore,
    title: `Pick ${row.pickNo}: ${row.avgScore.toFixed(1)} average`,
  }));

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
      <Panel
        title="By pack"
        aside={coverage}
        className="lg:w-64 lg:shrink-0"
        bodyClassName="gap-3"
      >
        <ScorePlot columns={packs} label={spoken("Average score by pack", packs)} />
        <p className="text-xs leading-relaxed text-base-content/50">
          Pack three is drafted with a deck already half-decided, so a slip here is usually a
          pool that stopped offering anything you can play.
        </p>
      </Panel>

      <Panel title="By pick" aside={coverage} className="lg:flex-1" bodyClassName="gap-3">
        <ScorePlot
          columns={picks}
          label={spoken("Average score by pick number within a pack", picks)}
        />
        <p className="text-xs leading-relaxed text-base-content/50">
          How deep into a pack, counted the same way in all three. The late numbers are
          picking from four cards and then two, where there is not much left to get wrong.
        </p>
      </Panel>
    </div>
  );
}

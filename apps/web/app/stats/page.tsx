"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Authenticated, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@mtg-tutor/backend";
import { PageShell } from "../components/PageShell";
import { Panel } from "../components/Panel";
import { SetIcon } from "../components/SetIcon";
import { SignedOut } from "../components/SignedOut";
import { pct, points, releaseDate } from "../lib/format";
import { statsViewed } from "../lib/analytics";
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

  // Once per visit, not once per render, the way the review list counts itself:
  // `stats.overview` is a live subscription and re-answers whenever any draft in
  // the window is written to. Above the empty branch below on purpose -- a view
  // with nothing to show is the half of this measurement worth having.
  const counted = useRef(false);
  useEffect(() => {
    if (!data || counted.current) return;
    counted.current = true;
    statsViewed({
      drafts: data.overall.drafts,
      picks: data.overall.totalPicks,
      detailed: data.countedDrafts,
      mistakes: data.topMistakes.length,
      truncated: data.truncated,
    });
  }, [data]);

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

      {/* The window is a hundred drafts and nobody has reached it, but a page
          that quietly averaged a subset and called it "overall" would never say
          so on the day somebody does. */}
      {data.truncated && (
        <p className="text-sm text-base-content/55">
          Only your {overall.drafts} most recent drafts are counted here — older ones fall
          outside the window.
        </p>
      )}

      <Lately recent={data.recent} />
      <Breakdowns data={data} />
      <Mistakes data={data} />
    </div>
  );
}

/**
 * The last few drafts in the order they happened.
 *
 * The one thing on this page that is not an average, and the only one that can
 * answer "am I getting better" -- which is the question somebody opens a stats
 * screen with. The averages above are a standing, and a standing cannot show a
 * direction.
 *
 * Deliberately not a second copy of the drafts table on /review. That list is
 * for finding a particular draft; this is for the shape of a run of them, and
 * the columns are links so it is still a way into any one of them.
 */
function Lately({ recent }: { recent: Stats["recent"] }) {
  // Only for the symbol. `stats.overview` carries the set code and not its
  // icon, and the rest of the app names a set by its symbol first. Keyed by code
  // alone, unlike the review list: this row has no format on it, and the symbol
  // is a property of the set rather than of the format it was drafted in.
  const sets = useQuery(api.sets.list);
  const icons = useMemo(() => {
    const byCode = new Map<string, { name?: string; iconUri?: string }>();
    for (const set of sets ?? []) if (!byCode.has(set.code)) byCode.set(set.code, set);
    return byCode;
  }, [sets]);

  if (recent.length === 0) return null;

  // The query answers newest first, which is right for a list and backwards for
  // a run of time.
  const columns: ScoreColumn[] = [...recent].reverse().map((draft) => {
    const set = icons.get(draft.setCode);
    const name = set?.name ?? draft.setCode.toUpperCase();
    const on = releaseDate(draft.createdAt.slice(0, 10)) ?? draft.createdAt.slice(0, 10);

    return {
      key: draft.id,
      label: set?.iconUri ? (
        <SetIcon uri={set.iconUri} className="mx-auto size-3.5" />
      ) : (
        draft.setCode.toUpperCase()
      ),
      score: draft.overallScore,
      href: `/review/${draft.id}`,
      title: `${name}${draft.colorPair ? ` ${draft.colorPair}` : ""}, ${on}: ${draft.overallScore.toFixed(1)}, ${pct(draft.accuracy)} best-pick accuracy`,
    };
  });

  return (
    <Panel
      title={`Your last ${columns.length} draft${columns.length === 1 ? "" : "s"}`}
      aside={<span className="text-xs text-base-content/50">oldest first</span>}
      bodyClassName="gap-3"
    >
      <ScorePlot columns={columns} label={spoken("Score by draft, oldest first", columns)} />
      <p className="text-xs leading-relaxed text-base-content/50">
        One column per finished draft. Open any of them to step back through the picks it is
        made of.
      </p>
    </Panel>
  );
}

type Stats = FunctionReturnType<typeof api.stats.overview>;

/**
 * How many drafts the digest-built panels actually cover.
 *
 * Absent when it is all of them. The per-pick panels are built on the digest a
 * draft writes when it finishes, rather than on the summaries the header
 * averages, and a draft that finished before digests existed has none -- so they
 * say what they are built on rather than inheriting the header's count.
 */
function coverage(data: Stats) {
  if (data.countedDrafts >= data.overall.drafts) return undefined;
  return (
    <span className="text-xs tabular-nums text-base-content/50">
      {data.countedDrafts} of {data.overall.drafts} drafts
    </span>
  );
}

/** One plot's worth of columns, said as a sentence for anyone who cannot see it. */
const spoken = (subject: string, columns: ScoreColumn[]): string =>
  `${subject} — ${columns.map((c) => c.title).join("; ")}`;

/**
 * The two cuts of the same number, side by side and drawn to one axis.
 *
 * They are together because they are a pair of questions about the same slip:
 * whether it happens in a particular pack, or at a particular depth into every
 * pack. Either one alone invites the wrong reading of the other.
 */
function Breakdowns({ data }: { data: Stats }) {
  const { byPackNo, byPickNo, countedDrafts } = data;

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

  const covers = coverage(data);

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
        aside={covers}
        className="lg:w-64 lg:shrink-0"
        bodyClassName="gap-3"
      >
        <ScorePlot columns={packs} label={spoken("Average score by pack", packs)} />
        <p className="text-xs leading-relaxed text-base-content/50">
          Pack three is drafted with a deck already half-decided, so a slip here is usually a
          pool that stopped offering anything you can play.
        </p>
      </Panel>

      <Panel title="By pick" aside={covers} className="lg:flex-1" bodyClassName="gap-3">
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

/**
 * The picks that cost the most win rate, worst first.
 *
 * The one panel here that names a card rather than a number, and the reason the
 * page is worth opening twice: an average tells somebody they are a B+ drafter
 * and this tells them which card they keep passing.
 *
 * Capped by the query rather than by the page. Each draft keeps only its own
 * worst DIGEST_MISTAKES, which answers a global worst-N exactly up to that and
 * silently starts missing picks past it -- so `stats.overview` clamps instead of
 * serving a wrong list, and asking for more here would get the same ten.
 */
function Mistakes({ data }: { data: Stats }) {
  if (data.topMistakes.length === 0) return null;

  return (
    <Panel title="Biggest missed picks" aside={coverage(data)}>
      <ul className="flex flex-col">
        {/* Keyed by position in the list, because the same miss made twice in
            two drafts is two identical rows and both belong here. */}
        {data.topMistakes.map((m, i) => (
          <li
            key={`${i}-${m.setCode}-${m.packNo}-${m.pickNo}`}
            className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-base-300 py-1.5 text-sm last:border-0"
          >
            <span>
              <span className="mr-1.5 tabular-nums text-base-content/60">
                {m.setCode.toUpperCase()} P{m.packNo}P{m.pickNo}
              </span>
              took {m.pickedName}
            </span>
            <span className="text-base-content/60">
              over {m.bestName}{" "}
              {/* The gap the grade is made of, in the percentage points cards
                  are compared in -- the same subtraction, said the way the
                  glossary's ruler says it. */}
              <span className="tabular-nums">{points(m.bestValue - m.pickedValue)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

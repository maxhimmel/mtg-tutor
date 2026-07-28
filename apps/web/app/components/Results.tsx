"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { CardName } from "./CardText";
import { Panel } from "./Panel";

export function Results({ sessionId }: { sessionId: Id<"draftSessions"> }) {
  const results = useQuery(api.draft.results, { sessionId });

  if (results === undefined) return <p className="text-base-content/60">Tallying up…</p>;

  const { summary, deck, mistakes } = results;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Panel
          title={`Suggested deck — ${deck.colors.join("") || "splashy"}`}
          aside={
            <span className="text-xs tabular-nums text-base-content/50">
              {deck.spells.length} spells
              {deck.nonbasicLands.length > 0 && ` + ${deck.nonbasicLands.length} lands`} +{" "}
              {deck.basicLands} basics
            </span>
          }
        >
          <CardPlacardList
            cards={[...deck.spells, ...deck.nonbasicLands]}
            trailing={(c) => pct(c.gihWinRate)}
          />
        </Panel>

        {mistakes.length > 0 && (
          <Panel title="Biggest missed picks">
            <ul className="flex flex-col">
              {mistakes.map((m) => (
                <li
                  key={`${m.packNo}-${m.pickNo}`}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-base-300 py-1.5 text-sm last:border-0"
                >
                  <span>
                    <span className="mr-1.5 tabular-nums text-base-content/60">
                      P{m.packNo}P{m.pickNo}
                    </span>
                    took <CardName card={m.picked} />
                  </span>
                  <span className="text-base-content/60">
                    over <CardName card={m.best} />{" "}
                    <span className="tabular-nums">+{(m.cost * 100).toFixed(1)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        {results.ratedCardCount === 0 && (
          <div role="alert" className="alert alert-warning">
            <span>
              <strong>This set has no 17Lands data.</strong> Cards were valued by rarity
              alone, so the score is inflated — when every card is worth about the same, a
              &ldquo;wrong&rdquo; pick barely costs anything. The missed-picks list is
              empty for the same reason: explaining a miss needs win rates. You still took
              something other than the top-valued card on{" "}
              {Math.round((1 - summary.accuracy) * summary.pickCount)} of {summary.pickCount}{" "}
              picks.
            </span>
          </div>
        )}

        {/* The draft's answer to the per-pick grade, set the same way so the two
            read as the same verdict at two scales. */}
        <Panel title="Result" bodyClassName="gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold leading-none tracking-tight">
              {summary.overallScore.toFixed(1)}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">/100</span>
          </div>

          <dl className="flex flex-col border-t border-base-300 pt-2 text-sm">
            {[
              ["Best-pick accuracy", `${(summary.accuracy * 100).toFixed(0)}%`],
              ["Colors", summary.colorPair || "—"],
              ["Picks", String(summary.pickCount)],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 py-1 tabular-nums">
                <dt className="text-base-content/60">{term}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel>
          {/* The moment anyone is most likely to want the walkthrough is the
              moment they have just seen the grade it explains. */}
          <Link href={`/review/${sessionId}`} className="btn btn-primary w-full">
            Review it pick by pick
          </Link>
          <Link href="/" className="link link-hover text-sm text-base-content/60">
            Draft another set →
          </Link>
        </Panel>
      </aside>
    </div>
  );
}

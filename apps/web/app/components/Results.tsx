"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";

export function Results({ sessionId }: { sessionId: Id<"draftSessions"> }) {
  const results = useQuery(api.draft.results, { sessionId });
  const save = useMutation(api.draft.save);
  const [saved, setSaved] = useState(false);

  if (results === undefined) return <p className="text-base-content/60">Tallying up…</p>;

  const { summary, deck, mistakes } = results;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-2 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Suggested deck — {deck.colors.join("") || "splashy"}
            </h2>
            <p className="text-base-content/60">
              {deck.spells.length} spells + {deck.lands} lands
            </p>
            <div className="grid gap-0.5">
              {/* Keyed by position, not name: drafting two copies of the same
                  card is normal, so names are not unique in a pool. */}
              {deck.spells.map((c, i) => (
                <div
                  key={`${c.name}-${i}`}
                  className="flex justify-between gap-4 border-b border-base-300 py-1 text-sm"
                >
                  <span>{c.name}</span>
                  <span className="text-base-content/60">{pct(c.gihWinRate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="card border border-base-300 bg-base-200">
            <div className="card-body gap-2 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                Biggest missed picks
              </h2>
              <div className="grid gap-0.5">
                {mistakes.map((m) => (
                  <div
                    key={`${m.packNo}-${m.pickNo}`}
                    className="flex justify-between gap-4 border-b border-base-300 py-1 text-sm"
                  >
                    <span>
                      <span className="text-base-content/60">
                        P{m.packNo}P{m.pickNo}
                      </span>{" "}
                      took {m.picked.name}
                    </span>
                    <span className="text-base-content/60">
                      over {m.best.name} (+{(m.cost * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
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

        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-2 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
              Result
            </h2>
            <div className="flex justify-between py-0.5 tabular-nums">
              <span className="text-base-content/60">Overall score</span>
              <strong>{summary.overallScore.toFixed(1)}/100</strong>
            </div>
            <div className="flex justify-between py-0.5 tabular-nums">
              <span className="text-base-content/60">Best-pick accuracy</span>
              <strong>{(summary.accuracy * 100).toFixed(0)}%</strong>
            </div>
            <div className="flex justify-between py-0.5 tabular-nums">
              <span className="text-base-content/60">Colors</span>
              <strong>{summary.colorPair || "—"}</strong>
            </div>
            <div className="flex justify-between py-0.5 tabular-nums">
              <span className="text-base-content/60">Picks</span>
              <strong>{summary.pickCount}</strong>
            </div>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-200">
          <div className="card-body gap-2 p-4">
            <button
              className="btn btn-primary w-full"
              disabled={saved || results.saved}
              onClick={async () => {
                await save({ sessionId });
                setSaved(true);
              }}
            >
              {saved || results.saved ? "Saved" : "Save this draft"}
            </button>
            <p className="text-sm text-base-content/60">
              <Link href="/">Draft another set →</Link>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

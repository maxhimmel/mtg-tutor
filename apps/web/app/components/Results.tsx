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

  if (results === undefined) return <p className="muted">Tallying up…</p>;

  const { summary, deck, mistakes } = results;

  return (
    <div className="board">
      <div>
        <div className="panel">
          <h2>Suggested deck — {deck.colors.join("") || "splashy"}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {deck.spells.length} spells + {deck.lands} lands
          </p>
          <div className="deck">
            {/* Keyed by position, not name: drafting two copies of the same
                card is normal, so names are not unique in a pool. */}
            {deck.spells.map((c, i) => (
              <div key={`${c.name}-${i}`} className="deckRow">
                <span>{c.name}</span>
                <span className="muted">{pct(c.gihWinRate)}</span>
              </div>
            ))}
          </div>
        </div>

        {mistakes.length > 0 && (
          <div className="panel">
            <h2>Biggest missed picks</h2>
            <div className="deck">
              {mistakes.map((m) => (
                <div key={`${m.packNo}-${m.pickNo}`} className="deckRow">
                  <span>
                    <span className="muted">
                      P{m.packNo}P{m.pickNo}
                    </span>{" "}
                    took {m.picked.name}
                  </span>
                  <span className="muted">
                    over {m.best.name} (+{(m.cost * 100).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside>
        {results.ratedCardCount === 0 && (
          <div className="warn">
            <strong>This set has no 17Lands data.</strong> Cards were valued by rarity
            alone, so the score is inflated — when every card is worth about the same, a
            &ldquo;wrong&rdquo; pick barely costs anything. The missed-picks list is
            empty for the same reason: explaining a miss needs win rates. You still took
            something other than the top-valued card on{" "}
            {Math.round((1 - summary.accuracy) * summary.pickCount)} of{" "}
            {summary.pickCount} picks.
          </div>
        )}

        <div className="panel">
          <h2>Result</h2>
          <div className="stat">
            <span className="muted">Overall score</span>
            <strong>{summary.overallScore.toFixed(1)}/100</strong>
          </div>
          <div className="stat">
            <span className="muted">Best-pick accuracy</span>
            <strong>{(summary.accuracy * 100).toFixed(0)}%</strong>
          </div>
          <div className="stat">
            <span className="muted">Colors</span>
            <strong>{summary.colorPair || "—"}</strong>
          </div>
          <div className="stat">
            <span className="muted">Picks</span>
            <strong>{summary.pickCount}</strong>
          </div>
        </div>

        <div className="panel">
          <button
            className="primary"
            disabled={saved || results.saved}
            onClick={async () => {
              await save({ sessionId });
              setSaved(true);
            }}
            style={{ width: "100%" }}
          >
            {saved || results.saved ? "Saved" : "Save this draft"}
          </button>
          <p className="muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>
            <Link href="/">Draft another set →</Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

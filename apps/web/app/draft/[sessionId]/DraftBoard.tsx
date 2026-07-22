"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { type Card, type PickScore, explainPick } from "@mtg-tutor/core";
import { AuthButton } from "../../components/AuthButton";
import { CardTile } from "../../components/CardTile";
import { Results } from "../../components/Results";
import { COLOR_NAMES, gradeColor, pct } from "../../lib/format";
import { convexSiteUrl } from "../../lib/convexSite";

const SITE = convexSiteUrl;

interface LastPick {
  score: PickScore;
  signal?: string;
  pickIndex: number;
}

export function DraftBoard({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const state = useQuery(api.draft.state, { sessionId: id });
  const pickCard = useMutation(api.draft.pick);
  const { getAccessToken } = useAccessToken();

  const [last, setLast] = useState<LastPick | null>(null);
  const [coach, setCoach] = useState("");
  const [picking, setPicking] = useState(false);

  // Guards against an earlier pick's stream overwriting a later one when the
  // player picks faster than the coach can answer.
  const streamRun = useRef(0);

  const streamCoach = useCallback(
    async (pickIndex: number, score: PickScore) => {
      const run = ++streamRun.current;
      const fallback = () => {
        if (run === streamRun.current) setCoach(explainPick(score).join("\n"));
      };

      setCoach("");
      if (!SITE) return fallback();

      try {
        // /coach spends the deployment's Anthropic key, so it rejects anonymous
        // callers. This is a plain fetch rather than a Convex call, so the token
        // the ConvexReactClient already holds has to be attached by hand.
        const token = await getAccessToken();

        const res = await fetch(`${SITE}/coach`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId, pickIndex }),
        });

        // 401 unauthenticated, 503 when no API key is configured; fall back to
        // the deterministic explanation rather than leaving the panel empty.
        if (!res.ok || !res.body) return fallback();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (run !== streamRun.current) {
            await reader.cancel();
            return;
          }
          text += decoder.decode(value, { stream: true });
          setCoach(text);
        }
      } catch {
        fallback();
      }
    },
    [sessionId, getAccessToken],
  );

  async function onPick(card: Card) {
    if (picking) return;
    setPicking(true);
    try {
      const result = await pickCard({ sessionId: id, cardName: card.name });
      const score = result.score as PickScore;
      setLast({ score, signal: result.signal, pickIndex: result.pickIndex });
      void streamCoach(result.pickIndex, score);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  }

  if (state === undefined) {
    return (
      <main className="shell">
        <p className="muted">Loading draft…</p>
      </main>
    );
  }

  const poolColors = new Map<string, number>();
  for (const c of state.pool) {
    for (const col of c.colors) poolColors.set(col, (poolColors.get(col) ?? 0) + 1);
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            mtg<span>-</span>tutor
          </Link>{" "}
          <span className="muted" style={{ fontWeight: 400 }}>
            {state.setCode.toUpperCase()}
          </span>
        </div>
        <div className="counter">
          {state.complete ? (
            <strong>Draft complete</strong>
          ) : (
            <>
              Pack <strong>{state.packNo}</strong> · Pick <strong>{state.pickNo}</strong> ·{" "}
              {state.pack.length} cards · pool <strong>{state.pool.length}</strong>
            </>
          )}
        </div>
        <AuthButton />
      </div>

      {state.complete ? (
        <Results sessionId={id} />
      ) : (
        <div className="board">
          <div className="pack">
            {state.pack.map((card) => (
              <CardTile key={card.name} card={card} onPick={onPick} disabled={picking} />
            ))}
          </div>

          <aside>
            <div className="panel">
              <h2>Last pick</h2>
              {last ? (
                <>
                  <div className="gradeRow">
                    <span className="grade" style={{ color: gradeColor(last.score.grade) }}>
                      {last.score.grade}
                    </span>
                    <span className="score">{last.score.score}/100</span>
                  </div>
                  <div>{last.score.picked.name}</div>
                  {!last.score.isBest && (
                    <div className="best">
                      best was {last.score.best.name} ({pct(last.score.best.gihWinRate)})
                    </div>
                  )}
                  {last.signal && <div className="signal">{last.signal}</div>}
                  <div className="coach">
                    <span className="label">Coach</span>
                    {coach || <span className="muted">thinking…</span>}
                  </div>
                </>
              ) : (
                <p className="muted">Pick a card to see how it scored.</p>
              )}
            </div>

            <div className="panel">
              <h2>Pool ({state.pool.length})</h2>
              {poolColors.size === 0 ? (
                <p className="muted">Nothing drafted yet.</p>
              ) : (
                <div className="pool">
                  {[...poolColors]
                    .sort((a, b) => b[1] - a[1])
                    .map(([color, n]) => (
                      <span key={color} className="pip">
                        {COLOR_NAMES[color] ?? color} {n}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

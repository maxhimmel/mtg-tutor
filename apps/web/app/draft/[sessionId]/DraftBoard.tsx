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
import { PicksColumn } from "../../components/PicksColumn";
import { Results } from "../../components/Results";
import { SettingsToggle } from "../../components/SettingsToggle";
import { gradeColor, pct } from "../../lib/format";
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
      <main className="mx-auto max-w-[1500px] px-6 py-5">
        <p className="text-base-content/60">Loading draft…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4 border-b border-base-300 pb-3">
        <div className="text-lg font-bold tracking-tight">
          <Link href="/" className="no-underline text-base-content">
            mtg<span className="text-primary">-</span>tutor
          </Link>{" "}
          <span className="font-normal text-base-content/60">{state.setCode.toUpperCase()}</span>
        </div>
        <div className="tabular-nums text-base-content/60">
          {state.complete ? (
            <strong className="text-base-content">Draft complete</strong>
          ) : (
            <>
              Pack <strong className="text-base-content">{state.packNo}</strong> · Pick{" "}
              <strong className="text-base-content">{state.pickNo}</strong> · {state.pack.length}{" "}
              cards · pool <strong className="text-base-content">{state.pool.length}</strong>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <SettingsToggle />
          <AuthButton />
        </div>
      </div>

      {state.complete ? (
        <Results sessionId={id} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
            {state.pack.map((card) => (
              <CardTile key={card.name} card={card} onPick={onPick} disabled={picking} />
            ))}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="card border border-base-300 bg-base-200">
              <div className="card-body gap-2 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                  Last pick
                </h2>
                {last ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="text-2xl font-bold tracking-tight"
                        style={{ color: gradeColor(last.score.grade) }}
                      >
                        {last.score.grade}
                      </span>
                      <span className="tabular-nums text-base-content/60">
                        {last.score.score}/100
                      </span>
                    </div>
                    <div>{last.score.picked.name}</div>
                    {!last.score.isBest && (
                      <div className="text-sm text-primary">
                        best was {last.score.best.name} ({pct(last.score.best.gihWinRate)})
                      </div>
                    )}
                    {last.signal && <div className="text-sm text-info">{last.signal}</div>}
                    <div className="mt-2 min-h-[3.2rem] whitespace-pre-wrap border-t border-base-300 pt-2">
                      <span className="mb-1 block text-xs text-base-content/60">Coach</span>
                      {coach || <span className="text-base-content/60">thinking…</span>}
                    </div>
                  </>
                ) : (
                  <p className="text-base-content/60">Pick a card to see how it scored.</p>
                )}
              </div>
            </div>

            <PicksColumn pool={state.pool} />
          </aside>
        </div>
      )}
    </main>
  );
}

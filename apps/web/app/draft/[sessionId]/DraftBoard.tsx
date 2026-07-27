"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import {
  type Card,
  type PickScore,
  explainPick,
  isDecisionPick,
  loadPrinciples,
  splitCitations,
} from "@mtg-tutor/core";
import { CardName, CardText } from "../../components/CardText";
import { CardTile } from "../../components/CardTile";
import { PicksColumn } from "../../components/PicksColumn";
import { PrincipleBadges } from "../../components/PrincipleBadge";
import { Results } from "../../components/Results";
import { SetIcon } from "../../components/SetIcon";
import { UserMenu } from "../../components/UserMenu";
import { gradeColor, pct } from "../../lib/format";
import { useSettings } from "../../lib/useSettings";
import { convexSiteUrl } from "../../lib/convexSite";

const SITE = convexSiteUrl;
const PRINCIPLES = loadPrinciples();

interface LastPick {
  score: PickScore;
  signal?: string;
  pickIndex: number;
  cardsInPack: number;
}

export function DraftBoard({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const state = useQuery(api.draft.state, { sessionId: id });
  const pickCard = useMutation(api.draft.pick);
  const { getAccessToken } = useAccessToken();

  const { settings } = useSettings();
  const [last, setLast] = useState<LastPick | null>(null);
  const [coach, setCoach] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [picking, setPicking] = useState(false);

  // Guards against an earlier pick's stream overwriting a later one when the
  // player picks faster than the coach can answer.
  const streamRun = useRef(0);

  const streamCoach = useCallback(
    async (pickIndex: number, score: PickScore, cardsInPack: number, force = false) => {
      const run = ++streamRun.current;
      const fallback = () => {
        if (run === streamRun.current) setCoach(explainPick(score).join("\n"));
      };
      const skip = () => {
        if (run === streamRun.current) setSkipped(true);
        fallback();
      };

      // Forcing means "coach this one regardless": a floor of 1 passes any pack
      // that still has a card in it, which is every pack you can pick from.
      const minPackCards = force ? 1 : settings.coachMinPackCards;

      setCoach("");
      setSkipped(false);

      // Checked here as well as server-side so a forced pick costs no round
      // trip, not just no tokens.
      if (!isDecisionPick(cardsInPack, minPackCards)) return skip();
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
          body: JSON.stringify({ sessionId, pickIndex, minPackCards }),
        });

        // 204 is the server agreeing this pick was forced -- it can disagree
        // with us, since it owns the clamp and we do not.
        if (res.status === 204) return skip();

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
    [sessionId, getAccessToken, settings.coachMinPackCards],
  );

  // Every card the coach could plausibly name: what is in front of you, what
  // you have taken, and the card the data preferred.
  const boardCards = useMemo(() => {
    const cards: Card[] = [...(state?.pack ?? []), ...(state?.pool ?? [])];
    if (last) cards.push(last.score.best, last.score.picked);
    return cards;
  }, [state?.pack, state?.pool, last]);

  // Recomputed on every streamed chunk, which is why splitCitations tolerates a
  // half-arrived citation rather than flashing "[EVA" into the prose.
  const advice = useMemo(() => splitCitations(coach, PRINCIPLES), [coach]);

  async function onPick(card: Card) {
    if (picking) return;
    setPicking(true);
    // Read before the mutation returns: `result` already holds the next pack.
    const cardsInPack = state?.pack.length ?? 0;
    try {
      const result = await pickCard({ sessionId: id, cardName: card.name });
      const score = result.score as PickScore;
      setLast({ score, signal: result.signal, pickIndex: result.pickIndex, cardsInPack });
      void streamCoach(result.pickIndex, score, cardsInPack);
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
        <div className="flex flex-wrap items-baseline gap-4">
          <div className="text-lg font-bold tracking-tight">
            <Link href="/" className="no-underline text-base-content">
              mtg<span className="text-primary">-</span>tutor
            </Link>{" "}
            <span className="inline-flex items-baseline gap-1.5 font-normal text-base-content/60">
              <SetIcon
                uri={state.setIcon}
                name={state.setName}
                className="size-4 self-center"
              />
              <span title={state.setName}>{state.setCode.toUpperCase()}</span>
            </span>
          </div>
          <Link href="/principles" className="text-sm text-base-content/60 hover:text-primary">
            Draft principles
          </Link>
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
        <UserMenu />
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
                    <div>
                      <CardName card={last.score.picked} />
                    </div>
                    {!last.score.isBest && (
                      <div className="text-sm">
                        best was <CardName card={last.score.best} /> (
                        {pct(last.score.best.gihWinRate)})
                      </div>
                    )}
                    {last.signal && <div className="text-sm text-info">{last.signal}</div>}
                    <div className="mt-2 min-h-[3.2rem] border-t border-base-300 pt-2">
                      <span className="mb-1 block text-xs text-base-content/60">
                        {skipped ? "Coach — skipped, this pick was forced" : "Coach"}
                      </span>
                      <div className="whitespace-pre-wrap">
                        {coach ? (
                          <CardText text={advice.prose} cards={boardCards} />
                        ) : (
                          <span className="text-base-content/60">thinking…</span>
                        )}
                      </div>
                      <PrincipleBadges principles={advice.principles} />
                      {skipped && (
                        <button
                          className="btn btn-outline btn-xs mt-2"
                          onClick={() =>
                            void streamCoach(last.pickIndex, last.score, last.cardsInPack, true)
                          }
                        >
                          Coach this pick anyway
                        </button>
                      )}
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

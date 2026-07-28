"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { PageNotice, PageShell } from "../../components/PageShell";
import { CardText } from "../../components/CardText";
import { CardTile } from "../../components/CardTile";
import { Panel } from "../../components/Panel";
import { PicksColumn } from "../../components/PicksColumn";
import { PrincipleBadges } from "../../components/PrincipleBadge";
import { Results } from "../../components/Results";
import { SetIcon } from "../../components/SetIcon";
import { Verdict } from "../../components/Verdict";
import { useSettings } from "../../lib/useSettings";
import { convexSiteUrl } from "../../lib/convexSite";

const SITE = convexSiteUrl;
const PRINCIPLES = loadPrinciples();

type DraftState = FunctionReturnType<typeof api.draft.state>;

interface LastPick {
  score: PickScore;
  signal?: string;
  pickIndex: number;
  // The pack this pick chose from, captured before the mutation swaps it for
  // the next one. The coach talks about these cards and nothing else holds them.
  pack: Card[];
}

export function DraftBoard({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const pickCard = useMutation(api.draft.pick);
  const { getAccessToken } = useAccessToken();

  // Loaded once, then advanced from what `pick` returns, rather than held open
  // as a live subscription. Replaying a draft costs a ~240KB read of the set's
  // card pool, and a subscription re-runs on every write to the session -- so
  // every pick paid for that read twice, once in the mutation and once in the
  // invalidated query. A draft is single-player and its board only ever changes
  // because this component changed it, so there is nothing to subscribe to.
  const [state, setState] = useState<DraftState | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { settings } = useSettings();
  const [last, setLast] = useState<LastPick | null>(null);
  const [coach, setCoach] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [picking, setPicking] = useState(false);

  // Guards against an earlier pick's stream overwriting a later one when the
  // player picks faster than the coach can answer.
  const streamRun = useRef(0);

  // Ownership is checked server-side, so this has to wait for the token: the
  // subscription this replaced re-ran itself once auth arrived, and a one-shot
  // read fired too early would just fail.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    convex
      .query(api.draft.state, { sessionId: id })
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [convex, id, isAuthenticated]);

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

  // Every card the coach could plausibly name: what is in front of you, what you
  // have taken, and the pack it is actually coaching -- which is no longer the
  // pack in front of you, since picking advanced the board. Without that last
  // one only the pick and the data's pick could ever be matched, and the rest of
  // the pack the coach compared them against rendered as plain text.
  const boardCards = useMemo(
    () => [...(state?.pack ?? []), ...(state?.pool ?? []), ...(last?.pack ?? [])],
    [state?.pack, state?.pool, last],
  );

  // Recomputed on every streamed chunk, which is why splitCitations tolerates a
  // half-arrived citation rather than flashing "[EVA" into the prose.
  const advice = useMemo(() => splitCitations(coach, PRINCIPLES), [coach]);

  async function onPick(card: Card) {
    if (picking) return;
    setPicking(true);
    // Read before the mutation returns: `result` already holds the next pack.
    const pack = state?.pack ?? [];
    try {
      const result = await pickCard({ sessionId: id, cardName: card.name });
      const score = result.score as PickScore;
      // `pick` returns the whole next board, which is the reason this component
      // needs no subscription. Everything not listed here -- the set's name,
      // icon and format -- is fixed for the life of the session.
      setState((prev) =>
        prev && {
          ...prev,
          packNo: result.packNo,
          pickNo: result.pickNo,
          complete: result.complete,
          totalPicks: result.totalPicks,
          pack: result.pack,
          pool: result.pool,
        },
      );
      setLast({ score, signal: result.signal, pickIndex: result.pickIndex, pack });
      void streamCoach(result.pickIndex, score, pack.length);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  }

  if (loadError) {
    return <PageNotice tone="error">{loadError}</PageNotice>;
  }

  if (state === undefined) {
    return <PageNotice>Loading draft…</PageNotice>;
  }

  return (
    <PageShell
      headerAside={
        <div className="flex items-center gap-2.5 text-sm tabular-nums text-base-content/60">
          <span className="flex items-center gap-1.5 text-base-content/80" title={state.setName}>
            <SetIcon uri={state.setIcon} name={state.setName} className="size-4" />
            {state.setCode.toUpperCase()}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-base-300" />
          {state.complete ? (
            <span className="font-semibold text-base-content">Draft complete</span>
          ) : (
            <span>
              Pack <strong className="font-semibold text-base-content">{state.packNo}</strong> ·
              Pick <strong className="font-semibold text-base-content">{state.pickNo}</strong> ·{" "}
              {state.pack.length} in pack · pool{" "}
              <strong className="font-semibold text-base-content">{state.pool.length}</strong>
            </span>
          )}
        </div>
      }
    >
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
            <Panel title="Last pick" bodyClassName="gap-3">
              {last ? (
                <>
                  {/* Keyed by pick so each new verdict re-mounts and replays the
                      entrance -- the one animation in the app, on the one moment
                      the player is waiting for. */}
                  <div key={last.pickIndex} className="motion-safe:animate-verdict">
                    <Verdict score={last.score} />
                  </div>

                  {last.signal && <p className="text-sm text-info">{last.signal}</p>}

                  <div className="border-t border-base-300 pt-3">
                    <div className="eyebrow mb-1.5">
                      {skipped ? "Coach — skipped, this pick was forced" : "Coach"}
                    </div>
                    <div className="min-h-[3.2rem] whitespace-pre-wrap leading-relaxed">
                      {coach ? (
                        <CardText text={advice.prose} cards={boardCards} />
                      ) : (
                        <span className="text-base-content/60">thinking…</span>
                      )}
                    </div>
                    <PrincipleBadges principles={advice.principles} />
                    {skipped && (
                      <button
                        className="btn btn-outline btn-xs mt-3"
                        onClick={() =>
                          void streamCoach(last.pickIndex, last.score, last.pack.length, true)
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
            </Panel>

            <PicksColumn pool={state.pool} />
          </aside>
        </div>
      )}
    </PageShell>
  );
}

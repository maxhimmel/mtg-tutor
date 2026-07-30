"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import {
  type Card,
  type TextIndex,
  type PickScore,
  explainPick,
  hydrate,
  hydrateScore,
  isDecisionPick,
  loadPrinciples,
  splitCitations,
  textIndex,
} from "@mtg-tutor/core";
import { PageNotice, PageShell } from "../../components/PageShell";
import { CardText } from "../../components/CardText";
import { CardFace, CardTile } from "../../components/CardTile";
import { Panel } from "../../components/Panel";
import { PicksColumn } from "../../components/PicksColumn";
import { PrincipleBadges } from "../../components/PrincipleBadge";
import { Results } from "../../components/Results";
import { SetIcon } from "../../components/SetIcon";
import { Verdict } from "../../components/Verdict";
import { useSettings } from "../../lib/useSettings";
import { convexSiteUrl } from "../../lib/convexSite";
import { webpImage } from "../../lib/cardImage";
import { preloadImages } from "../../lib/preloadImages";

const SITE = convexSiteUrl;
const PRINCIPLES = loadPrinciples();

// The pack grid, shared by the pack, the pack being passed on, and the
// placeholder that stands in between them, so a pack arriving or leaving cannot
// shift the layout it moves through.
const PACK_GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5";

// How the pack changes hands. The durations mirror animate-deal/animate-pass in
// globals.css; the gap between cards lives here because the board is what knows
// how many are left in the pack, and the sequence is only as long as the pack.
const DEAL_STAGGER = 28;
const PASS_STAGGER = 24;
const PASS_MS = 300;
const passDuration = (cards: number) => PASS_MS + PASS_STAGGER * Math.max(0, cards - 1);

const motionOK = () =>
  typeof window === "undefined" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type DraftState = FunctionReturnType<typeof api.draft.state>;

interface LastPick {
  score: PickScore;
  signal?: string;
  pickIndex: number;
  // The pack this pick chose from, captured before the mutation swaps it for
  // the next one. The coach talks about these cards and nothing else holds them.
  pack: DraftState["pack"];
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

  // The set's rules text and art, read once for the session. The board that
  // comes back from every pick carries only what the engine deals in, so this
  // is the other half of a card and it is joined in below. It cannot change
  // while a draft is being played -- re-ingesting a set is what breaks a draft,
  // not what updates one -- so once is exactly right.
  const [text, setText] = useState<TextIndex | undefined>(undefined);

  const { settings } = useSettings();
  const [last, setLast] = useState<LastPick | null>(null);
  // The pack on its way to the next drafter. Held separately from the board
  // because for as long as it is leaving, two packs exist: this one and the one
  // arriving behind it.
  const [outgoing, setOutgoing] = useState<{ cards: Card[]; picked: string } | null>(null);
  // The card pulled out of the row and not yet taken. By name, because that is
  // what identifies a card everywhere else on the board.
  const [selected, setSelected] = useState<string | null>(null);
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

  // Chained off the board rather than fired alongside it, because the set this
  // session is drafting is not known until the board says so.
  const setCode = state?.setCode;
  const format = state?.format;
  useEffect(() => {
    if (!setCode || !format) return;
    let cancelled = false;

    convex
      .query(api.sets.cardText, { setCode, format })
      .then((rows) => {
        if (!cancelled) setText(textIndex(rows));
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [convex, setCode, format]);

  const streamCoach = useCallback(
    async (pickIndex: number, score: PickScore<Card>, cardsInPack: number, force = false) => {
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
        let prose = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (run !== streamRun.current) {
            await reader.cancel();
            return;
          }
          prose += decoder.decode(value, { stream: true });
          setCoach(prose);
        }

        // A 200 that says nothing is still a coach that did not answer, and it
        // is the shape a model call that produced no output actually takes: the
        // status went out long before the call failed, so there is no error code
        // left for the checks above to catch. Without this the panel just sits
        // blank for the rest of the pick.
        if (!prose.trim()) fallback();
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
  // Whole cards, joined from the text read once above. Everything below this
  // point works in Card; everything the server sent works in EngineCard.
  const pack = useMemo(() => (text ? hydrate(state?.pack ?? [], text) : []), [state?.pack, text]);
  const pool = useMemo(() => (text ? hydrate(state?.pool ?? [], text) : []), [state?.pool, text]);
  const lastView = useMemo(
    () =>
      last &&
      text && {
        ...last,
        score: hydrateScore(last.score, text),
        pack: hydrate(last.pack, text),
      },
    [last, text],
  );

  const selectedCard = useMemo(
    () => pack.find((card) => card.name === selected),
    [pack, selected],
  );

  const boardCards = useMemo(
    () => [...pack, ...pool, ...(lastView?.pack ?? [])],
    [pack, pool, lastView],
  );

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Held back until every card in it can be drawn. A pack is dealt all at once,
  // so the alternative is watching it assemble itself frame by frame.
  const [packReady, setPackReady] = useState(false);
  const packImages = useMemo(
    () => pack.flatMap((card) => (card.imageUrl ? [webpImage(card.imageUrl)] : [])),
    [pack],
  );
  useEffect(() => {
    let cancelled = false;
    setPackReady(false);
    void preloadImages(packImages).then(() => {
      if (!cancelled) setPackReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [packImages]);

  // Recomputed on every streamed chunk, which is why splitCitations tolerates a
  // half-arrived citation rather than flashing "[EVA" into the prose.
  const advice = useMemo(() => splitCitations(coach, PRINCIPLES), [coach]);

  // A click never spends the pick: it pulls the card out of the row, and the
  // pick is confirmed separately, because taking the wrong card by a stray click
  // is unrecoverable -- the draft moves on. Clicking the card you already pulled
  // therefore does nothing, on purpose: a click, a pause and another click is
  // someone rereading the card, not someone deciding. The shortcut for deciding
  // fast is a real double-click, which is a gesture rather than a repetition.
  function onTileClick(card: Card) {
    if (picking) return;
    setSelected(card.name);
  }

  async function onPick(card: Card) {
    if (picking || !text) return;
    setPicking(true);
    setSelected(null);
    // Read before the mutation returns: `result` already holds the next pack.
    const packBefore = state?.pack ?? [];

    // The pack you just picked from, held on screen so it can be passed on
    // rather than swapped out. It leaves on its own clock -- waiting for the
    // server first would make the wait feel like the animation.
    const passing = pack;
    setOutgoing({ cards: passing, picked: card.name });
    const sweep = window.setTimeout(
      () => setOutgoing(null),
      motionOK() ? passDuration(passing.length) : 0,
    );

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
      setLast({ score, signal: result.signal, pickIndex: result.pickIndex, pack: packBefore });
      void streamCoach(result.pickIndex, hydrateScore(score, text), packBefore.length);
    } catch (e) {
      // Nothing was passed after all, so put the pack back rather than let it
      // finish leaving.
      window.clearTimeout(sweep);
      setOutgoing(null);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  }

  if (loadError) {
    return <PageNotice tone="error">{loadError}</PageNotice>;
  }

  if (state === undefined || text === undefined) {
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
              {pack.length} in pack · pool{" "}
              <strong className="font-semibold text-base-content">{pool.length}</strong>
            </span>
          )}
        </div>
      }
    >
      {state.complete ? (
        <Results sessionId={id} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            {outgoing ? (
              <div key="outgoing" className={PACK_GRID} aria-hidden>
                {outgoing.cards.map((card, i) => {
                  const kept = card.name === outgoing.picked;
                  return (
                    <div
                      key={card.name}
                      className={`flex ${kept ? "motion-safe:animate-keep" : "motion-safe:animate-pass"}`}
                      // The card you took holds its place for as long as the rest
                      // of the pack takes to go, so it is the last thing on screen.
                      style={
                        kept
                          ? { animationDuration: `${passDuration(outgoing.cards.length)}ms` }
                          : { animationDelay: `${i * PASS_STAGGER}ms` }
                      }
                    >
                      <CardFace card={card} />
                    </div>
                  );
                })}
              </div>
            ) : packReady ? (
              <div key={`pack-${state.packNo}-${state.pickNo}`} className={PACK_GRID}>
                {pack.map((card, i) => (
                  <div
                    key={card.name}
                    className="relative flex motion-safe:animate-deal"
                    style={{ animationDelay: `${i * DEAL_STAGGER}ms` }}
                  >
                    <CardTile
                      card={card}
                      onPick={onTileClick}
                      onQuickPick={onPick}
                      disabled={picking}
                      selected={selected === card.name}
                      // What one click does, which is the same whether or not
                      // the card is already selected. Being selected is state,
                      // and aria-pressed is what carries it.
                      label={`Select ${card.name}`}
                    />
                    {/* Sits in the gap the card leaves as it lifts, so the label
                        is revealed by the pull rather than pasted over the art,
                        and its top edge meets the card's ring -- same material,
                        same turn, so the light reads as one thing. */}
                    {selected === card.name && (
                      // bottom-3 is the lift (-translate-y-3), which puts this
                      // box's bottom edge on the card's; translate-y-1/2 then
                      // drops it by half its own height, centring the badge on
                      // that edge whatever size the card is drawn at.
                      <span className="pointer-events-none absolute inset-x-0 bottom-3 flex translate-y-1/2 justify-center">
                        <span className="badge-lit px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                          Selected
                        </span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Waiting for the pack's art. The slots hold the pack's own shape
              // -- the right number of cards at the right size, so nothing moves
              // when the art lands -- and the set's symbol fills the drafting
              // area behind them, cropped by its edge, with a sheen crossing it.
              // The cards then arrive on top of it, out of the dark.
              <div className="relative isolate overflow-hidden rounded-box">
                <SetIcon
                  uri={state.setIcon}
                  className="pack-glyph pointer-events-none absolute -top-[10%] -right-[14%] -z-10 h-[120%] w-[70%] text-base-content/[0.07]"
                />
                <div className={PACK_GRID}>
                  {pack.map((card) => (
                    <span
                      key={card.name}
                      className="card-aspect block w-full rounded-xl bg-base-200/50"
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedCard && (
              <div className="sticky bottom-4 z-20 mt-4 flex justify-center">
                <div className="popup-surface flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <span className="font-display text-lg leading-tight">{selectedCard.name}</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={picking}
                    onClick={() => void onPick(selectedCard)}
                  >
                    Confirm pick
                  </button>
                  <span className="hidden text-xs text-base-content/50 sm:inline">
                    Double-click a card to skip this step · <kbd className="kbd kbd-xs">esc</kbd> to
                    clear
                  </span>
                </div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Panel title="Last pick" bodyClassName="gap-3">
              {lastView ? (
                <>
                  {/* Keyed by pick so each new verdict re-mounts and replays the
                      entrance -- the one animation in the app, on the one moment
                      the player is waiting for. */}
                  <div key={lastView.pickIndex} className="motion-safe:animate-verdict">
                    <Verdict score={lastView.score} />
                  </div>

                  {lastView.signal && <p className="text-sm text-info">{lastView.signal}</p>}

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
                          void streamCoach(lastView.pickIndex, lastView.score, lastView.pack.length, true)
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

            <PicksColumn pool={pool} />
          </aside>
        </div>
      )}
    </PageShell>
  );
}

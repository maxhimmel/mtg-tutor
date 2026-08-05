"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { FunctionReturnType } from "convex/server";
import { useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import {
  type Card,
  type CardContext,
  type Challenge,
  type ChallengeOutcome,
  type Confidence,
  type TextIndex,
  type PickScore,
  calibrationLine,
  challengeFor,
  claimOutcome,
  explainPick,
  hydrate,
  hydrateScore,
  isDecisionPick,
  loadPrinciples,
  normalizeName,
  packScoringContext,
  resolveChallenge,
  splitCitations,
  splitPool,
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
import { useSuspendPreview } from "../../components/CardPreview";
import { useSettings } from "../../lib/useSettings";
import { CoachDeclined, streamCoach as streamCoachFrom } from "../../lib/coach";
import { convexSiteUrl } from "../../lib/convexSite";
import { webpImage } from "../../lib/cardImage";
import { preloadImages } from "../../lib/preloadImages";
import { StateYourCase, TheChallenge } from "./Commitment";

const SITE = convexSiteUrl;
const PRINCIPLES = loadPrinciples();

// The pack grid, shared by the pack, the pack being passed on, and the
// placeholder that stands in between them, so a pack arriving or leaving cannot
// shift the layout it moves through.
const PACK_GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5";

// How the pack changes hands. One set of numbers for both halves, because
// arriving and leaving are the same motion: the duration mirrors
// animate-deal/animate-pass in globals.css, and the gap between cards lives here
// because the board is what knows how many are left in the pack -- the sequence
// is only ever as long as the pack.
const PACK_STAGGER = 24;
const PACK_MS = 300;
const passDuration = (cards: number) => PACK_MS + PACK_STAGGER * Math.max(0, cards - 1);

// Which way this pack is travelling. A draft reverses direction every pack --
// 1 left, 2 right, 3 left -- so in packs 1 and 3 the pack in front of you came
// from your right and goes to your left, and in pack 2 it is the other way
// round. 1 runs the animation right-to-left; -1 mirrors it. The engine owns the
// rule (core/draft/engine.ts `rotate`); this only has to agree with it.
const passDirection = (packNo: number) => (packNo % 2 === 1 ? 1 : -1);

const motionOK = () =>
  typeof window === "undefined" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// How far the mouse has to travel before a press becomes a drag. Under it, the
// press is still a click and the card is only being selected.
const DRAG_THRESHOLD = 8;

// Re-measured every frame rather than once at the start of a drag, because the
// sideboard section appears the moment a card is lifted -- which moves the
// maindeck section a drag measured before it existed would still be aiming at.
// Hoisted because DndContext keeps this by reference.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } } as const;

// One card in the pack, and the box a drag measures. The ref goes here rather
// than on the tile because this element's rectangle is the card's true size --
// hover-3d tilts and scales the tile's first child, not the tile -- and because
// animate-deal fills `both`, so its final transform and opacity outlive the
// animation and beat anything set on this element afterwards. Everything that
// changes while dragging is therefore set inside the tile.
function PackTile({
  card,
  index,
  disabled,
  selected,
  onClick,
  onQuickPick,
}: {
  card: Card;
  index: number;
  disabled: boolean;
  selected: boolean;
  onClick: (card: Card) => void;
  onQuickPick: (card: Card) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    // By position, not by name: a pack can hold two of the same card, and two
    // draggables cannot share an id.
    id: `pack-${index}`,
    data: { card },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className="relative flex motion-safe:animate-deal"
      style={{ animationDelay: `${index * PACK_STAGGER}ms` }}
    >
      <CardTile
        card={card}
        onPick={onClick}
        onQuickPick={onQuickPick}
        disabled={disabled}
        selected={selected}
        dragListeners={listeners}
        dragging={isDragging}
        // What one click does, which is the same whether or not the card is
        // already selected. Being selected is state, and aria-pressed is what
        // carries it.
        label={`Select ${card.name}`}
      />
      {/* Sits in the gap the card leaves as it lifts, so the label is revealed
          by the pull rather than pasted over the art, and its top edge meets the
          card's ring -- same material, same turn, so the light reads as one
          thing.

          bottom-3 is the lift (-translate-y-3), which puts this box's bottom
          edge on the card's; translate-y-1/2 then drops it by half its own
          height, centring the badge on that edge whatever size the card is drawn
          at. */}
      {selected && !isDragging && (
        <span className="pointer-events-none absolute inset-x-0 bottom-3 flex translate-y-1/2 justify-center">
          <span className="badge-lit px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Selected
          </span>
        </span>
      )}
    </div>
  );
}

type DraftState = FunctionReturnType<typeof api.draft.state>;

// The card taken and the pile it is going to, carried through the two screens
// between choosing it and spending the pick. `carried` means the player pulled
// it out of the pack by hand, which changes nothing about the pick and
// everything about what is left behind -- see the pass animation below.
interface Proposal {
  card: Card;
  bench: boolean;
  carried: boolean;
}

// Where a pick is between being chosen and being made. Two screens, in the order
// the argument has to happen in: you say what you think, and only then are you
// argued with. Turning those round would be a quiz with the answer on the card.
type Pending =
  | { stage: "reason"; proposal: Proposal }
  | {
      stage: "challenge";
      proposal: Proposal;
      reason: string;
      confidence: Confidence;
      challenge: Challenge;
    };

// What the player committed to, on its way to the mutation. `outcome` never
// goes to the server: it is the resolved pair for the reveal to read, and the
// row keeps the four facts the coach needs instead.
interface Defense {
  reason: string;
  confidence: Confidence;
  challengedName?: string;
  proposedName?: string;
  outcome?: ChallengeOutcome;
  /**
   * The card the BROWSER made the pack's context-best while building the
   * challenge -- the better of the pair it put up. Kept so the reveal can check
   * it against the card the server actually graded against.
   *
   * Both sides rank the same pack through `packScoringContext` and should always
   * agree. This is what happens when they do not: rather than grade a player's
   * stated certainty over a pair the server has since contradicted, the reveal
   * drops the calibration reading entirely. Being told nothing is recoverable;
   * being argued into defending one comparison and then scored on a different
   * one is exactly the failure that makes a demanding flow worse than a passive
   * one.
   */
  expectedBestName?: string;
}

interface LastPick {
  score: PickScore;
  signal?: string;
  pickIndex: number;
  // The pack this pick chose from, captured before the mutation swaps it for
  // the next one. The coach talks about these cards and nothing else holds them.
  pack: DraftState["pack"];
  // How the challenge went. Kept apart from the score because it is about the
  // PAIR the player was actually shown, which is not always the pair the grade
  // is measured over: someone who switches to the context-best is graded against
  // a card they took, and the interesting comparison is the one they left.
  call?: { confidence: Confidence; outcome: ChallengeOutcome };
}

export function DraftBoard({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const pickCard = useMutation(api.draft.pick);
  const benchCard = useMutation(api.draft.bench);
  const { getAccessToken } = useAccessToken();
  const suspendPreview = useSuspendPreview();

  // A mouse sensor, not a pointer one. Pointer events also fire for touch, where
  // a vertical flick past the threshold arms a drag and then cancels the scroll
  // it was actually meant to be -- and the pack grid is the whole screen on a
  // phone. Dragging is what a mouse adds; the confirm bar's two buttons are the
  // path for everyone, and they reach both piles.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_THRESHOLD } }),
  );

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

  // What scoring reads to rank THIS pack against the deck being built. Fetched
  // per pack rather than per set: fourteen rows, against the ~50KB the set's
  // would cost.
  //
  // Absent means no challenge, and in-flight and unreadable are deliberately the
  // same absence -- there is nothing useful to say differently about them, and a
  // challenge computed WITHOUT this would rank the pack on raw power and argue
  // for a card the server then does not grade against. Better to skip the
  // argument than to make one the reveal will contradict.
  const [packContext, setPackContext] = useState<Map<string, CardContext> | undefined>(
    undefined,
  );

  const { settings } = useSettings();
  const [last, setLast] = useState<LastPick | null>(null);
  // The pack on its way to the next drafter. Held separately from the board
  // because for as long as it is leaving, two packs exist: this one and the one
  // arriving behind it.
  // packNo travels with it: by the time this pack is leaving, the board may
  // already be on the next one, and pack 2 leaves the other way round.
  const [outgoing, setOutgoing] = useState<{
    cards: Card[];
    picked: string;
    packNo: number;
  } | null>(null);
  // The card pulled out of the row and not yet taken. By name, because that is
  // what identifies a card everywhere else on the board.
  const [selected, setSelected] = useState<string | null>(null);
  // The card in hand, drawn under the cursor for as long as it is being carried.
  const [carrying, setCarrying] = useState<Card | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // A pick that would not go through. Shown on the stage the player is standing
  // on rather than in an alert, because that stage is also where the way out is.
  const [commitError, setCommitError] = useState<string | null>(null);
  const [coach, setCoach] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [picking, setPicking] = useState(false);

  // Guards against an earlier pick's stream overwriting a later one when the
  // player picks faster than the coach can answer.
  const streamRun = useRef(0);
  // The double-submit latch. State cannot do this job: two clicks in the same
  // tick both read the pre-render value.
  const committing = useRef(false);
  // The last sideboard write, so a pick can wait for it. See `propose`.
  const benchInFlight = useRef<Promise<unknown> | null>(null);

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

  // Fetched the moment a pack lands, not when the player commits: they spend
  // seconds reading the pack, and the challenge should already be waiting when
  // they finish typing.
  const packNames = useMemo(() => (state?.pack ?? []).map((c) => c.name), [state?.pack]);
  useEffect(() => {
    if (!setCode || !format || packNames.length === 0) return;
    let cancelled = false;
    setPackContext(undefined);

    convex
      .query(api.sets.packContext, { setCode, format, names: packNames })
      .then((rows) => {
        if (!cancelled) setPackContext(new Map(rows.map((r) => [r.key, r.context])));
      })
      // Not fatal, and not silently degraded either: with no context the browser
      // would rank the pack on raw power alone and argue for a card the server
      // will not grade against. The flow drops the challenge instead of making
      // an argument it cannot stand behind.
      .catch(() => {
        if (!cancelled) setPackContext(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [convex, setCode, format, packNames]);

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
        // The token the ConvexReactClient already holds has to be attached by
        // hand, because /coach is an HTTP action rather than a Convex call.
        const token = await getAccessToken();
        const request = { site: SITE, token, sessionId, pickIndex, minPackCards };

        let prose = "";
        for await (const chunk of streamCoachFrom(request)) {
          // A newer pick is already streaming; leaving the loop cancels this one.
          if (run !== streamRun.current) return;
          prose += chunk;
          setCoach(prose);
        }
      } catch (e) {
        // The server can disagree with us about whether this pick was forced,
        // since it owns the clamp and we do not. Everything else -- no key, a
        // lapsed token, an answer that never came -- falls back to the
        // deterministic explanation rather than leaving the panel empty.
        if (e instanceof CoachDeclined) return skip();
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

  // The deck as the player has defined it, and what a pack is judged against.
  // Built by core's own helper from the same inputs `draft.pick` uses, because
  // the card this board argues for and the card the server grades against have
  // to be the same card -- see packScoringContext.
  const scoringContext = useMemo(() => {
    if (!state || !packContext) return undefined;
    const maindeck = splitPool(pool, state.sideboard, pool.length).maindeck;
    return packScoringContext(
      maindeck,
      pool.length,
      state.totalPicks,
      state.colorWinRates,
      (c) => packContext.get(normalizeName(c.name)),
    );
  }, [state, pool, packContext]);

  const selectedCard = useMemo(
    () => pack.find((card) => card.name === selected),
    [pack, selected],
  );

  const boardCards = useMemo(
    () => [...pack, ...pool, ...(lastView?.pack ?? [])],
    [pack, pool, lastView],
  );

  useEffect(() => {
    // Not while a pick is being defended: the card is on the screen above, and
    // clearing the selection underneath it would leave nothing lit to come back
    // to.
    if (!selected || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pending]);

  // Held back until every card in it can be drawn. A pack is dealt all at once,
  // so the alternative is watching it assemble itself frame by frame.
  const [packReady, setPackReady] = useState(false);
  // Where the set symbol's sheen is: idle before it has been shown, sweeping
  // while the light is still crossing it, done once it has landed.
  const [glyphPhase, setGlyphPhase] = useState<"idle" | "sweeping" | "done">("idle");
  const packImages = useMemo(
    () => pack.flatMap((card) => (card.imageUrl ? [webpImage(card.imageUrl)] : [])),
    [pack],
  );
  useEffect(() => {
    let cancelled = false;
    setPackReady(false);
    setGlyphPhase("idle");
    void preloadImages(packImages).then(() => {
      if (!cancelled) setPackReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [packImages]);

  // The symbol is always on the board, so the light crossing it is free to
  // finish after the cards have arrived rather than holding them back: the sheen
  // runs while the pack loads and then plays out its last pass. Nothing is ever
  // cut off mid-symbol, and nothing waits for it either.
  const sheening = !packReady || glyphPhase === "sweeping";
  useEffect(() => {
    // Reduced motion has no pass to play out, and waiting on an iteration that
    // will never fire would leave the sheen class on for the rest of the draft.
    if (!packReady && glyphPhase === "idle") setGlyphPhase(motionOK() ? "sweeping" : "done");
  }, [packReady, glyphPhase]);

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
    if (picking || pending) return;
    setSelected(card.name);
  }

  // The shortcut takes the card to the deck, which is where the overwhelming
  // majority of picks go. Choosing the other pile is a deliberate act: a button
  // that names it, or carrying the card there.
  function onQuickPick(card: Card) {
    void propose({ card, bench: false, carried: false });
  }

  /**
   * Choosing a card no longer spends the pick. It opens the case for it.
   *
   * The gate is `isDecisionPick`, the same threshold that decides whether the
   * coach is worth spending tokens on, and for the same reason rather than a
   * matching one: a pack down to its last few cards is picking for you, and
   * being asked to defend a forced pick is a chore that teaches nothing. So the
   * bottom of every pack still plays exactly as it did.
   */
  async function propose(proposal: Proposal) {
    if (picking || pending || !text) return;
    setCommitError(null);
    // The one way the browser's ranking and the server's grade can be built from
    // different decks. `onBench` moves a card locally before the server has
    // confirmed it, so a player who sideboards something and immediately picks
    // would have the client scoring against the new maindeck and the server
    // against the old one -- which moves committedColors, which can move the
    // context-best. Waiting for the write to land costs nothing on every pick
    // that did not just bench something, because there is nothing to wait for.
    //
    // Only reachable here: once a stage is open the board behind it is inert, so
    // no bench can land between this and the pick.
    await benchInFlight.current?.catch(() => {});
    if (!isDecisionPick(pack.length, settings.coachMinPackCards)) {
      void commit(proposal);
      return;
    }
    setSelected(proposal.card.name);
    setPending({ stage: "reason", proposal });
  }

  // Back to the pack with nothing spent. Reachable from the first screen at any
  // time and from the challenge only after a pick has failed to go through --
  // being argued with is the point, so it is not a thing you can simply decline.
  function abandon() {
    setPending(null);
    setCommitError(null);
  }

  // The case is made; now it gets argued with. The challenger is the best
  // remaining card in the pack for this deck, which when the player has already
  // taken that card is the runner-up -- see challengeFor for why that rule is
  // what keeps the screen from being its own answer.
  function onCommit(reason: string, confidence: Confidence) {
    if (!pending) return;
    const { proposal } = pending;
    const challenge = scoringContext
      ? challengeFor(pack, proposal.card, scoringContext)
      : undefined;

    // Nothing to argue with -- a pack of one, or a context we could not read.
    // The defense still stands and still reaches the coach; only the second
    // screen is skipped.
    if (!challenge) {
      void commit(proposal, { reason, confidence });
      return;
    }
    setPending({ stage: "challenge", proposal, reason, confidence, challenge });
  }

  // Standing and switching are the same act with a different answer, so they are
  // one function: the card taken is whichever one they named, and everything
  // else about the pick is unchanged. `switched` is not sent -- `draft.pick`
  // derives it from the card proposed against the card taken, so the stored row
  // cannot claim a change of mind that did not happen.
  function resolve(take: Card) {
    if (!pending || pending.stage !== "challenge") return;
    const { proposal, reason, confidence, challenge } = pending;
    const stood = take.name === proposal.card.name;
    const outcome = resolveChallenge(challenge, stood);
    void commit(
      {
        ...proposal,
        card: take,
        // "I am taking this but will not play it" was said about the OTHER card.
        // A switch cannot inherit it, so the new card goes to the deck and the
        // picks column is there if they want it set aside after all.
        bench: stood ? proposal.bench : false,
        // Nor can it inherit having been lifted out of the pack by hand. The
        // card they carried is going back with the pack; naming no card as kept
        // would sweep the whole thing while the card they actually took was
        // never picked up at all.
        carried: stood ? proposal.carried : false,
      },
      {
        reason,
        confidence,
        challengedName: challenge.challenger.name,
        proposedName: proposal.card.name,
        outcome,
        // The better of the pair by the browser's own ranking, which is what the
        // whole pack's context-best must be: the challenger was the best card
        // that was not the proposed one.
        expectedBestName:
          outcome.edge > 0 ? proposal.card.name : challenge.challenger.name,
      },
    );
  }

  // `bench` takes the card without adding it to the deck. Said at the moment of
  // picking rather than corrected afterwards, so the tallies the coach reads
  // never briefly count a card the player already knew they would not play.
  async function commit(proposal: Proposal, defense?: Defense) {
    // A ref, not the `picking` state: two clicks dispatched before React
    // re-renders both read the same stale `false`, and the second one spends a
    // pick the player did not make. The modal's buttons make that a good deal
    // easier to do than the confirm bar did.
    if (committing.current || !text) return;
    committing.current = true;

    const { card, bench, carried } = proposal;
    setPicking(true);
    setCommitError(null);
    setSelected(null);
    // Read before the mutation returns: `result` already holds the next pack.
    const packBefore = state?.pack ?? [];

    // The pack you just picked from, held on screen so it can be passed on
    // rather than swapped out. It leaves on its own clock -- waiting for the
    // server first would make the wait feel like the animation.
    const passing = pack;
    // A carried card has already left the pack -- the player pulled it out and
    // dropped it in a pile, and their eye is over there. Naming no card as kept
    // means the whole pack sweeps and nothing lifts out of an empty slot the
    // player is no longer looking at.
    setOutgoing({
      cards: passing,
      picked: carried ? "" : card.name,
      packNo: state?.packNo ?? 1,
    });
    const sweep = window.setTimeout(
      () => setOutgoing(null),
      motionOK() ? passDuration(passing.length) : 0,
    );

    try {
      const result = await pickCard({
        sessionId: id,
        cardName: card.name,
        bench,
        ...(defense
          ? {
              defense: {
                reason: defense.reason,
                confidence: defense.confidence,
                ...(defense.challengedName === undefined
                  ? {}
                  : { challengedName: defense.challengedName }),
                proposedName: defense.proposedName ?? card.name,
              },
            }
          : {}),
      });
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
          sideboard: result.sideboard,
        },
      );
      setPending(null);
      setSelected(null);
      setLast({
        score,
        signal: result.signal,
        pickIndex: result.pickIndex,
        pack: packBefore,
        // Only when the server graded against the same card the browser argued
        // over. They are built from the same inputs by the same function and
        // should never differ; if they ever do, the honest move is to say
        // nothing about the player's certainty rather than score it against a
        // comparison they were never shown.
        ...(defense?.outcome &&
        defense.expectedBestName === (score.contextBest as { name: string }).name
          ? { call: { confidence: defense.confidence, outcome: defense.outcome } }
          : {}),
      });
      void streamCoach(result.pickIndex, hydrateScore(score, text), packBefore.length);
    } catch (e) {
      // Nothing was passed after all, so put the pack back rather than let it
      // finish leaving. `pending` is left standing so the defense survives --
      // retyping it because the network blinked would be the worst moment this
      // flow could pick -- and the message goes onto the stage itself, which is
      // also where the way out of it is.
      window.clearTimeout(sweep);
      setOutgoing(null);
      setSelected(card.name);
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      committing.current = false;
      setPicking(false);
    }
  }

  // The other way to confirm a pick: carry the card to the pile it belongs in.
  // The two buttons say where a card is going; this lets the player show it, and
  // it is the same decision either way.
  function onDragStart(e: DragStartEvent) {
    const card = (e.active.data.current as { card: Card }).card;
    setCarrying(card);
    // Picking a card up is choosing it, so the selection follows the hand. Any
    // other card stops being lit -- two cards under consideration at once, one
    // of them named by a confirm bar you are dragging away from, was the state
    // this avoids. It also means letting go over nothing leaves the card
    // selected, which is the honest reading of the gesture: you meant this card
    // and have not yet said which pile.
    setSelected(card.name);
    // For the whole gesture, not just its start: the cursor crosses every card
    // in the pack and every row in the deck on its way across the board.
    suspendPreview(true);
  }

  function endDrag() {
    setCarrying(null);
    suspendPreview(false);
  }

  function onDragEnd(e: DragEndEvent) {
    endDrag();
    const card = (e.active.data.current as { card: Card } | undefined)?.card;
    const zone = e.over?.data.current as { bench: boolean } | undefined;
    // Released anywhere but on a pile. Nothing was decided, so nothing happens
    // -- the card is still in the pack and still unpicked.
    if (!card || !zone) return;
    void propose({ card, bench: zone.bench, carried: true });
  }

  // Moved locally first and reconciled with what the server returns, because
  // this board holds its own state rather than subscribing: waiting for the
  // round trip would leave a card sitting in a list it has been dragged out of.
  async function onBench(pickIndex: number, benched: boolean) {
    const before = state?.sideboard ?? [];
    const without = before.filter((b) => b.pos !== pickIndex);
    // Benching now, so the clock is the picks made so far. The server keeps an
    // existing entry's `atPick` on a repeat call and this reconciles to it.
    const after = benched
      ? [...without, { pos: pickIndex, atPick: state?.pool.length ?? pickIndex }].sort(
          (a, b) => a.pos - b.pos,
        )
      : without;
    setState((prev) => prev && { ...prev, sideboard: after });

    try {
      // Held so a pick made straight afterwards can wait for it -- see propose.
      const write = benchCard({ sessionId: id, pickIndex, benched });
      benchInFlight.current = write;
      const stored = await write;
      setState((prev) => prev && { ...prev, sideboard: stored });
    } catch (e) {
      setState((prev) => prev && { ...prev, sideboard: before });
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      benchInFlight.current = null;
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
        <DndContext
          id="draft-board"
          sensors={sensors}
          // Only the cursor being inside a pile counts. The default asks whether
          // the dragged card's box overlaps one, which a 150px card does to both
          // sections at once -- and closest-centre always names a winner, so a
          // card released over the pack grid would be picked.
          collisionDetection={pointerWithin}
          measuring={MEASURING}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={endDrag}
        >
          <div className="relative isolate grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* The set's mark, stamped on the board the way it is stamped on every
                card in the pack: oversized and sitting behind the pack rather than
                beside it. Quiet enough at 5% to be chrome, until the sheen crosses
                it while a pack loads and it becomes the one thing saying the board
                is working.

                It is placed against the window rather than against the board, so
                it holds one position for the whole draft instead of moving with a
                pack that is emptying. Centred on the cards: half the window, less
                half of what the side panel and its gap take (384px), which is
                where the middle of the pack column falls at any width the page is
                capped and guttered to. Below lg the panel stacks under the pack
                and the middle is simply the middle. */}
            <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-[calc(50vw-192px)]">
                {/* Two and a half rows of cards tall, measured rather than
                    guessed: the pack's own grid, dealt one item two and a half
                    cards tall (488x680 is a card, so 488x1700 is two and a half of
                    them) at the width the pack column has -- the page's 1500px cap
                    and gutters, less the side panel and the gap beside it. So the
                    mark is sized in cards at any viewport width, and stays that way
                    if the grid's columns ever change. */}
                <div className={`${PACK_GRID} invisible w-[calc(min(1500px,100vw)-432px)]`}>
                  <span style={{ aspectRatio: "488 / 1700" }} />
                </div>

                <SetIcon
                  uri={state.setIcon}
                  className={`absolute top-0 left-1/2 aspect-square h-full -translate-x-1/2 text-base-content/[0.05] ${sheening ? "pack-glyph" : ""}`}
                  // One pass of the light has landed. If the pack is here the sheen
                  // stops; if it is not, this simply runs again rather than starting
                  // a pass it cannot finish.
                  onAnimationIteration={() => {
                    if (packReady) setGlyphPhase("done");
                  }}
                />
              </div>
            </div>

            <div>
              {outgoing ? (
                <div
                  key="outgoing"
                  className={PACK_GRID}
                  aria-hidden
                  style={{ "--pass-dir": passDirection(outgoing.packNo) } as CSSProperties}
                >
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
                            : { animationDelay: `${i * PACK_STAGGER}ms` }
                        }
                      >
                        <CardFace card={card} />
                      </div>
                    );
                  })}
                </div>
              ) : packReady ? (
                <div
                  key={`pack-${state.packNo}-${state.pickNo}`}
                  className={PACK_GRID}
                  style={{ "--pass-dir": passDirection(state.packNo) } as CSSProperties}
                >
                  {pack.map((card, i) => (
                    <PackTile
                      key={card.name}
                      card={card}
                      index={i}
                      disabled={picking || pending !== null}
                      selected={selected === card.name}
                      onClick={onTileClick}
                      onQuickPick={onQuickPick}
                    />
                  ))}
                </div>
              ) : (
                // Waiting for the pack's art. Nothing is drawn in the cards' place
                // -- the set symbol behind the board is what says the board is
                // working. These hold the pack's shape and nothing else, so the
                // cards land where the page already had room for them.
                <div className={PACK_GRID}>
                  {pack.map((card) => (
                    <span key={card.name} className="card-aspect block w-full" />
                  ))}
                </div>
              )}

              {/* Not while a card is in the air, and not while one is being
                  defended. The bar and the two lit piles ask the same question,
                  and during a drag the piles are the ones being answered -- a
                  second copy of the choice, at the bottom of the screen, is one
                  you are dragging away from. It is back the moment the card is
                  let go. */}
              {selectedCard && !carrying && !pending && (
                <div className="sticky bottom-4 z-20 mt-4 flex justify-center">
                  <div className="popup-surface flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5">
                    <span className="font-display text-lg leading-tight">{selectedCard.name}</span>
                    {/* Both destinations are named now that there are two of them.
                        "Maindeck" and "Sideboard" are the words on the sections
                        these fill, and a button should say the name of the pile
                        the card lands in. */}
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={picking}
                        onClick={() =>
                          void propose({ card: selectedCard, bench: false, carried: false })
                        }
                      >
                        Pick to maindeck
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={picking}
                        onClick={() =>
                          void propose({ card: selectedCard, bench: true, carried: false })
                        }
                      >
                        Pick to sideboard
                      </button>
                    </span>
                    <span className="hidden text-xs text-base-content/50 sm:inline">
                      Drag a card to choose a pile · double-click to maindeck ·{" "}
                      <kbd className="kbd kbd-xs">esc</kbd> to clear
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* The right-hand wall for card previews: the coach is talking here,
                and a card image landing on top of it covers the thing you are
                drafting by. */}
            <aside data-preview-edge className="flex flex-col gap-4">
              <Panel title="Last pick" bodyClassName="gap-3">
                {lastView ? (
                  <>
                    {/* Keyed by pick so each new verdict re-mounts and replays the
                        entrance -- the one animation in the app, on the one moment
                        the player is waiting for. */}
                    <div key={lastView.pickIndex} className="motion-safe:animate-verdict">
                      <Verdict score={lastView.score} />
                    </div>

                    {lastView.call && (
                      // What the certainty they stated was actually worth. Its own
                      // block rather than a line in the verdict, because it grades
                      // a different thing: the verdict is about the card, and this
                      // is about the claim they made before they saw it.
                      <div className="border-t border-base-300 pt-3">
                        <div className="eyebrow mb-1.5 flex items-center justify-between gap-2">
                          <span>Your call</span>
                          {claimOutcome(lastView.call.confidence, lastView.call.outcome) !==
                            "none" && (
                            <span
                              className={`badge badge-sm ${
                                claimOutcome(lastView.call.confidence, lastView.call.outcome) ===
                                "held"
                                  ? "badge-success"
                                  : "badge-warning"
                              }`}
                            >
                              {claimOutcome(lastView.call.confidence, lastView.call.outcome) ===
                              "held"
                                ? "read it right"
                                : "misread"}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-base-content/80">
                          {calibrationLine(lastView.call.confidence, lastView.call.outcome)}
                        </p>
                      </div>
                    )}

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
                  <p className="text-base-content/60">
                    Take a card and say why. Nothing is graded until you have.
                  </p>
                )}
              </Panel>

              <PicksColumn
                pool={pool}
                sideboard={state.sideboard}
                onBench={(pickIndex, benched) => void onBench(pickIndex, benched)}
                offering={carrying !== null}
              />
            </aside>
          </div>

          {/* Outside the grid, not inside it: `isolate` above makes a stacking
              context, and anything drawn in there -- however high its z-index --
              still composites below the card preview's fixed layer.

              No drop animation. The card does not travel back to the pack; the
              pack leaves, and that is the motion the eye should be following. */}
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
            {carrying && (
              // Lit like a card pulled out of the row, because that is what it
              // is -- the same gold, one gesture further on.
              <CardFace
                card={carrying}
                className="card-lit motion-safe:rotate-[3deg] motion-safe:scale-105"
              />
            )}
          </DragOverlay>

          {pending?.stage === "reason" && (
            <StateYourCase
              card={pending.proposal.card}
              busy={picking}
              error={commitError}
              onBack={abandon}
              onCommit={onCommit}
            />
          )}
          {pending?.stage === "challenge" && (
            <TheChallenge
              yours={pending.proposal.card}
              challenger={pending.challenge.challenger}
              reason={pending.reason}
              busy={picking}
              error={commitError}
              onAbandon={abandon}
              onStand={() => resolve(pending.proposal.card)}
              onSwitch={() => resolve(pending.challenge.challenger)}
            />
          )}
        </DndContext>
      )}
    </PageShell>
  );
}

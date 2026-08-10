"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useConvex,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { normalizeName, textIndex } from "@mtg-tutor/core";
import { PageHeading } from "../../../components/PageHeading";
import { PageNotice, PageShell } from "../../../components/PageShell";
import { SetIcon } from "../../../components/SetIcon";
import { diffViewed, forkOpened } from "../../../lib/analytics";
import { humanError } from "../../../lib/humanError";
import { useSettings, type DiffLayout } from "../../../lib/useSettings";
import { Braid } from "./Braid";
import { Decks } from "./Decks";
import { Forks } from "./Forks";
import { LayoutPicker } from "./LayoutPicker";
import { Shelf } from "./Shelf";
import { Summary } from "./Summary";
import { TrackStepper } from "./track";
import type { Face } from "./faces";
import { theirName } from "./sides";

export function DiffScreen({ challengeId }: { challengeId: string }) {
  return (
    <>
      <AuthLoading>
        <PageNotice>Signing in…</PageNotice>
      </AuthLoading>
      <Unauthenticated>
        <PageNotice>Signing in…</PageNotice>
      </Unauthenticated>
      <Authenticated>
        <Screen challengeId={challengeId as Id<"challenges">} />
      </Authenticated>
    </>
  );
}

function Screen({ challengeId }: { challengeId: Id<"challenges"> }) {
  const convex = useConvex();
  const { settings } = useSettings();
  const { diffLayout: layout, diffExplain: explain } = settings;
  const diff = useQuery(api.challenges.diff, { challengeId });
  // Its own query on purpose: it is the only part that replays, so a set that
  // has moved costs the braid its weights instead of the screen. Handed the
  // forks the diff already found, because re-deriving them here meant reading
  // both drafts' rows a second time -- 163KB against the diff's own 138KB,
  // measured, for a list this component is holding.
  const impacts = useQuery(
    api.challenges.forkImpacts,
    diff ? { challengeId, forks: diff.tally.forks.map((f) => ({ pickIndex: f.pickIndex, theirs: f.theirs })) } : "skip",
  );
  const markSeen = useMutation(api.challenges.markSeen);

  const [text, setText] = useState<ReturnType<typeof textIndex> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const shelfRef = useRef<HTMLDivElement | null>(null);

  // The same join the draft board does: one read of the set's text per visit,
  // matched by name against rows that carry names only.
  const setCode = diff?.setCode;
  const format = diff?.format;
  useEffect(() => {
    if (!setCode || !format) return;
    let cancelled = false;
    convex
      .query(api.sets.cardText, { setCode, format })
      .then((rows) => {
        if (!cancelled) setText(textIndex(rows));
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(humanError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [convex, setCode, format]);

  // Clears the badge. Idempotent and challenger-only server-side, so the friend
  // calling it is a no-op rather than a refusal.
  const seen = useRef(false);
  useEffect(() => {
    if (!diff || seen.current) return;
    seen.current = true;
    void markSeen({ challengeId });
    const mineBuilt = diff.yourDeck.basicLands !== undefined;
    const theirsBuilt = diff.theirDeck.basicLands !== undefined;
    diffViewed({
      challengeId,
      rows: diff.tally.rows,
      comparable: diff.tally.comparable,
      agreed: diff.tally.agreed,
      forks: diff.tally.forks.length,
      // Off the registered forties rather than off what the panel rendered: the
      // panel can also fall back when a re-ingest drops a card, and that is a
      // different fact from nobody having built a deck.
      decks:
        mineBuilt && theirsBuilt
          ? "both"
          : mineBuilt
            ? "yours"
            : theirsBuilt
              ? "theirs"
              : "neither",
      layout,
    });
    // `layout` is read once, at the moment the comparison resolves, which is
    // after SettingsProvider has restored from localStorage on mount -- so this
    // is the layout the reader actually got rather than the default they passed
    // through. Switching layouts mid-read does not re-fire: this event counts
    // readings, and a reader trying both is one reading, not two.
  }, [diff, challengeId, markSeen, layout]);

  /**
   * A name to something renderable, tolerantly.
   *
   * `hydrateCard` throws on a name it cannot find, which is right on the draft
   * board -- a card being dealt with no text means two halves of a set written
   * by different ingests, and a blank frame is worse than a crash. It is wrong
   * here: this screen reads rows written weeks ago, and a re-ingest that dropped
   * one card must cost that card its art, not the whole comparison.
   */
  const faceOf = useCallback(
    (name: string, colors: readonly string[]): Face => {
      const half = text?.get(normalizeName(name));
      if (!half) return { name, colors: [...colors], card: null };
      return { name, colors: [...colors], card: { ...half, name, colors: [...colors] } as Card };
    },
    [text],
  );

  const forkIndices = useMemo(
    () => new Set((diff?.tally.forks ?? []).map((f) => f.pickIndex)),
    [diff],
  );

  /**
   * Move the shelf, and report it only when it landed on a fork.
   *
   * The track is navigation over all forty-two picks now, and so is the braid --
   * neither is a list of forks any more. Firing `fork_opened` on every step
   * would drown the one number the event exists to produce, which is which of
   * the readings actually drives the stepper. Stepping to an ordinary pick is
   * not somebody opening a fork, wherever they stepped from.
   *
   * TWO OF THE `from` VALUES NOW NAME A DIFFERENT SURFACE, and any chart split
   * by them has a seam where this shipped. `hero` was a grid of fork cards with
   * card art in them and is now a ranked list of lines; `track` was a copy of
   * the pick track beside the score and is now the braid's own axis, under the
   * chart. The question each answers is unchanged -- which reading of the
   * comparison a person actually navigates from -- which is why the values were
   * kept rather than renamed into a second event nobody could compare against
   * the first.
   */
  const goTo = useCallback(
    (
      pickIndex: number,
      from: "track" | "hero" | "braid" | "tick" | "stepper",
      scroll: boolean,
    ): void => {
      setAt(pickIndex);
      if (forkIndices.has(pickIndex)) forkOpened({ challengeId, pickIndex, from, layout });

      const node = shelfRef.current;
      if (!scroll || !node) return;

      // Only when the shelf is not already where you are looking. Re-aligning a
      // panel somebody is already reading is a jump with nothing to show for it.
      const box = node.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.75 && box.bottom > 140) return;

      node.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    },
    [challengeId, forkIndices, layout],
  );

  // Arrow keys step the shelf, with the usual escape hatch for anything a
  // person might be typing into -- and for the track itself, which handles its
  // own arrows to move between ticks and says so by preventing the default.
  // Without that check, focusing the track stepped two picks per press.
  useEffect(() => {
    if (!diff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setAt((i) => Math.min(diff.tally.rows - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diff]);

  const impactByIndex = useMemo(
    () => new Map((impacts ?? []).map((i) => [i.pickIndex, i])),
    [impacts],
  );

  if (loadError) return <PageNotice tone="error">{loadError}</PageNotice>;
  if (diff === undefined) return <PageNotice>Reading both drafts…</PageNotice>;

  // Named rather than "a friend", because the page is a comparison between two
  // people and one of them was anonymous in every label on it.
  const them = theirName(diff.side, diff.fromName);

  /**
   * The page's parts, built once, arranged four ways.
   *
   * Every layout below is a rearrangement of exactly these -- no layout has a
   * section another one lacks, and none of them draws a thing twice. That is the
   * whole rule of the experiment: if two layouts differ in what they SAY as well
   * as where they put it, then whichever wins wins for a reason nobody can name.
   *
   * The score has a second FORM rather than a second copy -- a band across the
   * page or a rail down it -- and both come out of one component with an
   * orientation, so the numbers and the sentence cannot drift apart between
   * layouts.
   */
  const parts = {
    summary: <Summary rows={diff.rows} tally={diff.tally} them={them} explain={explain} />,
    summaryRail: (
      <Summary
        rows={diff.rows}
        tally={diff.tally}
        them={them}
        explain={explain}
        orientation="vertical"
      />
    ),
    forks: (
      <Forks
        rows={diff.rows}
        tally={diff.tally}
        impacts={impactByIndex}
        impactsUnavailable={impacts === null}
        them={them}
        faceOf={faceOf}
        explain={explain}
        onOpen={(i) => goTo(i, "hero", true)}
      />
    ),
    braid: (
      <Braid
        rows={diff.rows}
        tally={diff.tally}
        them={them}
        at={at}
        explain={explain}
        onSelect={goTo}
      />
    ),
    decks: (
      <Decks
        rows={diff.rows}
        them={them}
        yourDeck={diff.yourDeck}
        theirDeck={diff.theirDeck}
        yourSessionId={diff.yourSessionId}
        faceOf={faceOf}
      />
    ),
    shelf: (
      <div ref={shelfRef} className="scroll-mt-4">
        <Shelf
          rows={diff.rows}
          them={them}
          at={at}
          faceOf={faceOf}
          // Never scrolls: the panel it drives is the one it is attached to, and
          // re-aligning something the reader is already looking at is a jump
          // with nothing to show for it.
          footer={
            <TrackStepper
              rows={diff.rows}
              them={them}
              at={at}
              onAt={(i) => goTo(i, "stepper", false)}
            />
          }
        />
      </div>
    ),
  };

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={diff.iconUri} className="size-6 text-base-content/50" />}
        title={
          <>
            You vs. {them}{" "}
            <span className="text-base-content/45">
              {diff.setName ?? diff.setCode.toUpperCase()}
            </span>
          </>
        }
        controls={
          <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <LayoutPicker />
            <Link href="/challenge" className="link link-hover text-sm text-base-content/60">
              All challenges →
            </Link>
          </span>
        }
      />

      <Layout layout={layout} parts={parts} />
    </PageShell>
  );
}

type Parts = {
  summary: ReactNode;
  summaryRail: ReactNode;
  forks: ReactNode;
  braid: ReactNode;
  decks: ReactNode;
  shelf: ReactNode;
};

/**
 * Two readings of one comparison.
 *
 * The screen has one instrument and one verdict, and both of them could be
 * permanent -- always on screen, never scrolled past -- but the page has two
 * edges to pin things to and five sections that want the middle.
 *
 * - RIBBON spends nothing. Every section full width, in the order they are worth
 *   reading. It is the page as it shipped, and it stays because a layout that
 *   beats nothing has not been shown to beat anything.
 * - CONSOLE spends both. The verdict goes down the left edge as a rail the
 *   height of the screen; the braid stays horizontal and pins across the top of
 *   the reading column. Nothing is ever behind you: the score you are arguing
 *   about and the drawing you are arguing from are both on screen at every
 *   section.
 *
 * TWO MORE WERE TRIED AND ARE NOT HERE. Both stood the braid on end and pinned
 * it down the left, and the drawing did not survive the rotation -- `Spine.tsx`
 * is kept, unwired, with what went wrong written on it. What they settled is why
 * `console` looks the way it does: PERMANENCE was the good idea, the rotation
 * was not, so the braid is pinned in the orientation it was always drawn in.
 *
 * CONSOLE COLLAPSES TO THE RIBBON BELOW `xl`, which is not a fallback so much as
 * the honest answer: a rail needs a column of its own and a phone has one column
 * in total. So the rail is hidden at narrow widths and the in-flow copy of the
 * verdict takes its place -- which is why the score appears twice in the markup
 * and never twice on screen.
 */
function Layout({ layout, parts }: { layout: DiffLayout; parts: Parts }) {
  if (layout === "ribbon") {
    return (
      <div className="flex flex-col gap-4">
        {parts.summary}
        {parts.forks}
        {parts.braid}
        {parts.decks}
        {parts.shelf}
      </div>
    );
  }

  return (
    /* THE ROW HAS TO END WHERE THE PAGE ENDS, and these two classes are how.
       They read as a trick and are not one.

       A sticky box is constrained to its containing block, which for the rail is
       this row's content box -- and `PageShell` puts the page's bottom padding
       on `<main>`, BELOW this row. So the row stops sixty-four pixels short of
       where the page stops, and at full scroll a rail of the full height of the
       screen would not fit inside its own container. Something has to give:
       either the rail is released and slides up off the top of the screen, or it
       shrinks to fit. Both are the same complaint -- at the very bottom of the
       page the rail stops being the height of the screen.

       So the container is extended to the page's real bottom instead. The
       padding goes on the READING COLUMN, because a flex row's content box is
       as tall as its tallest item and padding on the row itself would sit
       outside the box sticky actually measures. The negative margin then takes
       the same sixty-four pixels back off `main`'s own height, so the page is
       exactly as long as it was and only the row's box has moved. */
    <div className="-mb-16 flex items-start gap-4">
      <Rail>{parts.summaryRail}</Rail>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pb-16">
        {/* Pinned with the page's own colour behind it and a rule under it, so
            the sections do not slide out from under a floating box. `-mt-4`
            against the padding, so its resting position is unchanged and the
            padding only shows up as clearance once it catches. */}
        <div className="z-20 xl:sticky xl:top-0 xl:-mt-4 xl:border-b xl:border-base-300 xl:bg-base-100 xl:pb-3 xl:pt-4">
          {parts.braid}
        </div>
        {/* The widths with no rail to put it in. It sits under the braid rather
            than over it, because at these widths the braid is not pinned either
            and the column is simply the ribbon with its instrument first. */}
        <div className="xl:hidden">{parts.summary}</div>
        {parts.forks}
        {parts.decks}
        {parts.shelf}
      </div>
    </div>
  );
}

// The rail's clearance: from the top of the viewport once it has pinned, and
// from the bottom at every moment. One figure, because `top-4` below is the
// same 1rem and the two must agree or the rail is off-centre in its own gutter.
const RAIL_GAP = 16;
const MIN_RAIL_H = 320;

/**
 * A section that stays, and reaches the bottom of the screen while it does.
 *
 * THE HEIGHT IS NOT A HEIGHT, IT IS A BOTTOM EDGE, and that is the resolution of
 * a contradiction worth writing down because it is easy to feel and hard to
 * name.
 *
 * A sticky box has two lives. In the first it is part of the document: its top
 * is wherever the page put it, which here is under the masthead and the page's
 * own heading -- about a hundred and fifty pixels down. In the second it is
 * pinned, and its top is sixteen pixels down. "Always exactly the height of the
 * screen" is only well defined in the second life. Given as a fixed
 * `100dvh - 2rem` it is right once pinned and a hundred and fifty pixels too
 * tall before that, which is precisely the overflow you see at the top of the
 * page: the rail runs off the bottom edge and the split rule is cut in half.
 *
 * So the constant is the BOTTOM, not the height. The rail always ends one
 * gutter above the bottom of the screen; its top is wherever the document
 * currently has it, and the box simply grows upward as that top rises, until it
 * pins and stops. Nothing jumps, nothing is ever cut off, and "full height"
 * becomes true at every scroll position rather than at one of them.
 *
 * That needs measuring, because CSS has no way to ask how far a box currently is
 * from the top of the viewport -- `position: sticky` changes where a box is
 * painted and never what it measures. Hence the effect below. It is the whole
 * reason this component is not four lines of Tailwind.
 *
 * AND THE MEASUREMENT HAS TO BE CLAMPED AT BOTH ENDS, which the first version
 * was not, and which cost the rail its top edge at the foot of the page. Both
 * clamps are written up where they are applied; the short of it is that a rail
 * whose height is read off its own position is a feedback loop unless it is
 * forbidden from ever growing past the screen.
 *
 * The width is the verdict's, not the page's: fifteen rem is what holds "Average
 * pick score out of 100, across all 42 picks" in four lines rather than seven,
 * and a rail narrower than its own explanatory sentence is a rail that spends
 * its height on hyphenation.
 */
function Rail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const column = node.parentElement;
      // Below `xl` the rail is display:none, where every box reports a top of
      // zero -- so measuring there would claim the whole viewport for a rail
      // that is not on screen, and do it on every scroll of a phone.
      if (!column || node.offsetParent === null) return;

      /**
       * NEVER ABOVE THE PIN, and this clamp is the whole difference between a
       * rail and a runaway.
       *
       * A sticky box is released at the end of its containing block: the rail's
       * top goes above its pinned sixteen pixels and then negative as the last
       * of the page arrives. Fed to the subtraction below, a negative top ADDS
       * to the height -- and a taller box meets the container's bottom sooner,
       * which drives the top further up, which makes it taller again. It runs
       * away in about three frames.
       *
       * Clamped, the arithmetic can never ask for more than the pinned height,
       * so the loop has no way to start.
       */
      const top = Math.max(RAIL_GAP, node.getBoundingClientRect().top);

      // What the screen can give, and what is left of the row -- the rail takes
      // the smaller.
      //
      // The second should never bind now that the row reaches the foot of the
      // page (see the layout above), and it is kept as the thing that makes that
      // true rather than assumed: a rail is only ever released from its sticky
      // position because it did not fit, so a rail that always fits is never
      // released. If the page's bottom padding changes and the row stops
      // reaching the end again, this shrinks the rail by the difference instead
      // of letting it slide up off the top of the screen -- the quieter of the
      // two failures, and the one that still shows every number on it.
      const toScreenFoot = window.innerHeight - top - RAIL_GAP;
      const toColumnFoot = column.getBoundingClientRect().bottom - top;

      // Floored, because the arithmetic can go to nothing on a viewport short
      // enough that the heading alone fills it -- and a rail that computes its
      // way to zero height has disappeared, which is a worse failure than one
      // that runs a little past the bottom edge of a window nobody has.
      setHeight(Math.max(MIN_RAIL_H, Math.min(toScreenFoot, toColumnFoot)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The rail's top also moves when something ABOVE it changes height without
    // the window ever resizing -- the heading's controls wrapping, a webfont
    // landing, the fork list arriving from its own query. Watching the body
    // catches all of them as one listener.
    //
    // It cannot feed back, and the reason is the clamp rather than anything
    // about the observer: the rail can never be taller than the viewport, the
    // reading column beside it is five panels and always taller than that, so
    // the row's height -- and therefore the document's -- is never a function of
    // the rail's. Remove the clamp and this observer becomes the second half of
    // a loop.
    const resized = new ResizeObserver(schedule);
    resized.observe(document.body);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resized.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-4 hidden min-h-0 w-60 shrink-0 xl:block"
      // The pinned height until the first measurement lands, which is what the
      // server renders and what a reader sees for one frame. Right for the state
      // the rail spends nearly all of its time in, and too tall only at the very
      // top of the page -- the same failure as before, lasting one frame.
      style={{ height: height ?? "calc(100dvh - 2rem)" }}
    >
      {children}
    </div>
  );
}

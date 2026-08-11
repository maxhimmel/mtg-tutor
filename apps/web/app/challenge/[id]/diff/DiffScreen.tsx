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

/**
 * Which door this reading came through, off `?from=` on the URL.
 *
 * Read from `location` inside the effect that captures rather than through
 * `useSearchParams`, which is a hook and would put this component behind a
 * Suspense boundary it otherwise does not need -- for a value nothing renders.
 * The effect is client-only by construction, so there is always a `location`.
 *
 * Unstamped is `link`, which is honest: a bare URL, a bookmark, a back button
 * and every view recorded before the property existed are the same fact.
 */
function doorway(): "results" | "list" | "landing" | "email" | "link" {
  const from = new URLSearchParams(window.location.search).get("from");
  return from === "results" || from === "list" || from === "landing" || from === "email"
    ? from
    : "link";
}

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
  const { diffLayout: layout } = settings;
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
      from: doorway(),
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

      /**
       * Clear of whatever is pinned over the top of the column.
       *
       * `console` pins the braid across the top of the reading column and the
       * shelf sits directly beneath it, so a scroll that lands the shelf at the
       * top of the window lands it UNDERNEATH the band -- the panel's own header
       * rule and the coordinate on it, hidden by the instrument that opened it.
       *
       * Measured here rather than watched, and that is the whole reason it costs
       * nothing: this is the only instant the number is wanted. Its height is
       * not a constant worth writing down either -- the band is a hundred pixels
       * shorter once the braid's caption has moved behind its question mark.
       *
       * `position` rather than a layout flag, because the band is only sticky
       * from `xl` and below that it scrolls away like everything else, where an
       * offset would push the shelf a screenful too far down.
       */
      const band = document.querySelector<HTMLElement>("[data-pinned-band]");
      const pinned =
        band && getComputedStyle(band).position === "sticky"
          ? band.getBoundingClientRect().height
          : 0;
      node.style.scrollMarginTop = `${pinned + 16}px`;

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
    summary: <Summary rows={diff.rows} tally={diff.tally} them={them} />,
    summaryRail: (
      <Summary rows={diff.rows} tally={diff.tally} them={them} orientation="vertical" />
    ),
    forks: (
      <Forks
        rows={diff.rows}
        tally={diff.tally}
        impacts={impactByIndex}
        impactsUnavailable={impacts === null}
        them={them}
        faceOf={faceOf}
        onOpen={(i) => goTo(i, "hero", true)}
      />
    ),
    braid: (
      <Braid
        rows={diff.rows}
        tally={diff.tally}
        them={them}
        at={at}
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
 *
 * THE ORDER IS THE SAME IN BOTH, and two of the five sections have traded
 * places since it was first set. It used to rank by how long each section takes
 * to read, which put the pick-by-pick shelf last as the reference section
 * nobody reads straight through. That was wrong about what people come here
 * for: a draft is forty-two decisions, and reading ONE of them properly -- the
 * whole pack, both cards, the grades -- is the thing this screen exists to let
 * somebody do. So the verdict opens, the shelf follows it, and the fork list
 * takes the slot the shelf gave up.
 *
 * The drawing of the whole draft and the two forties did not move, and that is
 * deliberate rather than incidental: only the two sections whose ranking was
 * actually in question changed, so anything read about this page's order before
 * today is still true of everything else on it.
 *
 * It also puts the shelf directly under the pinned braid in `console`, so the
 * instrument and the panel it drives are adjacent instead of four sections
 * apart.
 */
function Layout({ layout, parts }: { layout: DiffLayout; parts: Parts }) {
  if (layout === "ribbon") {
    return (
      <div className="flex flex-col gap-4">
        {parts.summary}
        {parts.shelf}
        {parts.braid}
        {parts.decks}
        {parts.forks}
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
       screen does not fit inside its own container. It is then RELEASED: it
       slides up out of its pinned position, taking its own header rule off the
       top of the screen, in the last stretch of the page.

       This is the whole of what the two classes buy, and it survives the rail
       being a plain fixed height again. A sticky box is only ever released
       because it did not fit, so a box that always fits is never released.

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
        {/* Named for what it is rather than for what it holds: `goTo` has to
            clear whatever is pinned over this column before it scrolls the
            shelf into it, and it should not have to know that the thing pinned
            there is a braid. */}
        <div
          data-pinned-band
          className="z-20 xl:sticky xl:top-0 xl:-mt-4 xl:border-b xl:border-base-300 xl:bg-base-100 xl:pb-3 xl:pt-4"
        >
          {parts.braid}
        </div>
        {/* The widths with no rail to put it in. It sits under the braid rather
            than over it, because at these widths the braid is not pinned either
            and the column is simply the ribbon with its instrument first. */}
        <div className="xl:hidden">{parts.summary}</div>
        {parts.shelf}
        {parts.decks}
        {parts.forks}
      </div>
    </div>
  );
}

/**
 * A section that stays.
 *
 * ONE HEIGHT, AND IT IS THE PINNED ONE. A sticky box has two lives: in the flow,
 * where its top is wherever the document put it -- here about a hundred and
 * fifty pixels down, under the masthead and the page's own heading -- and
 * pinned, where its top is the sixteen pixels of `top-4`. A single fixed height
 * can only be right in one of them, and this is the choice to make it the
 * second, because that is where the rail spends all of the scroll and one of
 * the two lives lasts a hundred and thirty pixels.
 *
 * SO IT OVERHANGS THE FOOT OF THE SCREEN AT THE VERY TOP OF THE PAGE, by the
 * height of the heading above it, and that is known rather than missed. It was
 * fixed once, by measuring the rail's own distance from the top of the viewport
 * on every scroll and treating the height as a bottom edge -- which does work,
 * and is a scroll listener, a ResizeObserver, two clamps against a feedback
 * loop, and a component that is eighty lines instead of eight. Taken back out on
 * purpose: a panel whose height quietly changes as you scroll is a stranger
 * thing to sit beside than one that starts a little long.
 *
 * If it comes back, it comes back knowing that the measurement is the easy half.
 * A box whose height is read from its own position is a loop unless it is
 * forbidden from growing past the screen -- a released sticky box reports a
 * negative top, which ADDS to the height, which makes it meet its container
 * sooner, which releases it further. See the history of this file.
 *
 * The width is the verdict's, not the page's: fifteen rem is what holds "Average
 * pick score out of 100, across all 42 picks" in four lines rather than seven,
 * and a rail narrower than its own explanatory sentence is a rail that spends
 * its height on hyphenation.
 */
function Rail({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky top-4 hidden min-h-0 w-60 shrink-0 xl:block"
      style={{ height: "calc(100dvh - 2rem)" }}
    >
      {children}
    </div>
  );
}

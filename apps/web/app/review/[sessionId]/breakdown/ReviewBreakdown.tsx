"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { REVIEW, isDecisionPick } from "@mtg-tutor/core";
import { PageNotice, PageShell } from "../../../components/PageShell";
import { PageHeading } from "../../../components/PageHeading";
import { PickTrack, type Tick } from "../../../components/PickTrack";
import { ColorPips } from "../../../components/ColorPips";
import { Panel } from "../../../components/Panel";
import { SetIcon } from "../../../components/SetIcon";
import { breakdownAsked } from "../../../lib/analytics";
import { PickReveal } from "../../PickReveal";
import { useLines } from "../../useLines";
import { PickMarksKey } from "../../../components/PickMarks";
import { ReviewFrame } from "../../ReviewFrame";
import { ReviewViews } from "../../ReviewViews";
import type { ReviewPick } from "../../types";
import { useVerdicts } from "../../useVerdicts";

const decisionPick = (pick: ReviewPick) =>
  isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards);

// "missed" is picks where you did not take the best card FOR YOUR DECK, which
// is what the score is now measured against. It used to mean the card the data
// rated highest, which was a proxy that quietly dropped every pick where you
// took the raw best and the right card was something else -- exactly the
// divergence worth teaching. The proxy is gone; this is the real question.
type Scope = "missed" | "all";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "missed", label: "Picks you missed" },
  { key: "all", label: "Every decision pick" },
];

/**
 * How tall the pinned masthead is, and the only place that number is written.
 *
 * PageHeading fixes everything above its slot at 4.5rem (pt-4, a 2rem title row,
 * gap-3, pb-3), and this page fills the slot with a flat track, which is
 * 1.125rem.
 *
 * Three things depend on it and would each be wrong in a different way if they
 * were measured separately -- the key rail would pin too high, the observer
 * would call a record "being read" while it was still behind the masthead, and
 * a tick you clicked would scroll its record underneath it.
 */
const PINNED_H = "5.625rem";

// The whole diagnostic at once: no guessing, no stepping. Unlike the
// walkthrough it does not ask for anything on its own -- one breakdown is ~35
// model calls, and arriving here by a misclick should not spend them.
export function ReviewBreakdown({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const draft = useQuery(api.review.load, { sessionId: id });
  const sets = useQuery(api.sets.list);

  const [scope, setScope] = useState<Scope>("missed");
  const [analyzing, setAnalyzing] = useState(false);
  const [started, setStarted] = useState(false);
  // Picks asked about one at a time. `useVerdicts` keeps its own record of what
  // has been asked, but in a ref -- deliberately, so that answering one pick does
  // not re-render every other -- which leaves nothing to draw a spinner from.
  const [asking, setAsking] = useState<ReadonlySet<number>>(new Set());

  const picks = draft?.picks;
  const { get, request, requestMany, refused } = useVerdicts(id, picks);
  const lines = useLines(id);

  // One line for the whole page: this fires seventeen verdicts and two frames,
  // and a refusal repeated per row would bury the breakdown it is explaining.
  const [frameRefused, setFrameRefused] = useState<string | null>(null);
  const notice = refused ?? frameRefused;

  const decisions = useMemo(() => (picks ?? []).filter(decisionPick), [picks]);
  const shown = useMemo(
    () => (scope === "missed" ? decisions.filter((p) => !p.isBest) : decisions),
    [decisions, scope],
  );

  const pool = useMemo(() => (picks ?? []).map((p) => p.picked), [picks]);

  // Where each decision pick sits on the track, so a record on screen can name
  // the tick that stands for it. The track draws every decision pick and the
  // list below is filtered, so the two are not the same sequence.
  const tickOf = useMemo(
    () => new Map(decisions.map((pick, i) => [pick.pickIndex, i])),
    [decisions],
  );

  // The record being read, as a tick index. Kept here rather than in PickTrack
  // because it is a fact about this page's scroll, and the track is a picture of
  // a draft that knows nothing about being scrolled past.
  const [here, setHere] = useState<number | undefined>(undefined);
  const records = useRef(new Map<number, HTMLElement>());

  // A pick asked for from the track, held until its record exists. Clicking a
  // tick the current scope filters out widens the scope, and the record it
  // wants is not in the DOM until the render after that -- so the scroll is a
  // thing the page owes, not a thing the click can do.
  const [wanted, setWanted] = useState<number | null>(null);

  useEffect(() => {
    if (wanted === null) return;
    const tick = tickOf.get(wanted);
    const node = tick === undefined ? undefined : records.current.get(tick);
    setWanted(null);
    node?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [wanted, tickOf, shown]);

  useEffect(() => {
    const nodes = [...records.current.values()];
    if (nodes.length === 0) {
      setHere(undefined);
      return;
    }

    // Which records are in the reading band at any moment, so the answer is the
    // topmost of them rather than whichever one crossed the line most recently.
    // Entering and leaving arrive as separate callbacks, and a scroll fast enough
    // to fire both in one frame would otherwise settle on the wrong tick.
    const inBand = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const tick = Number((entry.target as HTMLElement).dataset.tick);
          if (entry.isIntersecting) inBand.add(tick);
          else inBand.delete(tick);
        }
        setHere(inBand.size > 0 ? Math.min(...inBand) : undefined);
      },
      // The band a record has to be in to count as the one being read: from just
      // under the pinned masthead down to the middle of the screen. Px because
      // rootMargin takes no other absolute unit, so PINNED_H is converted rather
      // than named -- 5.625rem at the browser default.
      { rootMargin: "-90px 0px -50% 0px" },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  // Already answered, here or on a previous visit -- verdicts are frozen, so
  // the second read of a breakdown costs nothing.
  const unasked = shown.filter((p) => get(p.pickIndex) === undefined);
  const resolved = shown.length - unasked.length;

  // The frames wait for the same gate as the verdicts rather than firing at
  // anyone who lands here -- unless this breakdown was already generated, in
  // which case showing it whole is the point. They are frozen on first success
  // now, like verdicts, so a second visit costs nothing either way; the gate
  // remains because two model calls is still not what a glance should buy.
  const complete = shown.length > 0 && unasked.length === 0;
  const showFrames = started || complete;

  async function analyze() {
    breakdownAsked({ sessionId, how: "all", picks: unasked.length });
    setStarted(true);
    setAnalyzing(true);
    try {
      await requestMany(shown.map((p) => p.pickIndex));
    } finally {
      setAnalyzing(false);
    }
  }

  /**
   * Go to the pick a tick stands for.
   *
   * The track draws every decision pick and the list is filtered, so two thirds
   * of the ticks have no record under the default scope. That was the reason not
   * to make them clickable -- but a dead target is only one of the two answers.
   * The other is that asking for a pick is asking to SEE it, so a tick outside
   * the current scope widens the scope and then goes there.
   *
   * Which also keeps the track whole. It has always drawn the entire draft
   * whatever the scope, on the grounds that a summary that filtered with the
   * list would stop being a summary; now that holds without costing anyone a
   * click that does nothing.
   */
  function goTo(tickIndex: number) {
    const pick = decisions[tickIndex];
    if (!pick) return;
    if (scope === "missed" && pick.isBest) setScope("all");
    setWanted(pick.pickIndex);
  }

  // One pick. The bulk button was never a decision that a breakdown must be
  // bought whole -- the decision was that arriving here must not spend anything,
  // and a per-pick button keeps that while making the cheapest useful thing on
  // this page one call instead of seventeen.
  async function askOne(pickIndex: number) {
    breakdownAsked({ sessionId, how: "one", picks: 1 });
    setStarted(true);
    setAsking((prev) => new Set(prev).add(pickIndex));
    try {
      await request(pickIndex);
    } finally {
      setAsking((prev) => {
        const next = new Set(prev);
        next.delete(pickIndex);
        return next;
      });
    }
  }

  if (draft === undefined) {
    return <PageNotice>Rebuilding the draft…</PageNotice>;
  }

  const set = (sets ?? []).find((s) => s.code === draft.setCode && s.format === draft.format);

  // The whole draft at a glance, which is what this page is for and what its
  // filtered list cannot show: the misses in the order they happened, against
  // every decision the draft asked for. It stays whole whichever scope is on --
  // the list below is the filter, and a summary that filtered with it would
  // stop being a summary.
  const track: Tick[] = decisions.map((pick) => ({
    state: pick.isBest ? "hit" : "miss",
    label: `Pack ${pick.packNo}, pick ${pick.pickNo}`,
  }));
  const missed = decisions.filter((p) => !p.isBest).length;

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={set?.iconUri} name={set?.name} className="size-6 text-base-content/50" />}
        title={
          <>
            {set?.name ?? draft.setCode.toUpperCase()}
            {draft.colorPair && <ColorPips colors={draft.colorPair} className="ml-2.5" />}
          </>
        }
        controls={<ReviewViews sessionId={sessionId} current="breakdown" />}
        sticky
      >
        <PickTrack
          groups={[track]}
          here={here}
          onSelect={goTo}
          label={
            here === undefined
              ? `${decisions.length} decision picks, ${missed} of them missed. Select one to go to it.`
              : `${decisions.length} decision picks, ${missed} of them missed. Reading pick ${
                  here + 1
                }. Select one to go to it.`
          }
        />
      </PageHeading>

      {/* The records, and the key to reading them. `justify-center` rather than
          `mx-auto` on the column, so the records stay centred on the page at the
          widths where there is no room for the rail beside them. */}
      <div className="flex justify-center gap-6">
        {/* Wider than a reading column, because a pick record is not one: it is
            a 19rem shortlist beside prose that still wants a measure of its own.
            64rem is those two plus the panel's padding and almost nothing else. */}
        <div className="flex min-w-0 max-w-5xl flex-1 flex-col gap-4">
          {notice && (
            <div role="alert" className="alert alert-warning">
              <span>{notice}</span>
            </div>
          )}
          <Panel bodyClassName="gap-3">
            <div
              className="flex rounded-lg bg-base-300 p-0.5"
              role="group"
              aria-label="Which picks the breakdown covers"
            >
              {SCOPES.map((option) => {
                const selected = scope === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`flex-1 cursor-pointer rounded-md py-1.5 text-sm transition-colors ${
                      selected
                        ? "bg-primary font-semibold text-primary-content"
                        : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
                    }`}
                    aria-pressed={selected}
                    onClick={() => setScope(option.key)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* The count the masthead used to carry, next to the control that
              sets it. */}
            <p className="text-xs text-base-content/50">
              Showing <span className="tabular-nums">{shown.length}</span> of{" "}
              <span className="tabular-nums">{decisions.length}</span> decision picks.
              {scope === "missed" &&
                " These are the ones where you took a card the data rates below another. A pick you got right can still hold a lesson, and this view will not show it."}
            </p>

            {unasked.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-base-300 pt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={analyzing}
                  onClick={() => void analyze()}
                >
                  {analyzing ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Analyzing {resolved} of {shown.length}…
                    </>
                  ) : (
                    `Ask the coach about ${unasked.length} ${
                      unasked.length === 1 ? "pick" : "picks"
                    }`
                  )}
                </button>
              </div>
            )}
          </Panel>

          {showFrames && (
            <ReviewFrame sessionId={id} phase="open" cards={pool} onError={setFrameRefused} />
          )}

          {shown.length === 0 ? (
            <Panel>
              <p className="text-base-content/70">
                You took the data&apos;s best card on every decision pick in this draft. Switch to
                every decision pick to read them anyway.
              </p>
            </Panel>
          ) : (
            <>
              {/* Where the rail beside the page has no room to exist. Same key,
                  above the first record instead of alongside every one. */}
              <div className="px-4 pt-1 xl:hidden">
                <PickMarksKey />
              </div>
              {shown.map((pick) => {
                const tick = tickOf.get(pick.pickIndex) ?? 0;

                return (
                  // Wrapped only so the observer has something to watch: Panel
                  // draws the box and does not forward a ref, and the tick index
                  // rides on the element so the callback needs no closure over
                  // the list it was built from.
                  <div
                    key={pick.pickIndex}
                    data-tick={tick}
                    // So a record arrived at from the track lands below the
                    // masthead rather than behind it.
                    style={{ scrollMarginTop: `calc(${PINNED_H} + 0.75rem)` }}
                    ref={(el) => {
                      if (el) records.current.set(tick, el);
                      else records.current.delete(tick);
                    }}
                  >
                    <Panel
                      // Named here rather than inside the reveal, which is where
                      // it used to be -- and where it was a second copy of the
                      // title the walkthrough's panel already drew above it.
                      title={`Pack ${pick.packNo} · Pick ${pick.pickNo}`}
                      aside={
                        <span className="text-xs tabular-nums text-base-content/50">
                          {pick.pack.length} cards
                        </span>
                      }
                    >
                      <PickReveal
                        pick={pick}
                        verdict={get(pick.pickIndex)}
                        pending={analyzing || asking.has(pick.pickIndex)}
                        onAsk={() => void askOne(pick.pickIndex)}
                        draft={{ sessionId: id, setCode: draft.setCode, format: draft.format }}
                        line={lines.lineFor(pick.pickIndex)}
                        onAskLine={(card, which) => lines.ask(pick.pickIndex, card, which)}
                      />
                    </Panel>
                  </div>
                );
              })}
            </>
          )}

          {showFrames && (
            <ReviewFrame sessionId={id} phase="close" cards={pool} onError={setFrameRefused} />
          )}

          {/* The two sibling views are in the switcher at the top of the page,
              so the only way out this page still owes anyone is up a level. */}
          <div className="flex flex-wrap gap-2">
            <Link href="/review" className="btn btn-sm btn-ghost">
              Another draft
            </Link>
          </div>
        </div>

        {/* The key, kept in view for the length of the scroll.

            Above the list it is read once and then left behind, and the record
            that needs it is the twelfth one down -- by then it is a thousand
            pixels off the top of the screen and the labels are back to being a
            code. Beside the list it is there for every record without being
            repeated for any of them.

            Only where there is width to spare: the records are 64rem and giving
            them up to keep a legend on screen would be paying for the key with
            the thing it explains. Below that it goes back above the list. */}
        <aside className="hidden w-52 shrink-0 xl:block" aria-label="How to read these picks">
          {/* Below the masthead, which pins above it. */}
          <div className="sticky" style={{ top: `calc(${PINNED_H} + 0.75rem)` }}>
            <PickMarksKey />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

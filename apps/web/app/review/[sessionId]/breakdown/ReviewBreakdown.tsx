"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { REVIEW, isDecisionPick } from "@mtg-tutor/core";
import { PageNotice, PageShell } from "../../../components/PageShell";
import { PageHeading } from "../../../components/PageHeading";
import { PickTrack, type Tick } from "../../../components/PickTrack";
import { Panel } from "../../../components/Panel";
import { SetIcon } from "../../../components/SetIcon";
import { PickReveal } from "../../PickReveal";
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

  const picks = draft?.picks;
  const { get, requestMany, refused } = useVerdicts(id, picks);

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
    setStarted(true);
    setAnalyzing(true);
    try {
      await requestMany(shown.map((p) => p.pickIndex));
    } finally {
      setAnalyzing(false);
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
            {draft.colorPair && (
              <span className="ml-2 text-base-content/45">{draft.colorPair}</span>
            )}
          </>
        }
        controls={<ReviewViews sessionId={sessionId} current="breakdown" />}
      >
        <PickTrack
          groups={[track]}
          label={`${decisions.length} decision picks, ${missed} of them missed.`}
        />
      </PageHeading>

      <div className="mx-auto flex max-w-4xl flex-col gap-4">
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
              <span className="text-xs text-base-content/50">
                One model call each, kept once answered.
              </span>
            </div>
          )}
        </Panel>

        {showFrames && <ReviewFrame sessionId={id} phase="open" cards={pool} onError={setFrameRefused} />}

        {shown.length === 0 ? (
          <Panel>
            <p className="text-base-content/70">
              You took the data&apos;s best card on every decision pick in this draft.
              Switch to every decision pick to read them anyway.
            </p>
          </Panel>
        ) : (
          shown.map((pick) => (
            <Panel
              key={pick.pickIndex}
              aside={
                <span className="text-xs tabular-nums text-base-content/50">
                  {pick.pack.length} cards
                </span>
              }
            >
              <PickReveal
                pick={pick}
                verdict={get(pick.pickIndex)}
                pending={analyzing}
              />
            </Panel>
          ))
        )}

        {showFrames && <ReviewFrame sessionId={id} phase="close" cards={pool} onError={setFrameRefused} />}

        {/* The two sibling views are in the switcher at the top of the page, so
            the only way out this page still owes anyone is the way up a level. */}
        <div className="flex flex-wrap gap-2">
          <Link href="/review" className="btn btn-sm btn-ghost">
            Another draft
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

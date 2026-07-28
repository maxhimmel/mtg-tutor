"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { REVIEW, isDecisionPick } from "@mtg-tutor/core";
import { PageNotice, PageShell } from "../../../components/PageShell";
import { Panel } from "../../../components/Panel";
import { SetIcon } from "../../../components/SetIcon";
import { PickReveal } from "../../PickReveal";
import { ReviewFrame } from "../../ReviewFrame";
import type { ReviewPick } from "../../types";
import { useVerdicts } from "../../useVerdicts";

const decisionPick = (pick: ReviewPick) =>
  isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards);

// "missed" is picks where you did not take the card the data rates highest.
// That is a proxy, not the real question -- a pick can be the raw-power best
// and still be the wrong card for your deck -- but the better answer is the
// coach's context-best, which does not exist until a model call has been spent.
// See notes.md, Issues #3.
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
  const { get, requestMany } = useVerdicts(id, picks);

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

  // The frames are the one part of a review that is never cached: review.frame
  // calls the model every time, where verdicts are frozen on first ask. So they
  // wait for the same gate rather than firing two calls at anyone who lands
  // here -- unless this breakdown was already generated, in which case showing it
  // whole is the point.
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

  return (
    <PageShell
      headerAside={
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/60">
          <span className="flex items-center gap-1.5 text-base-content/80" title={set?.name}>
            <SetIcon uri={set?.iconUri} name={set?.name} className="size-4" />
            {draft.setCode.toUpperCase()}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-base-300" />
          <span className="tabular-nums">
            {shown.length} of {decisions.length} decision picks
          </span>
          <Link href={`/review/${sessionId}`} className="link link-hover">
            ← Step through instead
          </Link>
        </div>
      }
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
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

          {scope === "missed" && (
            <p className="text-xs text-base-content/50">
              Picks where you took a card the data rates below another one. A pick you
              got right can still hold a lesson, and this view will not show it — see
              the walkthrough for those.
            </p>
          )}

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

        {showFrames && <ReviewFrame sessionId={id} phase="open" cards={pool} />}

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

        {showFrames && <ReviewFrame sessionId={id} phase="close" cards={pool} />}

        <div className="flex flex-wrap gap-2">
          <Link href={`/review/${sessionId}`} className="btn btn-sm btn-primary">
            Step through it
          </Link>
          <Link href="/review" className="btn btn-sm btn-ghost">
            Another draft
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

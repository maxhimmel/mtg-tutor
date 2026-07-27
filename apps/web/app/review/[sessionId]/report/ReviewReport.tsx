"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { REVIEW, isDecisionPick } from "@mtg-tutor/core";
import { AppHeader } from "../../../components/AppHeader";
import { Panel } from "../../../components/Panel";
import { SetIcon } from "../../../components/SetIcon";
import { PickReveal } from "../../PickReveal";
import { ReviewFrame } from "../../ReviewFrame";
import type { ReviewPick } from "../../types";
import { useVerdicts } from "../../useVerdicts";

const decisionPick = (pick: ReviewPick) =>
  isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards);

// The whole diagnostic at once: no guessing, no stepping, every decision pick
// answered. The walkthrough's counterpart for when you want the answers rather
// than the exercise.
export function ReviewReport({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const draft = useQuery(api.review.load, { sessionId: id });
  const sets = useQuery(api.sets.list);

  const picks = draft?.picks;
  const { get, requestMany } = useVerdicts(id, picks);

  const decisions = useMemo(() => (picks ?? []).filter(decisionPick), [picks]);

  // Everything up front, bounded -- this is the one screen that legitimately
  // wants every verdict, since it is going to show every verdict.
  useEffect(() => {
    if (decisions.length === 0) return;
    void requestMany(decisions.map((p) => p.pickIndex));
  }, [decisions, requestMany]);

  const pool = useMemo(() => (picks ?? []).map((p) => p.picked), [picks]);
  const resolved = decisions.filter((p) => get(p.pickIndex) !== undefined).length;

  if (draft === undefined) {
    return (
      <main className="mx-auto max-w-[1500px] px-6 py-5">
        <p className="text-base-content/60">Rebuilding the draft…</p>
      </main>
    );
  }

  const set = (sets ?? []).find((s) => s.code === draft.setCode && s.format === draft.format);

  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <AppHeader>
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/60">
          <span className="flex items-center gap-1.5 text-base-content/80" title={set?.name}>
            <SetIcon uri={set?.iconUri} name={set?.name} className="size-4" />
            {draft.setCode.toUpperCase()}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-base-300" />
          <span>Full report</span>
          <Link href={`/review/${sessionId}`} className="link link-hover">
            ← Step through instead
          </Link>
        </div>
      </AppHeader>

      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <ReviewFrame sessionId={id} phase="open" cards={pool} />

        {resolved < decisions.length && (
          <p
            className="flex items-center gap-2 text-sm text-base-content/60"
            role="status"
            aria-live="polite"
          >
            <span className="loading loading-spinner loading-xs" />
            Analyzing decision picks — {resolved} of {decisions.length}
          </p>
        )}

        {decisions.map((pick) => (
          <Panel
            key={pick.pickIndex}
            aside={
              <span className="text-xs tabular-nums text-base-content/50">
                {pick.pack.length} cards
              </span>
            }
          >
            <PickReveal pick={pick} verdict={get(pick.pickIndex)} />
          </Panel>
        ))}

        <ReviewFrame sessionId={id} phase="close" cards={pool} />

        <div className="flex flex-wrap gap-2">
          <Link href={`/review/${sessionId}`} className="btn btn-sm btn-primary">
            Step through it
          </Link>
          <Link href="/review" className="btn btn-sm btn-ghost">
            Another draft
          </Link>
        </div>
      </div>
    </main>
  );
}

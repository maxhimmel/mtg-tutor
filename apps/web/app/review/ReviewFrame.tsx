"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { loadPrinciples, splitCitations } from "@mtg-tutor/core";
import { CardText } from "../components/CardText";
import { Panel } from "../components/Panel";
import { PrincipleBadges } from "../components/PrincipleBadge";

const PRINCIPLES = loadPrinciples();

const TITLES = {
  open: "Draft overview",
  close: "Signal-reading recap",
} as const;

/**
 * The coach's bookends: what this draft looked like going in, and what it says
 * about your signal reading coming out.
 *
 * Renders nothing at all when the action answers null -- a deployment with no
 * model key should show a review without prose, not an apology where the prose
 * would have been.
 */
export function ReviewFrame({
  sessionId,
  phase,
  cards,
}: {
  sessionId: Id<"draftSessions">;
  phase: "open" | "close";
  // The final pool, so card names in the prose link to the cards themselves.
  cards: Card[];
}) {
  const askFrame = useAction(api.review.frame);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    askFrame({ sessionId, phase })
      .then(setText)
      .catch(() => setText(null));
  }, [askFrame, sessionId, phase]);

  // The frame runs on the review system prompt, which asks for principle
  // citations -- so it arrives with bracketed ids in it exactly like a verdict.
  const advice = useMemo(() => splitCitations(text ?? "", PRINCIPLES), [text]);

  if (text === null) return null;

  return (
    <Panel title={TITLES[phase]}>
      {text === undefined ? (
        <p className="flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          {phase === "open" ? "Coach is sizing up the draft…" : "Coach is writing the recap…"}
        </p>
      ) : (
        <>
          <p className="leading-relaxed">
            <CardText text={advice.prose} cards={cards} />
          </p>
          <PrincipleBadges principles={advice.principles} />
        </>
      )}
    </Panel>
  );
}

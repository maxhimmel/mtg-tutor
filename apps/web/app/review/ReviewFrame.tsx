"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { loadPrinciples, splitCitations } from "@mtg-tutor/core";
import { CardText } from "../components/CardText";
import { AiRating } from "../components/AiResponse";
import { Panel } from "../components/Panel";
import { PrincipleBadges } from "../components/PrincipleBadge";
import { humanError } from "../lib/humanError";

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
  onError,
}: {
  sessionId: Id<"draftSessions">;
  phase: "open" | "close";
  // The final pool, so card names in the prose link to the cards themselves.
  cards: Card[];
  // Reported rather than rendered. A frame mounts twice on a page that also
  // asks for verdicts, so a refusal shown here would be the same sentence
  // three times; the page shows it once and this keeps its promise to render
  // nothing when there is no prose.
  onError?: (message: string) => void;
}) {
  const askFrame = useAction(api.review.frame);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    askFrame({ sessionId, phase })
      .then(setText)
      .catch((e: unknown) => {
        // The action returns null when the coach simply had nothing; a throw is
        // a refusal, and only that is worth telling anyone about.
        onError?.(humanError(e));
        setText(null);
      });
    // onError is left out of the deps on purpose: `asked` means this body runs
    // once ever, so the callback it closes over is the one that was there when
    // the frame was asked for, and an inline handler from the parent cannot
    // re-arm the request by changing identity.
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
          {/* No `quote`: reviewFrames stores this text and freezes it, so the
              owner's script reads the stored row rather than a copy taken here. */}
          <AiRating surface="frame" anchor={{ sessionId, phase }} />
        </>
      )}
    </Panel>
  );
}

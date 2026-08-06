"use client";

import { useEffect, useState } from "react";
import { useFeedback } from "./Feedback";
import type { Id } from "@mtg-tutor/backend/dataModel";

/**
 * The one time the app asks, rather than waiting to be told.
 *
 * A finished draft is the moment somebody has the most to say and is no longer
 * mid-decision, which is why this is the only prompt in the app and why it is
 * never shown during one. Inline on the results screen rather than as a toast:
 * a toast arriving while somebody is admiring the deck they just built is the
 * one that gets dismissed without being read.
 *
 * Capped to once a day, in localStorage. Per-browser rather than per-account,
 * which is the wrong grain in principle and exactly right in practice -- it
 * costs no read, no write and no schema, and the failure mode is being asked
 * twice on two machines.
 *
 * No feedback_prompted event to go with it. This renders on every completed
 * draft that clears the cap, and draft_completed is already captured, so
 * prompt-to-open is computable without a fourth event.
 */

const KEY = "mtg-tutor:asked-for-feedback";
const DAY = 24 * 60 * 60 * 1000;

export function AfterDraft({
  sessionId,
  setCode,
  format,
}: {
  sessionId: Id<"draftSessions">;
  setCode: string;
  format: string;
}) {
  const open = useFeedback();
  // Rendered from an effect rather than read during render, because
  // localStorage does not exist on the server and reading it in the body would
  // mismatch the first paint.
  const [show, setShow] = useState(false);

  useEffect(() => {
    const last = Number(window.localStorage.getItem(KEY) ?? 0);
    if (Date.now() - last > DAY) setShow(true);
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div role="status" className="alert">
      <span className="text-sm">
        You just finished a draft — was the coaching any use? One sentence helps more than you
        would think.
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            dismiss();
            open({
              surface: "results",
              source: "prompt",
              anchor: { sessionId, setCode, format },
              prompt: "How was that draft, and how was the coach?",
            });
          }}
        >
          Say something
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

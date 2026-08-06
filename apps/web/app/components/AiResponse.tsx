"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { api } from "@mtg-tutor/backend";
import type { Doc, Id } from "@mtg-tutor/backend/dataModel";
import { routeOf, useFeedback, type FeedbackSurface } from "./Feedback";

/**
 * An answer the model wrote, with a way to say what you thought of it.
 *
 * Every AI response in this app is rateable in place, and they are the same
 * three convex/validators.ts already enumerates as llmCall's `area`: the
 * streamed per-pick coach, a review verdict, and the two review frames. Reusing
 * that union rather than inventing one means a complaint joins to the model call
 * that produced it.
 *
 * THE THUMB WRITES IMMEDIATELY, AND THEN ASKS WHY.
 *
 * One click is the whole cost of rating an answer, and the row exists before any
 * dialog opens. The overlay that follows asks for a reason; it does not collect
 * the rating. So somebody who does not feel like typing closes it and their
 * thumb still stands. Gating the rating behind the reason would lose the cheap
 * signal from exactly the people least likely to write a paragraph, which is
 * most of them. The reason then patches that same row (see feedback.explain)
 * rather than making a second, so one reaction stays one note.
 *
 * WHERE THE CONTROL SITS
 *
 * In whatever header row the block already has, revealed on hover or focus,
 * rather than floating over the prose. The prose carries hoverable card names
 * (CardText) and principle badges with their own portal popups, so an overlay
 * across it would cover exactly the parts worth reading -- and would be arguing
 * with the card preview's z-50 layer while it did. Appearing when you engage
 * with the block is the part that matters; covering it never was.
 *
 * Two exports because the blocks are shaped differently. AiResponse brings its
 * own header row, for the coach and verdict blocks that already had an eyebrow
 * of their own. AiRating is the bare control, for a frame that is already a
 * titled Panel and has an `aside` slot waiting for it.
 */

type Anchor = NonNullable<Doc<"feedback">["anchor"]>;
type Sentiment = NonNullable<Doc<"feedback">["sentiment"]>;

interface Rated {
  surface: FeedbackSurface;
  anchor?: Anchor;
  /**
   * What the model said, when nothing on the server holds it.
   *
   * Only the draft coach needs this -- it streams out of an httpAction and is
   * written down nowhere, so a complaint about it is unactionable without a
   * snapshot. Verdicts and frames are stored and frozen on first review, and the
   * owner's script joins those rather than keeping a copy that could disagree.
   */
  quote?: string;
}

export function AiRating({ surface, anchor, quote }: Rated) {
  const submit = useMutation(api.feedback.submit);
  const open = useFeedback();
  const pathname = usePathname() ?? "/";
  const [rated, setRated] = useState<Sentiment | null>(null);
  const [failed, setFailed] = useState(false);

  const rate = async (sentiment: Sentiment) => {
    if (rated) return;
    // Optimistic, because the control changing under the cursor IS the
    // acknowledgement on this path -- a toast on top of a per-response button
    // would be noise. Rolled back below if the write does not land, so it never
    // claims something was recorded that was not.
    setRated(sentiment);
    setFailed(false);

    let id: Id<"feedback">;
    try {
      id = await submit({ note: "", sentiment, route: routeOf(pathname), surface, anchor, quote });
    } catch {
      setRated(null);
      setFailed(true);
      return;
    }

    open({
      surface,
      source: "ai",
      sentiment,
      anchor,
      quote,
      explains: id,
      prompt: sentiment === "up" ? "What did it get right?" : "What did it get wrong?",
    });
  };

  if (rated) return <span className="text-xs text-base-content/60">Noted — thank you</span>;
  if (failed) return <span className="text-xs text-warning">Did not send</span>;

  return (
    // Quiet for a mouse until the block is engaged with, and always there for
    // touch. Opacity rather than `hidden`, which would take it out of the tab
    // order and off screen readers along with it.
    <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
      <Thumb label="This helped" onClick={() => void rate("up")} />
      <Thumb label="This missed" down onClick={() => void rate("down")} />
    </span>
  );
}

export function AiResponse({
  surface,
  anchor,
  quote,
  title,
  children,
}: Rated & {
  /** The block's existing eyebrow, moved in here so the control has a row to sit in. */
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="group border-t border-base-300 pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="eyebrow">{title}</div>
        <AiRating surface={surface} anchor={anchor} quote={quote} />
      </div>
      {children}
    </div>
  );
}

function Thumb({ label, down, onClick }: { label: string; down?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs px-1.5"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3.5 w-3.5 ${down ? "rotate-180" : ""}`}
      >
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </svg>
    </button>
  );
}

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
 * WHERE THE CONTROL SITS, AND WHY IT MOVED
 *
 * A strip under the answer, always drawn. It was a pair of thumbs up in the
 * block's header, revealed on hover, and that was wrong twice.
 *
 * Hover-revealed is invisible. A control nobody can see is a control nobody
 * uses, and pointing at a paragraph to find out whether it can be rated is not
 * something anybody does. The same mistake the feedback button made, one screen
 * further in.
 *
 * And it asked before the answer had been read. The question only makes sense
 * once somebody has the answer in hand, so it belongs where the reading ends
 * rather than up in the chrome above it. That is also where the eye already is.
 *
 * Two exports, because the blocks are shaped differently. AiResponse brings its
 * own eyebrow, for the coach and verdict blocks that already had one. AiRating
 * is the strip alone, for a frame that is already a titled Panel.
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
  /**
   * Whether there is an answer yet. False while the coach is still streaming --
   * "was this useful?" under a spinner is asking about nothing, and a thumb
   * pressed then would file a rating of the empty string.
   */
  ready?: boolean;
}

export function AiRating({ surface, anchor, quote, ready = true }: Rated) {
  const submit = useMutation(api.feedback.submit);
  const open = useFeedback();
  const pathname = usePathname() ?? "/";
  const [rated, setRated] = useState<Sentiment | null>(null);
  const [failed, setFailed] = useState(false);

  const rate = async (sentiment: Sentiment) => {
    if (rated) return;
    // Optimistic, because the strip answering instantly IS the acknowledgement
    // on this path -- a toast for a thumb would be noise. Rolled back below if
    // the write does not land, so it never claims something was recorded that
    // was not.
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

  if (!ready) return null;

  return (
    // Dashed, where the rule that opens the block is solid: one is a division
    // between two things worth reading and this is a footer under one of them,
    // and drawing them alike would give a short block two equal-weight lines.
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-base-300 pt-2">
      <span className={`text-xs ${failed ? "text-warning" : "text-base-content/50"}`}>
        {rated
          ? "Noted — thank you"
          : failed
            ? "That did not send. Try again?"
            : "Was this useful?"}
      </span>

      {!rated && (
        <span className="flex items-center gap-1">
          <Thumb label="This helped" onClick={() => void rate("up")} />
          <Thumb label="This missed" down onClick={() => void rate("down")} />
        </span>
      )}
    </div>
  );
}

export function AiResponse({
  surface,
  anchor,
  quote,
  ready,
  title,
  children,
}: Rated & {
  /** The block's existing eyebrow, kept here so the block owns its whole anatomy. */
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-base-300 pt-3">
      <div className="eyebrow mb-1.5">{title}</div>
      {children}
      <AiRating surface={surface} anchor={anchor} quote={quote} ready={ready} />
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
        className={`size-4 ${down ? "rotate-180" : ""}`}
      >
        <path d="M7 10v12" />
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </svg>
    </button>
  );
}

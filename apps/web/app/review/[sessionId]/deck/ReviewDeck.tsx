"use client";

import Link from "next/link";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { PageShell } from "../../../components/PageShell";
import { Results } from "../../../components/Results";

/**
 * What the picks became: the deck, the suggestion beside it, and the score.
 *
 * The same screen the draft board shows the moment a draft ends -- this is the
 * way back to it afterwards, and it is a route of its own rather than a link to
 * `/draft/<id>` because that page has to replay the board and read the set's
 * whole rules text before it can render anything. Neither is worth a byte here:
 * `draft.results` is the only query this screen asks.
 *
 * It sits under /review because a finished draft is not being played. The
 * walkthrough next door is about the picks; this is about what those picks
 * added up to.
 */
export function ReviewDeck({ sessionId }: { sessionId: string }) {
  return (
    <PageShell
      headerAside={
        <div className="flex flex-wrap items-center gap-3 text-sm text-base-content/60">
          <Link href={`/review/${sessionId}`} className="link link-hover">
            ← Step through the picks
          </Link>
          <span aria-hidden className="h-3.5 w-px bg-base-300" />
          <Link href={`/review/${sessionId}/breakdown`} className="link link-hover">
            Breakdown
          </Link>
        </div>
      }
    >
      <Results sessionId={sessionId as Id<"draftSessions">} />
    </PageShell>
  );
}

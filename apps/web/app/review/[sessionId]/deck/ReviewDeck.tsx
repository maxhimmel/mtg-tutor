"use client";

import type { Id } from "@mtg-tutor/backend/dataModel";
import { PageShell } from "../../../components/PageShell";
import { PageHeading } from "../../../components/PageHeading";
import { Results } from "../../../components/Results";
import { ReviewViews } from "../../ReviewViews";

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
    <PageShell>
      {/* No title, on purpose: `draft.results` is the only query this screen is
          willing to pay for and it does not carry the set, and Results opens
          with a headline of its own that a second one above would fight. So the
          heading here is the switcher and the rule under it. */}
      <PageHeading controls={<ReviewViews sessionId={sessionId} current="deck" />} />
      <Results sessionId={sessionId as Id<"draftSessions">} />
    </PageShell>
  );
}

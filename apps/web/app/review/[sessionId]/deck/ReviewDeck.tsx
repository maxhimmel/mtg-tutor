"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { PageShell } from "../../../components/PageShell";
import { PageHeading } from "../../../components/PageHeading";
import { ColorPips } from "../../../components/ColorPips";
import { Results } from "../../../components/Results";
import { SetIcon } from "../../../components/SetIcon";
import { ReviewViews } from "../../ReviewViews";

/**
 * What the picks became: the deck, the suggestion beside it, and the score.
 *
 * The same screen the draft board shows the moment a draft ends -- this is the
 * way back to it afterwards, and it is a route of its own rather than a link to
 * `/draft/<id>` because that page has to replay the board and read the set's
 * whole rules text before it can render anything. Neither is worth a byte here:
 * `draft.results` is the only query this screen asks for the draft itself.
 *
 * It sits under /review because a finished draft is not being played. The
 * walkthrough next door is about the picks; this is about what those picks
 * added up to.
 */
export function ReviewDeck({ sessionId }: { sessionId: string }) {
  // Which draft this is, handed back by Results once its one query lands. The
  // masthead used to be blank here, on the grounds that nothing on this route
  // knew the set -- but a switcher whose three views do not agree on what they
  // are views OF is the switcher losing the draft between clicks, so the name is
  // worth waiting a beat for. `sets.list` is the same small query the other two
  // views make, and it does not touch the draft.
  const [subject, setSubject] = useState<{
    setCode: string;
    format: string;
    colorPair: string;
  } | null>(null);
  const sets = useQuery(api.sets.list);
  const set = subject
    ? (sets ?? []).find((s) => s.code === subject.setCode && s.format === subject.format)
    : undefined;

  return (
    <PageShell>
      <PageHeading
        icon={
          subject && (
            <SetIcon uri={set?.iconUri} name={set?.name} className="size-6 text-base-content/50" />
          )
        }
        title={
          subject && (
            <>
              {set?.name ?? subject.setCode.toUpperCase()}
              {subject.colorPair && <ColorPips colors={subject.colorPair} className="ml-2.5" />}
            </>
          )
        }
        controls={<ReviewViews sessionId={sessionId} current="deck" />}
      />
      <Results sessionId={sessionId as Id<"draftSessions">} onSubject={setSubject} />
    </PageShell>
  );
}

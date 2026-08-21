"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { ForkImpact } from "@mtg-tutor/core";
import { lineExplored } from "../lib/analytics";

/**
 * undefined: nobody has asked about this pick.
 * "pending": asked, the replay has not come back.
 * null: asked, and it cannot be measured -- the boosters were never stored, or
 *       the replay diverged from the picks.
 */
export type LineState = ForkImpact | "pending" | null | undefined;

export interface Line {
  state: LineState;
  /** The card being swapped in, so a panel can name it while it waits. */
  theirs: string;
}

interface Asked {
  pickIndex: number;
  theirs: string;
  which: "graded" | "chosen";
}

/**
 * Every alternate line this review has asked for, in ONE query.
 *
 * The batching is the whole reason this is a hook rather than a `useQuery` in
 * the component that draws the panel. `review.lines` reads the draft's stored
 * boosters -- ~45KB -- and `PickReveal` is rendered forty times over on the
 * breakdown. A subscription per pick would be forty deal reads for a screen
 * whose entire point is that it does not read the pool (see `review.load`), so
 * a feature that cost nothing to compute would have been the most expensive
 * thing on the page. `DiffScreen` batches its forks for the same reason.
 *
 * Accumulating rather than replacing: asking about a second pick must not throw
 * away the answer to the first, because both panels stay open behind you as you
 * walk the draft. Re-asking the same pick with a different card REPLACES that
 * pick's entry -- one line at a time per pick is what the panel draws, and
 * keeping the old one would grow the query forever as somebody clicked around.
 *
 * THE EVENT FIRES HERE RATHER THAN ON THE CLICK, and that is the one thing in
 * this file worth arguing about. `line_explored` carries `reach`, which does not
 * exist until the replay comes back -- and `reach` is the measurement the event
 * exists for (see analytics.ts). Capturing on the click would send a row saying
 * somebody asked, with a blank where the finding goes, which is the shape of
 * event the repo's own rule calls noise. So it is sent once per settled answer,
 * keyed by pick and card so that re-rendering cannot send it twice.
 */
export function useLines(sessionId: Id<"draftSessions">) {
  const [asked, setAsked] = useState<readonly Asked[]>([]);

  const impacts = useQuery(
    api.review.lines,
    asked.length > 0
      ? { sessionId, forks: asked.map((f) => ({ pickIndex: f.pickIndex, theirs: f.theirs })) }
      : "skip",
  );

  const ask = useCallback((pickIndex: number, theirs: string, which: "graded" | "chosen") => {
    setAsked((was) => {
      const rest = was.filter((f) => f.pickIndex !== pickIndex);
      return [...rest, { pickIndex, theirs, which }];
    });
  }, []);

  // `impacts` is positional -- the query maps its forks array in order -- so a
  // result is only this fork's answer while the arrays are the same length.
  // Mid-flight after a new ask they are not, and everything reads as pending
  // rather than as somebody else's number.
  const settled =
    impacts !== undefined && (impacts === null || impacts.length === asked.length);

  const byPick = useMemo(() => {
    const out = new Map<number, Line>();
    asked.forEach((fork, i) => {
      const state: LineState = !settled ? "pending" : impacts === null ? null : impacts[i];
      out.set(fork.pickIndex, { state, theirs: fork.theirs });
    });
    return out;
  }, [asked, impacts, settled]);

  const sent = useRef(new Set<string>());
  useEffect(() => {
    // Nothing to report about a line that could not be run: `null` is one answer
    // for the whole query rather than a per-fork one, so there is no `reach` to
    // send and no pick to attribute it to.
    if (!settled || impacts === null || impacts === undefined) return;

    asked.forEach((fork, i) => {
      const impact = impacts[i];
      if (!impact) return;

      const key = `${fork.pickIndex}:${fork.theirs}`;
      if (sent.current.has(key)) return;
      sent.current.add(key);

      lineExplored({
        sessionId,
        pickIndex: fork.pickIndex,
        card: fork.which,
        reach: impact.reach,
        of: impact.of,
        delay: impact.delay,
      });
    });
  }, [asked, impacts, settled, sessionId]);

  const lineFor = useCallback((pickIndex: number) => byPick.get(pickIndex), [byPick]);

  return { ask, lineFor };
}

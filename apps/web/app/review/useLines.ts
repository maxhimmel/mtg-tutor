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
 * WHAT THE BATCHING ACTUALLY BUYS, stated carefully because the first version of
 * this comment claimed a saving it does not deliver. `asked` grows with every
 * ask, so each ask is new query args and therefore a new execution and another
 * read of the same ~45KB deal -- N asks cost N deal reads whether they are
 * batched or not, and the batched form does strictly MORE replay work, since
 * execution k re-runs all k forks. So this is not a bandwidth win and must not
 * be cited as one.
 *
 * What it is, is one live subscription for the page instead of one per pick.
 * `PickReveal` is rendered forty times over on the breakdown, and forty standing
 * subscriptions on a screen built specifically not to read the pool (see
 * `review.load`) is the shape of thing that drained the tier before. That is
 * worth having on its own. `DiffScreen` batches its forks the same way.
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
  const sent = useRef(new Set<string>());

  // The router reuses one component across two ids of the same dynamic route,
  // so without this a second review inherits the first one's asks -- the same
  // hazard `useVerdicts` has a paragraph about one file over, and worse here.
  // A stale ask is not merely a stale answer: it is sent to the NEW session,
  // whose own `pickedNames` walk fine, so nothing throws. `forkImpact` cannot
  // find the other draft's card in this draft's pack and falls through to
  // `?? bestOf(pack)`, which quietly swaps in the pod's best card and returns a
  // perfectly plausible `reach` for a counterfactual nobody asked for, drawn
  // under a pick of a draft it has nothing to do with.
  //
  // `sent` is cleared with it, or `line_explored` de-dupes the new session's
  // answers against the old one's keys and silently drops them.
  useEffect(() => {
    setAsked([]);
    sent.current = new Set();
  }, [sessionId]);

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

  // KEYED BY THE ANSWER'S OWN `pickIndex`, never by position in the array.
  //
  // Positional was the first version and it read fine: the query maps its forks
  // in order, so `impacts[i]` is `asked[i]`'s answer. The guard against a
  // mid-flight mismatch was `impacts.length === asked.length` -- which is not a
  // guard, it is a coincidence that holds until the server returns a different
  // number of rows than it was given. `review.lines` caps the forks it will
  // replay, so on a set whose packs run to 45 picks that cap is reachable, the
  // lengths never match again, and EVERY panel on the page -- including the ones
  // answered ten picks ago -- falls back to "pending" and spins forever.
  //
  // `ForkImpact` carries the `pickIndex` it was computed for, so the mapping is
  // available for free and is immune to truncation, reordering and any filtering
  // the server ever grows. `DiffScreen` already does exactly this with the same
  // type; this was the one place that reimplemented it worse.
  const answers = useMemo(
    () => new Map((impacts ?? []).map((impact) => [impact.pickIndex, impact])),
    [impacts],
  );

  const byPick = useMemo(() => {
    const out = new Map<number, Line>();
    for (const fork of asked) {
      // `null` is the whole query refusing -- no boosters, or a replay that
      // diverged -- and applies to every fork on it. `undefined` from the map is
      // this fork alone: still loading, or dropped past the cap.
      const state: LineState =
        impacts === null ? null : (answers.get(fork.pickIndex) ?? "pending");
      out.set(fork.pickIndex, { state, theirs: fork.theirs });
    }
    return out;
  }, [asked, impacts, answers]);

  useEffect(() => {
    // Nothing to report about a line that could not be run: `null` is one answer
    // for the whole query rather than a per-fork one, so there is no `reach` to
    // send and no pick to attribute it to.
    if (impacts === null || impacts === undefined) return;

    for (const fork of asked) {
      const impact = answers.get(fork.pickIndex);
      if (!impact) continue;

      const key = `${fork.pickIndex}:${fork.theirs}`;
      if (sent.current.has(key)) continue;
      sent.current.add(key);

      lineExplored({
        sessionId,
        pickIndex: fork.pickIndex,
        card: fork.which,
        reach: impact.reach,
        of: impact.of,
        delay: impact.delay,
      });
    }
  }, [asked, impacts, answers, sessionId]);

  const lineFor = useCallback((pickIndex: number) => byPick.get(pickIndex), [byPick]);

  return { ask, lineFor };
}

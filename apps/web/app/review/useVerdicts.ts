"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { ReviewVerdict } from "@mtg-tutor/core";
import { humanError } from "../lib/humanError";

// undefined: never asked. null: asked, and there was no answer -- the deployment
// has no model key, the call failed, or the answer named a card that was not in
// the pack and the backend refused it. Callers show the data-only reveal for
// null rather than spinning on a verdict that is not coming.
export type VerdictState = ReviewVerdict | null | undefined;

interface Seeded {
  pickIndex: number;
  verdict?: ReviewVerdict;
}

/**
 * The one place the web app asks for a review verdict.
 *
 * `api.review.verdict` is an action, not a stream: it arrives whole after a
 * couple of seconds, so the walkthrough asks for the pick being revealed and
 * warms the next one, and only the breakdown asks for everything at once.
 *
 * Verdicts are frozen server-side on first request, so `review.load` already
 * carries every one earned on a previous pass -- seeding from those is what
 * makes a second review of the same draft cost nothing.
 */
export function useVerdicts(sessionId: Id<"draftSessions">, seed: Seeded[] | undefined) {
  const askVerdict = useAction(api.review.verdict);
  const [verdicts, setVerdicts] = useState<ReadonlyMap<number, ReviewVerdict | null>>(
    new Map(),
  );

  // Every pick already asked for, answered or not. Kept in a ref rather than
  // read off `verdicts` so that `request` has a stable identity and can be
  // depended on by an effect without re-firing as answers land.
  const asked = useRef(new Set<number>());

  // Why the asking stopped, when it stopped for a reason worth reading.
  //
  // The action returns null for "the coach could not answer" -- no model key,
  // a call that failed, an answer naming a card that was not in the pack -- so
  // anything it THROWS is a refusal: not signed in, not your draft, or out of
  // reviews for today. That is what makes one catch enough here.
  const [refused, setRefused] = useState<string | null>(null);

  // And having been refused once, stop asking. Without this the breakdown's
  // five workers each collect the same sentence and seventeen further round
  // trips run only to be told no.
  const halted = useRef(false);

  // The router reuses one component across two ids of the same dynamic route,
  // so without this a second draft would inherit the first draft's answers and
  // -- worse -- its record of what had already been asked, and would never ask
  // for anything.
  useEffect(() => {
    asked.current = new Set();
    halted.current = false;
    setRefused(null);
    setVerdicts(new Map());
  }, [sessionId]);

  useEffect(() => {
    if (!seed) return;
    const frozen = seed.filter((p) => p.verdict && !asked.current.has(p.pickIndex));
    if (frozen.length === 0) return;

    for (const pick of frozen) asked.current.add(pick.pickIndex);
    setVerdicts((prev) => {
      const next = new Map(prev);
      for (const pick of frozen) next.set(pick.pickIndex, pick.verdict!);
      return next;
    });
  }, [seed]);

  const request = useCallback(
    async (pickIndex: number): Promise<void> => {
      if (halted.current || asked.current.has(pickIndex)) return;
      asked.current.add(pickIndex);

      let verdict: ReviewVerdict | null = null;
      try {
        verdict = await askVerdict({ sessionId, pickIndex });
      } catch (e) {
        // Stays in `asked`, so a deployment with no key answers "unavailable"
        // once instead of being re-asked on every render.
        halted.current = true;
        setRefused(humanError(e));
      }
      setVerdicts((prev) => new Map(prev).set(pickIndex, verdict));
    },
    [askVerdict, sessionId],
  );

  // Bounded concurrency, the same shape the CLI's --breakdown uses: a full draft
  // is ~17 decision picks, and firing seventeen model calls at once is a way to
  // get rate limited rather than a way to go faster.
  const requestMany = useCallback(
    async (indices: number[], limit = 5): Promise<void> => {
      const pending = indices.filter((i) => !asked.current.has(i));
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(limit, pending.length) }, async () => {
          while (cursor < pending.length && !halted.current) await request(pending[cursor++]);
        }),
      );
    },
    [request],
  );

  const get = useCallback((pickIndex: number): VerdictState => verdicts.get(pickIndex), [
    verdicts,
  ]);

  return { get, request, requestMany, resolved: verdicts.size, refused };
}

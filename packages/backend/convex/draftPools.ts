import { ConvexError } from "convex/values";
import type { ColorWinRate, Deal, SetData } from "@mtg-tutor/core";
import { dealDraft, packDeal, unpackDeal } from "@mtg-tutor/core";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

// Reading and writing the boosters a draft was dealt.
//
// The one door onto `draftPools`. Nothing else may index into the stored
// columns: the equal-length invariant that `v.array(engineCard)` used to give
// for free now lives in core's `unpackCards`, and it only protects readers that
// come through here.

/**
 * Deals a draft and stores it, once, at creation.
 *
 * The set document is read exactly here and nowhere else on a session's life:
 * this is the whole point of the table. Returns nothing, because the caller has
 * no use for the deal -- it will read it back through `dealFor` like every other
 * request does, so there is one path rather than a fast one and a slow one that
 * can disagree.
 */
export async function storeDeal(
  ctx: MutationCtx,
  sessionId: Id<"draftSessions">,
  set: SetData,
  seed: number,
): Promise<void> {
  await ctx.db.insert("draftPools", {
    sessionId,
    ...packDeal(dealDraft(set, seed)),
    colorWinRates: set.colorWinRates,
  });
}

/**
 * Gives a second draft the SAME boosters as a first.
 *
 * What a challenge means, made structural. It used to be expressed as a shared
 * seed re-dealt against the set -- which is only the same packs for as long as
 * the set does not move, so `accept` carried a staleness guard that replayed the
 * challenger's draft to check. That guard could only ever DETECT the drift and
 * refuse; copying the row removes the drift.
 *
 * The row is copied rather than shared. Two sessions pointing at one pool would
 * be smaller, and would make deleting either draft able to take the other's
 * packs with it -- and a challenge is precisely a promise that cannot be
 * withdrawn once taken up.
 */
export async function copyDeal(
  ctx: MutationCtx,
  from: Id<"draftSessions">,
  to: Id<"draftSessions">,
): Promise<void> {
  const row = await ctx.db
    .query("draftPools")
    .withIndex("by_session", (q) => q.eq("sessionId", from))
    .unique();

  if (!row) {
    throw new ConvexError("The draft behind this challenge has no stored packs.");
  }
  await ctx.db.insert("draftPools", {
    sessionId: to,
    cards: row.cards,
    rounds: row.rounds,
    colorWinRates: row.colorWinRates,
  });
}

/**
 * The boosters this draft was dealt.
 *
 * Throws rather than falling back to dealing one, and that is the choice. A
 * session with no pool row is a session created by a code path that forgot to
 * write one -- re-dealing here would paper over it with packs that are not the
 * ones the player saw, and every pick they had already made would be graded
 * against a draft that never happened. Loud is the only safe answer.
 */
export async function dealFor(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
): Promise<{ deal: Deal; colorWinRates: ColorWinRate[] }> {
  const row = await ctx.db
    .query("draftPools")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();

  if (!row) {
    throw new ConvexError(
      `Draft ${sessionId} has no stored boosters, so it cannot be rebuilt.`,
    );
  }
  return {
    deal: unpackDeal({ cards: row.cards, rounds: row.rounds }),
    colorWinRates: row.colorWinRates,
  };
}

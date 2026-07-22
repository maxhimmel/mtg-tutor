import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { card, draftSummary, reviewVerdict } from "./validators.js";

export default defineSchema({
  // One document per (set, format). A whole set of cards measures 126-164KB
  // for real sets, well inside Convex's 1MB document limit, so a draft
  // mutation reads exactly one document instead of hundreds of card rows.
  sets: defineTable({
    code: v.string(),
    format: v.string(),
    cards: v.array(card),
    // Map<string, number> isn't a Convex value; stored as pairs and rebuilt.
    colorPairWinRates: v.array(
      v.object({ pair: v.string(), winRate: v.number() }),
    ),
    ratedCardCount: v.number(),
    ingestedAt: v.string(),
  }).index("by_code_and_format", ["code", "format"]),

  // A draft is fully determined by its seed plus the ordered names the human
  // picked, so that pair IS the session -- no board state is persisted. See
  // replayDraft in @mtg-tutor/core. Replaying a finished draft costs ~0.16ms.
  draftSessions: defineTable({
    userId: v.optional(v.string()), // set once auth lands
    setCode: v.string(),
    format: v.string(),
    seed: v.number(),
    pickedNames: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("complete")),
    saved: v.boolean(),
    createdAt: v.string(),
    completedAt: v.optional(v.string()),
    // Denormalized on completion so the stats screen doesn't replay every draft.
    summary: v.optional(draftSummary),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_saved", ["userId", "saved"]),

  // Frozen on first review so re-reviews are stable. Keyed by position in the
  // session's pick list rather than by a pick row, since picks aren't stored.
  reviewVerdicts: defineTable({
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  }).index("by_session_and_pickIndex", ["sessionId", "pickIndex"]),
});

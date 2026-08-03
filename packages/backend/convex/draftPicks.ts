import { ConvexError } from "convex/values";
import type { Card, EngineCard, PoolCard, RecordedPick, TextIndex } from "@mtg-tutor/core";
import { computeCardValue, hydrate, hydrateCard } from "@mtg-tutor/core";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

// Reading and writing what a pick saw.
//
// The coach and the review verdict each want one historical pick. Rebuilding
// one by replaying the draft meant reading the set's entire card pool to answer
// a question about fourteen cards. The engine already produced the answer when
// the pick was made; this stores it and reads it back.

/** Written in the same transaction as the pick it records. */
export async function recordPick(
  ctx: MutationCtx,
  sessionId: Id<"draftSessions">,
  pickIndex: number,
  rec: RecordedPick,
  poolBefore: readonly PoolCard[],
): Promise<void> {
  await ctx.db.insert("draftPicks", {
    sessionId,
    pickIndex,
    packNo: rec.packNo,
    pickNo: rec.pickNo,
    pack: rec.pack,
    pickedName: rec.picked.name,
    poolBefore: poolBefore.map((c) => ({ name: c.name, colors: c.colors })),
    score: {
      score: rec.score.score,
      grade: rec.score.grade,
      pickedName: rec.score.picked.name,
      rawBestName: rec.score.rawBest.name,
      contextBestName: rec.score.contextBest.name,
      pickedValue: rec.score.pickedValue,
      rawBestValue: rec.score.rawBestValue,
      contextBestValue: rec.score.contextBestValue,
      ...(rec.score.terms.length > 0 ? { terms: rec.score.terms } : {}),
      isBest: rec.score.isBest,
      onColor: rec.score.onColor,
      rankInPack: rec.score.rankInPack,
    },
    ...(rec.signal === undefined ? {} : { signal: rec.signal }),
  });
}

export async function storedPick(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
  pickIndex: number,
): Promise<Doc<"draftPicks"> | null> {
  return await ctx.db
    .query("draftPicks")
    .withIndex("by_session_and_pickIndex", (q) =>
      q.eq("sessionId", sessionId).eq("pickIndex", pickIndex),
    )
    .unique();
}

/**
 * Every score this session actually gave, in pick order.
 *
 * A replay cannot answer this. `draft.pick` scores against the pack's context
 * rows, and a replay has none -- reading the set's on every pick is the cost the
 * card split exists to avoid -- so a replayed history carries raw-power scores
 * and the stored rows carry what the player was shown. The stored rows win.
 */
export async function storedScores(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
): Promise<Doc<"draftPicks">["score"][]> {
  const rows = await ctx.db
    .query("draftPicks")
    .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", sessionId))
    .collect();
  return rows.sort((a, b) => a.pickIndex - b.pickIndex).map((r) => r.score);
}

function inPack(pack: EngineCard[], name: string): EngineCard {
  const card = pack.find((c) => c.name === name);
  if (!card) {
    // The picked card and the best card are both chosen FROM the pack stored
    // beside them, so neither can be missing unless the row was written by
    // something other than the engine.
    throw new ConvexError(`Stored pick names "${name}", which is not in its own pack.`);
  }
  return card;
}

// A pack stored before `value` existed still carries the statistics it was
// computed from, so the number is recoverable rather than lost -- and it is the
// value that pick actually saw, not today's. Settling it here instead of
// backfilling the rows keeps the record untouched and costs one pass over the
// ~14 cards a coach call reads.
const asEngineCards = (pack: Doc<"draftPicks">["pack"]): EngineCard[] =>
  pack.map((c) => ({
    ...c,
    value: c.value ?? computeCardValue({ ...c, rarity: c.rarity ?? "common" }),
  }));

/** The stored row as the engine would have handed it over, cards and all. */
export function toRecordedPick(row: Doc<"draftPicks">, text: TextIndex): RecordedPick<Card> {
  const stored = asEngineCards(row.pack);
  const pack = hydrate(stored, text);
  const picked = hydrateCard(inPack(stored, row.pickedName), text);

  return {
    packNo: row.packNo,
    pickNo: row.pickNo,
    pack,
    picked,
    score: {
      score: row.score.score,
      grade: row.score.grade,
      picked: hydrateCard(inPack(stored, row.score.pickedName), text),
      rawBest: hydrateCard(inPack(stored, row.score.rawBestName), text),
      contextBest: hydrateCard(inPack(stored, row.score.contextBestName), text),
      pickedValue: row.score.pickedValue,
      rawBestValue: row.score.rawBestValue,
      contextBestValue: row.score.contextBestValue,
      terms: row.score.terms ?? [],
      isBest: row.score.isBest,
      onColor: row.score.onColor,
      rankInPack: row.score.rankInPack,
    },
    signal: row.signal,
  };
}

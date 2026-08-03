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
      bestName: rec.score.best.name,
      pickedValue: rec.score.pickedValue,
      bestValue: rec.score.bestValue,
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
      best: hydrateCard(inPack(stored, row.score.bestName), text),
      pickedValue: row.score.pickedValue,
      bestValue: row.score.bestValue,
      isBest: row.score.isBest,
      onColor: row.score.onColor,
      rankInPack: row.score.rankInPack,
    },
    signal: row.signal,
  };
}

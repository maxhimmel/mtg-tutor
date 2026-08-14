import { ConvexError } from "convex/values";
import type {
  Card,
  EngineCard,
  PickDefense,
  PoolCard,
  RecordedPick,
  TextIndex,
} from "@mtg-tutor/core";
import { curveTurn, detectRole, hydrate, hydrateCard, normalizeName } from "@mtg-tutor/core";
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
  defense?: PickDefense,
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
      pickedContextValue: rec.score.pickedContextValue,
      rawBestValue: rec.score.rawBestValue,
      contextBestValue: rec.score.contextBestValue,
      ...(rec.score.terms.length > 0 ? { terms: rec.score.terms } : {}),
      isBest: rec.score.isBest,
      indistinguishable: rec.score.indistinguishable,
      bandNames: rec.score.band.map((c) => c.name),
      ...(rec.score.preferred ? { preferredName: rec.score.preferred.name } : {}),
      reasons: rec.score.reasons,
      onColor: rec.score.onColor,
      rankInPack: rec.score.rankInPack,
    },
    ...(rec.signal === undefined ? {} : { signal: rec.signal }),
    ...(defense === undefined ? {} : { defense }),
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

/**
 * Every row of a session, in pick order.
 *
 * Unchecked, like `storedPick` and `storedScores` beside it: the caller proves
 * it may read them. That is a contract this file already had rather than a new
 * exception -- the ownership check for these lives at each entry point, in
 * `draft.coachContext` and `review.verdictContext`. The cross-user caller is
 * `challenges.diff`, and its right to be here is `challengeParty`.
 */
export async function storedPicks(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
): Promise<Doc<"draftPicks">[]> {
  const rows = await ctx.db
    .query("draftPicks")
    .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", sessionId))
    .collect();
  return rows.sort((a, b) => a.pickIndex - b.pickIndex);
}

/**
 * The pool as the draft left it, out of the LAST pick's row alone.
 *
 * A row's `poolBefore` holds every card taken before it, so the final row holds
 * 44 of the 45 -- and the 45th is the card that row is about, sitting in its own
 * `pack`. One document, ~1.5KB at P3P15 where the pack is down to a single card.
 *
 * That is the whole reason `draft.build` can correct a finished draft's colours
 * without replaying it: rebuilding the pool through `loadBoard` would read the
 * set's ~46KB card document, and would throw on a draft whose set has since been
 * re-ingested -- which must not be a way to lose your deck.
 *
 * Pick order, because that is what a bench position indexes: `poolBefore` for
 * pick n holds positions 0..n-1, so the picked card appends at exactly n.
 */
export function poolFromLastPick(row: Doc<"draftPicks">): PoolCard[] {
  const picked = inPack(row.pack, row.pickedName);
  return [...row.poolBefore, { name: picked.name, colors: picked.colors }];
}

/**
 * `null` when the session has no row for its last pick, rather than a throw.
 *
 * Sessions drafted before `draftPicks` existed have rows only if the backfill
 * could replay them, which by definition excludes the ones whose set has moved
 * on. A caller that wants to refresh something derived should leave it alone in
 * that case; none of them is worth failing a mutation over.
 */
export async function storedPool(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
  pickCount: number,
): Promise<PoolCard[] | null> {
  if (pickCount <= 0) return null;
  const row = await storedPick(ctx, sessionId, pickCount - 1);
  return row ? poolFromLastPick(row) : null;
}

// Generic in the card, because finding one by name needs nothing else -- and
// the two callers hold different shapes: a stored snapshot, which may predate
// `turn`/`role`, and a snapshot already brought up to a whole EngineCard.
function inPack<C extends { name: string }>(pack: readonly C[], name: string): C {
  const card = pack.find((c) => c.name === name);
  if (!card) {
    // The picked card and the best card are both chosen FROM the pack stored
    // beside them, so neither can be missing unless the row was written by
    // something other than the engine.
    throw new ConvexError(`Stored pick names "${name}", which is not in its own pack.`);
  }
  return card;
}

/**
 * A stored snapshot brought up to a whole `EngineCard`.
 *
 * `turn` and `role` are optional on `packSnapshot` and required on the pool --
 * see `validators.ts` for why the two lifecycles differ -- so a pack stored
 * before those existed is short of both, and everything downstream wants a card
 * that is not.
 *
 * DERIVED, NOT DEFAULTED. They are computed from the text half being joined on
 * in the same breath, by the same two functions ingest calls, so the answer is
 * the one ingest would have written rather than a placeholder standing in for
 * it. A default would be measurement trap #10 exactly: a card that scores as
 * though it had no cost and no role, indistinguishable from one that does.
 */
function asEngineCard(stored: Doc<"draftPicks">["pack"][number], text: TextIndex): EngineCard {
  if (stored.turn != null && stored.role != null) return stored as EngineCard;
  const half = text.get(normalizeName(stored.name));
  return {
    ...stored,
    turn: stored.turn ?? (half ? curveTurn(half) : 1),
    role: stored.role ?? (half ? detectRole(half) : "other"),
  };
}

/** The stored row as the engine would have handed it over, cards and all. */
export function toRecordedPick(row: Doc<"draftPicks">, text: TextIndex): RecordedPick<Card> {
  const stored = row.pack.map((c) => asEngineCard(c, text));
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
      pickedContextValue: row.score.pickedContextValue ?? row.score.pickedValue,
      rawBestValue: row.score.rawBestValue,
      contextBestValue: row.score.contextBestValue,
      terms: row.score.terms ?? [],
      isBest: row.score.isBest,
      // Read, never recomputed. This used to derive it from the hydrated cards
      // for rows written before the grade could see a margin -- which put a
      // FIFTH copy of "is this gap real" in the codebase, in the one place whose
      // job is to report what a player was actually shown. A row from before the
      // field existed simply did not have that verdict, and inventing one now
      // would show them a screen they never saw.
      indistinguishable: row.score.indistinguishable ?? false,
      // Names rather than cards on the row, hydrated back out of the pack it was
      // stored beside -- the same shape `pickedName` and `contextBestName` take.
      // A row written before the band existed has none and renders as it always
      // did: one card, which is what it was shown with.
      band: (row.score.bandNames ?? []).map((n) => hydrateCard(inPack(stored, n), text)),
      ...(row.score.preferredName
        ? { preferred: hydrateCard(inPack(stored, row.score.preferredName), text) }
        : {}),
      reasons: row.score.reasons ?? [],
      onColor: row.score.onColor,
      rankInPack: row.score.rankInPack,
    },
    signal: row.signal,
  };
}

import { REVIEW, dialsForDraft, isDecisionPick } from "@mtg-tutor/core";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { DigestMistake } from "./validators.js";

// What a draft leaves behind for the statistics screen.
//
// Built from the `draftPicks` rows, never from a replay. That is a correctness
// choice before it is a cost one: `draft.pick` scores against the pack's own
// context rows, and a replay has none, so a replayed history carries raw-power
// scores while the rows carry what the player was actually shown. See the note
// on `storedScores`.

/**
 * How many of a draft's worst picks are kept.
 *
 * EXACT RATHER THAN APPROXIMATE, for the one list that reads them. The screen
 * asks for the worst N across every draft in the window, and any single draft
 * can contribute at most N of those -- so keeping each draft's own worst N is
 * enough to answer it exactly. It stops being exact only if somebody asks for
 * more than this, which `stats.overview` clamps rather than answers wrongly.
 */
export const DIGEST_MISTAKES = 10;

/** The gap the grade is made of, which is what ranks a mistake. */
const gap = (m: DigestMistake) => m.bestValue - m.pickedValue;

// A mistake is a DECISION got wrong, which is why the pack has to be big enough
// to have offered one. The last few cards of a pack are what is left rather than
// what was chosen -- taking a land off the dregs to signal, or because there is
// nothing else, is not a miss and being shown it as one teaches nothing. The
// review quiz and the misses drill already step past exactly these picks; this
// is the same threshold, applied where the list is built.
function mistakesFrom(rows: readonly Doc<"draftPicks">[]): DigestMistake[] {
  return rows
    .filter(
      (row) => !row.score.isBest && isDecisionPick(row.pack.length, REVIEW.decisionPickMinCards),
    )
    .map((row) => ({
      pickedName: row.pickedName,
      // contextBest, not rawBest: the filter above is "did you take the card the
      // grade was measured against", so naming the other answer produces rows
      // reading "you took X, best was X".
      bestName: row.score.contextBestName,
      pickedValue: row.score.pickedContextValue ?? row.score.pickedValue,
      bestValue: row.score.contextBestValue,
      score: row.score.score,
      packNo: row.packNo,
      pickNo: row.pickNo,
    }))
    .sort((a, b) => gap(b) - gap(a))
    .slice(0, DIGEST_MISTAKES);
}

/**
 * Writes the digest for a finished draft.
 *
 * Called from `draft.pick`'s completion branch, which has already read these
 * rows to summarise the draft -- so this costs the write and nothing else.
 */
/**
 * A draft's rows as the dial walk wants them.
 *
 * `pickedName` is a name and the walk wants the card, which is in the row's own
 * pack -- a pack snapshot is the engine half of every card that was on offer, so
 * nothing has to be read to resolve it. A name that is not in its own pack is
 * left undefined rather than guessed at, and `dialPicksFrom` skips that pick;
 * the alternative is a pick recorded as "took index 0", which is a preference
 * nobody expressed.
 */
export function dialRows(rows: readonly Doc<"draftPicks">[]) {
  return rows.map((row) => ({
    pack: row.pack,
    picked: row.pack.find((card) => card.name === row.pickedName),
  }));
}

export async function storeDigest(
  ctx: MutationCtx,
  sessionId: Id<"draftSessions">,
  // Taken as an argument rather than read here, because the only caller has just
  // read them to summarise the draft. A draft's pick rows are ~92KB -- each
  // carries the pack it saw -- so collecting them a second time would cost more
  // than this digest saves on the screen it was written for.
  rows: readonly Doc<"draftPicks">[],
): Promise<void> {
  await ctx.db.insert("draftDigests", {
    sessionId,
    picks: {
      scores: rows.map((r) => r.score.score),
      packNos: rows.map((r) => r.packNo),
      pickNos: rows.map((r) => r.pickNo),
    },
    mistakes: mistakesFrom(rows),
    // Twenty-eight numbers, off rows the caller has already read. Undefined when
    // this draft cannot be measured -- a pool with no pick order at all, or a
    // draft with no decision in it -- because `dialsForDraft` refuses rather
    // than handing back something that would sum with everything else and mean
    // something different.
    //
    // At theta = 1 and NOT corrected for the set: the baselines are refittable,
    // and a curvature stored already-corrected would freeze whichever vintage of
    // that correction was current on the day. See `curvatureOf`.
    dials: dialsForDraft(dialRows(rows)),
  });
}

/**
 * The digest for a session, or null.
 *
 * Null rather than a throw, unlike `dealFor`. A draft only gets one when it
 * FINISHES, so an active draft legitimately has none -- and the caller's answer
 * is to leave it out of the per-pick charts, which is what "you have not
 * finished this one yet" should look like.
 */
export async function digestFor(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
): Promise<Doc<"draftDigests"> | null> {
  return await ctx.db
    .query("draftDigests")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
}

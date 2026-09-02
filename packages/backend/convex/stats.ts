import { v } from "convex/values";
import {
  DIAL_BUNDLES,
  DIAL_FINGERPRINT,
  DRAFTER_TAU,
  REVIEW,
  addCurvature,
  cardsLeftAtMiss,
  curvatureOf,
  drafterReadout,
  emptyCurvature,
  isDecisionPick,
  missFixed,
  missProgress,
  setBaseline,
} from "@mtg-tutor/core";
import { query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { ownSessions, requireUserId } from "./sessions.js";
import { DIGEST_MISTAKES, digestFor } from "./draftDigests.js";
import type { DigestMistake } from "./validators.js";

// Per-draft numbers come from the denormalized summary on the session; the
// per-pick breakdowns (score by pick number, biggest misses) come from that
// draft's digest.
//
// NEITHER HALF REPLAYS ANY MORE, and the reason is correctness before cost.
// This used to rebuild every draft in the window, handing the replay a scoring
// context so it would agree with what the player was shown -- because without
// one a replay grades on raw power, and the two halves of this screen would
// disagree. That was a lot of machinery to recompute numbers `draftPicks` had
// written down at the moment they were shown. The digest is those numbers.
//
// What it cost: a hundred sessions, each replay reading its set's pool and its
// context rows, 732KB a page view.
const DEFAULT_SESSION_LIMIT = 100;

export const overview = query({
  args: { limit: v.optional(v.number()), mistakeLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? DEFAULT_SESSION_LIMIT;
    const sessions = (await ownSessions(ctx, limit + 1)).filter((s) => s.status === "complete");

    // Asked for one extra so we can tell the caller the window clipped their
    // history rather than silently reporting a partial picture as the total.
    const truncated = sessions.length > limit;
    const window = truncated ? sessions.slice(0, limit) : sessions;

    const byPickNo = new Map<number, { total: number; n: number }>();
    const byPackNo = new Map<number, { total: number; n: number }>();
    const mistakes: (DigestMistake & { setCode: string })[] = [];

    // NO REPLAY. This used to rebuild every draft in the window to recover its
    // per-pick scores, reading each set's pool and context to do it -- and it
    // was recomputing numbers `draftPicks` already held, less accurately: a
    // replay has no per-pack context rows, so it grades on raw power while the
    // player was shown the stored ones. The digest is those stored numbers,
    // reduced to what this screen plots.
    let counted = 0;
    // How many stored misses the decision-pick floor threw away.
    //
    // Reported rather than kept quiet because the floor is a judgement, not a
    // measurement -- and it was WRONG when this went in, at 5 rather than 6,
    // which kept the tenth pick of a fourteen-card pack. A player found that
    // within a day of the first drill run, which this number could not have
    // told anybody: it says how much the floor withholds, never whether the
    // floor is in the right place. Kept anyway, because how much of a history
    // the floor eats is still worth knowing before it is ever moved again.
    let forced = 0;

    // What this window says about how the player picks, off the same digests the
    // charts above are made of. NO EXTRA READS: every one of these documents is
    // already being fetched a few lines down, and a draft's whole contribution
    // is twenty-eight numbers sitting on it.
    //
    // Three ways a finished draft contributes nothing, counted apart because
    // they mean different things and only one of them ever goes away on its own.
    let dials = emptyCurvature(DIAL_BUNDLES.length);
    let contributed = 0;
    const skipped = { unmeasured: 0, stale: 0, newSet: 0 };

    for (const session of window) {
      const digest = await digestFor(ctx, session._id);
      // A draft that finished before digests existed, or one still in progress.
      // Its summary still counts toward the totals above; only the per-pick
      // breakdown is unavailable, and `countedDrafts` says how many that is.
      if (!digest) continue;
      counted++;

      if (!digest.dials) {
        // Finished before the curvature was written, or a draft that could not
        // be measured at all -- a pool with no pick order, or one with no
        // decision in it. The backfill closes the first and never the second.
        skipped.unmeasured++;
      } else if (digest.dials.fingerprint !== DIAL_FINGERPRINT) {
        // Numbers in units nothing records any more. They still sum and still
        // fit, which is exactly why they are refused rather than trusted.
        skipped.stale++;
      } else if (!setBaseline(session.setCode)) {
        // Nobody has measured what the average drafter of this set does, and
        // that offset is routinely larger than what is being read about a
        // person -- so this draft would put a fact about the format inside a
        // sentence about them. Which bites hardest on a brand-new set, where
        // this app is most useful and 17Lands has published nothing yet.
        skipped.newSet++;
      } else {
        const curvature = curvatureOf(digest.dials, session.setCode);
        if (curvature) {
          dials = addCurvature(dials, curvature);
          contributed++;
        }
      }

      const { scores, packNos, pickNos } = digest.picks;
      for (let i = 0; i < scores.length; i++) {
        const pick = byPickNo.get(pickNos[i]) ?? { total: 0, n: 0 };
        byPickNo.set(pickNos[i], { total: pick.total + scores[i], n: pick.n + 1 });

        const pack = byPackNo.get(packNos[i]) ?? { total: 0, n: 0 };
        byPackNo.set(packNos[i], { total: pack.total + scores[i], n: pack.n + 1 });
      }

      // The decision-pick filter again, at read time. `mistakesFrom` applies it
      // when a digest is written, so this is only reaching digests written
      // before it did -- but a chart of "your worst picks" that still lists the
      // dregs of a pack for every draft taken before today is the same wrong
      // answer, and the arrays it needs are already in hand.
      for (const m of digest.mistakes) {
        if (!isDecisionPick(cardsLeftAtMiss(digest.picks, m), REVIEW.decisionPickMinCards)) {
          forced++;
          continue;
        }
        mistakes.push({ ...m, setCode: session.setCode });
      }
    }

    // The count rides along with the mean it made. On a zoomed axis -- which is
    // the only axis these averages are legible on -- a bucket built from three
    // picks draws exactly like one built from three hundred, so the plot cannot
    // say which of its columns is worth believing unless it is handed n.
    const avg = (m: Map<number, { total: number; n: number }>) =>
      [...m]
        .map(([key, { total, n }]) => ({ key, avgScore: total / n, n }))
        .sort((a, b) => a.key - b.key);

    const scored = window.filter((s) => s.summary);
    const mean = (pick: (s: Doc<"draftSessions">) => number) =>
      scored.length ? scored.reduce((sum, s) => sum + pick(s), 0) / scored.length : 0;

    return {
      overall: {
        drafts: window.length,
        avgScore: mean((s) => s.summary!.overallScore),
        avgAccuracy: mean((s) => s.summary!.accuracy),
        totalPicks: window.reduce((n, s) => n + (s.summary?.pickCount ?? s.pickedNames.length), 0),
      },
      recent: window.slice(0, 10).map((s) => ({
        id: s._id,
        createdAt: s.createdAt,
        setCode: s.setCode,
        overallScore: s.summary?.overallScore ?? 0,
        accuracy: s.summary?.accuracy ?? 0,
        colorPair: s.summary?.colorPair ?? "",
      })),
      byPickNo: avg(byPickNo).map((r) => ({ pickNo: r.key, avgScore: r.avgScore, n: r.n })),
      byPackNo: avg(byPackNo).map((r) => ({ packNo: r.key, avgScore: r.avgScore, n: r.n })),
      // Clamped to what a digest keeps. Each draft stores its own worst
      // DIGEST_MISTAKES, which answers a global top-N exactly for N up to that
      // -- a global top-N can draw at most N from any one draft. Past it the
      // answer would silently start missing picks, so it is refused by clamping
      // rather than served wrong.
      topMistakes: mistakes
        .sort((a, b) => b.bestValue - b.pickedValue - (a.bestValue - a.pickedValue))
        .slice(0, Math.min(args.mistakeLimit ?? 10, DIGEST_MISTAKES)),
      // How this player picks, or null when nothing could be pooled. Null rather
      // than a readout of zeros: "we have nothing to say yet" and "you are
      // exactly average" are different sentences and must not share a shape.
      habits:
        contributed === 0
          ? null
          : {
              drafts: contributed,
              skipped,
              ...drafterReadout(dials, DRAFTER_TAU),
            },
      // So the caller can say what it could not see, rather than implying totals.
      truncated,
      countedDrafts: counted,
      forcedMistakes: forced,
    };
  },
});

/**
 * What the drill has taught, counted by question.
 *
 * ITS OWN QUERY, not another branch of `overview`. That one reads a hundred
 * session documents and a digest each to average drafts; this reads one index
 * on one table and nothing else, and pooling them would make a screen showing
 * either pay for both. They also answer different questions -- `overview` is a
 * standing and this is a direction -- which is the distinction the stats screen
 * has been missing rather than a second cut of the same number.
 *
 * WHY THE DRILL AND NOT THE REVIEW QUIZ, when both write rows. A review guess
 * is graded leniently and against a card the coach may have named after the
 * fact, so a run of them mixes two answers to "what was right here"; and every
 * review is a different draft of a different set, so a trend across them is the
 * cross-set comparison this whole feature exists to avoid. The drill asks the
 * same pack twice out of the same pool. Those rows are stored and this does not
 * read them, deliberately -- see notes.md, Deferred #2, which wanted both
 * surfaces on one table and one reader at a time.
 */
export const progress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const answers = await ctx.db
      .query("pickAnswers")
      .withIndex("by_user_and_asked", (q) => q.eq("userId", userId).eq("asked", "misses"))
      .collect();

    return {
      ...missProgress(
        answers.map((answer) => ({
          key: `${answer.sessionId}:${answer.pickIndex}`,
          at: answer.at,
          fixed: missFixed(answer),
        })),
      ),
      // When the record starts, so a screen can say how long these numbers took
      // to gather instead of implying they are a standing over all time. Not the
      // earliest DRAFT -- the questions reach back further than the answers do,
      // and saying so would date the history to somebody's first ever pick.
      since: answers.reduce<string | undefined>(
        (earliest, answer) => (!earliest || answer.at < earliest ? answer.at : earliest),
        undefined,
      ),
    };
  },
});

import { v } from "convex/values";
import { query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { ownSessions } from "./sessions.js";
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
    for (const session of window) {
      const digest = await digestFor(ctx, session._id);
      // A draft that finished before digests existed, or one still in progress.
      // Its summary still counts toward the totals above; only the per-pick
      // breakdown is unavailable, and `countedDrafts` says how many that is.
      if (!digest) continue;
      counted++;

      const { scores, packNos, pickNos } = digest.picks;
      for (let i = 0; i < scores.length; i++) {
        const pick = byPickNo.get(pickNos[i]) ?? { total: 0, n: 0 };
        byPickNo.set(pickNos[i], { total: pick.total + scores[i], n: pick.n + 1 });

        const pack = byPackNo.get(packNos[i]) ?? { total: 0, n: 0 };
        byPackNo.set(packNos[i], { total: pack.total + scores[i], n: pack.n + 1 });
      }

      for (const m of digest.mistakes) mistakes.push({ ...m, setCode: session.setCode });
    }

    const avg = (m: Map<number, { total: number; n: number }>) =>
      [...m]
        .map(([key, { total, n }]) => ({ key, avgScore: total / n }))
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
      byPickNo: avg(byPickNo).map((r) => ({ pickNo: r.key, avgScore: r.avgScore })),
      byPackNo: avg(byPackNo).map((r) => ({ packNo: r.key, avgScore: r.avgScore })),
      // Clamped to what a digest keeps. Each draft stores its own worst
      // DIGEST_MISTAKES, which answers a global top-N exactly for N up to that
      // -- a global top-N can draw at most N from any one draft. Past it the
      // answer would silently start missing picks, so it is refused by clamping
      // rather than served wrong.
      topMistakes: mistakes
        .sort((a, b) => b.bestValue - b.pickedValue - (a.bestValue - a.pickedValue))
        .slice(0, Math.min(args.mistakeLimit ?? 10, DIGEST_MISTAKES)),
      // So the caller can say what it could not see, rather than implying totals.
      truncated,
      countedDrafts: counted,
    };
  },
});

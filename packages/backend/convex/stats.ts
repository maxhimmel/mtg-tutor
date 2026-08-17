import { v } from "convex/values";
import {
  dealDraft,
  normalizeBench,
  normalizeName,
  packScoringContext,
  replayDraft,
  splitPool,
} from "@mtg-tutor/core";
import type { CardContext, ColorWinRate, DraftEngine, EngineCard } from "@mtg-tutor/core";
import { query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { ownSessions, setDocFor } from "./sessions.js";
import { dealFor } from "./draftPools.js";
import { cardContextFor } from "./cardText.js";
import { toSetData } from "./setData.js";

// Per-draft numbers come from the denormalized summary; the per-pick breakdowns
// (score by pick number, biggest misses) come from replay, at ~0.16ms per
// finished draft.
//
// The replay is handed the same scoring context the pick had. Without it a
// replay grades on raw power, and the two halves of this screen would disagree:
// the averages would come from one scorer and the totals beside them from
// another, and "biggest mistakes" would list picks the app had graded 100.
//
// Deliberately still replay, even though draftPicks now holds every pick. This
// reads a hundred sessions at once and caches one pool per (setCode, format),
// so replaying costs a handful of pool reads where reading the rows would cost
// four thousand. The coach and the review verdict want ONE pick and go to the
// rows; this wants all of them and does not.
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

    // The per-card CONTEXT is still per-set, and still cached: a hundred-draft
    // window spans a handful of sets, so this is read a handful of times.
    //
    // The DEAL is not, and cannot be -- it belongs to the session now, not the
    // set. That makes this query more expensive than it was, on purpose and
    // temporarily: it reads one ~12KB pool row per draft where it used to share
    // one pool read across every draft of a set. It is the one path the stored
    // deal costs rather than saves, and the digest table that removes the replay
    // here entirely is the next change. Measured before and after, either way.
    const contextCache = new Map<string, Map<string, CardContext>>();
    const contextFor = async (session: Doc<"draftSessions">) => {
      const key = `${session.setCode}::${session.format}`;
      const cached = contextCache.get(key);
      if (cached) return cached;
      const context = await cardContextFor(ctx, session.setCode, session.format);
      contextCache.set(key, context);
      return context;
    };

    const byPickNo = new Map<number, { total: number; n: number }>();
    const byPackNo = new Map<number, { total: number; n: number }>();
    const mistakes: {
      pickedName: string;
      bestName: string;
      pickedValue: number;
      bestValue: number;
      score: number;
      packNo: number;
      pickNo: number;
      setCode: string;
    }[] = [];

    let replayed = 0;
    for (const session of window) {
      const context = await contextFor(session);

      // Scored exactly the way the pick itself was, or this reports grades the
      // player never saw -- and would list picks as misses that the app graded
      // 100. The sideboard is part of that: a pick was judged against the deck
      // minus whatever had been set aside by then.
      const bench = normalizeBench(session.sideboard ?? []);
      const scoring = (rates: ColorWinRate[]) => (engine: DraftEngine) => {
        const made = engine.history.length;
        // Through the shared builder, not assembled here. This was a hand-rolled
        // copy of the same five fields, and the moment `ScoringContext` grew a
        // sixth -- the deck's needs -- it silently became a context that ranks
        // packs by a different rule from the one the app grades with. Which is
        // the exact divergence `packScoringContext` was written to make
        // impossible; a second copy of it just moves the seam somewhere quieter.
        return packScoringContext(
          splitPool(engine.humanPool, bench, made).maindeck,
          made,
          engine.totalPicks(),
          rates,
          (c) => context.get(normalizeName(c.name)),
        );
      };

      // A draft carries its own boosters, so this can no longer be defeated by
      // the set moving underneath it -- which is why there is no catch-and-skip
      // here any more. A session with no pool row is a bug rather than a stale
      // draft, and it is left to throw as one rather than silently dropping the
      // draft out of its owner's own statistics.
      const { deal, colorWinRates } = await dealFor(ctx, session._id);
      const engine = replayDraft(
        deal,
        session.seed,
        session.pickedNames,
        scoring(colorWinRates),
        session.pod ?? "legacy",
      );
      replayed++;

      for (const h of engine.history) {
        const pick = byPickNo.get(h.pickNo) ?? { total: 0, n: 0 };
        byPickNo.set(h.pickNo, { total: pick.total + h.score.score, n: pick.n + 1 });

        const pack = byPackNo.get(h.packNo) ?? { total: 0, n: 0 };
        byPackNo.set(h.packNo, { total: pack.total + h.score.score, n: pack.n + 1 });

        // Ranked by the gap the score is made of. A raw GIH delta ranked
        // differently from the grade beside it, and dropped any pick whose
        // cards 17Lands had never rated.
        if (!h.score.isBest) {
          mistakes.push({
            pickedName: h.picked.name,
            // contextBest, not rawBest: the filter above is "did you take the
            // card the grade was measured against", so naming the other answer
            // produced rows reading "you took X, best was X".
            bestName: h.score.contextBest.name,
            pickedValue: h.score.pickedContextValue,
            bestValue: h.score.contextBestValue,
            score: h.score.score,
            packNo: h.packNo,
            pickNo: h.pickNo,
            setCode: session.setCode,
          });
        }
      }
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
      topMistakes: mistakes
        .sort((a, b) => b.bestValue - b.pickedValue - (a.bestValue - a.pickedValue))
        .slice(0, args.mistakeLimit ?? 10),
      // So the caller can say what it could not see, rather than implying totals.
      truncated,
      replayedDrafts: replayed,
    };
  },
});

import { v } from "convex/values";
import {
  dealDraft,
  normalizeBench,
  normalizeName,
  packScoringContext,
  replayDraft,
  splitPool,
} from "@mtg-tutor/core";
import type { CardContext, DraftEngine, EngineCard, SetData } from "@mtg-tutor/core";
import { query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { ownSessions, setCardsFor, setDocFor } from "./sessions.js";
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

    // Cached per SET, not per session, which is what makes this affordable.
    // A hundred-draft window spans a handful of sets, so the pool and its
    // context are read a handful of times between them -- against the ~8MB
    // reading every draft's stored picks would cost, since each of those rows
    // carries the pack it saw.
    const setCache = new Map<string, { set: SetData; context: Map<string, CardContext> }>();
    const setDataFor = async (
      session: Doc<"draftSessions">,
    ): Promise<{ set: SetData; context: Map<string, CardContext> } | undefined> => {
      const key = `${session.setCode}::${session.format}`;
      const cached = setCache.get(key);
      if (cached) return cached;
      try {
        const setDoc = await setDocFor(ctx, session.setCode, session.format);
        const set = toSetData(await setCardsFor(ctx, setDoc));
        const context = await cardContextFor(ctx, session.setCode, session.format);
        const entry = { set, context };
        setCache.set(key, entry);
        return entry;
      } catch {
        // The set was never ingested here, or has since been replaced. That
        // draft's per-pick detail is unavailable; its summary still counts.
        return undefined;
      }
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
      const loaded = await setDataFor(session);
      if (!loaded) continue;
      const { set, context } = loaded;

      // Scored exactly the way the pick itself was, or this reports grades the
      // player never saw -- and would list picks as misses that the app graded
      // 100. The sideboard is part of that: a pick was judged against the deck
      // minus whatever had been set aside by then.
      const bench = normalizeBench(session.sideboard ?? []);
      const scoring = (engine: DraftEngine) => {
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
          set.colorWinRates,
          (c) => context.get(normalizeName(c.name)),
        );
      };

      let engine;
      try {
        engine = replayDraft(dealDraft(set, session.seed), session.seed, session.pickedNames, scoring, session.pod ?? "legacy");
      } catch {
        // Set data changed under a stored draft; skip its detail, keep its summary.
        continue;
      }
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

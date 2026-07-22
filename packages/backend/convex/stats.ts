import { v } from "convex/values";
import { replayDraft } from "@mtg-tutor/core";
import type { SetData } from "@mtg-tutor/core";
import { query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { ownSessions, setDocFor } from "./sessions.js";
import { toSetData } from "./setData.js";

// Per-draft numbers come from the denormalized summary, but the per-pick
// breakdowns (score by pick number, biggest misses) have no denormalized form --
// picks are not stored. They come from replay, which is ~0.16ms per finished
// draft. The cost that actually matters is the set documents: 126-164KB each,
// so they are loaded once per (setCode, format) rather than once per session.
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

    const setCache = new Map<string, SetData>();
    const setDataFor = async (session: Doc<"draftSessions">): Promise<SetData | undefined> => {
      const key = `${session.setCode}::${session.format}`;
      const cached = setCache.get(key);
      if (cached) return cached;
      try {
        const set = toSetData(await setDocFor(ctx, session.setCode, session.format));
        setCache.set(key, set);
        return set;
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
      pickedGih: number;
      bestGih: number;
      score: number;
      packNo: number;
      pickNo: number;
      setCode: string;
    }[] = [];

    let replayed = 0;
    for (const session of window) {
      const set = await setDataFor(session);
      if (!set) continue;

      let engine;
      try {
        engine = replayDraft(set, session.seed, session.pickedNames);
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

        if (!h.score.isBest && h.picked.gihWinRate != null && h.score.best.gihWinRate != null) {
          mistakes.push({
            pickedName: h.picked.name,
            bestName: h.score.best.name,
            pickedGih: h.picked.gihWinRate,
            bestGih: h.score.best.gihWinRate,
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
        .sort((a, b) => b.bestGih - b.pickedGih - (a.bestGih - a.pickedGih))
        .slice(0, args.mistakeLimit ?? 10),
      // So the caller can say what it could not see, rather than implying totals.
      truncated,
      replayedDrafts: replayed,
    };
  },
});

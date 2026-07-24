import { v } from "convex/values";
import {
  buildDraftFrame,
  buildReviewContext,
  buildReviewSystemPrompt,
  loadPrinciples,
  summarizeDraft,
} from "@mtg-tutor/core";
import type { ReviewVerdict } from "@mtg-tutor/core";
import { z } from "zod";
import { action, internalQuery, mutation, query } from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";
import { loadBoard, ownSessions } from "./sessions.js";
import { reviewVerdict } from "./validators.js";
import { CoachUnavailableError, object, text } from "./llm.js";

// The picker list. Completed drafts only -- there is nothing to review about a
// draft still in progress. Uses the summary denormalized at completion, so this
// does not replay anything.
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sessions = await ownSessions(ctx, args.limit ?? 25);

    return sessions
      .filter((s) => s.status === "complete")
      .map((s) => ({
        id: s._id,
        setCode: s.setCode,
        format: s.format,
        createdAt: s.createdAt,
        colorPair: s.summary?.colorPair ?? "",
        overallScore: s.summary?.overallScore ?? 0,
        accuracy: s.summary?.accuracy ?? 0,
        pickCount: s.summary?.pickCount ?? s.pickedNames.length,
      }));
  },
});

// The whole draft rehydrated for the walkthrough: every pack as the player saw
// it, the deterministic scoring, and any verdict already frozen.
//
// Picks are not stored, so a pick is identified by its index in the session's
// pick list -- that is what reviewVerdicts keys on.
export const load = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine, setDoc } = await loadBoard(ctx, args.sessionId);

    const verdicts = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const byIndex = new Map(verdicts.map((v) => [v.pickIndex, v.verdict]));

    return {
      id: session._id,
      setCode: session.setCode,
      format: session.format,
      seed: String(session.seed),
      createdAt: session.createdAt,
      colorPair: session.summary?.colorPair ?? "",
      colorPairWinRates: setDoc.colorPairWinRates,
      picks: engine.history.map((h, pickIndex) => ({
        pickIndex,
        packNo: h.packNo,
        pickNo: h.pickNo,
        pack: h.pack,
        picked: h.picked,
        bestName: h.score.best.name,
        score: h.score.score,
        isBest: h.score.isBest,
        onColor: h.score.onColor,
        verdict: byIndex.get(pickIndex),
      })),
    };
  },
});

// Frozen on first review so re-reviews are stable rather than re-rolling the
// model's opinion every time.
export const saveVerdict = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  },
  handler: async (ctx, args) => {
    // Establishes ownership before writing anything keyed to this session.
    const { engine } = await loadBoard(ctx, args.sessionId);
    if (!engine.history[args.pickIndex]) {
      throw new Error(
        `Session has ${engine.history.length} picks; no pick at index ${args.pickIndex}.`,
      );
    }

    const existing = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) =>
        q.eq("sessionId", args.sessionId).eq("pickIndex", args.pickIndex),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { verdict: args.verdict });
      return existing._id;
    }
    return await ctx.db.insert("reviewVerdicts", {
      sessionId: args.sessionId,
      pickIndex: args.pickIndex,
      verdict: args.verdict,
    });
  },
});

// The principles corpus is byte-identical on every call, so build it once.
let systemPrompt: string | undefined;
const system = () => (systemPrompt ??= buildReviewSystemPrompt(loadPrinciples()));

// Mirrors the reviewVerdict validator. The descriptions are load-bearing --
// they are the only instruction the model gets about what each field means.
const VERDICT_SCHEMA = z.object({
  contextBestName: z
    .string()
    .describe(
      "Exact name of the card that was the best pick given the player's pool and signals (the context-best). May equal the raw-power best.",
    ),
  divergenceLesson: z
    .string()
    .describe(
      "1-2 sentences: why the context-best and raw-power best agree or differ, and what that teaches.",
    ),
  narrative: z
    .string()
    .describe("2-4 sentences coaching the pick, citing principle ids in brackets."),
});

// Replay gives the pack and the pool as it stood BEFORE the pick, which is what
// makes "context-best" mean anything.
export const verdictContext = internalQuery({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    const { engine } = await loadBoard(ctx, args.sessionId);
    const record = engine.history[args.pickIndex];
    if (!record) {
      throw new Error(
        `Session has ${engine.history.length} picks; no pick at index ${args.pickIndex}.`,
      );
    }

    const existing = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) =>
        q.eq("sessionId", args.sessionId).eq("pickIndex", args.pickIndex),
      )
      .unique();

    return {
      cached: existing?.verdict,
      userContent: buildReviewContext(
        {
          pickIndex: args.pickIndex,
          packNo: record.packNo,
          pickNo: record.pickNo,
          pack: record.pack,
          picked: record.picked,
          bestName: record.score.best.name,
          score: record.score.score,
          isBest: record.score.isBest,
          onColor: record.score.onColor,
        },
        engine.humanPool.slice(0, args.pickIndex),
      ),
    };
  },
});

// Frozen on first request: a re-review shows the same verdict rather than
// re-rolling the model's opinion, which is what makes the quiz score mean
// anything across sessions.
export const verdict = action({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args): Promise<ReviewVerdict | null> => {
    const context = await ctx.runQuery(internal.review.verdictContext, args);
    if (context.cached) return context.cached;

    let input: z.infer<typeof VERDICT_SCHEMA>;
    try {
      input = await object({
        system: system(),
        userContent: context.userContent,
        // Headroom so the JSON isn't truncated mid-object, which used to
        // surface as "verdict was missing required fields".
        maxTokens: 1024,
        schema: VERDICT_SCHEMA,
      });
    } catch (e) {
      // Callers show the data-only reveal instead; a missing key should not end
      // the review.
      if (e instanceof CoachUnavailableError) return null;
      throw e;
    }

    // The schema guarantees three strings, but not that they are non-empty. The
    // context-best name is the one field we cannot invent; the prose fields are
    // defaulted so a clipped narrative still teaches something.
    if (!input.contextBestName) {
      throw new Error("Review verdict was missing the context-best card.");
    }
    const result: ReviewVerdict = {
      contextBestName: input.contextBestName,
      divergenceLesson: input.divergenceLesson || "—",
      narrative: input.narrative || "(no coaching returned)",
    };

    await ctx.runMutation(api.review.saveVerdict, { ...args, verdict: result });
    return result;
  },
});

export const framePrompt = internalQuery({
  args: { sessionId: v.id("draftSessions"), phase: v.union(v.literal("open"), v.literal("close")) },
  handler: async (ctx, args) => {
    const { engine, setDoc } = await loadBoard(ctx, args.sessionId);
    const winRates = new Map(setDoc.colorPairWinRates.map((r) => [r.pair, r.winRate]));
    return buildDraftFrame(args.phase, engine.humanPool, winRates);
  },
});

// The archetype bookends -- plain prose, no structure to enforce.
export const frame = action({
  args: { sessionId: v.id("draftSessions"), phase: v.union(v.literal("open"), v.literal("close")) },
  handler: async (ctx, args): Promise<string | null> => {
    const userContent = await ctx.runQuery(internal.review.framePrompt, args);
    try {
      return await text({ system: system(), userContent, maxTokens: 500 });
    } catch (e) {
      if (e instanceof CoachUnavailableError) return null;
      throw e;
    }
  },
});

// Backfills the summary for sessions completed before it was denormalized, so
// the picker doesn't show a row of zeroes.
export const backfillSummary = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);
    if (session.summary) return session.summary;

    const summary = summarizeDraft(engine.history, engine.humanPool);
    await ctx.db.patch(args.sessionId, { summary });
    return summary;
  },
});

import { v } from "convex/values";
import {
  type DraftEngine,
  buildPickContext,
  newSeed,
  replayDraft,
  suggestDeck,
  summarizeDraft,
} from "@mtg-tutor/core";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { toSetData } from "./setData.js";

// Ownership is always derived server-side, never taken as an argument. Returns
// undefined until auth is wired up, which is also what unauthenticated local
// use looks like -- so those drafts group together under "no owner".
async function currentUserId(ctx: QueryCtx): Promise<string | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier;
}

// Rebuilds the live board for a session. The session stores only the seed and
// the picked names, so every read replays -- ~0.16ms for a finished draft,
// which is nothing next to the round trip that got us here.
async function loadBoard(ctx: QueryCtx, sessionId: Id<"draftSessions">) {
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error(`No draft session ${sessionId}.`);

  const setDoc = await ctx.db
    .query("sets")
    .withIndex("by_code_and_format", (q) =>
      q.eq("code", session.setCode).eq("format", session.format),
    )
    .unique();

  if (!setDoc) {
    throw new Error(
      `Set "${session.setCode}" (${session.format}) has not been ingested yet. ` +
        `Run the sets:ingest action for it first.`,
    );
  }

  const engine = replayDraft(toSetData(setDoc), session.seed, session.pickedNames);
  return { session, engine };
}

const boardView = (engine: DraftEngine) => ({
  packNo: engine.packNo,
  pickNo: engine.pickNo,
  complete: engine.isComplete(),
  totalPicks: engine.totalPicks(),
  pack: engine.isComplete() ? [] : engine.currentPack,
  pool: engine.humanPool,
});

export const start = mutation({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) => q.eq("code", setCode).eq("format", format))
      .unique();

    if (!setDoc) {
      throw new Error(`Set "${setCode}" (${format}) has not been ingested yet.`);
    }

    return await ctx.db.insert("draftSessions", {
      userId: await currentUserId(ctx),
      setCode,
      format,
      seed: newSeed(),
      pickedNames: [],
      status: "active" as const,
      saved: false,
      createdAt: new Date().toISOString(),
    });
  },
});

export const state = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);
    return {
      sessionId: session._id,
      setCode: session.setCode,
      format: session.format,
      status: session.status,
      saved: session.saved,
      summary: session.summary,
      ...boardView(engine),
    };
  },
});

export const pick = mutation({
  args: { sessionId: v.id("draftSessions"), cardName: v.string() },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);

    if (engine.isComplete()) {
      throw new Error("This draft is already finished.");
    }

    const chosen = engine.currentPack.find((c) => c.name === args.cardName);
    if (!chosen) {
      throw new Error(
        `"${args.cardName}" is not in pack ${engine.packNo} pick ${engine.pickNo}.`,
      );
    }

    const record = engine.humanPick(chosen);
    const complete = engine.isComplete();

    await ctx.db.patch(args.sessionId, {
      pickedNames: [...session.pickedNames, chosen.name],
      ...(complete
        ? {
            status: "complete" as const,
            completedAt: new Date().toISOString(),
            summary: summarizeDraft(engine.history, engine.humanPool),
          }
        : {}),
    });

    return {
      score: record.score,
      signal: record.signal,
      pickIndex: session.pickedNames.length,
      ...boardView(engine),
    };
  },
});

// The end-of-draft readout: suggested deck plus the picks that cost the most.
export const results = query({
  args: { sessionId: v.id("draftSessions"), mistakeLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);

    const mistakes = engine.history
      .filter(
        (h) => !h.score.isBest && h.picked.gihWinRate != null && h.score.best.gihWinRate != null,
      )
      .map((h) => ({
        packNo: h.packNo,
        pickNo: h.pickNo,
        picked: h.picked,
        best: h.score.best,
        cost: h.score.best.gihWinRate! - h.picked.gihWinRate!,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, args.mistakeLimit ?? 5);

    return {
      summary: summarizeDraft(engine.history, engine.humanPool),
      deck: suggestDeck(engine.humanPool),
      mistakes,
      status: session.status,
      saved: session.saved,
    };
  },
});

export const save = mutation({
  args: { sessionId: v.id("draftSessions"), saved: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);
    const saved = args.saved ?? true;

    await ctx.db.patch(args.sessionId, {
      saved,
      // A draft can be saved mid-way; make sure the summary reflects what exists.
      summary: session.summary ?? summarizeDraft(engine.history, engine.humanPool),
    });

    return { sessionId: args.sessionId, saved };
  },
});

// The grounded prompt for one pick, rebuilt by replay. Internal: it exists only
// so the coach HTTP action can fetch what it needs in a single transaction.
export const coachContext = internalQuery({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);

    const record = engine.history[args.pickIndex];
    if (!record) {
      throw new Error(
        `Session has ${engine.history.length} picks; no pick at index ${args.pickIndex}.`,
      );
    }

    // The pool as it stood just after this pick, not the final pool.
    const poolAtPick = engine.humanPool.slice(0, args.pickIndex + 1);

    return {
      userContent: buildPickContext(record, poolAtPick),
      setCode: session.setCode,
      packNo: record.packNo,
      pickNo: record.pickNo,
    };
  },
});

export const listSaved = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);

    const sessions = await ctx.db
      .query("draftSessions")
      .withIndex("by_user_and_saved", (q) => q.eq("userId", userId).eq("saved", true))
      .order("desc")
      .take(args.limit ?? 25);

    return sessions.map((s) => ({
      sessionId: s._id,
      setCode: s.setCode,
      format: s.format,
      createdAt: s.createdAt,
      status: s.status,
      summary: s.summary,
    }));
  },
});

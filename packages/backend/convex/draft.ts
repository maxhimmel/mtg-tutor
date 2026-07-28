import { v } from "convex/values";
import {
  type DraftEngine,
  buildPickContext,
  newSeed,
  suggestDeck,
  summarizeDraft,
} from "@mtg-tutor/core";
import { internalQuery, mutation, query } from "./_generated/server.js";
import { loadBoard, requireUserId, setDocFor } from "./sessions.js";

const boardView = (engine: DraftEngine) => ({
  packNo: engine.packNo,
  pickNo: engine.pickNo,
  complete: engine.isComplete(),
  totalPicks: engine.totalPicks(),
  pack: engine.isComplete() ? [] : engine.currentPack,
  pool: engine.humanPool,
});

export const start = mutation({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    /**
     * Pins the deal. A draft is {seed, pickedNames} replayed, so fixing the seed
     * and the picks fixes every prompt the run sends -- which is what lets the
     * token benchmark compare two runs as a paired measurement instead of two
     * samples of different drafts. Normal play omits it and gets a fresh deal.
     */
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    await setDocFor(ctx, setCode, format);

    return await ctx.db.insert("draftSessions", {
      userId,
      setCode,
      format,
      // Coerced the same way mulberry32 reads it, so a caller cannot pin a seed
      // that behaves differently from one newSeed would have produced.
      seed: args.seed === undefined ? newSeed() : args.seed >>> 0,
      pickedNames: [],
      status: "active" as const,
      createdAt: new Date().toISOString(),
    });
  },
});

export const state = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine, setDoc } = await loadBoard(ctx, args.sessionId);
    return {
      sessionId: session._id,
      setCode: session.setCode,
      // The board already holds the set document to replay the draft, so
      // naming and badging the set costs nothing extra here.
      setName: setDoc.name,
      setIcon: setDoc.iconUri,
      format: session.format,
      status: session.status,
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
    const { session, engine, setDoc } = await loadBoard(ctx, args.sessionId);

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
      // Without 17Lands data every card scores off its rarity baseline, so a
      // pick can rarely be "wrong" and the score is close to meaningless.
      // Surfaced so the UI can say that rather than imply a perfect draft.
      ratedCardCount: setDoc.ratedCardCount,
    };
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
      // How many cards this pick chose between, so /coach can refuse to spend
      // tokens on a pack that was picking for you.
      cardsInPack: record.pack.length,
    };
  },
});


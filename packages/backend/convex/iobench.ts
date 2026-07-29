import { v } from "convex/values";
import type { EngineCard, PickScore } from "@mtg-tutor/core";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";
import { reviewVerdict } from "./validators.js";

// What a read path costs the database, measured rather than argued about.
//
// Convex bills `database_io_read_bytes`, and charges for the whole document it
// retrieved rather than the fields that were used -- so a change that reads the
// same document more cheaply is worth nothing, and one that reads a smaller
// document is worth everything. Neither is visible in a diff.
// `getTransactionMetrics` reports that exact counter for the current
// transaction, nested runQuery/runMutation calls included.
//
// Every probe therefore WRAPS the real function rather than restating its
// reads. A probe that reimplemented loadBoard would measure the probe, and
// would keep reporting the old number after the real path stopped doing it.
//
// `npx convex insights` will not show any of this: it surfaces problem classes
// -- OCC conflicts, unindexed scans -- and a 240KB read through a perfect index
// is healthy by its definition.
//
// Public because scripts/bench-io.mjs authenticates as a person, exactly as
// bench-llm does. Each probe grants precisely what the function it wraps
// already grants, and every one of those re-checks ownership itself.

export interface IoCost {
  bytesRead: number;
  // Billed as well as the reads, and a saving that only moves work from one to
  // the other is not a saving. Storing what a pick saw trades a read on every
  // coach call for a write on every pick, so the trade has to be visible.
  bytesWritten: number;
  documentsRead: number;
  databaseQueries: number;
}

async function cost(ctx: QueryCtx | MutationCtx): Promise<IoCost> {
  const m = await ctx.meta.getTransactionMetrics();
  return {
    bytesRead: m.bytesRead.used,
    bytesWritten: m.bytesWritten.used,
    documentsRead: m.documentsRead.used,
    databaseQueries: m.databaseQueries.used,
  };
}

export const stateCost = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.draft.state, args);
    return await cost(ctx);
  },
});

// What `draft.pick` hands back, spelled out rather than inferred through
// `api.draft.pick`. `api` includes this module, so inferring the return type of
// the one probe that returns what it wrapped makes the type self-referential --
// and TypeScript answers that by widening the whole `api` object to `any`,
// which surfaces as a pile of implicit-any errors in unrelated modules.
interface PickOutcome {
  score: PickScore;
  signal?: string;
  pickIndex: number;
  packNo: number;
  pickNo: number;
  complete: boolean;
  totalPicks: number;
  pack: EngineCard[];
  pool: EngineCard[];
}

// Returns the board alongside the cost: the harness has to know what the next
// pack holds to choose from it, and asking twice would measure the asking.
export const pickCost = mutation({
  args: { sessionId: v.id("draftSessions"), cardName: v.string() },
  handler: async (ctx, args): Promise<{ cost: IoCost; result: PickOutcome }> => {
    const result = await ctx.runMutation(api.draft.pick, args);
    return { cost: await cost(ctx), result };
  },
});

export const coachContextCost = query({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.draft.coachContext, args);
    return await cost(ctx);
  },
});

export const verdictContextCost = query({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.review.verdictContext, args);
    return await cost(ctx);
  },
});

// Probe this one last. It writes, so every verdictContext measured after it
// would come back cached and read a different path than the one under test.
export const saveVerdictCost = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.review.saveVerdict, args);
    return await cost(ctx);
  },
});

export const reviewLoadCost = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.review.load, args);
    return await cost(ctx);
  },
});

export const resultsCost = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.draft.results, args);
    return await cost(ctx);
  },
});

export const framePromptCost = query({
  args: {
    sessionId: v.id("draftSessions"),
    phase: v.union(v.literal("open"), v.literal("close")),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.review.framePrompt, args);
    return await cost(ctx);
  },
});

export const statsOverviewCost = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.stats.overview, args);
    return await cost(ctx);
  },
});

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server.js";
import { ownedSession } from "./sessions.js";
import { llmCall } from "./validators.js";

// What the deployment's model key gets spent on, one row per call.
//
// This is deliberately not in llm.ts. That file is the provider seam -- the only
// place that knows which model is answering -- and it stays ignorant of Convex;
// it hands usage to whoever asked for the call, and the caller decides that the
// answer is worth writing down.

export const record = internalMutation({
  args: llmCall.fields,
  handler: async (ctx, args) => {
    // Derived server-side rather than taken as an argument, the same rule
    // ownership follows. Unlike requireUserId this does not throw: attribution
    // is a nice-to-have on a metrics row, and a call worth counting is still
    // worth counting when we cannot say whose it was. Whether identity even
    // survives this far is call-site dependent -- see the note in http.ts.
    const identity = await ctx.auth.getUserIdentity();

    await ctx.db.insert("llmUsage", {
      ...args,
      userId: identity?.tokenIdentifier,
      createdAt: new Date().toISOString(),
    });
  },
});

// Every call one draft spent, for whoever owns that draft. This is how the
// benchmark reads back the run it just drove -- and why a run needed no
// benchmark-specific plumbing in the API: it drives the same endpoints a player
// does, and its rows are simply the rows of its own session.
export const forSession = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    await ownedSession(ctx, args.sessionId);

    // A fully coached and fully reviewed draft is 45 + 45 + 2 calls, so this
    // bound is roughly 5x the most a session can produce. Taken rather than
    // collected so a bug that writes per-token could never make this unbounded.
    return await ctx.db
      .query("llmUsage")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .take(500);
  },
});

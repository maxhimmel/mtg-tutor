import { internalMutation } from "./_generated/server.js";
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

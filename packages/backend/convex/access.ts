import { ConvexError, v } from "convex/values";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api.js";
import { internalAction, mutation } from "./_generated/server.js";

// Asking to be let in.
//
// WorkOS has no primitive for this: with sign-up disabled a stranger cannot
// create an account at all, and an invitation is something the owner sends
// rather than something anyone can request. So the request itself lands here
// and the answer is an email -- which is deliberately the whole of the admin
// surface. Approving someone is sending them an invitation from the WorkOS
// dashboard, and a screen in this app that listed requests would be a second
// place to look with no power the first one lacks.

const DAY = 24 * HOUR;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // This mutation is public and unauthenticated -- it has to be, the whole
  // point is that the caller has no account. Two limits rather than one: the
  // per-address bucket stops a form someone leans on, and the global one is
  // what keeps this from being a mail cannon aimed through our deployment.
  accessRequest: { kind: "fixed window", rate: 2, period: DAY, start: 0 },
  accessRequestsTotal: { kind: "fixed window", rate: 40, period: DAY, start: 0 },
});

// Long enough for a real address and a sentence, short enough that nobody is
// storing an essay in a table with no owner.
const MAX = { name: 80, email: 160, note: 400 };

export const requestAccess = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, MAX.name);
    const email = args.email.trim().toLowerCase().slice(0, MAX.email);
    const note = args.note?.trim().slice(0, MAX.note);

    // Not validation so much as a shape check: the address is only ever read by
    // a person deciding whether to invite someone, so the bar is "could this be
    // an address" rather than RFC 5322.
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ConvexError("A name and an email address, please.");
    }

    const perEmail = await rateLimiter.limit(ctx, "accessRequest", { key: email });
    const overall = await rateLimiter.limit(ctx, "accessRequestsTotal");
    if (!perEmail.ok || !overall.ok) {
      throw new ConvexError("That request is already in. Give it a day.");
    }

    await ctx.db.insert("accessRequests", {
      name,
      email,
      note,
      createdAt: new Date().toISOString(),
    });

    // Scheduled rather than awaited: a mutation cannot make a network call, and
    // the request is worth keeping whether or not the mail gets through.
    await ctx.scheduler.runAfter(0, internal.access.notifyOwner, { name, email, note });
  },
});

export const notifyOwner = internalAction({
  args: { name: v.string(), email: v.string(), note: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const key = process.env.RESEND_API_KEY;
    const to = process.env.OWNER_EMAIL;

    // Unset is a real configuration, not a broken one: the row is stored either
    // way, and a deployment nobody is inviting people on has no reason to hold
    // a mail key.
    if (!key || !to) {
      console.info(`Access requested by ${args.name} <${args.email}>${args.note ? `: ${args.note}` : ""}`);
      return;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        // Resend's own sender, which needs no verified domain -- this only ever
        // goes to the one address the deployment is configured with.
        from: "P1P1 <onboarding@resend.dev>",
        to: [to],
        reply_to: args.email,
        subject: `P1P1: ${args.name} wants in`,
        text: [
          `${args.name} <${args.email}> asked for access.`,
          args.note ? `\n"${args.note}"\n` : "",
          "To let them in, send an invitation from the WorkOS dashboard:",
          "Convex dashboard -> Settings -> Integrations -> WorkOS Authentication,",
          "then Users -> Invites. Add them to the beta organization; leave the role",
          "at the default unless they should be uncapped.",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      // Logged rather than thrown: the row is already stored, so the request is
      // not lost, and retrying a scheduled action buys nothing a second person
      // filling the form in would not.
      console.error(`Could not email the access request: ${response.status} ${await response.text()}`);
    }
  },
});

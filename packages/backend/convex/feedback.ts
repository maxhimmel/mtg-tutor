import { ConvexError, v } from "convex/values";
import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { feedbackAnchor, feedbackSentiment, feedbackSurface } from "./validators.js";
import { requireCaller, requireOwner } from "./roles.js";
import { feedbackExplained, feedbackLeft } from "./analytics.js";

// Anything a friend wants to say, from anywhere, at any point.
//
// Its own RateLimiter rather than a fourth entry in quota.ts, and the split is
// the one that file's own header draws: quota.ts is what a day of this app COSTS
// per person. It rations the deployment's model key, and its refusals are
// product promises rendered to a player in a full sentence. Nothing here spends
// anything. This is the access.ts kind of limit -- a backstop on a write anybody
// signed in can make, sized so nobody talking honestly ever meets it.

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Fixed window pinned to UTC midnight for the reason quota.ts pins its own: a
  // token bucket drips one back every hour and makes any sentence about "today"
  // a lie. Per-person AND global, the pair access.ts uses, because the first
  // stops a stuck retry loop and the second is what stops one compromised
  // session filling the table.
  feedback: { kind: "fixed window", rate: 20, period: DAY, start: 0 },
  feedbackTotal: { kind: "fixed window", rate: 300, period: DAY, start: 0 },
});

// /coach is capped at 400 output tokens, so ~1600 characters is the most it can
// produce and `quote` is clamped above anything real. `note` is five times
// access.ts's stranger-at-the-door limit: somebody describing what the coach got
// wrong needs room for a repro, and this table has a named author where that one
// has an unauthenticated stranger.
const MAX = { note: 2000, quote: 2000, route: 120 };

const TOO_MUCH = "That is a lot of feedback for one day -- thank you. Send the rest tomorrow.";
const SAY_SOMETHING = "Say something, or pick a thumb.";

export const submit = mutation({
  args: {
    note: v.string(),
    sentiment: v.optional(feedbackSentiment),
    route: v.string(),
    surface: feedbackSurface,
    anchor: v.optional(feedbackAnchor),
    quote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Signed in, and NOTHING MORE. `role === "none"` is deliberately allowed
    // through, which no other mutation in this repo does. A friend who followed
    // the invite, signed in, and can do nothing because a WorkOS membership was
    // never set is the single person with the most useful thing to say in this
    // whole app -- and quota.enforce would refuse them with NOT_INVITED. That is
    // the access_blocked lesson in the root CLAUDE.md, and closing this door
    // would be repeating it.
    const caller = await requireCaller(ctx);

    const note = args.note.trim().slice(0, MAX.note);
    const quote = args.quote?.trim().slice(0, MAX.quote) || undefined;
    const route = args.route.trim().slice(0, MAX.route);

    // A thumb with no words is a real signal. Nothing at all is a misfire.
    if (!note && !args.sentiment) throw new ConvexError(SAY_SOMETHING);

    const mine = await rateLimiter.limit(ctx, "feedback", { key: caller.userId });
    const overall = await rateLimiter.limit(ctx, "feedbackTotal");
    if (!mine.ok || !overall.ok) throw new ConvexError(TOO_MUCH);

    // The anchor is NOT verified against draftSessions. ownedSession would cost
    // a ~2KB read on every submit to defend against a note pointed at a draft
    // that is not yours -- which returns nothing to the writer and leaks nothing
    // to them either, so it is a weird row rather than an exploit. Losing a
    // paragraph somebody typed because their pointer was stale is the worse
    // failure by a wide margin.
    const id = await ctx.db.insert("feedback", {
      userId: caller.userId,
      subject: caller.subject,
      role: caller.role,
      note,
      sentiment: args.sentiment,
      route,
      surface: args.surface,
      anchor: args.anchor,
      quote,
      createdAt: new Date().toISOString(),
    });

    // AFTER the insert and after both limiters, which is the whole of the trap
    // analytics.ts is written around: capture schedules its send inside this
    // transaction, so anything above that throws takes the send with it,
    // silently. Every refusal above is captured in the browser instead.
    //
    // Nothing that can throw may be added below this line.
    await feedbackLeft(ctx, caller, {
      surface: args.surface,
      sentiment: args.sentiment ?? "none",
      route,
      chars: note.length,
      hasQuote: quote !== undefined,
    });

    return id;
  },
});

/**
 * The reason behind a thumb already given.
 *
 * A patch rather than a second row, and that is the point. Rating an answer
 * writes immediately -- one click, before any dialog -- so the cheap signal is
 * never lost to somebody who did not feel like typing. The overlay then asks
 * why, and what it collects belongs to the rating it is explaining. Two rows
 * would double every count in feedback_left and hand the script an orphan
 * sentence sitting beside an orphan thumb, with nothing to join them by.
 */
export const explain = mutation({
  args: { id: v.id("feedback"), note: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);

    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("That note is gone.");
    // The same shape ownedSession uses, and cheap here for the reason it was not
    // worth it on submit: the row is already read, and this one does defend
    // something -- an unchecked patch would let anybody overwrite anybody's note.
    if (row.userId !== caller.userId) throw new ConvexError("That note is not yours.");

    const note = args.note.trim().slice(0, MAX.note);
    if (!note) throw new ConvexError(SAY_SOMETHING);

    await ctx.db.patch(args.id, { note });
    await feedbackExplained(ctx, { surface: row.surface, chars: note.length });
  },
});

/**
 * Everything anybody has said, newest first, for scripts/feedback.mjs.
 *
 * Owner only, on the caller's own identity and nothing else -- there is
 * deliberately no deployKey arm like sets.storeSetStats has. See requireOwner in
 * roles.ts for why that key does not get widened to this.
 *
 * `limit` is the read budget and the only server-side filter. --since and
 * --surface are done in the script, because filtering here would read the same
 * bytes and answer to the same bound; see the feedback header in schema.ts for
 * why there is no index to narrow it with.
 */
export const all = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const rows = await ctx.db.query("feedback").order("desc").take(limit);

    return await Promise.all(rows.map(async (row) => ({ ...row, context: await contextFor(ctx, row) })));
  },
});

/**
 * The prose a note is about, when it has a home of its own.
 *
 * Never for "coach" -- there is nothing stored to read, which is what `quote` on
 * the row exists for. ~700 bytes a verdict, and only for the rows that name one.
 *
 * draftPicks is deliberately not joined. It is ~3KB a row (a 14-card pack plus a
 * 45-name poolBefore) and would be the single largest cost in this query, to
 * print context the owner can pull for the one note they are actually acting on.
 */
async function contextFor(ctx: QueryCtx, row: Doc<"feedback">): Promise<string | undefined> {
  const sessionId = row.anchor?.sessionId;
  if (!sessionId) return undefined;

  if (row.surface === "verdict" && row.anchor?.pickIndex !== undefined) {
    const pickIndex: number = row.anchor.pickIndex;
    const found = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) =>
        q.eq("sessionId", sessionId).eq("pickIndex", pickIndex),
      )
      .unique();
    if (!found) return undefined;
    return [found.verdict.divergenceLesson, found.verdict.narrative].join("\n\n");
  }

  if (row.surface === "frame" && row.anchor?.phase) {
    const phase: "open" | "close" = row.anchor.phase;
    const found = await ctx.db
      .query("reviewFrames")
      .withIndex("by_session_and_phase", (q) => q.eq("sessionId", sessionId).eq("phase", phase))
      .unique();
    return found?.text;
  }

  return undefined;
}

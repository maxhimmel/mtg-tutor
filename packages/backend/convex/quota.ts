import { ConvexError, v } from "convex/values";
import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api.js";
import { internalMutation, query } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import { UNLIMITED, requireCaller, roleOf, sourceOf, type Caller } from "./roles.js";
import { ownedSession } from "./sessions.js";

// What a day of this app costs, per person.
//
// Three limits for two reasons. Drafts and reviews are what a player
// understands and what the beta actually rations; the coach limit is a
// backstop on the one endpoint that can be re-spent without doing anything
// new, and is sized so nobody playing honestly ever meets it.

const LIMITS = {
  // FIXED WINDOW, not a token bucket. A 3/day bucket drips one draft back
  // every eight hours, so a patient player gets nine a day and any sentence
  // about "your three for today" is a lie. `start: 0` pins the window to UTC
  // midnight rather than taking the default random per-key offset, which
  // would make the reset moment unexplainable -- and the copy below quotes
  // retryAfter rather than naming a time, so the timezone never comes up.
  drafts: { kind: "fixed window", rate: 3, period: DAY, start: 0 },
  reviews: { kind: "fixed window", rate: 3, period: DAY, start: 0 },

  // TOKEN BUCKET, because this one is a backstop rather than a promise.
  // Three drafts of up to 45 picks is 135 legitimate calls, so 200 leaves the
  // force button and re-picks room to breathe. It exists at all because
  // /coach stores nothing: the same pickIndex can be asked forever, which is
  // unbounded spend sitting behind a bounded draft count. A bucket suits
  // that -- a heavy day never hard-stops someone until tomorrow.
  coach: { kind: "token bucket", rate: 200, period: DAY, capacity: 250 },
} as const;

const rateLimiter = new RateLimiter(components.rateLimiter, LIMITS);

type Limit = keyof typeof LIMITS;

function unlocksIn(retryAfter: number | undefined): string {
  if (retryAfter === undefined) return "shortly";
  const minutes = Math.ceil(retryAfter / 60_000);
  if (minutes < 60) return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

// The sentences a person actually reads, in one place because the web app and
// the CLI both render whatever the server said and would otherwise drift.
// Quoting retryAfter rather than "tomorrow" keeps them true for a player in
// any timezone, which a fixed UTC window would not.
const REFUSALS: Record<Limit, (retryAfter: number | undefined) => string> = {
  drafts: (r) => `You have used your 3 drafts for today. The next one unlocks ${unlocksIn(r)}.`,
  reviews: (r) =>
    `You have used your 3 reviews for today. The next one unlocks ${unlocksIn(r)} — ` +
    `drafts you have already reviewed are still free to reread.`,
  coach: (r) =>
    `You have asked the coach a lot today; it is back ${unlocksIn(r)}. ` +
    `Your picks are still being graded in the meantime.`,
};

const NOT_INVITED =
  "This app is in a private beta and this account has not been let in yet.";

/**
 * Consume one token, or refuse in a sentence.
 *
 * `throws: true` is deliberately not used: the component raises a ConvexError
 * carrying an object, and every catch site in this codebase renders
 * `error.message` (see the note atop sessions.ts). So the result is inspected
 * and the refusal raised in the shape the clients already understand.
 */
export async function enforce(ctx: MutationCtx, name: Limit, caller: Caller): Promise<void> {
  if (caller.role === "none") throw new ConvexError(NOT_INVITED);

  // No component call at all for the exempt roles -- no read, no write, and
  // nothing for a concurrent mutation to contend with.
  if (UNLIMITED.has(caller.role)) return;

  const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key: caller.userId });
  if (!ok) throw new ConvexError(REFUSALS[name](retryAfter));
}

/**
 * One review token per draft session, charged once ever.
 *
 * A review is not an entity -- it is a page that fires up to 45 verdict
 * actions five at a time, plus two frames. There is nothing there to charge,
 * so the flag on the session is what turns that spray into a single
 * chargeable act.
 *
 * Five verdicts race this on a first review. Convex mutations are
 * serializable: each reads the session, the winner writes it, and the losers'
 * read sets conflict so they re-execute and see the flag. Exactly one token is
 * spent whatever the interleaving -- and because the limiter consumes inside
 * this same transaction, a racer that loses hands its token back rather than
 * leaking one apiece.
 *
 * Callers only reach this on a cache miss, so a re-review runs it zero times
 * and costs nothing at all.
 */
export const claimReview = internalMutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);
    if (session.reviewClaimedAt) return;

    await enforce(ctx, "reviews", await requireCaller(ctx));
    await ctx.db.patch(args.sessionId, { reviewClaimedAt: new Date().toISOString() });
  },
});

/** For /coach, which is an httpAction and so has no mutation ctx of its own. */
export const consumeCoach = internalMutation({
  args: {},
  handler: async (ctx) => {
    await enforce(ctx, "coach", await requireCaller(ctx));
  },
});

/**
 * What is left today, and where the caller's role came from.
 *
 * `source` and `orgId` are not decoration. A missing WorkOS organization
 * membership and a working one look identical from the app -- both just draft
 * -- right up until the moment someone is refused everything, so this is the
 * one surface that can tell them apart without reading deployment logs.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const role = roleOf(identity);
    const limited = !UNLIMITED.has(role) && role !== "none";

    // Nothing to count for a role that is never charged, and asking would read
    // component rows to render a number that is always "unlimited".
    const remaining = limited
      ? {
          drafts: (await rateLimiter.getValue(ctx, "drafts", { key: identity.tokenIdentifier }))
            .value,
          reviews: (await rateLimiter.getValue(ctx, "reviews", { key: identity.tokenIdentifier }))
            .value,
        }
      : null;

    return {
      role,
      source: sourceOf(identity),
      subject: identity.subject,
      orgId: typeof identity.org_id === "string" ? identity.org_id : null,
      limited,
      remaining,
      of: { drafts: LIMITS.drafts.rate, reviews: LIMITS.reviews.rate },
    };
  },
});

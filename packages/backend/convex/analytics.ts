import { PostHog } from "@posthog/convex";
import { components } from "./_generated/api.js";
import { env } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
import type { Caller } from "./roles.js";

// The backend half of the app's analytics, and the mirror of
// apps/web/app/lib/analytics.ts. The split between them is one rule:
//
//   The browser captures interaction. The backend captures lifecycle.
//
// Interaction -- what was clicked, how long a pick took, whether the coach
// actually rendered -- is only knowable in a browser. Lifecycle -- a draft
// exists, a draft finished, a deck was locked -- is authoritative here, and
// comes free for the CLI, which is not a lesser client.
//
// THE ONE THING THAT CANNOT LIVE HERE
//
// Refusals. `capture` schedules its send with ctx.scheduler.runAfter, inside the
// calling transaction, so a mutation that throws -- which is what every refusal
// in quota.ts does -- rolls the scheduled send back along with its own writes and
// nothing is ever sent. It fails silently, and looks exactly like a limit nobody
// has hit. Every refusal is captured in the browser instead.
//
// The corollary for anything added later: capture AFTER the write it describes,
// and only on paths that commit.

/**
 * distinctId is resolved once, here, rather than passed at each call site.
 *
 * It has to be `identity.subject` -- the WorkOS user id, which is the string the
 * browser also identifies on (see roles.ts, where Caller.subject is documented,
 * and MTG_TUTOR_ROLES, which is keyed on it). Explicitly NOT the tokenIdentifier
 * that draftSessions.userId holds: that is `${issuer}|${subject}`, and using it
 * would file every person twice, once per side of the app, leaving every funnel
 * reading as though nobody who started a draft ever made a pick.
 *
 * Doing it in the constructor is what makes that a fact about the app rather than
 * a convention three call sites have to remember.
 */
const posthog = new PostHog(components.posthog, {
  identify: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity ? { distinctId: identity.subject } : null;
  },
});

/**
 * Whether to send anything at all.
 *
 * The variable is required -- the component declares it that way, so every
 * deployment must define it -- which leaves an empty string as the only way to
 * mean "off". That is what a dev deployment sets, so working on a draft locally
 * does not put fake picks into the project the real numbers live in.
 */
function on(): boolean {
  return env.POSTHOG_PROJECT_TOKEN !== "";
}

/** A draft exists. The first event of every session, and the funnel's root. */
export async function draftStarted(
  ctx: MutationCtx,
  caller: Caller,
  p: { sessionId: string; setCode: string; format: string },
): Promise<void> {
  if (!on()) return;

  // The role is the one fact about a person the browser cannot see, and it is
  // what makes every chart splittable by beta tier -- an owner's numbers are not
  // evidence about anything, and mixed into a funnel they are noise.
  await posthog.identify(ctx, { properties: { role: caller.role } });
  await posthog.capture(ctx, { event: "draft_started", properties: p });
}

/**
 * Forty-five picks, done.
 *
 * Captured server-side rather than in the browser because this is the moment the
 * session's status actually flips, and because the duration is measured from the
 * stored createdAt rather than from anything a tab remembers -- a draft resumed
 * the next morning is a different fact from one done in a sitting, and only the
 * row knows which happened.
 */
export async function draftCompleted(
  ctx: MutationCtx,
  p: { sessionId: string; setCode: string; format: string; picks: number; ms: number },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "draft_completed", properties: p });
}

/**
 * The forty locked in.
 *
 * The last step of the funnel, and the one that says whether the second half of
 * the product is used at all: a draft can be finished and never built, and those
 * are two different products working or not working.
 */
export async function deckBuilt(
  ctx: MutationCtx,
  p: { sessionId: string; setCode: string; format: string; basicLands: number },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "deck_built", properties: p });
}

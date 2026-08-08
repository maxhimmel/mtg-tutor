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
 * Somebody dared a friend to their packs.
 *
 * The root of a funnel whose every later step is a different person, which is
 * what makes the three challenge events worth having separately: issued against
 * accepted is whether links get sent and taken at all, and accepted against
 * finished is the friend who said yes and wandered off -- a state the schema
 * cannot express, because `draftSessions.status` has no terminal-but-unfinished
 * value and deliberately is not getting one.
 */
export async function challengeIssued(
  ctx: MutationCtx,
  p: { challengeId: string; setCode: string; format: string },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "challenge_issued", properties: p });
}

/**
 * A friend took one up, and how old the link was when they did.
 *
 * `hoursSinceIssued` is the whole reason this carries a property. A challenge is
 * a seed that outlives the moment it was made, so it meets a re-ingest far more
 * often than a same-day draft does -- and whether that is a real problem or a
 * theoretical one is a question about how long these links actually sit before
 * anyone clicks them. Nothing else in the app can answer it.
 */
export async function challengeAccepted(
  ctx: MutationCtx,
  p: { challengeId: string; setCode: string; format: string; hoursSinceIssued: number },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "challenge_accepted", properties: p });
}

/** The second draft is done and there is finally something to compare. */
export async function challengeFinished(
  ctx: MutationCtx,
  p: { challengeId: string; setCode: string; format: string; ms: number },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "challenge_finished", properties: p });
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

/**
 * Somebody said something.
 *
 * Here rather than in the browser, under this file's own rule: a feedback row
 * existing is lifecycle, it is authoritative at the moment of the insert, and it
 * comes free the day the CLI grows a feedback command. It is also the one
 * capture in this module whose mutation is genuinely allowed to commit -- every
 * refusal in feedback.ts throws, and those are in the browser where they survive.
 *
 * It identifies as well as captures, which draftCompleted and deckBuilt do not,
 * and that is the real argument for it being here. Leaving feedback is the only
 * act in this app a `role: "none"` account can perform, so this is the only event
 * that will ever be the first thing a locked-out friend does. draftStarted can
 * never identify them, because they can never start a draft -- so without this,
 * the person the beta most needs to hear from is the one person in PostHog with
 * no role on their profile.
 *
 * The note itself is not a property. It is the payload, it already lives in
 * Convex where scripts/feedback.mjs reads it, and a truncated second copy here
 * would be a retention decision nobody made.
 */
export async function feedbackLeft(
  ctx: MutationCtx,
  caller: Caller,
  p: {
    surface: string;
    // "none" rather than an absent property: a missing one charts as its own
    // bucket and reads like a bug in the event rather than an absent thumb.
    sentiment: "up" | "down" | "none";
    route: string;
    chars: number;
    // Whether the coach snapshot arrived. The one silent failure in this
    // feature: a DraftBoard refactor that stops passing the prose turns every
    // coach note unactionable, and nothing else would report it -- you would
    // find out weeks later reading empty quotes in the script output. Same
    // shape as access_blocked, invisible until it is expensive.
    hasQuote: boolean;
  },
): Promise<void> {
  if (!on()) return;
  await posthog.identify(ctx, { properties: { role: caller.role } });
  await posthog.capture(ctx, { event: "feedback_left", properties: p });
}

/**
 * A thumb grew a reason.
 *
 * The question the whole per-response design rests on: do people who rate an
 * answer ever say why? A thumb writes its row immediately and the overlay asks
 * afterwards, so if this never fires the overlay is the barrier and the thumb
 * should be left to stand alone.
 */
export async function feedbackExplained(
  ctx: MutationCtx,
  p: { surface: string; chars: number },
): Promise<void> {
  if (!on()) return;
  await posthog.capture(ctx, { event: "feedback_explained", properties: p });
}

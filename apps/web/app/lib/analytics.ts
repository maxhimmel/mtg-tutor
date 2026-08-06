import posthog from "posthog-js";

import type { PickCeremony } from "./useSettings";

/**
 * The one place the app talks to PostHog.
 *
 * Same shape as app/env.ts and for the same reason: a single boundary, typed
 * calls out of it, and nothing else importing the SDK. Three things fall out of
 * that which matter more than the indirection costs.
 *
 * Event names exist once, so renaming one is a rename rather than a grep for a
 * string literal that a chart in PostHog is also quietly depending on. The
 * absent-key case is one check here instead of one per call site. And the
 * properties are typed, which is the actual failure mode of hand-rolled
 * analytics: an event that fires everywhere with `score` spelled two ways
 * charts as two events, and you find out a fortnight later with no way back.
 *
 * WHAT BELONGS HERE, AND WHAT BELONGS ON THE BACKEND
 *
 * The browser captures interaction -- what was clicked, how long it took, which
 * ceremony, whether the coach actually rendered. None of that is knowable
 * server-side. The backend (see convex/draft.ts) captures lifecycle: a draft
 * began, ended, got built. Those are authoritative there and come free for the
 * CLI, which is not a lesser client.
 *
 * Refusals are the exception that looks like it should be a backend event and
 * cannot be. `posthog.capture` in a Convex mutation schedules the send inside
 * the transaction, so a mutation that then throws -- which is exactly what a
 * refusal does -- rolls the send back with it and nothing is ever sent. So
 * every refusal is captured here, where the client already has the message in
 * hand to render.
 */

// Whether init ran. posthog-js queues calls made before init and would replay
// them at whatever key arrived later, so "no key" has to mean "do nothing"
// rather than "call and hope".
function on(): boolean {
  return posthog.__loaded === true;
}

/**
 * Ties this browser to a person.
 *
 * `id` must be WorkOS's user.id -- the same string convex/draft.ts passes as
 * distinctId, via requireCaller().subject. If these two ever diverge, every
 * chart silently splits each friend into a browser half and a server half, and
 * the funnels read as though nobody who started a draft ever made a pick.
 */
export function identify(id: string, email?: string): void {
  if (!on()) return;
  posthog.identify(id, email ? { email } : undefined);
}

/** Drops the identity so the next person on this browser is not the last one. */
export function signedOut(): void {
  if (!on()) return;
  posthog.reset();
}

/**
 * One pick, as it landed.
 *
 * The highest-volume event by far -- 45 a draft -- and worth every one of them,
 * because a trend broken down by `pickIndex` IS the abandonment curve. A cliff
 * at pick 10 says the draft is too long or the ceremony too heavy, and the same
 * breakdown split by `ceremony` says which.
 *
 * `isBest` and `score` are the server's own grade, not a client guess, so
 * "are they getting better" is answerable without touching draftPicks.
 */
export function pickMade(p: {
  sessionId: string;
  pickIndex: number;
  packNo: number;
  pickNo: number;
  ceremony: PickCeremony;
  score: number;
  grade: string;
  isBest: boolean;
  onColor: boolean;
  rankInPack: number;
  packSize: number;
  benched: boolean;
  carried: boolean;
  // Time from the previous pick landing to this one. The cheapest proxy there
  // is for "was this pick hard", and it pairs with the replay: the number says
  // slow, the replay shows what they were staring at.
  msDeliberating: number;
  // Only under the challenge ceremony.
  confidence?: number;
  challenged?: boolean;
  outcome?: string;
}): void {
  if (!on()) return;
  posthog.capture("pick_made", p);
}

/** The challenge was started and walked away from -- friction, stated plainly. */
export function challengeAbandoned(p: { sessionId: string; pickIndex: number }): void {
  if (!on()) return;
  posthog.capture("challenge_abandoned", p);
}

/** The coach said something. `ms` is how long the player waited to see it. */
export function coachShown(p: {
  sessionId: string;
  pickIndex: number;
  ms: number;
  chars: number;
}): void {
  if (!on()) return;
  posthog.capture("coach_shown", p);
}

/**
 * The coach did not.
 *
 * `reason` separates three different bugs that look identical from the outside:
 * "declined" is the pick being forced and no tokens being spent on purpose,
 * "quota" is the friend having run out, and "error"/"unconfigured" are the app
 * being broken. Only one of them is a thing to fix.
 */
export function coachUnavailable(p: {
  sessionId: string;
  pickIndex: number;
  reason: "declined" | "quota" | "unconfigured" | "error";
}): void {
  if (!on()) return;
  posthog.capture("coach_unavailable", p);
}

/**
 * Someone tried to start a draft and was told no.
 *
 * The most likely thing throttling a private beta, and until now invisible --
 * the refusal is a sentence rendered in the browser and nothing else.
 */
export function draftRefused(p: { setCode: string; format: string; message: string }): void {
  if (!on()) return;
  posthog.capture("draft_refused", p);
}

/**
 * A signed-in account that may do nothing at all.
 *
 * Read off quota.mine's role rather than by matching the refusal prose, because
 * the prose is a product decision and would take the metric with it when it
 * changes. This is a friend who followed the invite, signed in, and hit a wall
 * -- almost always a WorkOS organization membership that was never set.
 */
export function accessBlocked(p: { source: string }): void {
  if (!on()) return;
  posthog.capture("access_blocked", p);
}

/** Fires on the mutation resolving, which is why it beats autocapturing the button. */
export function inviteRequested(): void {
  if (!on()) return;
  posthog.capture("invite_requested");
}

/**
 * A setting moved.
 *
 * Mostly here for one of them: everybody switching pickCeremony to "passive" is
 * the loudest signal this app could receive about its own central idea.
 */
export function settingChanged(key: string, value: string | number | boolean): void {
  if (!on()) return;
  posthog.capture("setting_changed", { key, value });
}

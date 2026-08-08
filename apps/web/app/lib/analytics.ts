import posthog from "posthog-js";
import type { Confidence } from "@mtg-tutor/core";
import type { Doc } from "@mtg-tutor/backend/dataModel";

import type { PickCeremony } from "./useSettings";

// Taken off the schema rather than restated here. The union exists once, in
// convex/validators.ts, for the same reason the event names below exist once --
// and a second copy in the client would be free to drift from the one the rows
// are actually written with.
type FeedbackSurface = Doc<"feedback">["surface"];

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

/**
 * A sign-in that reached /callback with no `state` and had to be started over.
 *
 * Every invitation link produces one, because that flow begins at AuthKit
 * rather than at our /sign-in and so carries no PKCE state -- see
 * app/callback/route.ts, which recovers it. The recovery is silent and it
 * works, which is exactly why it has to be counted: nothing else in the app
 * would ever mention that a friend's first sign-in failed and was recovered.
 *
 * The number decides one thing. With the WorkOS dashboard's Initiate login URL
 * pointed at /sign-in this should sit at zero, so a rate that stays flat says
 * that setting is not doing what it claims and every new friend is being
 * carried by the fallback -- which is a fallback, and will not be there if the
 * callback route is ever simplified back to a bare handleAuth().
 */
export function signInRestarted(): void {
  if (!on()) return;
  posthog.capture("sign_in_restarted");
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

  // The rest only exist under the challenge ceremony, and together they are the
  // measurement the whole flow is for: whether stating a confidence out loud and
  // then being shown the other card actually teaches anybody anything.
  //
  // `stood` false is someone who argued for a card, saw the comparison, and
  // changed their mind -- the flow working. `separable` false is the data being
  // unable to tell the pair apart, which is the case where a switch taught
  // nothing and being graded on it would be noise.
  confidence?: Confidence;
  challenged?: boolean;
  stood?: boolean;
  separable?: boolean;
}): void {
  if (!on()) return;
  posthog.capture("pick_made", p);
}

/**
 * The ceremony was started and walked away from.
 *
 * `stage` is the whole point and is why this takes no pickIndex: which screen
 * they bailed on says more than where in the draft it happened. "reason" is
 * being asked to type a sentence and declining; "challenge" is having been
 * argued with and backing out. Those are two different complaints about the
 * flow, and only the second one is about the argument.
 *
 * Read it as a floor, not a rate. The way out of the challenge screen only
 * appears once a pick has already failed to go through, so some of those are a
 * network blink rather than a decision.
 */
export function ceremonyAbandoned(p: {
  stage: "reason" | "challenge";
  confidence?: Confidence;
}): void {
  if (!on()) return;
  posthog.capture("ceremony_abandoned", p);
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
 * Somebody bought verdicts on the breakdown, and which way.
 *
 * The breakdown offers two: the whole thing at once, or one pick at a time. The
 * bulk button is ~17 model calls against a daily limit that is still a guess, so
 * which one people actually reach for decides whether it should stay the primary
 * action on the page -- and there is no other way to find out, because a verdict
 * is frozen on first request and a second visit spends nothing.
 *
 * On the click rather than the answer: the choice is the subject, and a click
 * that ends in a refusal is exactly as interesting as one that does not.
 */
export function breakdownAsked(p: {
  sessionId: string;
  how: "all" | "one";
  /** How many verdicts this click buys. Always 1 for "one". */
  picks: number;
}): void {
  if (!on()) return;
  posthog.capture("breakdown_asked", p);
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
 * How much of somebody's review list is unreadable.
 *
 * Re-ingesting a set strands every draft taken against the old data, and the
 * cost of that has never been measurable: the list could not tell until you
 * clicked, so nothing anywhere counted how often it happens to a real person.
 * That is the number that decides whether issue #3 is worth a real fix or is a
 * theoretical problem we keep describing to each other.
 *
 * Per list render rather than per row, and it carries `shown` so the ratio is
 * readable -- one stale draft out of twenty is a footnote, and eleven out of
 * twenty is the whole review feature quietly not working. `unknown` counts the
 * drafts that predate the stamp, because a metric that folded those into either
 * answer would be reporting a certainty it does not have.
 */
export function reviewListSeen(p: { shown: number; stale: number; unknown: number }): void {
  if (!on()) return;
  posthog.capture("review_list_seen", p);
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
 * The feedback panel was opened.
 *
 * Interaction, and only a browser knows it -- which is also why the other half
 * of this pair, feedback_left, is on the backend instead (see
 * convex/analytics.ts for the identify argument that puts it there).
 *
 * It exists to be divided into feedback_left. `source` says which way in
 * actually earns notes: the button that follows you around, a thumb on an AI
 * answer, or the ask after a draft finishes -- and if the prompt earns none, the
 * prompt goes. Opened-minus-left is the form's abandonment rate, and a high one
 * says the form asks for something people will not give, which is a change to
 * the form rather than to the button.
 *
 * No feedback_abandoned to go with it: that is exactly this minus feedback_left,
 * and an event you can subtract is an event you should not send.
 */
export function feedbackOpened(p: {
  surface: FeedbackSurface;
  source: "fab" | "ai" | "prompt";
  route: string;
}): void {
  if (!on()) return;
  posthog.capture("feedback_opened", p);
}

/**
 * Somebody tried to say something and was told no.
 *
 * The canonical case for this file's refusal rule rather than an application of
 * it: every refusal in feedback.submit throws, so a capture there would be
 * scheduled inside the transaction and rolled back with it, silently.
 *
 * `reason` separates three failures that look identical from outside. "rate" is
 * a daily cap that was only ever a guess, and the person it will strangle first
 * is the one friend who writes things down -- which is exactly backwards.
 * "empty" is the form letting somebody press send with nothing in it. "error" is
 * the app eating a paragraph they typed, which is the worst thing this feature
 * can do to anybody.
 */
export function feedbackRefused(p: {
  surface: FeedbackSurface;
  reason: "rate" | "empty" | "error";
  message: string;
}): void {
  if (!on()) return;
  posthog.capture("feedback_refused", p);
}

/**
 * Where a setting was reached from.
 *
 * "menu" is the account dropdown, which no longer carries any setting at all --
 * it stays in the union because events sent from it are already in PostHog and a
 * breakdown that cannot name the old surface reads as though nothing was ever
 * changed there.
 */
export type SettingSurface = "menu" | "board" | "sets";

/**
 * A setting moved.
 *
 * Mostly here for one of them: everybody switching pickCeremony to "passive" is
 * the loudest signal this app could receive about its own central idea.
 *
 * `where` is what decides whether a setting should have been on the surface it
 * changes rather than behind the avatar. The card stats, the coach threshold and
 * the ceremony sat in the account menu and were changed by almost nobody, which is
 * not the same fact as nobody wanting them changed -- a control nobody finds and
 * a control nobody wants produce the same silence. Splitting the event by
 * surface is the only way to tell those two apart, and it is what says whether
 * the terms strip on the draft board earned its place.
 */
export function settingChanged(
  key: string,
  value: string | number | boolean,
  where: SettingSurface,
): void {
  if (!on()) return;
  posthog.capture("setting_changed", { key, value, where });
}

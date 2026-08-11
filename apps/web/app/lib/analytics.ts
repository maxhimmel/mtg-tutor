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
 * How far apart the player's forty and the suggested one turned out to be.
 *
 * `deck_built` says the forty was locked in; this says whether the screen that
 * opens next had anything to tell them. The suggestion used to be chosen out of
 * the maindeck rather than the pool, so it could only ever hand back the cards
 * already kept and `apart` was zero on essentially every draft -- a comparison
 * that agreed with itself, shipped and unnoticed because nothing counted it.
 * This is the number that would have caught it, and the one that says whether
 * the fix went too far the other way: a builder that disagrees on fifteen cards
 * every time is not a second opinion either.
 *
 * In the browser rather than beside `deck_built`, because the diff is computed
 * in `draft.results` -- a query, where a capture cannot be scheduled -- and the
 * build mutation deliberately reads no card text, which is what pricing a deck
 * takes. Once per screen, not once per render.
 */
export function buildCompared(p: {
  sessionId: string;
  setCode: string;
  format: string;
  /** Cards on exactly one of the two lists, both directions summed. */
  apart: number;
  /** In your forty and not in the suggestion — the cards it would cut. */
  onlyBuilt: number;
  /** In the suggestion and not in your forty — the cards you cut and it kept. */
  onlySuggested: number;
  /** Whether the two decks name the same colours. */
  sameColors: boolean;
  landsBuilt: number;
  landsSuggested: number;
}): void {
  if (!on()) return;
  posthog.capture("build_compared", p);
}

/**
 * How much building the build screen actually did.
 *
 * `deck_built` says a forty was locked in, and cannot say whether anybody moved
 * a card to get there -- the mutation stores a land count and the cuts were
 * written one at a time by `draft.bench`, which is the same mutation the draft
 * screen has been calling since pick one. So a deck built entirely by pressing
 * "lock in" on whatever the draft left behind is indistinguishable, in the data,
 * from one somebody spent ten minutes on.
 *
 * That distinction decides what the screen is. If `moves` is near zero across
 * the board then this is a confirmation dialog with forty-five cards on it and
 * should be built as one; if it is not, the board is doing the work it was
 * redrawn to do. Which is the other half: it was two panels and is now the curve
 * wells, and "did the reshape change how much people build" is exactly this
 * number before and after.
 *
 * A separate event rather than a property on `deck_built` -- the usual move here
 * -- because that one is captured in a Convex mutation that has no idea what
 * happened in the browser, and an analytics-only argument threaded through
 * `draft.build` would put it in the CLI's signature too. Same `sessionId`, so
 * the two still cross.
 */
export function deckShaped(p: {
  sessionId: string;
  setCode: string;
  format: string;
  /** Cards pressed, both directions summed. Zero means nothing was built here. */
  moves: number;
  cuts: number;
  plays: number;
  /** Presses of the land stepper, which is the other half of a forty. */
  landSteps: number;
  basicLands: number;
  /** How many of the forty-five ended up in the sideboard. */
  benched: number;
}): void {
  if (!on()) return;
  posthog.capture("deck_shaped", p);
}

/**
 * Someone tried to start a draft and was told no.
 *
 * The most likely thing throttling a private beta, and until now invisible --
 * the refusal is a sentence rendered in the browser and nothing else.
 */
export function draftRefused(p: {
  setCode: string;
  format: string;
  message: string;
  /**
   * That this refusal happened on a challenge link rather than the set picker.
   *
   * A property on the existing event rather than a `challenge_draft_refused`
   * beside it: it is the same wall, hit by somebody who came through a
   * different door, and a second name would split every chart that already
   * counts this. It matters because being told no on a link a friend sent is a
   * worse moment than being told no on your own home screen.
   */
  via?: "challenge";
}): void {
  if (!on()) return;
  posthog.capture("draft_refused", p);
}

/**
 * What somebody actually found when they clicked a challenge link.
 *
 * The most valuable event in this feature, and the reason it is ONE event with
 * an outcome rather than seven names: every arm is a real destination -- open,
 * already taken by somebody else, your own link, one you are mid-draft on, one
 * that finished, one withdrawn, one whose set has moved -- and the interesting
 * number is the SHAPE of that distribution. Seven separate events would answer
 * each in isolation and none of them together.
 *
 * `stale` in particular is how the stale-link worry stops being theoretical.
 */
export function challengeOpened(p: {
  challengeId: string;
  outcome:
    | "open"
    | "taken"
    | "own"
    | "in-progress"
    | "finished"
    | "revoked"
    | "stale";
}): void {
  if (!on()) return;
  posthog.capture("challenge_opened", p);
}

/**
 * The link left the app.
 *
 * Issuing a challenge is not sending one, and the gap between the two is a step
 * nothing else can see: a link created and never copied is somebody who tried
 * the feature and thought better of it, which reads identically to one that was
 * sent and ignored if you only count what the backend wrote.
 */
export function challengeLinkCopied(p: { challengeId: string; where: string }): void {
  if (!on()) return;
  posthog.capture("challenge_link_copied", p);
}

/**
 * Somebody opened the comparison, and how much of it was worth comparing.
 *
 * `comparable` against `rows` is the question the whole feature rests on. Two
 * pods off one seed stop being the same question once the wheel brings the first
 * divergence round, and if that turns out to happen on pick nine every time then
 * the diff is mostly two drafts side by side rather than one answered twice --
 * which is worth knowing before building anything else on top of it.
 */
export function diffViewed(p: {
  challengeId: string;
  rows: number;
  comparable: number;
  agreed: number;
  forks: number;
  /**
   * Whether there were two forties to compare, one, or none.
   *
   * A challenge unlocks at the forty-second PICK, and a deck is registered by a
   * separate act somebody may never get round to -- so the deck comparison can
   * open on an empty state through no fault of its own. This is the number that
   * decides whether that empty state is a rare edge or the common case, and
   * therefore whether finishing a challenge should walk somebody into building
   * their forty rather than just telling them the comparison is ready.
   */
  decks: "both" | "yours" | "theirs" | "neither";
  /**
   * Which shape the screen was read in.
   *
   * A PROPERTY ON AN EXISTING EVENT, deliberately, and the same one is on
   * `fork_opened` below. The comparison is being tried in four layouts and the
   * only question worth asking about them is behavioural -- does a braid that
   * never leaves the screen get used more than one you scroll past -- which is
   * `fork_opened` split by this. Minting `diff_layout_viewed` would have put
   * that answer in a second event nobody can cross against the first, to measure
   * something that may not outlive the experiment; adding a property leaves
   * every chart already drawn on these two events standing.
   */
  layout: string;
  /**
   * Which door the reader came through.
   *
   * A PROPERTY, for the reason `layout` above is one and `draft_refused`'s
   * `via` is one: this is the same arrival counted by the same charts, and a
   * `diff_opened_from_results` beside it would split every one of them.
   *
   * It exists to judge one change. The comparison unlocks on the friend's
   * forty-second pick and was reachable from the list, the landing page and an
   * email -- and from none of them was it reachable from the screen the friend
   * was actually standing on when they finished, which is how somebody answered
   * a challenge and was handed the solo completion page. `results` is that
   * hand-off. If it carries nobody, the hand-off is not the thing that was
   * missing and the fix is somewhere else.
   *
   * `email` is the nudge that reaches the challenger, and is the only value
   * here that says the app was not already open. `link` is the fallback: a bare
   * URL, a bookmark, a back button -- everything unstamped, including every
   * view recorded before this property existed.
   */
  from: "results" | "list" | "landing" | "email" | "link";
}): void {
  if (!on()) return;
  posthog.capture("diff_viewed", p);
}

/**
 * Which of the readings actually drives the stepper.
 *
 * The fork cards list them, the braid draws them in time, and the track marks
 * them -- several ways into the same place, built on the theory that they answer
 * different questions. `from` is what tells us whether that was true, and in
 * particular whether the braid earned what it cost.
 *
 * `track` is the summary's run of forty-two ticks, added when it replaced the
 * prose the screen used to explain itself with. A NEW VALUE rather than a
 * renaming of the three that were here: `hero` still means the fork cards even
 * though the panel around them is no longer called that, because a chart in
 * PostHog cannot be repaired retroactively and a value that changes meaning is
 * worse than one that reads a little stale.
 *
 * `stepper` is the second copy of that track, under the pick-by-pick shelf,
 * where it carries prev/next arrows. Its own value and not `track`, because the
 * question it answers is the one that justified drawing the track twice: whether
 * a reader deep in a pack steps on from where they are, or whether they were
 * scrolling back up to the summary all along and the tail control is dead
 * weight. Folded into `track` that number cannot be recovered.
 *
 * Only fires when the step landed on a fork. The track is navigation over the
 * whole draft, and counting every step would bury the thing being measured.
 *
 * `braid` covers the rail as well as the panel, and that is not laziness. The
 * rail IS the braid -- same rope, same measure, same geometry, stood on end --
 * and a value that meant "the drawing, but only when it was lying down" would be
 * a distinction no chart wants. Which of the two a reader had is `layout`, so
 * "does a permanent braid get used more than one you scroll past" is one
 * breakdown of this event rather than a comparison across two values that would
 * have to be added back together first.
 */
export function forkOpened(p: {
  challengeId: string;
  pickIndex: number;
  from: "track" | "hero" | "braid" | "tick" | "stepper";
  layout: string;
}): void {
  if (!on()) return;
  posthog.capture("fork_opened", p);
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

/**
 * Signed in, and the app cannot tell.
 *
 * A friend whose WorkOS session is fine but whose Convex client has decided
 * they are not authenticated: the set picker shows them the landing page they
 * signed in to get past, and a draft board shows them a pick that will not go
 * through. It is caused by one dropped token fetch, and before this there was
 * no trace of it anywhere -- no error, no refusal, nothing on the server, which
 * only ever sees a request that did not arrive.
 *
 * `route` is where they were standing, and it is the property that decides what
 * to do about it. On `/` this is a confusing screen; on `/draft` it is somebody
 * mid-draft whose next pick fails, which is a different severity and a
 * different fix.
 */
export function authStalled(p: { route: string }): void {
  if (!on()) return;
  posthog.capture("auth_stalled", p);
}

/**
 * And it came back.
 *
 * The pair to `auth_stalled` and not subtractable from it, which is the bar this
 * file sets: the duration is the entire question. Recovery is a backoff that
 * starts at a second and climbs to five minutes, so `stalledMs` is what says
 * whether that curve is right, and stalls MINUS recoveries is the count that
 * never came back at all -- somebody who sat there until they gave up or
 * reloaded. Those two numbers are the ones that would justify changing the
 * retry, and neither exists without both events.
 */
export function authRecovered(p: { route: string; stalledMs: number }): void {
  if (!on()) return;
  posthog.capture("auth_recovered", p);
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
export type SettingSurface = "menu" | "board" | "sets" | "diff";

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

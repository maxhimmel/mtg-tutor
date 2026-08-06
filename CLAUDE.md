# Working in this repo

## Every change that a person can feel gets a paired metric

This app went live to friends with no analytics at all, and the questions that
mattered most in that first week — did they get in, do they finish a draft, where
do they quit, is the coach working, are my own quotas strangling them — had no
answer anywhere. That gap is not repaid by a later analytics push; it is repaid by
never opening it again. So instrumentation is part of building a thing, decided
while the thing is being designed, not a follow-up task.

**Do not wait to be asked for this.** A request for a feature is a request for the
feature and the means to tell whether it worked.

### What trips the rule

Something a person can do, be refused, or get stuck in:

- a new screen, action, or change to an existing flow
- a new quota, limit, or gate
- a new refusal or error path
- an empty state someone can land in and not get out of

Failure paths count as much as features, and are easy to skip because they feel
like plumbing. They are not. The two most valuable events in this codebase are
`access_blocked` and `draft_refused` — a friend who signed in and could do nothing
because of a WorkOS membership nobody set, and a friend told no by a daily limit
that was only ever a guess. Both were completely invisible before they existed.

### What stays silent

Refactors, renames, type fixes, copy and CSS tweaks, build and ingest scripts,
tests. Nothing to instrument, and nothing to say about it.

### How to choose the event

- **An event has to answer a question that would change a decision.** If no answer
  to it would make anyone do anything differently, it is noise that costs quota
  and clutters the events feed. `button_clicked` is the failure mode.
- **The browser captures interaction, the backend captures lifecycle.** What was
  clicked, how long it took, whether something rendered — only a browser knows.
  That a row exists, finished, or was locked in — the server owns, and the CLI
  gets it for free.
- **A backend capture only survives if its mutation commits.** `posthog.capture`
  schedules its send inside the calling transaction, so a mutation that throws
  takes the send down with it, silently. Refusals therefore cannot be captured
  server-side at all; they go in the browser, where the message is already in hand.
  Capture after the write, never before it.
- **Name events in the seam, never inline.** A chart in PostHog depends on the
  event name and cannot be repaired retroactively — rename an event and the old
  data is a different event forever. The seams are
  `apps/web/app/lib/analytics.ts` and `packages/backend/convex/analytics.ts`, and
  both carry the full reasoning in their header comments. Read whichever applies
  before adding to it.
- **Analytics must never cost somebody their draft.** Every capture is behind a
  guard that no-ops when unconfigured, and no capture is allowed to throw on a
  path a person is standing on.

### What to report back

Say what got instrumented: the event, where it fires, and the question it answers.

Do not narrate what did not get instrumented. Silence means there was nothing
worth measuring.

One exception: if a change looks like it obviously should have an event and it
deliberately does not, say so in a line — not to justify it, but so the call can
be caught. Capturing `pick_made` in the browser rather than in `draft.pick` is
that kind of decision.

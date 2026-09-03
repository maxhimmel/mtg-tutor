# Planning conventions for the `planning` stage

The plan is the thing `plan-review` tries to refute. Write one that can be
argued with — a plan too vague to be wrong is a plan that passes review and
teaches nobody anything.

## Every field is load-bearing

**`summary`** — what gets built and why, in prose. This is what the reviewers
are handed, so a summary that omits the contentious part gets a clean review it
did not earn.

**`steps`** — each with a description and the files it touches. If a step's
files are unknown, that is a sign the research did not finish.

**`testingStrategy`** — how anyone will know it works. "Typecheck passes" is
not a strategy; a green vitest run reads `src` while scripts and Convex read
`dist`, so a passing suite is not on its own evidence the live path works.

**`instrumentation`** — required, because a request for a feature is a request
for the means to tell whether it worked. Name the event, where it fires, and
the question it answers. "Nothing to instrument, because this is a refactor" is
a valid value; a missing answer is not. Failure paths count — `access_blocked`
and `draft_refused` are the two most valuable events in this codebase and both
were invisible before they existed.

## A before-and-after measurement is takeable exactly once

If the plan proves itself by comparing a before to an after, the before-capture
is step one and nothing precedes it. The first run got this wrong three
separate times in a row -- the capture placed after the fix, then taken while
an override suppressed the defect, then with the capture spec edited so late
that before and after were different crops. Each of those is unrecoverable
once the defect is fixed, because the thing being measured no longer exists.

Say in `testingStrategy` what the before-capture is, that it is taken first,
and what would make it not comparable to the after.

## Rejected options belong in the plan

`rejectedOptions` is optional but rarely should be. A conclusion reached and
not written down reads, later, as never having been considered — and the
reviewer who raises it costs a cycle. Record the option and why it lost.

## Derive it, do not enumerate it

Every parameter needs a principled derivation from the goal. A plan that offers
a menu of approaches and asks the reviewer to choose has moved the design work
downstream rather than done it.

## Scope

The plan covers what was asked. A plan that quietly widens scope will be
refuted for it, and correctly.

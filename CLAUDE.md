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

## Say it the way a Limited player says it

This is a Magic app and it should sound like one — in the coach's prose, in
labels and headings, in commit messages, and in what you say to me in chat. The
corpus is `packages/core/docs/vernacular.yaml`, with the evidence behind every
rule in `vernacular.md` beside it. Read them before naming anything.

It exists because the coach wrote "Spectral Sailor is a cheaper, higher-floor
flyer that fits nearly any blue deck — either is defensible at pick 1." Nothing
in that sentence is wrong about the pick. It is wrong about being a person.

**The problem is grammar, not vocabulary**, and that is the part worth carrying.
"Floor" is real Limited vernacular and strong writers use it — as the predicate
of a clause: "the floor is pretty high here, as a 3-mana 2/2 flier is solid."
Stacked in front of a noun as a hyphenated modifier it becomes a register nobody
in this game writes in. So the fix is almost never to find a different word. It
is to put the same word in a different sentence.

Three things the corpus is for:

- **`voice`** — ten rules about sentence shape. These go into the coach and
  review system prompts and they apply to you too.
- **`avoid`** — phrases with no MTG provenance, each with what a drafter says
  instead. `defensible` is the clearest: no source uses it anywhere.
- **`terms`** — fifty words with definitions and sources, for people and for
  agents. Deliberately NOT sent to the model, which already knows what a bomb is.

**Do not invent a name for something the game already names.** "The Forty" was
mine and it is not a thing anybody says; the deck is "your deck", "your 40", or
"your 23". If you need a word and cannot find it in the corpus, that is worth a
sentence in chat rather than a coinage — the corpus grows by research, and a
term added to it carries the page it came from or an explicit `sourced: false`.

`jargonHits` counts the `avoid` list in what the model actually wrote, and rides
on `coach_shown.jargon`. A style rule nobody measures is a style rule that
silently does not work — which is how this one got requested months after the
prose went out.

## A graphic states its scale, or it is not a graphic

Every chart, bar, ruler, track and diagram in `apps/web` is drawn by hand, and
in August 2026 an audit of all thirty of them found sixteen defects. Not one was
a missing chart type. They were a missing axis, a scale that saturated three
picks in and drew a twelve-pick parting the same as a three-pick one, bars
renormalised per row so they could not sum to the total printed above them, a
`%` on a figure that was points, and three charts that overflowed a 375px screen
without looking broken. Every one of those is the same mistake in a different
place: **the drawing made a claim the scale could not support, and nothing on
screen said so.**

So the rules are about the scale, not the picture.

### Draw it with visx

`@visx/*` is installed and is the only charting dependency this app has. It
ships no chart components on purpose — scales, axes, tick generation, shape
generators, responsive measurement — which is what leaves the bespoke half of
this app possible. Nivo and Tremor were both measured and rejected; the
reasoning is in the commit that added visx, and it does not need re-deriving.

The house kit is `app/charts/`:

- **`Plot`** — the frame. `needs` and `instead` are required, because a chart
  squeezed past its minimum is not a smaller chart, it is a wrong one, and the
  failure is silent. `label` is required and is the chart in one sentence with
  its units and both ends of its scale; a label you cannot finish is a chart
  with no axis.
- **`ValueAxisBottom` / `ValueAxisLeft` / `Reference`** — a reference line is
  always labelled. An unlabelled rule gets read as zero even when it is a 50%
  win rate or a significance bar.
- **`ink.ts`** — roles, never hues, because there is no free palette here.
  `success`/`info`/`warning`/`error` ARE the grade scale, so a chart reaching
  for green is making a claim about a grade whether it meant to or not; gold
  means "yours"; the five Magic colours are `cardFrame`'s literal hex and must
  not move with the theme. A new mark needs a role before it needs a colour.
- **`Key`** — a legend carries each series' COUNT beside its swatch where there
  is one, so no value on the chart needs a hover. **A legend is for telling two
  or more series apart; a one-series chart gets none and its title names it.**
  Three marks about ONE number — a value, its uncertainty, a reference — are not
  three series: direct-label the one a reader cannot infer and leave the rest.
  A legend taller than the chart it explains is the tell that this was missed.

### What the rules are

- **Say the domain.** Both ends of the scale, in the drawing. A truncated axis
  is fine and often right — `stats/plot.ts` snaps its floor to a grade threshold
  and argues the case — but it must be visible, and a scale that stops short of
  its data needs a mark saying so.
- **Never encode with hue alone.** Height, fill against hollow, position, a
  printed value: pick a second channel. Red and green at 6px with no legend is
  the review pick track, and it is the worst graphic in the app.
- **Never encode with opacity, area or angle.** Two tints of one gold at 8px is
  not a categorical split. Against a 19%-lightness ground, `/25` and `/30` text
  lands near 2:1 — fine for a hairline, never for a digit.
- **A hover is not a channel.** `title=` does not exist on touch. Anything a
  reader needs to understand the chart is printed, and `useCursorTip` is the
  longer form for people who can point.
- **Rates and differences are different things.** `pct()` for a rate, `points()`
  for a difference of two rates. Rendering a delta as a percentage is how a
  reader comes to think a 4pp charge is a 4% one.
- **Show uncertainty where it changes the reading.** `DeckBands` in the
  archetype quiz is the model: the band is sized so two bands touching IS the
  significance threshold, so the picture cannot disagree with the verdict.

### Tooltips are not visx's

`useCursorTip` stays. visx's `useTooltip` holds position in React state and
re-renders per pointer move, which is precisely the pathology `CursorTip.tsx`
was rewritten to fix — it writes text with `textContent` and damps by elapsed
time rather than by frame, so it behaves the same at 60Hz and 120Hz. Use visx
for the scale and the marks, `useCursorTip` for what the pointer is over.

### Before shipping a graphic

Put it on `/dev` with real numbers, in a `Bay` at the widths the app gives it —
including the narrowest. That page exists because the placard's ten-pip overflow
was found in a real draft, by luck, after shipping, and a gallery of one
comfortable copy of each component would have shown it working.

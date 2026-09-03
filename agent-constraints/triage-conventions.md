# Triage conventions for the `triage` stage

Five booleans, declared before anyone has an interest in the answer.

They used to pick a lane -- all false went straight to implementation. That
lane is gone. With "uncertain means true" written here, it could not fire on
anything worth a factory run, and it never once fired on real work. Every work
item now takes the same path.

So the flags no longer route. **Every reviewer is handed them**, which makes
each `false` a claim in that reviewer's own lane, and a wrong one is a finding
against you. That is a sharper incentive than the lane ever was: nobody audited
a lane, but the graphics reviewer reads `touchesGraphics: false` and goes
looking.

When a flag is genuinely uncertain, it is `true`.

## The flags

**`touchesGraphics`** — any chart, bar, ruler, track, diagram, or the `ink.ts`
roles. A graphic states its scale or it is not a graphic, and sixteen of thirty
of them were wrong the last time anyone counted. Adding a mark to an existing
chart counts. So does changing what a chart is fed.

**`touchesStats`** — anything reading, deriving, or presenting 17Lands numbers:
the ingest pipeline, the set-stats artifact, scoring, bot policy, deck
suggestion. Presenting an existing number in a new place counts — the question
"does this metric support this use" is exactly where this repo has been bitten.

**`touchesUserFacingCopy`** — any string a person reads. Labels, headings,
buttons, empty states, error messages, coach prose. Not comments, not log
lines, not identifiers.

**`touchesUserFacingFlow`** — a new screen or action, a change to an existing
one, a new quota, limit, gate, refusal or error path, or an empty state
somebody can land in. If it trips the paired-metric rule in CLAUDE.md, it trips
this flag.

**`needsNewDependency`** — a new package, a new external endpoint, a new
service. This repo prefers fewer moving parts and questions new dependencies,
so one arriving is a thing to research rather than to add.

## The other fields

**`summary`** — what the change is, in a sentence or two. Every reviewer sees
it beside the research and the plan, so it is the one place the change is
described without an argument attached.

**`rationale`** — why the flags are what they are. One line per `true`, and for
an all-false triage, a sentence saying what you checked to be sure. This is the
field that makes a wrong lane visible afterwards.

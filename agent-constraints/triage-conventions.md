# Triage conventions for the `triage` stage

This stage picks the lane, and it does not pick it by judgement. Five booleans
decide it: all false takes the express lane straight to implementation, any one
true takes the full lane through research, planning and plan review.

**Answer the flags before you think about the lane.** Deciding the change "feels
small" and then filling in flags to match is the one failure mode this stage
has, and it is the failure mode the whole factory exists to prevent. Nobody
audits the lane; the flags are the record.

When a flag is genuinely uncertain, it is `true`. The cost of the full lane on
a small change is some minutes. The cost of the express lane on a change that
needed research is the thing that has been going wrong.

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

**`summary`** — what the change is, in a sentence or two. Every reviewer on the
express lane sees this and nothing else, because there is no plan to read.

**`rationale`** — why the flags are what they are. One line per `true`, and for
an all-false triage, a sentence saying what you checked to be sure. This is the
field that makes a wrong lane visible afterwards.

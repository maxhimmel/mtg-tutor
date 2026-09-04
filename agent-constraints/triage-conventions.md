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

## And one question the flags do not ask

**Does this change what `build-set-stats` writes?** If it does, the work item is
not done when the pipeline changes — it is done when the artifacts under
`packages/backend/data/` are rebuilt with `pnpm new-set <SET> <FORMAT>` and
COMMITTED, in their own `data:` commit. The deploy runs `seed-set-stats` and
`ingest-sets` against those committed files and never touches a CSV, so a branch
that changes the derivation and leaves them alone ships a feature that is dead in
production and green in CI at the same time. The deck-speed drill did exactly
that and a human found it by opening the page.

Say so in `rationale` when it applies, so the answer exists before there is an
interest in it. See the pipeline section of `docs/rulings.md`.

## The other fields

**`summary`** — what the change is, in a sentence or two. Every reviewer sees
it beside the research and the plan, so it is the one place the change is
described without an argument attached.

**`rationale`** — why the flags are what they are. One line per `true`, and for
an all-false triage, a sentence saying what you checked to be sure. This is the
field that makes a wrong lane visible afterwards.

**`notesEntry`** — the heading and number in `notes.md` this came from, exactly
as written there: `Issues #10`, `Ideas #1`, `Roadmap: archetype-quiz`. Empty
when the work came from somewhere else, which is most of it — four of the first
five work items were never in that file.

Record it now rather than at the end, because at the end there is an interest
in the answer: an empty string ships without touching notes.md, and a filled
one does not. A cel gate on `ship` refuses a branch that leaves the file alone.

The entry is deleted, not annotated. That distinction is the whole point of the
field — every feature in the Roadmap section that already shipped is still
sitting there with its post-mortem stapled underneath, which is how a backlog
becomes 2,499 lines. What shipped is in the git history. If the work turned up
something that outlives it, that is a new work item or a ruling in
`docs/rulings.md`, and neither of them goes back into notes.md.

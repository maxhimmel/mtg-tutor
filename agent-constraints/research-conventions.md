# Research conventions for the `research` stage

This stage is initial. Nothing reaches planning without it, which is the whole
reason it is first — research that is optional is research that happens a few
times a year.

## Go looking for the argument against

`contradictions` is a required field. Research that found only agreement has to
record an empty array deliberately, rather than arrive silently one-sided.

Where sources disagree, record both sides and — where you can settle it — the
resolution and what settled it. Where you cannot settle it, that is an
`openQuestion`, not a finding.

**`openQuestions` is now the routing fact, and an empty array is a claim.** If
it is empty, the plan goes straight to a branch with nobody consulted. If it
carries anything, the plan stops at `plan-decision` and a human decides before a
line gets built. So an open question you did not record is a decision taken away
from the person whose call it was — and `research-critic` reads the branch later
knowing that, and will say so.

It is not a place to be defensive either. Padding the list to be safe puts a
human in front of a plan that had nothing for them to decide, which is how a
checkpoint turns into a toll booth and stops being read.

## Open every file you cite

A citation you did not read is not a source. This applies hardest to a claim
arriving from somewhere else -- a reviewer's finding, a note, an earlier
artifact. Two of the four unchecked claims of the first run were a reviewer's
own citation carried into a plan without anybody opening the file, and one of
those was refuted by a source already sitting in the research it was added to.
Open it, or do not cite it.

## Two sources minimum

`sources` requires two, each with a `url` and the `claim` it supports. One
source is a citation, not a cross-check.

Prefer primary sources: the API's own docs, the paper, the spec, the source of
the library. A blog post summarising a doc is worth recording only when it
contradicts the doc.

For anything statistical — 17Lands metrics especially — the source has to
support the *use* being proposed, not merely exist. `trophyPickRate` correlates
with `maindeckRate` at 0.90; a source that says a metric exists says nothing
about whether it measures what the plan wants it to measure.

## What belongs in `findings`

Things that would change the plan. If a finding would not alter what gets
built, or how, it is background and belongs in the prose, not the artifact.

## What this stage is not

It is not design, and it is not a plan. It answers "what is already known and
where do the sources disagree." The plan comes next and is reviewed separately.

Check `notes.md` and existing repo docs before searching outward — a
contradiction already resolved in this repo is a finding with a local source.

## Coming back here after a review

`review`'s only failure edge lands here, because a finding about running code
is a fact about the ground and the ground is what this stage owns.

**Only `critical` and `high` block the ship.** That is not a suggestion the
gate makes -- `findings-clear` passes with mediums and lows outstanding, so a
review carrying nothing worse than a medium is a review that *passed*. Record
those findings as accepted, say why in a line, and advance. The most expensive
habit of the first run was reading a passing gate as a failing one and
rewriting the whole artifact, which bought a fresh full review and a new crop
of mediums each time.

When a blocking finding does send you back, fix the blocker. Do not re-derive
the research around it -- the artifact is versioned, so a new version that
changes one finding's ground is cheaper to read and cheaper to review than a
rewrite that changes everything.

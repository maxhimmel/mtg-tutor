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

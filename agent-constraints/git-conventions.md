# Git conventions for the `implementing` stage

The `change-summary` schema enforces the shape of this; the reasoning is here.

## A feature branch, always

Branch off the current base and work there. The `cel` gate on `submit` compares
`branch` to `baseBranch` and refuses the transition when they match, so
committing straight onto the base branch does not merely violate a convention —
the work item cannot advance.

When the work sits under an umbrella branch, phase branches are unprefixed and
merge back with `--no-ff`, so the merge commit is where the phase is named.

## Commits somebody could review one at a time

`commits` requires **two or more**. One commit for a whole feature is not
incremental, and this is the enforcement of that. Each commit should stand on
its own: a compiling tree, one idea, a subject that says what changed.

If a work item is genuinely a one-commit change, it did not need a factory run.
If the rule ever costs more than it buys, `minItems` on `commits` in the
definition is the one number to change.

## Messages

Match the log: a lowercase area prefix, then a sentence that says what changed
and why it was worth changing.

```
web: give the habits chart a width it deserves, and stop saying nothing thrice
```

Say it the way a Limited player would — the corpus is
`packages/core/docs/vernacular.yaml`, and it governs commit messages the same
as it governs the coach.

Every commit ends with the co-author trailer. Author email is
`himmelmax@gmail.com`.

## What gets recorded

`record_artifact name=change-summary` takes `branch`, `baseBranch`, `commits`
(sha + subject each), `headSha`, and the files touched. Read them out of git
rather than from memory — `git log --oneline <base>..HEAD` is the list, and a
sha you typed from recollection is a sha that will not resolve at review.

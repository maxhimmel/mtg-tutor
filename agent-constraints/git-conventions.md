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

The schema takes one commit, deliberately -- a genuine one-commit fix should
not be blocked from being recorded. (This paragraph used to claim it required
two, which the schema never did. The doc was wrong, not the gate.) The
discipline that is actually enforced is the branch.

Each commit should still stand on its own: a compiling tree, one idea, a
subject that says what changed.

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

## The notes entry comes out on this branch

If triage recorded a `notesEntry`, deleting it from `notes.md` is part of this
work, in its own commit, before you record the change summary. A cel gate on
`ship` refuses a branch that does not touch the file.

Delete it. Do not rewrite it to say what happened, do not leave a line saying
it shipped, do not move it to a "done" section. What shipped is in the git
history, and the entry going away is the signal. Something that outlives the
work item is either a new work item or a ruling in `docs/rulings.md`.

`notes.md` is Max's backlog and this deletion is the only edit an agent makes
to it — you never add to that file, including for problems this work uncovered.

## What gets recorded

`record_artifact name=change-summary` takes `branch`, `baseBranch`, `commits`
(sha + subject each), `headSha`, and the files touched. Read them out of git
rather than from memory — `git log --oneline <base>..HEAD` is the list, and a
sha you typed from recollection is a sha that will not resolve at review.

`files` is required now, and the notes gate reads it, so a summary that lists
nothing cannot advance.

## Prove the suite ran, on the commit you are claiming

`submit` will not advance on your word that the tests pass. Four gates stand on
it: the change summary exists, its branch differs from its base, a `verify-run`
verdict is recorded with `valid: true`, and that verdict's sha and branch match
the ones the summary records.

The verdict comes from `evidence-validator`, an instance of
`@mgreten/test-evidence-validator`. Run the suite, then hand it the parsed
result:

The nested `testResult` is easiest as a file. (The extension's README shows
`--arg`/`--arg-json`; this CLI takes `--input`/`--input-file`.)

```yaml
# verify.yaml
label: <work-item>
repoPath: /Users/maxymax/Repos/mtg-tutor
expectedHeadSha: "<git rev-parse HEAD>"
expectedBranch: "<git rev-parse --abbrev-ref HEAD>"
testResult:
  success: true
  summary: "1001 passed across core, backend, cli and web"
  tests_run: 1001
  tests_passed: 1001
  tests_failed: 0
  files_tested: [...]
  failures: []
  commands_run:
    - command: "pnpm test"
      exit_code: 0
  commit_sha: "<same sha>"
  criterion_evidence: []
```

```bash
swamp model method run evidence-validator validate --input-file verify.yaml
```

Then `record_evidence name=verify-run` with the returned verdict.

It is not a formality, and both halves were fired to check. A dirty tree came
back `valid: false, "the test worktree is not clean"`; a result claiming 1001
passing tests whose only recorded command was `git diff --stat` came back
`"tests were reported without a test-runner command"`.

It shells out to `git status --porcelain`,
`git rev-parse HEAD` and `git rev-parse --abbrev-ref HEAD` in the worktree, and
refuses on a dirty tree, a mismatched head, or a mismatched branch. Structurally
it rejects a result that reports failure, whose `tests_run` does not equal
passed plus failed, that carries a non-zero-exit command, or that claims tests
while no recorded command matches a real runner (`test`, `vitest`, `jest`,
`playwright`, `pytest`, `rspec`, …). A summary of a suite you did not run does
not parse as one.

**Run `pnpm test`, not just `pnpm typecheck`.** The first run's loop was
`pnpm check-charts` and `pnpm typecheck`, neither of which runs vitest, and
`pnpm test` was red for several commits while every review passed. That is the
hole this gate exists to close.

A fix-up after a review re-enters `implementing` with a new commit, so the
verdict is stale by construction -- re-run and re-validate. Evidence is
cycle-scoped and the engine will not carry the old one across.

## Say which layer the evidence covers

A green suite proves the code you tested does what its test says. It does not
prove the feature works, and the gap between those two is where this repo's
worst days come from. So `change-summary` names, in a sentence: **the layer the
evidence reaches, and the layer a person will actually touch.** If they differ,
that is not a failure — it is a fact the reviewer and the human both need, and
the one thing nobody can recover later.

The deck-speed drill is the worked example and every step of it passed its own
check:

- `deckSpeedQuestions` had twenty-four unit tests and `deal` had none, so the
  query shipped with a pager that dropped 58% of the bank, a false empty-state
  promise, and a roles read nothing had run.
- The suite was green while the committed artifacts under `data/` still carried
  the old shape, so the feature was dead in production and green in CI at the
  same time.
- The tooltip was wired and typechecked while its hit target was painted under
  its own marks, so the three things a reader aims at did nothing.

Each was verified one layer below where it broke. A person opening the page
found all three.

**The rule that follows: test the seam a person crosses.** A Convex query is not
covered by testing the function it calls — `convex-test` runs the real query in
milliseconds. A chart is not covered by typecheck — there is a Playwright
harness against `/dev`. A pipeline change is not covered by a green suite — the
deploy reads the committed artifacts, so rebuilding and committing them IS part
of the work item.

## A regression test that has never failed is not evidence

Before a test counts as proof of a fix, **watch it fail against the defect.**
Reinstate the bug, see red, restore the fix, see green. Say in the change
summary that you did.

This is not ceremony. Both tests written for the tooltip bug PASSED against the
bug: the first hovered the SVG's vertical centre, which with a 20px top and 40px
bottom margin lands below the marks on empty plot that behaves identically
either way. It would have gone into the repo as proof the tooltip worked, on a
chart where hovering anything a reader aims at did nothing. The only thing that
caught it was reinstating the defect — which took one minute and is the whole of
this rule.

The same check on the `unrated` empty state passed first try and was worth
running anyway: a test that goes red for the right reason has told you its shape,
and one that has never been red has told you nothing.


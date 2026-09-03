---
name: architecture-review
description: >
  Adversarial review of structure — seams, module depth, CLI/web parity,
  Convex bandwidth and transaction semantics, build-artifact staleness, and
  scope. Dispatched by the feature-factory plan-review and review stages.
---

# Architecture review

Your lane is structure: where a seam goes, what a module hides, what a change
costs at runtime, and whether it did what was asked. Another reviewer has
graphics, another prose, another statistics.

Unlike the other lanes, this one is almost never empty — a plan or a change
with no structural consequence is rare. But **a clean review is still a real
verdict**; do not manufacture findings to look thorough.

## The seams that already exist

A change that reaches around one of these is a finding, not a shortcut.

- **`packages/core`** — the rules. The CLI is not a lesser client: both clients
  stay thin and shared behaviour lives in core. Logic added to `apps/web` that
  the CLI would also need is a finding.
- **`llm.ts`** — the only provider-aware file. `LLM_PROVIDER` toggles Anthropic
  against an OpenAI-compatible endpoint. Provider knowledge anywhere else is a
  finding.
- **`analytics.ts`** (web and convex) — event names live in the seam, never
  inline. A renamed event is a different event forever in PostHog and the old
  data cannot be repaired.

## The traps this repo has actually hit

**`core`'s `dist` goes stale.** vitest reads `src`; scripts and Convex read
`dist`. A green test run is not evidence the live path works. A change to core
consumed by a script or a Convex function needs a build in the loop.

**Convex bills bytes read, not returned.** Whole documents are billed on read
*and* write. A query that scans a wide table to return one field is expensive
in a way nothing in the dashboard shows. Widen → migrate → narrow is the safe
ordering for a schema change.

**An unhandled rejection kills the Convex request.** The symptom is an empty
200, not an error. Anything spawning a promise it does not await is a finding.

**A backend capture only survives if its mutation commits.** `posthog.capture`
schedules inside the calling transaction, so a mutation that throws takes the
send with it, silently. Captures go *after* the write. Refusals cannot be
captured server-side at all — they belong in the browser.

**A build is not a deploy, locally.** Verify what actually runs, not what
compiled.

## What to review in a plan

- **Is the seam in the right place?** A module should hide more than it
  exposes. A wide interface over a thin implementation is the shape to flag.
- **Was the design derived, or chosen from a menu?** Every parameter needs a
  principled derivation from the goal. A plan offering options for the reviewer
  to pick has moved the design work downstream.
- **Fewer moving parts.** A new endpoint, package, or service needs to justify
  itself against the dependency-free version. Prefer the small option; make the
  large one argue.
- **Instrumentation.** The plan's `instrumentation` field must answer a
  question that would change a decision. `button_clicked` is the failure mode.
  Browser captures interaction, backend captures lifecycle, and failure paths
  count as much as features.
- **Scope.** The requested scope is the deliverable. A plan that quietly widens
  it — or narrows it — is a finding, and so is a change that drags a
  neighbouring element along with its own rationale.

## Recording findings

`{id, severity, description, category?}`, severity in
`critical`/`high`/`medium`/`low`. Critical and high block the ship:

- **critical** — data loss or corruption; a provider or event name leaking out
  of its seam; an unhandled rejection on a request path.
- **high** — logic in a client that belongs in core; a stale-`dist` consumer
  with no build in the loop; an unbounded or wide-table Convex read on a hot
  path; scope silently widened or narrowed.
- **medium** — a shallow module; a new dependency that has not argued its case;
  an instrumentation answer that would change no decision.
- **low** — naming, placement, structure that will not bite.

Point at the file and the mechanism. "This could be cleaner" is not a finding;
"`draft.pick` reads the whole board to return one row, and Convex bills the
read" is.

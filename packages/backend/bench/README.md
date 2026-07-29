# Benchmark: what a draft costs, and whether the advice survived the saving

Reducing AI token usage is easy. Reducing it without quietly making the coaching
worse is the hard part, and it is the only reason this directory exists.

Two commands:

```bash
pnpm bench-llm                    # drives a real draft, ~92 model calls, ~10 min
pnpm bench-report --open          # renders the result, free and instant
```

## The procedure

1. **Establish the reference.**

   ```bash
   pnpm bench-llm --update-baseline
   ```

   Prompts unchanged. This writes both the numbers and the prose that produced
   them. Do this once per provider — a baseline is never comparable across
   providers.

2. **Read it.**

   ```bash
   pnpm bench-report --open
   ```

   Single-run mode, ordered by output cost. This is where a line like "verdict
   output is 25.4k of the run's 30.8k tokens" stops being a statistic and
   becomes thirty pieces of prose you can see the verbosity in.

3. **Cut one thing.** Verdict first — it is the largest output line in the
   budget, and `VERDICT_SCHEMA`'s field descriptions in `convex/review.ts` are
   the only instruction the model gets about length. Coach input surface is the
   next target, then frames.

   One change per run. Two changes and the comparison cannot tell you which one
   did what.

4. **Measure it — just the area you changed.**

   ```bash
   pnpm bench-llm --area verdict && pnpm bench-report --open
   ```

   A full run is ~366k input tokens and ~41k output. Tuning the verdict prompt does not need thirty
   coach calls, and paying for them means a daily allowance buys fewer
   iterations of the thing you are actually changing. `--area` takes any of
   `coach`, `verdict`, `frame`, comma-separated; the default is all three.

   Unlike `--limit`, a partial run **is** a valid measurement — of the areas it
   covers. It writes a transcript, it compares against the baseline, and it
   fails on a regression.

   The report answers three questions in order:

   - **Did it get cheaper?** The bars at the top, candidate against baseline.
   - **Did it stay correct?** The metric chips — each one marked `held`,
     `improved` or `regressed` using the same thresholds `bench-llm` fails on,
     so the page can never disagree with the gate.
   - **Did it stay good?** The per-pick prose, ordered by how much each answer
     changed. A cut usually moves five picks and leaves twenty-five alone; those
     five are at the top.

5. **Accept or revert.** Accepting is `pnpm bench-llm --update-baseline`, which
   moves the numbers and the reference prose forward together. Reverting costs
   nothing but the run.

   A partial run gets **its own baseline**, keyed by the areas it covers:

   ```
   baseline.fdn.TradDraft.42.local.coach.json     # --area coach
   baseline.fdn.TradDraft.42.local.json           # full run
   ```

   They never overwrite each other, and a coach-only run is only ever compared
   against a coach-only baseline.

6. **Repeat from 3.**

## Scoping a benchmark to one feature

Working on the coach — the feedback after a pick — means you only need a
coach baseline:

```bash
pnpm bench-llm --area coach --update-baseline   # once
# ...change buildSystemPrompt or the coach prompt...
pnpm bench-llm --area coach                     # compare
pnpm bench-report --area coach --open
```

Every metric compares, because both sides counted over the same answers. About
~167k tokens per iteration instead of ~407k.

**Comparisons only happen between runs that measured the same thing.** Several
accuracy metrics are counted across more than one area — citations and principle
ids come from coach **and** verdict answers — so what matters is not whether a
run collected every area a metric reads, but whether both sides collected the
same ones:

| Candidate | Baseline | Blended metrics |
|---|---|---|
| coach only | coach only | compared — same population both sides |
| coach only | full run | skipped — counted over different populations |
| full run | full run | compared |

A skipped check is printed rather than passed silently: `not compared: distinct
principles used (counted over coach here, coach+verdict in the baseline)`, and a
dashed `not measured` chip carrying the same reason.

| Metric | Counted from |
|---|---|
| citations per answer, empty answers | `coach` |
| context-best divergence, unanswered verdicts | `verdict` |
| empty frames | `frame` |
| off-topic card names, invented citation rate, distinct principles used | `coach` + `verdict` |
| truncated answers | any area the two runs share |

### The one thing a scoped baseline will not catch

Coach and the review features build their system prompts separately —
`buildSystemPrompt` in `convex/http.ts` against `buildReviewSystemPrompt` in
`convex/review.ts` — but both are built from the same `loadPrinciples()` corpus.

So the rule is about **what you are changing**, not about which feature you care
about:

- Changing something coach-specific — the coach prompt, the coach gate,
  `buildSystemPrompt` — a coach baseline measures all of it.
- Changing the **principles corpus**, which all three areas read — a coach
  baseline measures a third of the blast radius. Cutting a principle could leave
  the coach fine and quietly strip what the verdict had to say. Use a full run
  for corpus changes.

## Reading the token numbers

Three input figures, and they are not interchangeable:

| Figure | What it is | Asserted? |
|---|---|---|
| `inputTokens` | the whole prompt — cached and uncached together | **yes**, exactly |
| `noCacheInputTokens` | the slice billed at full input price | no — reported |
| `cacheReadTokens` / `cacheWriteTokens` | the slice served from / written to cache | no — reported |

`inputTokens` is the **total**, not the uncached remainder. A coach call that
reads 4,637 cached tokens and adds 552 fresh ones reports `inputTokens` 5,189.
Summing it with the cache lines counts every cached token twice — that is a real
bug this harness shipped, and it published an input figure near double the truth
until 2026-07-29.

Only `inputTokens` gates. The split beneath it moves with how quickly calls
landed inside the provider's cache TTL, which is timing, not prompt content — a
slower run would fail a gate on the uncached line while sending byte-identical
prompts.

**Tokens are not money, and the gap is large.** For the committed coach
baseline, priced at Sonnet 5's introductory rate:

| Line | Tokens | Share of tokens | Cost | Share of cost |
|---|---|---|---|---|
| Cache read | 134,473 | 82% | $0.027 | 20% |
| Uncached input | 23,266 | 14% | $0.047 | 35% |
| Cache write | 4,637 | 3% | $0.012 | 9% |
| Output | 4,897 | 3% | $0.049 | **37%** |

The system prompt is 86% of every call's input and a fifth of the bill, because
cache reads cost a tenth of fresh input. Output is 3% of the tokens and the
single largest cost line, because output is priced 5x input and 50x a cache
read. Cutting the biggest token count is usually not cutting the biggest cost —
check which line the money is on before editing a prompt.

## What "held" means

`held` means the benchmark would not have failed it — not that nothing moved.
Citation density falling from 2.30 to 2.10 is inside the gate's 15% tolerance,
so it reads `held` with both numbers shown. Only a move in the good direction
reads `improved`. This distinction is deliberate: without it every cut would
report itself as a win.

`regressed` on any chip means `pnpm bench-llm` exits non-zero.

## Why quality is measured at all

The mechanical metrics catch the failures a token cut actually causes:

| Metric | Catches |
|---|---|
| invented citation rate | the model citing principle ids that do not exist |
| citations per answer | the coach dropping the corpus and freelancing |
| distinct principles used | the corpus being *condensed* rather than cut — every id kept, the depth behind them stripped, so the coach still cites but can only find a handful of things to say |
| context-best divergence | drift in either direction: toward 1 the coach is echoing the data verdict it was handed, toward 0 it is guessing |
| truncated answers | the JSON cut mid-object, or prose cut mid-sentence |
| unanswered verdicts | the model naming a card outside the pack, or returning nothing usable |

None of them answer "is this advice good". That is the read you do yourself in
step 4, which is why the report exists rather than a pass/fail number.

## The files

Names carry the area set when a run is partial, so scoped and full baselines
coexist: `baseline.fdn.TradDraft.42.local.coach.json` against
`baseline.fdn.TradDraft.42.local.json`. Below, `<stem>` is
`<set>.<format>.<seed>.<provider>` plus `.<areas>` for a partial run.

| File | Written by | Committed |
|---|---|---|
| `baseline.<stem>.json` | `--update-baseline` | yes — the gate |
| `run.<stem>.baseline.json` | `--update-baseline` | yes — the reference prose |
| `run.<stem>.json` | every run | yes — see below |
| `report.<stem>.html` | `bench-report` | no — derived, rebuilt for free |

`bench-report` takes the same `--area`, and needs it to find a scoped run.

Transcripts are committed because they cannot be reproduced. The seed pins the
deal and the prompts byte-for-byte, but not the model's generation: re-running
costs a full run's tokens and comes back with different prose. The runs most
worth keeping are the ones whose cut was **rejected** — they never become a
baseline, so without a commit there is no record of what the cut did to the
coaching or why it was backed out.

A run overwrites the previous file of the same name. Commit between runs, or the
second one takes the first with it.

The prose transcript exists because `llmUsage` stores token counts and nothing
else. The answers live in the harness's memory during a run and are gone when
the process exits, so anything not written to `run.*.json` can never be compared
against later.

## Provider caveats

Baselines are **per provider and never comparable across them**. A run records
the provider it used and the filename carries it.

- **Anthropic** reports the cache split, so its numbers can price a saving in
  money.
- **Anything openai-compatible** — Groq, Ollama, vLLM, OpenRouter — records
  itself as `local`, because that is the name the provider seam registers. Its
  baseline is valid for output length, call frequency and accuracy, and says
  much less about what a saving is worth: Groq reports a cache split, but it
  tokenizes differently and prices differently, so its uncached line does not
  convert into money the way Anthropic's does.

  Because they all record as `local`, a Groq baseline and an Ollama baseline
  would collide under one filename. Only keep one openai-compatible baseline at
  a time, or rename by hand.

Switch providers on the deployment, not in the script:

```bash
npx convex env get LLM_PROVIDER      # openai-compatible | anthropic
```

## Flags

| Flag | Effect |
|---|---|
| `--set fdn` | which set to draft (default `fdn`) |
| `--format TradDraft` | must match how the set was ingested |
| `--seed 42` | pins the deal, so two runs send byte-identical prompts |
| `--area verdict` | which prompts to spend on: `coach`, `verdict`, `frame`, comma-separated. Default all three. A valid measurement of what it covers — see above. |
| `--limit N` | coach and review only the first N picks. **Not a valid benchmark** — writes no artifacts and compares nothing. For proving the harness runs. |
| `--update-baseline` | accept this run as the new reference |
| `--open` | *(bench-report)* open the page when it is written |
| `--vs <file>` | *(bench-report)* compare against a specific transcript |

## Prerequisites

- `pnpm login` — the harness drives the same authenticated endpoints a browser
  does, and cannot talk to them anonymously.
- The set must be ingested for the format being drafted. A run that names the
  wrong format reads identically to a missing set, so the error lists what is
  actually available.
- `pnpm build` if `packages/core` changed — scripts read `dist`, not `src`, so a
  green vitest run does not mean the harness sees your change.

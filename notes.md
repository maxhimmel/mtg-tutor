# Issues:

Numbering is stable and therefore gappy, for the same reason the ideas below
are: `corpus.test.ts` cites issue #4. A fixed issue is deleted and its number
left empty rather than renumbering everything under it.

1. Room type cards and battle cards have text that is sideways and hard to read when they're enlarged. Can we rotate them or see if there's an alternate image to render in their enlarged state that has the text rotated so it's easier to read.

2. It seems like the coach does a bad job of encouraging/noticing themes/synergies between chosen cards and the latest pick the user just chose.
   (`setStats.synergies` is computed and stored and read by nothing — it is the
   data that would fix this.)

   **Still open, and now on purpose.** `setCardContext` was built to carry
   exactly this and synergy was left out of it: eight partner names per card
   measured at **201KB of read per draft**, against 41KB for the archetype
   splits — two thirds of the table's cost for the weakest of the signals
   (median lift 1.93pp against archetype fit's 4.2pp, p90 3.79 against 8.0).
   Storing partners as pool indices rather than names would roughly halve it if
   this is picked up. `pnpm backtest-scoring` is the harness, with the caveat
   below about what it can and cannot judge.

3. **Re-ingesting a set strands every draft taken against the old data.** A
   session is `{seed, pickedNames}` replayed against whatever the set says
   today, so when a set's card pool or pack model changes the seed deals
   different packs and `replayDraft` throws
   (`Replay diverged at P1P1: "X" is not in the pack`). Hit for real on
   2026-07-27 with EOE, after the bonus-sheet odds rebuild changed `packRate`
   for six sets. It is not repairable — the packs that draft saw no longer
   exist.

   `loadBoard` now says so in human terms instead of leaking the engine's
   message, but `/review` still **lists** those drafts, because `review.list`
   reads the denormalized summary and never replays — so it cannot know until
   you click. The cheap fix is a fingerprint: `sets` already carries
   `sourceHash` over the card pool, so stamping it on `draftSessions` at
   creation would let the list mark a stale draft without replaying anything.
   Only helps sessions created after the change, which is fine — it is a
   forward-looking guard, not a repair.

   **`draftPicks` (2026-07-29) shrinks this from "unreadable" to "unreplayable".**
   Every pick now stores the pack it saw, so a stranded draft keeps its own
   history: `coachContext` and `verdictContext` read the row and never replay,
   and work fine on a session whose set has moved on. Only `review.load` still
   replays and so still fails, which makes it the one thing left to fix — and it
   could be fixed by reading the rows too, at the cost of the whole-set text read
   it already does. Sessions drafted before that date have rows only if the
   backfill could replay them, which by definition excludes the stranded ones.

   Worth knowing: the 2026-07-29 `POOL_REVISION` bump re-ingested all 17 sets on
   both deployments and stranded **nothing** — the backfill replayed every prod
   session successfully. A re-crawl from unchanged artifacts is safe; it was the
   `packRate` rebuild that broke EOE, not re-ingestion as such.

4. We should create a favicon/logo for the app!
   - Minimalist + cute + easy to see at a glance.

5. **Show the tokens a card makes.** Split out of the card-shape work, which
   covered the rest of what was issue #0. A card that reads "create a Map token"
   is asking you to know what a Map is, and nothing in the app says.

   The data supports it and costs one extra request per set. Scryfall's
   `all_parts` names each related piece with a `component`, so filtering to
   `component === "token"` gives the tokens a card makes — and the field is
   absent entirely on a card that makes none, so it costs nothing on the many
   that don't. The art is not in there, but every set publishes its tokens as
   their own set under `t` + the code (`twoe`, `tdsk`): 15-19 cards each,
   ordinary `image_uris`, resolvable by name in one `set:t<code>` search. Same
   shape as the release-day bonus-sheet crawl `fetchScryfallPool` already does.

   Two things to get right. `all_parts` also lists `combo_piece` entries and the
   card itself — Kellan, Daring Traveler's three parts are two combo pieces and
   one token — so it has to be filtered rather than taken whole. And the hover
   already draws three boxes on a double-faced card with a stats panel, so where
   a token goes is a layout question before it is a data one.

6. **The coach still manufactures a fault when it cannot find one — prompt
   changed, not yet observed.** Reported on draft-v2: a Room dealing 4 damage to
   a creature, described by the player as "good removal", drew "calling it good
   removal mischaracterizes what the card does". It does kill a creature; the
   coach was wrong, and it was wrong on the easy case.

   Not the failure decision #9 fixed — the coach read the rules text correctly
   and described both halves of the card. It is `DEFENSE_RULE` in `prompt.ts`:
   inside the margin the model is told not to grade the card and to grade the
   reasoning instead, and it had no branch for reasoning that holds. It filled
   the space. Two rules were added — fault the reasoning only where the error can
   be named, and say so plainly when it is sound — and **a prompt change is only
   real once a live generation shows it.** `pnpm bench-llm --area coach`, after
   `--update-baseline` (roadmap #4: the stored baseline is stale).

   The rest of that report shipped. The reading names the card the pick was
   argued against instead of saying "the two cards" (`ChallengeOutcome`
   carries it now); the confidence control says "Clear gap"/"Close call" and
   asks "How big is the gap to the next-best card?", because "Clear" alone was
   read as "how obvious is this to me" — the one question the data cannot grade;
   and the panel's eyebrow says "Your call on the gap", so a `misread` badge
   under an A+ is not read as a second opinion on the card.

# Ideas:

Numbering is stable and therefore gappy. `build-set-stats.mjs` and the roadmap
below cite these by number, so a shipped idea is deleted and its number left
empty rather than renumbering everything under it. 4, 5 and 10 shipped on
2026-07-30; the sideboard and mana-curve ideas that took 10 and 11 after that
shipped on 2026-07-31.

1. A quiz on what archetype a mono-colored card belongs to.

- Ex. This Red card belongs in a Boros deck because ... <x,y,z>.
- The important bit is that it'd teach me what the archetypes even are, and what monocolored cards fit the type to belong in that archetype.
- Standalone: its own command and data model, not part of reviewing a draft.
- Now answerable from data rather than authored: `setStats.archetypes` carries
  per-card win rate per deck-colour-pair, so "which deck wants this card" has a
  ground truth.

2. **The replay dataset is deliberately unused — revisit it later.** 17Lands
   publishes three public datasets per set/format; the stats pipeline pulls only
   **draft** and **game**. Replay is the third and by far the largest (431MB
   gzipped for FIN, vs 90-206MB draft and 26-62MB game), and nothing we compute
   today needs it, so downloading it would triple the pipeline's cost for zero
   current gain. (`build-set-stats.mjs` cites this item by number — renumber
   with care.)

   It is one row per game — the same 63,987 games as the game dataset, joinable
   1:1 — carrying turn-by-turn board state for 30 turns: cards drawn/discarded,
   lands played, creatures cast, attacks and blocks, damage, mana spent, and
   end-of-turn hand/board/life for both players.

   What it would unlock, none of which is derivable from draft or game data:
   - **A mulligan/keep trainer.** `candidate_hand_1..7` plus `opening_hand` and
     `won` is a labelled dataset of real keep-or-mull decisions and their
     outcomes. Draft tutors rarely teach this, and it is a distinct skill from
     drafting — so it is a new practice surface, not an improvement to an
     existing one, which is why it sits behind everything else.
   - **Format speed.** Life totals and board state per turn say when games are
     actually decided. That is real pick advice: in a fast format a six-drop is
     worse than its raw GIH WR implies, and right now nothing in scoring knows
     how fast a format is.
   - **Curve and land-count truth.** End-of-turn lands in play vs winning,
     measured rather than assumed. Feeds the deck-builder work (roadmap #2).
   - **Gameplay coaching** (attacks, blocks, tempo) — the weakest fit. This is a
     _draft_ tutor; per-turn play coaching is a different product, and the data
     existing is not a reason to build it.

   If we do pick this up: the pipeline already streams gzip and never keeps raw
   files, so adding replay is a new derivation pass, not new infrastructure.

3. What about a button on the side panel or something for the user to click to
   get a hint/make a suggestion/pick for them? (Guiderails is the always-on
   version — a passive win-rate badge. This is the on-demand, ask-for-it one.)

4. **Show the field, not just the win rate.** The draft dataset is every human
   pick, so we can say "34% of drafters took this card at this pick" instead of
   only "this card has the higher win rate". A pick-order distribution is a
   better teacher than a scalar, and it is the same new draft-data pass that
   roadmap #3 (`human-bots`) needs — the bots consume it, the player sees it.

5. **Sealed mode.** Six packs, no passing, build the 40. `makePack` and
   `suggestDeck` already exist, so this is mostly a new screen — and it is a
   different skill (pool evaluation and deck construction rather than pick
   order).
   - Not too interested in this format. Low priority.

6. **A deck-building step.** Today `suggestDeck` just shows you the answer on
   the results screen. Building the 40 is half of Limited and the app currently
   does it for you; making the player build it and then diffing against the
   suggestion (and against real winning curves, roadmap #2) is a whole second
   practice surface on top of data we already have.

7. **Re-serve your own misses.** `stats.overview` already computes
   `topMistakes`. Storing the seed + pick index and dealing that exact pack back
   weeks later is spaced repetition on the mistakes you personally make.

8. Let's constrain who can actually use our deployed app. This isn't ready for public exposure yet. I don't want randoms online wasting my AI tokens. I wanna only allow certain friends to use the app. Maybe it'd be cool to allow people to attempt to sign-up, but instead notify me for their approval?
   - Secondarily, is there an easy way for me to invite people to use the app?! Could I send them a link rather than need to ask for their email or something?

9. I'd like to limit the usage per user.
   - I'm the admin/developer so I should be exempt. In fact, maybe I should be able to manage roles or something that dictate usage limits. For instance a tester friend could have unlimited? But normal friends in the "beta release" (or w/e we're supposed to call this workflow) should be limited to 3 drafts and reviews a day or something.

10. Is it possible to continue a draft we left in progress? Is a draft that isn't completed even tracked on the DB? It'd be pretty rad if we could just continue from where we left off with a draft we abandoned. Answer my question about this and tell me the answer before you start doing the work for this.

# Deferred (from Draft Review grilling, 2026-07-21):

Out-of-scope for the Draft Review MVP, noted so we don't lose them:

1. Deep multi-ply permutation re-simulation (chess.com-style alternate lines —
   replay the whole draft down a different branch). The MVP stores the RNG seed
   specifically to keep this possible later without a retrofit.
2. Longitudinal review-quiz trend tracking (persist each quiz outcome + add stats
   panels showing judgment improvement over time). Natural 2nd iteration once the
   review loop feels right; MVP only shows a session score. Nothing persists
   quiz outcomes today — `reviewVerdicts` stores the coach's verdict, not your
   guess.

# Still open from shipped work:

1. **Stats is CLI-only.** `convex/stats.ts:overview` already returns overall
   averages, score-by-pick-number, score-by-pack-number and top mistakes, and
   the web app has no route for any of it — the largest remaining capability gap
   between the two clients. Review shipped to the web on 2026-07-22
   (`/review`, `/review/[id]`, `/review/[id]/breakdown`); this is what is left.
2. **Draft sessions created before auth have `userId: undefined` and are now
   unreachable.** The schema still allows the field to be absent so those rows
   validate; nothing can read them. Only dev data, but it is why the field is
   optional rather than required.

# Roadmap (pick per future session):

Ordered by value × readiness. Each is a candidate feature branch.

1. **`deck-builder`** — replace the `DECK` 23-spell/17-land convention with real
   winning-deck land counts & curves from the data. `core/draft/deck.ts`; `DECK`
   in `core/config.ts` is the single tuning point. Small, self-contained.
2. **`human-bots`** — fit bot picks to the 438k real human picks in the draft
   data (needs a new draft-data pass) instead of greedy `cardValue` + colour
   bias, so signals/wheeling feel like a real pod. `core/draft/bots.ts` is still
   `cardValue + colorBias + noise`. Same data pass as Ideas #6.
3. **`mulligan-trainer`** — the unused **replay** dataset → a keep/mull practice
   mode + format-speed metrics (see Ideas #2). Biggest, most independent; last.
   Also what `contextValue`'s speed term is waiting on: the axis is stored and
   unscored because whether a proactive card is GOOD depends on format speed,
   which nothing measures yet.
   This is what would re-tighten the availability gate to require replay
   (`USED_KINDS` in `scripts/lib/datasets.mjs`).

4. **Follow-ups to token metrics** (spec:
   `.omc/specs/deep-dive-ai-token-usage-benchmarks.md`). Deliberately left out of
   the first pass, each for its own reason:
   - **Static token assertions in vitest, no API calls.** Input tokens,
     call frequency and the cache split are pure functions of the prompt
     builders and `isDecisionPick` — a draft replays in 0.16ms, so all 45 picks
     can be evaluated exactly and for free, no provider involved. That would
     catch corpus growth on every commit instead of only when someone pays for a
     benchmark run. It is not in the first pass only because _accuracy_ cannot be
     computed statically and forces a live harness anyway; this is the cheap
     fast-feedback half, worth adding once the harness proves the metrics are the
     right ones.
   - **LLM-as-judge pairwise quality tier.** The mechanical and distributional
     accuracy metrics catch hallucination, truncation and context-blindness, but
     not "is this advice actually good". A blind, order-randomized pairwise judge
     over baseline-vs-candidate answers would — at real token cost and with its
     own noise. For release candidates, not for every run.
   - **Rules text is now in every prompt. Measured 2026-08-04, and the stored
     baseline is stale.** `pnpm bench-llm --area coach` against `claude-sonnet-5`
     (fdn/TradDraft seed 42, 30 calls) vs the 2026-07-30 baseline:

     |                     | baseline | now     |            |
     | ------------------- | -------- | ------- | ---------- |
     | total input         | 162,376  | 190,773 | **+17.5%** |
     | uncached input      | 23,266   | 32,133  | +38.1%     |
     | output              | 4,897    | 4,076   | **−16.8%** |
     | cost @ $2/$10 intro | $0.1340  | $0.1489 | +11.1%     |

     **+947 input tokens per coached pick**, of which ~296 is uncached. A
     pre-run estimate of +230 was wrong by 4x: it counted only the rules text on
     the ~6 cards a pick shows, and missed that the system prompt grew too and is
     re-read on every call (at 0.1x, but every call). Output FELL, which pays
     back about a third of the input cost — a coach that can see the card says
     less about it.

     Accuracy held: 0 invented citations of 75, 0 empty answers, 0 truncated, 21
     distinct principles both runs.

     Two caveats. The baseline is 2026-07-30, so it spans the whole Aug 3 scoring
     phase as well as this change; a static comparison on one fixed pick puts
     roughly three quarters of the prompt growth on this change and a quarter on
     that phase. And `bench-llm` now exits 1 on it — that is the regression gate
     working, not a failure. **Regenerate with `--update-baseline` before reading
     any future run**, or every one of them fails against a prompt that no longer
     exists.

   - **A dashboard / live query over accumulated `llmUsage`.** The table is
     written from the first pass; nothing reads it yet except the benchmark
     harness filtering by session. Needs prod traffic to be worth building.
   - **The verdict prompt asks for 2-4 sentences and gets ~6x that.** First
     measured run against `claude-sonnet-5` (2026-07-28, fdn/TradDraft seed 42):
     17 of 30 verdicts hit the 1024-token ceiling exactly and returned nothing,
     and the 13 that fit averaged ~615 output tokens for three fields the schema
     describes as a sentence or two each. Raising the ceiling to 2048 took that
     to 5 of 30, and the 25 that now fit average ~1,016 output tokens — about
     ten times the length asked for. The ceiling bought correctness and nothing
     else; raising it again would just buy the verbosity more room.

     Verdict output is the single largest output line in the budget — 25.4k of
     the run's 30.8k output tokens — so tightening `VERDICT_SCHEMA`'s field
     descriptions, or giving the model a length budget it will actually respect,
     is the first real saving available. It is also exactly the change the
     quality metrics exist to police: shorter is only better if divergence rate,
     citation density and breadth hold. Regenerate the baseline first, change
     the prompt second, compare third.

Separate track: the **review features** in "Deferred" above (alternate draft
lines, review-quiz trend tracking) and the archetype quiz (Ideas #1) — unrelated
to the data work.

# Measurement traps worth not falling into twice:

1. **`trophyPickRate` cannot be fitted against.** It is the pick rate among 3-0
   drafters and is the only decision-level ground truth we hold, which makes it
   the obvious objective for a pick scorer — and it is nearly circular with
   `maindeckRate`. Maindeck rate ALONE ranks trophy picks at rho 0.90, against
   0.81 for the card value being improved. A weight search against it duly found
   +0.12 held-out, which is not a better scorer but one that has learned to
   predict one drafter behaviour from another. Use it as a CONSTRAINT — it
   catches a wrong sign or a wrong shape, and did both — never as a target.
2. **A fixture with no gaps hides a whole class of bug.** `splashCost` paid a
   card 1.5pp to add a colour, because a width nobody drafted falls back to the
   format's own rate, which is higher than a measured wider archetype. Every
   test fixture had contiguous archetype widths; the real data had a hole. Found
   by reading a stored pick.
3. **Most of the gaps a pick is graded on are smaller than the error bars on the
   win rates they came from.** A GIH WR is a proportion over `gihGames`, so it
   carries a standard error of sqrt(p(1-p)/n), and a difference of two carries
   the sum of their variances — about **±1pp between two well-sampled commons**,
   against a `winRateGapK` of 750 that turns 1pp into 7.5 points of grade. A 94
   and a 100 can be the same pick. `gapMargin` computes it and the coach prompt
   states it, because a scorer that reports a difference the data cannot resolve,
   with no error bar beside it, gets believed. One sigma deliberately: two would
   call nearly every pick in the format a tie.
4. **A test that cannot fail reads as coverage.** Both the replay corpus and the
   value fingerprint were written with input batteries that could not have
   noticed the change they existed to catch — every ALSA value sat at the nudge's
   pivot or past its clamp. Perturb the thing under test and watch the guard go
   red before trusting it.

# Deferred trade-offs (revisit when the premise changes):

1. **The draft board no longer live-syncs — and it is now cheap enough to
   reconsider.** `DraftBoard.tsx` used to hold `useQuery(api.draft.state)` open
   for the whole draft. Answering that query replays the session, which then read
   the ~240KB pool, and every pick patches `draftSessions` and so invalidated it
   — meaning each pick paid for that read twice, once in the mutation and once in
   the re-run query. It now loads the board once and advances it from what `pick`
   already returns.

   That is only sound because a draft is single-player and nothing but this
   component ever changes the board. **A shared pod, a spectator view, or
   drafting from two devices needs a subscription back.**

   **The premise has changed.** `draft.state` is 45KB, not 240KB, since the pool
   split — so naively restoring the subscription now costs ~45KB per pick rather
   than 240KB. That is roughly doubling the pick path (1.9MB → 3.8MB per draft),
   which is affordable but not free, and it buys tab-sync for a single player
   who is unlikely to have two tabs open.

   The shape that would keep both is unchanged and still better: subscribe to
   something small and derived (a pick counter, or a session revision number) and
   fetch the board only when that moves. Invalidation then costs a cheap read
   instead of a whole board. Same principle as `setStatsMeta` — if a value is
   only there to be watched or compared, it belongs on a row small enough to read
   often.

2. **`llmUsage` stores raw rows with no rollup — revisit when prod volume makes
   a full-table read expensive.** Every model call appends one ~150-byte row.
   That is nothing next to the ~240KB documents that drained the tier, so
   aggregating at read time is free at current volume and a rollup cron would be
   moving parts bought against a cost that does not exist yet.

   The premise changes when months of real traffic accumulate: "total tokens
   ever" then reads every row, which is exactly the `sets.list` pattern. At that
   point fold raw rows into daily per-area totals and prune the raw rows on a
   retention window. The benchmark harness is unaffected either way — it filters
   by `runId` and only ever reads one run.

3. **`draftPicks.defense` is declared on `main` with no reader and no writer, and
   has an expiry.** Added 2026-08-05. Convex validates stored documents on push,
   so once the `draft-v2` branch has written a pick carrying `defense`, pushing a
   schema that has never heard of the field fails against those rows — and `main`
   is exactly what you fall back to when the experiment is not what you want to
   run. Declaring the field on both sides is what lets one local deployment serve
   both without a wipe between every switch.

   This is convenience with a deadline, and it was taken knowingly. **The premise
   changes the moment `draft-v2` is judged**, in one of two directions:
   - **Adopted** — the field grows real readers and writers, and this note goes
     away because there is nothing left to explain.
   - **Rejected** — `defense`, `pickDefense` and `confidence` come out of
     `validators.ts` and `schema.ts`, and the user tables get wiped (they are
     disposable). A schema is a claim about what the data means, and a field
     nothing has ever written is a false one.

   The failure mode this note exists to prevent is the third direction: nobody
   decides, the field sits there for a year, and the next person to read the
   schema assumes it is load-bearing and builds on it. If `draft-v2` is still
   undecided when you next read this, that is the thing to fix.

# Decisions worth not re-litigating:

The architecture, the data pipeline and the deploy story are all documented in
`README.md`; only the decisions that document a road **not** taken live here.

1. **Ingestion refuses to overwrite rated data with unrated data** — a guard
   against a re-ingest that comes back all-null (a brand-new set, or an upstream
   hiccup) wiping a good snapshot.
2. **No Convex auth component and no `users` table.** WorkOS AuthKit issues
   RS256 JWTs that Convex validates directly against WorkOS' JWKS
   (`convex/auth.config.ts`). `draft.ts` only ever needs an opaque owner key and
   `identity.tokenIdentifier` already is one, so a user row would be dead weight
   and a sync webhook would be a second thing to keep correct.
3. **A set's storage shape is chosen per reader, not once for the set.** Convex
   bills the bytes a function moves and charges for the whole document it
   retrieved, so the question is never "document or table" in the abstract — it
   is what each reader asks for.
   - `sets` (~433 bytes) — what a listing needs. Split out because the set
     picker was reading the whole pool to render a name.
   - `setCards` (~46KB) — **one document**, because dealing a pack samples every
     rarity pool. The engine always wants all of it, so a per-card table would
     only add per-row overhead to a read it was going to do anyway.
   - `setCardText` — **one row per card**, because its readers want subsets.
     `buildPickContext` describes the card taken and the four best it passed, so
     the coach reads five rows (~3.5KB) where a blob would be ~180KB.

   The two shapes are the same decision applied to different access patterns,
   and getting it backwards either way is expensive. The one place the row shape
   loses is `review.load`, which wants every pack of the draft and so pays ~13%
   row overhead — accepted, it runs once per review.

   Ingestion still refuses anything over 900KB against the 1MB limit.

   Measured 2026-07-29: 22.70MB → 2.98MB of database I/O per draft + review.
   `pnpm bench-io` is the harness; it wraps the real functions and reads their
   transaction metrics, so it measures what ships rather than a model of it.
   `npx convex insights` will never show this — it reports problem classes, and
   a 240KB read through a perfect index is healthy by its definition.

4. **Persisting the board was considered and rejected.** Having `draft.pick`
   advance a stored board instead of replaying was the headline of the I/O plan,
   and the pool split above ate its value: a board row averages ~11KB against
   the 46KB pool it would replace, and has to be rewritten on every pick. That
   is ~1.65x for the one change that carries real divergence risk — a stored
   board must advance bit-identically to replay, forever, or drafts silently
   diverge. The premise changes only if the pool grows a lot; it shrank.
5. **`outputFileTracingRoot` must stay set** in `apps/web/next.config.ts`. Next
   traces from the project directory by default, and under pnpm 652 of the 653
   files in `next-server.js.nft.json` resolve outside `apps/web`.
6. **A `next.config.ts` that reads the backend's `.env.local` was tried and
   reverted.** Shipped code reaching into a sibling package's gitignored file,
   to save three lines set once, is a worse trade than the duplication. Convex's
   own schema documents `localEnvVars` as writing "to the local `.env` file"
   with no path option, so `convex dev` cannot populate the Next app's file.
7. **Do not add a task-level `env` key to `turbo.json`** — it _replaces_ rather
   than merges with `globalEnv` and has already silently dropped a variable
   once. Verified with `turbo run build --dry=json`.
8. **What the score reads, and what it deliberately does not.** `cardValue` is
   frozen: bots pick by it, so it decides the deal, and every context-dependent
   judgement lives in `contextValue` instead where it can change without
   stranding a draft. Three terms, none tuned — archetype fit and splash cost
   are measured win rates carried in their own units, and the trust correction
   is one-sided because self-selection flatters in one direction only.

   **Speed and IWD are stored and not scored, each for a stated reason.** Speed
   is genuinely orthogonal to win rate (corr 0.022) but its SIGN depends on how
   fast the format is, which needs the replay dataset. IWD has a sound
   measurement argument and no derivable weight — the first attempt took 0.37
   from `1 - corr^2`, and how redundant a signal is says nothing about how far
   it should move an answer. A term whose magnitude cannot be justified does not
   belong in the score.

   **A gap is never reported without its margin, and nothing labels a card
   "better" without one** (2026-08-04). See measurement trap #3: at 17Lands
   sample sizes the error bars are wider than most of the gaps being graded, so
   both the coach prompt and the verdict panel state the gap and its margin, and
   the panel says "Graded against" rather than "Better for your deck" — which
   asserted exactly what the margin exists to deny.

9. **Every card written into a prompt carries its rules text, and the model is
   told the page beats its own recall** (2026-08-04). This looks like an easy
   token saving and is not one. Without it the coach has a type line and a name,
   and a type line cannot say whether a card kills something — so it answers from
   the NAME, which is how it came to tell a player their removal spell "isn't
   removal" and call a five-colour mana rock "a generic mid-range artifact". The
   sets this app is most useful for are the ones released after a model's
   training data, which is exactly where recall is worst. Cost is measured and
   noted under roadmap #4; reminder text is stripped because it restates
   keywords the model already knows.

10. **A surface that shows a "best" card shows `contextBest`.** The grade,
    `isBest` and the missed-picks filter all key off it, and this has now been
    got wrong twice in three different places — the biggest-misses table
    (c00fc81), then the live draft panel and `explainPick`. Showing `rawBest`
    under a grade computed against `contextBest` produces rows that name the same
    card twice with a 0.0 gap. `rawBest` is worth showing only when it is a
    THIRD card, where the divergence is the lesson.

    **A basic land is worth 0**, which is not a knob: you are handed as many as
    you want when you build, so taking one adds nothing you did not already have.

11. **The commitment stage argues with you, and does not let you take the
    argument back** (2026-08-05, draft-v2). Three rulings from one report:
    - **No edit button on the reason once the challenger is on screen.** The
      sentence is the one piece of evidence in this app only a model can read,
      and it is worth that precisely because it was written before anything was
      revealed. An edit field after the reveal collects a rationalisation and
      stores it in the same slot, which is worse than collecting nothing.
      `StateYourCase` has its back button; `TheChallenge` deliberately has none.
    - **The deck stays visible.** The stage stops at `[data-preview-edge]` — the
      board's side rail, the same wall the hover preview already respects —
      because "is this better than what I have" cannot be answered by a player
      who has to dismiss the question to see their pool.
    - **And is inert while it is.** Benching a card from the rail mid-challenge
      moves `committedColors` under a challenge computed against the old pool.
      The reveal catches that as a browser/server disagreement and answers by
      saying nothing at all, so the visible rail must not also be a live one.

12. **The uncaught `AI_NoOutputGeneratedError` on a failed coach stream is
    cosmetic and stays.** Convex kills the request on an unhandled rejection and
    discards the response body with it, so a no-output stream returned
    200-with-nothing and both clients rendered a blank panel. Fixed 2026-07-30 by
    treating an empty 200 as the coach being unavailable, in each client's own
    `coach.ts` (`apps/web/app/lib`, `apps/cli/src/core/tutor`) — the seam exists
    in the web client so this decision is testable there too, and both tests stub
    the response and spend nothing. The log line
    itself is not reachable from our side: `.catch()` on all 21 public result
    promises, on the 5 private `DelayedPromise` slots, and patching
    `DelayedPromise.reject` outright all failed to defuse it, nothing in our stack
    ever awaits it, and Convex fires no `unhandledrejection`. Still present in ai
    7.0.42. Only `generateText` would fix it — **rejected**, token-by-token
    streaming is worth more than a clean log. Reproduce by pointing `LLM_MODEL` at
    a model that does not exist.

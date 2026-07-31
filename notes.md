# Issues:

0. We gotta figure out how to handle rendering certain types of cards that are 2-in-one. (This relates to the "Adventure" issue below.)
   - It'd be nice to have a helpful tool-tip (like the Haste, Trample, etc) for Adventures and Omens and sub-cards of that variety.
   - It'd also be awesome to have double-sided cards have an additional enlarged popup on hover showing the backside.
   - I don't know if there are other card types/varieties that fit this shape but let's be thorough.

1. Here are some missing keyword-type words that I feel should have the side-popup with more info (like Haste, Trample, etc already do):

- "Adventure" sub-card/split-card type (see: "Picklock Prankster")
- Bargain
- Storm
- Backup

2. It seems like the coach does a bad job of encouraging/noticing themes/synergies between chosen cards and the latest pick the user just chose.
   (`setStats.synergies` is computed and stored and read by nothing — it is the
   data that would fix this.)

3. **"Best pick" is decided by data alone, and the interesting answer needs the
   model.** `scorePick` ranks a pack by `cardValue` and calls the top card the
   best — pure 17Lands win rate, blind to what is already in your pool. The
   review then has a second, better idea of best: the **context-best**, the card
   that serves _this_ deck, and the lesson the whole feature is built around is
   the gap between the two.

   The problem is that context-best only exists after a model call, so nothing
   can filter, sort or flag picks by it up front. Concretely: the missed-picks
   report has to filter on `isBest` (did you take the data's top card), which
   silently drops every pick where you took the raw best and the coach would
   still have taken something else — exactly the divergence worth teaching.

   What would fix it is a deterministic context-aware value: `cardValue` reading
   the archetype splits and synergies we already own, so scoring knows your
   colours. That is roadmap #1 (`archetype-aware-scoring`) — this is a second
   reason to do it, and the place it would pay off beyond scoring. Until then
   `isBest` is the honest proxy and the report is named for what it actually
   shows.

4. **Re-ingesting a set strands every draft taken against the old data.** A
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

5. The scoring heuristic feels superficial. This was one of the first things vibe-coded on this app. We have so much data and stats now. There has gotta be more interesting ways to give a score that's more perceptive. We should look into what we have available to us and come up with some interesting, accurate, dynamic scoring heuristics - with pros/cons.

6. We should create a favicon/logo for the app!
   - Minimalist + cute + easy to see at a glance.

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

1. **`archetype-aware-scoring`** — consume the archetype splits + synergies we
   now own (`setStats.archetypes` / `.synergies`, read by nothing in scoring
   yet) so `cardValue`/scoring rates a card by how good it is _in your colours_,
   and surface the metrics we compute but never show (trap warnings from
   `maindeckRate`, synergy hints, archetype fit in explanations). Highest value;
   data is validated and live. `cardValue` (`core/scoring/value.ts`) is the
   single tuning point — and it takes a bare `Card`, so this is a signature
   change that ripples to bots and the deck builder for free.

   The one real obstacle: `archetypes` lives on `setStats`, which the draft hot
   path deliberately never reads (a 270KB document kept off the per-pick path).
   Either denormalize the splits onto the cards in `setCards` the way
   `rarityBaseline` already is, or thread a set-level context through
   `cardValue` — the former keeps every existing call site working.

   **That question is now settled in favour of denormalizing.** 2026-07-28 put
   `iwd` and `maindeckRate` on `setCards` the same way, measured at +5-6% on the
   document (~13KB/set) and confirmed harmless to existing sessions — a re-ingest
   left the replayed deal byte-identical, because the deal depends only on pool
   membership, order and `packRate`. Archetype splits are a bigger payload than
   two scalars per card (~119KB/set unpruned), so they need pruning to the set's
   real archetypes before they go the same way, but the pattern and the cost
   model are established. `sets.ts` `ingest` has the denormalise loop; add to it.

   Note the display and prompt work is already done: `core/tutor/cardLine.ts`
   renders a card's stat line for both prompt builders and the CLI, and
   `web/app/components/CardStats.tsx` is the hover panel. Archetype fit is a new
   row in each, not new plumbing.

2. **`deck-builder`** — replace the `DECK` 23-spell/17-land convention with real
   winning-deck land counts & curves from the data. `core/draft/deck.ts`; `DECK`
   in `core/config.ts` is the single tuning point. Small, self-contained.
3. **`human-bots`** — fit bot picks to the 438k real human picks in the draft
   data (needs a new draft-data pass) instead of greedy `cardValue` + colour
   bias, so signals/wheeling feel like a real pod. `core/draft/bots.ts` is still
   `cardValue + colorBias + noise`. Same data pass as Ideas #6.
4. **`mulligan-trainer`** — the unused **replay** dataset → a keep/mull practice
   mode + format-speed metrics (see Ideas #2). Biggest, most independent; last.
   This is what would re-tighten the availability gate to require replay
   (`USED_KINDS` in `scripts/lib/datasets.mjs`).

5. **Follow-ups to token metrics** (spec:
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
8. **The uncaught `AI_NoOutputGeneratedError` on a failed coach stream is
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

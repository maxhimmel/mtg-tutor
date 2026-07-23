# Issues:

1. The suggested decks have incorrect spell counts when including the Evolving Wilds/multi-colored lands. Those 2 card types should detract from the 17-lands count.

2. I did a draft and went wide with my color choices because I was focusing on dragon synergies, but it kept complaining that I should solidify my color choice.

3. ~~17Lands returns empty stats for rotated sets~~ — **fixed 2026-07-23; the
   diagnosis was wrong.** Not rotation: we called a legacy endpoint
   (`/card_ratings/data?format=`) instead of `/api/card_data?event_type=`, which
   serves every set back to 2020. See "Own the draft data" below and the
   `issue-3-ratings-real-cause` / `17lands-data-sources` memories.

4. ~~17Lands and Scryfall disagree on some set codes~~ — **fixed 2026-07-23; also
   misdiagnosed.** The blocker was the `is:booster` Scryfall filter (unset on Play
   Booster sets), not set codes; no mapping table needed. See "Own the draft data"
   below and the `play-booster-pack-model` memory.

# Ideas:

1. A quiz on what card a certain mono-colored card could/should belong to.

- Ex. This Red card belongs in a Boros deck because ... <x,y,z>.
- The important bit is that it'd teach me what the archetypes even are, and what monocolored cards fit the type to belong in that archetype.

2. **The replay dataset is deliberately unused — revisit it later.** 17Lands
   publishes three public datasets per set/format; the stats pipeline pulls only
   **draft** and **game**. Replay is the third and by far the largest (431MB
   gzipped for FIN, vs 90-206MB draft and 26-62MB game), and nothing we compute
   today needs it, so downloading it would triple the pipeline's cost for zero
   current gain.

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
     measured rather than assumed. Relevant to Issue #1 above.
   - **Gameplay coaching** (attacks, blocks, tempo) — the weakest fit. This is a
     *draft* tutor; per-turn play coaching is a different product, and the data
     existing is not a reason to build it.

   If we do pick this up: the pipeline already streams gzip and never keeps raw
   files, so adding replay is a new derivation pass, not new infrastructure.

# Deferred (from Draft Review grilling, 2026-07-21):

Out-of-scope for the Draft Review MVP, noted so we don't lose them:

1. Deep multi-ply permutation re-simulation (chess.com-style alternate lines —
   replay the whole draft down a different branch). The MVP stores the RNG seed
   specifically to keep this possible later without a retrofit.
2. Longitudinal review-quiz trend tracking (persist each quiz outcome + add stats
   panels showing judgment improvement over time). Natural 2nd iteration once the
   review loop feels right; MVP only shows a session score.
3. Standalone archetype quiz — see Ideas #1 above. Separate command / data model,
   not part of reviewing a draft.
4. ~~Keep review logic UI-agnostic in `core/` for an eventual React frontend~~ —
   done: `packages/core` is now a dependency-free package (see below). The
   decision-pick threshold (`REVIEW.decisionPickMinCards`) lives there and is
   still not user-adjustable; exposing it as a slider is the remaining half.

# Web platform (done, 2026-07-21 to 2026-07-22, deployed):

Decisions worth not re-litigating:

1. **A draft session is stored as `{setCode, format, seed, pickedNames[]}` and
   nothing else.** No board state is persisted — every read replays. Measured
   against real set data: replaying a finished 45-pick draft is 0.16ms, and all
   45 incremental replays together are 3.7ms, i.e. noise next to a network round
   trip. This is why Deferred #1 (alternate lines) is now nearly free.
2. **One Convex document per set, not a per-card table.** Real sets serialize to
   126-164KB against a 1MB document limit, so a draft mutation reads exactly one
   document. Ingestion refuses anything over 900KB rather than silently failing.
3. **Ingestion refuses to overwrite rated data with unrated data** — a guard
   against a re-ingest that comes back all-null (a brand-new set, or an upstream
   hiccup) wiping a good snapshot. (Originally framed around Issue #3's "rotation"
   theory, since disproven; the guard stands on its own.)
4. **The CLI stays a peer client, not a legacy shim.** Both it and the web app
   drive the same Convex functions, so a feature can't ship to one and skip the
   other. Cost: the CLI needs a running deployment.
5. **`packages/core` must stay dependency-free** — no `node:*`, no runtime deps —
   so the same code runs in Node, Convex's V8 runtime, and the browser. Enforced
   by `scripts/check-purity.ts` in the package's test script.
6. **No Convex auth component and no `users` table.** WorkOS AuthKit issues
   RS256 JWTs that Convex validates directly against WorkOS' JWKS
   (`convex/auth.config.ts`). `draft.ts` only ever needs an opaque owner key and
   `identity.tokenIdentifier` already is one, so a user row would be dead weight
   and a sync webhook would be a second thing to keep correct.
7. **The ownership check lives in `loadBoard`, not in each function.** Every
   session read and write funnels through it, so one check covers `state`,
   `pick`, `results`, `save`, and `coachContext`. Adding a function that reaches
   into `draftSessions` without going through `loadBoard` is the way this
   regresses.

Open / unfinished (completed items dropped):

1. **`@anthropic-ai/sdk` does not work in Convex's V8 runtime** — it imports
   `node:fs` in its credential loader, and `convex/http.ts` can't opt into
   `"use node"` because HTTP actions are V8-only. The coach endpoint therefore
   calls the Messages API with raw `fetch` and parses the SSE `text_delta`
   events itself. If an action ever *does* need the SDK, it has to live in a
   separate `"use node"` file and can't be an HTTP action.
   Gotcha found while building it: a `ReadableStream` that drains the upstream
   body from `pull()` delivers the whole body but **never terminates** — the
   client hangs with the response already in hand. Pumping to completion inside
   `start()` closes it properly. Verified end to end: first byte ~1.1s, full
   response ~3.2s.
2. Review and stats remain CLI-only *surfaces*, but their logic is now backend
   functions (`convex/review.ts`, `convex/stats.ts`), so a web version is a UI
   job rather than a port. The review quiz has no web equivalent yet.
3. **Headless runs need a token.** `smoke-draft.mjs` cannot talk to the draft
   functions anonymously. It takes `MTG_TUTOR_TOKEN`, or mints one via the
   WorkOS password grant from `SMOKE_EMAIL`/`SMOKE_PASSWORD` plus the
   deployment's `WORKOS_CLIENT_ID`/`WORKOS_API_KEY` — which only works if the
   environment has password auth enabled. Now that the device flow exists it
   could instead read `~/.mtg-tutor/credentials.json`.
4. **Three WorkOS values are copied by hand from `packages/backend/.env.local`
   into `apps/web/.env.local`, and that is as good as it gets.** Convex's own
   schema (`convex/schemas/convex.schema.json`) documents `localEnvVars` as
   *"writes the given mapping to the local `.env` file"* with **no path option**,
   so `convex dev` cannot populate the Next app's file. A `next.config.ts` that
   read the backend's `.env.local` was tried and reverted: shipped code reaching
   into a sibling package's gitignored file, to save three lines set once, is a
   worse trade than the duplication. Re-provisioning AuthKit means updating both
   files.
5. **Env vars cross four boundaries and three of them fail silently** — Vercel
   project scoping, Turborepo strict mode, and Next's `NEXT_PUBLIC_` inlining
   all drop what they were not told about, and only Convex's deployment env
   errors loudly. Three deploys broke on this. The countermeasures now in place:
   `apps/web/app/env.ts` validates at build start, and `turbo.json` declares in
   `globalEnv` rather than per-task (a task-level `env` *replaces* the general
   list — verified with `turbo run build --dry=json`). Do not add a task-level
   `env` key; put it in `globalEnv`.
6. **`outputFileTracingRoot` must stay set** in `apps/web/next.config.ts`. Next
   traces from the project directory by default, and under pnpm 652 of the 653
   files in `next-server.js.nft.json` resolve outside `apps/web`.
7. **Draft sessions created before auth have `userId: undefined` and are now
   unreachable.** The schema still allows the field to be absent so those rows
   validate; nothing can read them. Only dev data, but it is why the field is
   optional rather than required.

# Own the draft data (done 2026-07-23, merged to main, NOT pushed/deployed):

Six phases landed on `main` (umbrella `own-draft-data`, `--no-ff`, branches
deleted). The app now scores on statistics we derive ourselves from the 17Lands
**public datasets** (the sanctioned source), deals boosters that match how sets
really open (bonus sheets + land slot + observed shapes), and makes **no 17Lands
API call at runtime** — the API survives only as a testing oracle
(`pnpm validate-set-stats`). SOS and TDM ship with committed stats artifacts,
validated vs the API at Spearman 0.92–0.93. Details live in the
`set-stats-pipeline`, `play-booster-pack-model`, and `17lands-data-sources`
auto-memories. Issues #3 and #4 above were fixed here (both were misdiagnosed).

## Un-actioned: production deploy

`main` is merged but **not pushed and prod is not seeded**. Vercel's build runs
`convex deploy`, so a push ships schema+functions to prod Convex — but prod has
its own DB: the `setStats` table is empty and `sets:ingest` now *requires* seeded
stats. After pushing, on prod:

```
cd packages/backend && node scripts/seed-set-stats.mjs --prod
pnpm --filter @mtg-tutor/backend exec convex run sets:ingest '{"setCode":"sos","format":"TradDraft"}' --prod
# repeat for tdm
```

Any set already on prod (e.g. `fdn`) stays listed on old data until its stats are
built+seeded. The deploy is non-breaking: a schema-validation failure fails the
Vercel build and keeps the old site up.

## Follow-up roadmap (compressed; pick per future session)

Ordered by value × readiness. Each is a candidate feature branch.

1. **`archetype-aware-scoring`** — consume the archetype splits + synergies we
   now own (in `setStats`, read by nothing yet) so `cardValue`/scoring rates a
   card by how good it is *in your colours*, and surface the metrics we compute
   but never show (trap warnings from `maindeckRate`, synergy hints, archetype
   fit in explanations). **Fixes Issue #2.** Highest value; data is validated and
   live. `cardValue` (`core/scoring/value.ts`) is the single tuning point.
2. **`deck-builder`** — fix **Issue #1** (Evolving Wilds / multi-colour lands
   miscounted vs the 17-land target) and replace hardcoded 17-land/23-spell with
   real winning-deck land counts & curves from the data. `core/draft/deck.ts`.
   Small, self-contained.
3. **`bulk-ingestion`** — a loop over the availability gate + build + seed +
   ingest so the app ships with real data for a dozen sets, not two. Building
   blocks (gate, validate) exist. This is also when a pre-existing stale prod set
   gets rebuilt.
4. **`human-bots`** — fit bot picks to the 438k real human picks in the draft
   data (needs a new draft-data pass) instead of greedy `cardValue` + colour
   bias, so signals/wheeling feel like a real pod. `core/draft/bots.ts`.
5. **`mulligan-trainer`** — the unused **replay** dataset → a keep/mull practice
   mode + format-speed metrics (see Ideas #2). Biggest, most independent; last.
   This is what would re-tighten the availability gate to require replay
   (`USED_KINDS` in `scripts/lib/datasets.mjs`).

Separate track: the **review features** already in "Deferred" above (alternate
draft lines, review-quiz trend tracking) and the archetype quiz (Ideas #1) —
unrelated to the data work.

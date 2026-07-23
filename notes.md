# Issues:

1. The suggested decks have incorrect spell counts when including the Evolving Wilds/multi-colored lands. Those 2 card types should detract from the 17-lands count.

2. I did a draft and went wide with my color choices because I was focusing on dragon synergies, but it kept complaining that I should solidify my color choice.

3. ~~**17Lands `card_ratings` returns empty stats for rotated sets**~~ — **fixed
   2026-07-23. The original diagnosis was wrong.** Rotation had nothing to do with
   it: we were calling a legacy endpoint with a legacy parameter name.

   | | was | now |
   |---|---|---|
   | endpoint | `/card_ratings/data` | `/api/card_data` |
   | format param | `format=` | `event_type=` |
   | response | bare array | `{copyright, notes, data:[…]}` |

   ```
   /card_ratings/data?expansion=SOS&format=TradDraft  -> 341 cards,   0 rated
   /api/card_data?expansion=SOS&event_type=TradDraft  -> 341 cards, 297 rated, 4.3M games
   ```

   Every set works, back to 2020 — STX returns 332/338 rated, ZNR 253, DSK 272,
   FIN 348. The legacy endpoint only appeared to work for live queues because it
   suppresses any card under `ever_drawn_game_count >= 500`, and the live slice is
   small; DSK's 5 rated cards were n=526/579/585/546/506 against top-unrated
   489/475/470/464.

   Two things hid this for two days. `sets.ts` was already **half-migrated** — the
   neighbouring `color_ratings` call used `event_type=` correctly, so the file
   looked current. And both fetches ended in `.catch(() => [])`, turning a wrong
   URL into "this set has no ratings" instead of an error. The ratings fetch now
   throws, and `verify-data` fails when a set returns cards but zero rated cards.

   Also confirmed inert: `start_date`/`end_date` do nothing on these endpoints
   (MSH restricted to 2020 returns byte-identical totals to no-dates). The real
   params, per 17Lands' own JS bundle, are `start`/`end`/`time_period`. That is why
   the earlier "tested 2019->today, all zeros" check came back clean and misled us.

   The impact statement stands and is why this mattered: a real FDN draft scored
   **97.1/100 with 24% best-pick accuracy and zero missed picks**, because
   rarity-only values sit too close together for a wrong pick to cost anything.

   Bonus found on the working endpoint: `user_group=top|middle|bottom` segments
   ratings by player skill, and the payload carries IWD, OH WR, GD WR, GND WR,
   `play_rate` and `pool_count` — none of which the `Card` model reads yet.

4. ~~**17Lands and Scryfall disagree on some set codes.**~~ — **mostly fixed
   2026-07-23, and again the diagnosis was wrong.** The blocker was not set
   codes: it was the `is:booster` filter on the Scryfall query. Scryfall does not
   set that flag for Play Booster sets, so `set:sos is:booster` 404s while
   `set:sos` returns 271 cards. Dropping the filter makes SOS ingest.

   Fixing it properly meant modelling what is actually in a booster. SOS packs
   draw from three sets — `sos` (271) + `soa` Mystical Archive (65) + `spg`
   Special Guests (10) = the 346 cards 17Lands tracks. `spg` is shared across
   sets and is **not** a Scryfall child of `sos`, so no parent/child mapping
   finds it; ingestion searches the set plus everything Arena-legal released on
   the set's release date, then keeps only what 17Lands lists (plus basics).
   Verified: `sets:ingest` for SOS returns exactly 346 cards, 297 rated.

   **No code-mapping table is needed.** `MSH` was the original example of "a
   valid 17Lands expansion but not a Scryfall set code"; it ingests fine once
   `is:booster` is gone — 339 cards, 285 rated. The two services never disagreed
   about the code.

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
3. **Ingestion refuses to overwrite rated data with unrated data**, which turns
   Issue #3 above into something the architecture absorbs: ingest a set while
   it's live and Convex holds that snapshot after it rotates out.
4. **The CLI stays a peer client, not a legacy shim.** Both it and the web app
   drive the same Convex functions, so a feature can't ship to one and skip the
   other. Cost: the CLI will need a running deployment (see Open #3).
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

Open / unfinished:

1. ~~Convex backend has never run~~ — done. A full 45-pick draft now runs through
   the deployed functions (`pnpm --filter @mtg-tutor/backend smoke-draft`), art
   URLs survive the round trip, and re-reading a session replays to an identical
   pool. ~128ms per pick round trip against the dev deployment.
2. **`@anthropic-ai/sdk` does not work in Convex's V8 runtime** — it imports
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
3. ~~CLI still runs on local SQLite and its own file cache~~ — done. The CLI
   authenticates with the WorkOS device authorization grant (`mtg-tutor login`,
   tokens in `~/.mtg-tutor/credentials.json` at mode 0600) and drives Convex for
   draft, review and stats. `db.ts`, `data/`, the local Anthropic client and both
   local tutor modules are deleted; the CLI now holds no database, no API key and
   no set data. It needs `convex dev` running or a deployed backend — real
   friction, accepted deliberately.
4. ~~`mulberry32.state()` is unused~~ — deleted. It existed to persist live RNG
   position on the session doc, for a derived-cache design the 0.16ms replay
   measurement retired before it shipped. `mulberry32` now returns a plain
   `() => number`; the `Rng` interface existed only to carry that method. The
   seed itself is untouched and remains the basis of the whole session model.
5. Review and stats remain CLI-only *surfaces*, but their logic is now backend
   functions (`convex/review.ts`, `convex/stats.ts`), so a web version is a UI
   job rather than a port. The review quiz has no web equivalent yet.
6. **Headless runs need a token.** `smoke-draft.mjs` cannot talk to the draft
   functions anonymously. It takes `MTG_TUTOR_TOKEN`, or mints one via the
   WorkOS password grant from `SMOKE_EMAIL`/`SMOKE_PASSWORD` plus the
   deployment's `WORKOS_CLIENT_ID`/`WORKOS_API_KEY` — which only works if the
   environment has password auth enabled. Now that the device flow exists it
   could instead read `~/.mtg-tutor/credentials.json`.
7. **Three WorkOS values are copied by hand from `packages/backend/.env.local`
   into `apps/web/.env.local`, and that is as good as it gets.** Convex's own
   schema (`convex/schemas/convex.schema.json`) documents `localEnvVars` as
   *"writes the given mapping to the local `.env` file"* with **no path option**,
   so `convex dev` cannot populate the Next app's file. A `next.config.ts` that
   read the backend's `.env.local` was tried and reverted: shipped code reaching
   into a sibling package's gitignored file, to save three lines set once, is a
   worse trade than the duplication. Re-provisioning AuthKit means updating both
   files.
8. **Env vars cross four boundaries and three of them fail silently** — Vercel
   project scoping, Turborepo strict mode, and Next's `NEXT_PUBLIC_` inlining
   all drop what they were not told about, and only Convex's deployment env
   errors loudly. Three deploys broke on this. The countermeasures now in place:
   `apps/web/app/env.ts` validates at build start, and `turbo.json` declares in
   `globalEnv` rather than per-task (a task-level `env` *replaces* the general
   list — verified with `turbo run build --dry=json`). Do not add a task-level
   `env` key; put it in `globalEnv`.
9. **`outputFileTracingRoot` must stay set** in `apps/web/next.config.ts`. Next
   traces from the project directory by default, and under pnpm 652 of the 653
   files in `next-server.js.nft.json` resolve outside `apps/web`.
10. **Draft sessions created before auth have `userId: undefined` and are now
   unreachable.** The schema still allows the field to be absent so those rows
   validate; nothing can read them. Only dev data, but it is why the field is
   optional rather than required.

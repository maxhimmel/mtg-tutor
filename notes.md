# Issues:

1. The suggested decks have incorrect spell counts when including the Evolving Wilds/multi-colored lands. Those 2 card types should detract from the 17-lands count.

2. I did a draft and went wide with my color choices because I was focusing on dragon synergies, but it kept complaining that I should solidify my color choice.

3. **17Lands `card_ratings` returns empty stats for rotated sets** (found 2026-07-21).
   The endpoint still returns the full card list, but every entry has
   `seen_count: 0`, `game_count: 0`, `ever_drawn_win_rate: null` — so ingestion
   silently falls back to `RARITY_BASELINE` for every card and scoring is
   rarity-only. Evidence from the old per-machine cache, by fetch date: BLB (Jul 2) and
   MH3 (Jul 6) have real data; WOE (Jul 8), MKM, TDM, FDN, DSK all have zero. MSH
   (a currently-running set) still returns data. So this looks like a 17Lands-side
   change around Jul 7-8 that stopped serving historical aggregates for sets no
   longer in rotation — not a date-range bug (tested no-params, the set's own
   release window, and 2019->today; all return zeros).
   Impact: practicing a *current* set still works; practicing older sets does not.
   Worse than "no feedback" — the feedback actively misleads. A real FDN draft
   scored **97.1/100 overall with 24% best-pick accuracy and zero missed picks
   listed**, despite 34 of 45 picks not being the top card: rarity-only values
   sit so close together that a wrong pick costs almost nothing, and the
   missed-picks list needs win rates to explain a miss so it stays empty. The
   web results view now says this outright instead of implying a good draft.
   Options to explore: 17Lands' public data downloads, a different endpoint/param,
   or caching a good snapshot per set before it rotates out.

4. **17Lands and Scryfall disagree on some set codes.** `MSH` is a valid 17Lands
   expansion but not a Scryfall set code, so `sets:ingest` for it throws
   `No Scryfall cards found`. Any set where the two services differ is
   undraftable — which is most of the sting of Issue #3, since a *currently
   rotating* set is exactly the one with usable win rates. Wants a small
   code-mapping table in `convex/sets.ts`.

# Ideas:

1. A quiz on what card a certain mono-colored card could/should belong to.

- Ex. This Red card belongs in a Boros deck because ... <x,y,z>.
- The important bit is that it'd teach me what the archetypes even are, and what monocolored cards fit the type to belong in that archetype.

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
4. `mulberry32.state()` was added to support a resumable-session design that the
   0.16ms replay measurement then retired. Phase 4 is now done and still nothing
   uses it — it is tested and harmless as PRNG API, but it should be deleted.
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

# mtg-tutor

An interactive CLI that helps you get better at drafting Magic: The Gathering. Simulate a full 8-person, 3-pack draft against bots, get every pick **scored and explained** against real-world [17Lands](https://www.17lands.com/) win-rate data, and track your progress over time.

## Why

Reading pick guides is passive. Improvement comes from **reps with objective feedback**. `mtg-tutor` gives you the reps (a full 45-pick draft), the objective feedback (each pick scored 0–100 vs the statistically best card still in the pack), the reasoning (why the better card was better — removal, win-rate gap, whether it wheels), and the long-term view (are your early picks strong but your late picks sloppy? do you commit to colors too slowly?).

## How it works

- **Ground truth = 17Lands.** Card quality comes from `ever_drawn_win_rate` (GIH WR) and `avg_seen` (ALSA), pulled live per set. Cards without enough data fall back to a rarity-based baseline.
- **Card pool = Scryfall.** The set's cards, types, mana costs, and rarities come from Scryfall; packs are generated from the rarity pools (1 rare/mythic, 3 uncommons, 11 commons per 15-card pack).
- **Bots draft against you.** Each of the 7 bots commits to colors as it picks, so signals flow and packs wheel realistically.
- **Everything is cached** under `~/.mtg-tutor/cache/` (24h TTL); stats are saved to a SQLite DB at `~/.mtg-tutor/stats.db`.

## Install

```bash
pnpm install
```

Requires Node 20+ and pnpm 10+.

## Usage

Each capability is a **service** you run by name with `pnpm <service>` from the repo root:

```bash
# Draft a set (set code, e.g. dsk, blb, otj, fdn)
pnpm draft dsk

# Specify a format (defaults to PremierDraft)
pnpm draft dsk PremierDraft

# See your progress, trends, and biggest recurring mistakes
pnpm stats
```

The unified `mtg-tutor` CLI dispatches to the same services (`pnpm dev draft dsk`, or the built binary below).

After building (`pnpm build`), the `mtg-tutor` binary works directly:

```bash
mtg-tutor draft dsk
mtg-tutor stats
```

During a draft, arrow-key through the pack (cards are pre-sorted by win rate with hints), press Enter to pick, and read the grade + reasoning after each pick. At the end you get an overall score, best-pick accuracy, a suggested 40-card deck, and your biggest missed picks — then choose whether to save the draft.

> **Note on set coverage:** scoring quality depends on how much 17Lands Premier Draft data a set has. Recent, heavily-played sets score best. If a set has little data, the CLI warns you and leans on rarity fallbacks.

## Development

```bash
pnpm test              # unit suites for every package (vitest, via turbo)
pnpm build             # build every package in dependency order
pnpm verify-data       # sanity-check the live 17Lands + Scryfall response shapes
pnpm smoke-draft fdn   # headless full-draft smoke test
```

Never run `next build` while `next dev` is running — they share `apps/web/.next`, and the build overwrites the dev server's bundle with one compiled under different env. The symptom is a page stuck on "Loading sets" with no error anywhere. Use `pnpm --filter @mtg-tutor/web typecheck` instead.

## Deployment

Vercel hosts the web app; Convex hosts the backend. The Vercel build deploys
both — `apps/web/vercel.json` runs `convex deploy` first and hands the resulting
deployment URL to `next build`, so the client can never be built against a stale
backend URL.

One-time setup, all of it in dashboards:

1. **AuthKit for production** — in the **Convex** dashboard, on the *production*
   deployment (not dev): **Settings → Integrations → WorkOS Authentication →
   create an AuthKit environment**. Copy the Client ID and API key it shows.

   Not in the WorkOS dashboard. Convex provisions AuthKit environments into a
   WorkOS team it manages, which your own WorkOS account cannot see — going to
   dashboard.workos.com instead lands you in your personal team, whose default
   Production environment has nothing to do with this project and cannot be
   selected for it.
2. **Convex** — on the same production deployment, generate a **Production**
   deploy key.
3. **Vercel** — new project from this repo, **Root Directory `apps/web`**. It
   picks up `vercel.json`, so leave the build command alone. Set:

   | Variable | Value |
   |---|---|
   | `CONVEX_DEPLOY_KEY` | the production deploy key from step 2 |
   | `WORKOS_CLIENT_ID` | production client id from step 1 |
   | `WORKOS_API_KEY` | production API key from step 1 |
   | `WORKOS_COOKIE_PASSWORD` | `openssl rand -base64 32` |
   | `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | `https://<your-domain>/callback` |

   `NEXT_PUBLIC_CONVEX_URL` is set by the build. Do not set it by hand.

   All of these are validated in `apps/web/app/env.ts`, so a missing one fails
   the build and names itself. Omitting `NEXT_PUBLIC_WORKOS_REDIRECT_URI` used
   to produce a green build and a 500 on every route.

4. **After the first deploy**, on the *production* Convex deployment:

   ```bash
   pnpm --filter @mtg-tutor/backend exec convex env set ANTHROPIC_API_KEY <key> --prod
   pnpm --filter @mtg-tutor/backend exec convex run sets:ingest '{"setCode":"fdn"}' --prod
   ```

   Coaching returns 503 until the key is set, and the set list is empty until a
   set is ingested — production has its own database, nothing carries over
   from dev.

The redirect URI, homepage URL, and CORS origins are registered with WorkOS
automatically from the `prod` block in `packages/backend/convex.json`, which
reads Vercel's `VERCEL_PROJECT_PRODUCTION_URL` at build time. The four variables
above still have to be set by hand: Convex only auto-provisions AuthKit for dev.

## Architecture

A pnpm + Turborepo monorepo. Domain logic lives in a **pure** package that any client can import; each app owns only its own transport and UI.

```
packages/
  core/                        @mtg-tutor/core -- ZERO runtime dependencies
    src/
      config.ts                pack structure, scoring constants, review thresholds
      model/                   unified Card model, name normalization, RecordedPick
      scoring/                 card value, pick scoring, explanations
      draft/                   pack generation, bots, engine, deck builder
      tutor/                   principles corpus + prompt builders
      util/rng.ts              seedable, serializable PRNG
    docs/                      principles corpus (YAML source + human companion)
    scripts/                   YAML -> TS codegen, purity check
apps/
  cli/                         @mtg-tutor/cli -- the terminal client
    src/
      cli.ts                   thin dispatcher -> services/*/run() (feeds the mtg-tutor bin)
      core/                    CLI-only concerns
        config.ts              runtime config (HTTP, cache TTL, Anthropic)
        env.ts                 the single boundary that reads process.env
        data/                  cache, Scryfall + 17Lands fetchers, merge layer
        db/                    SQLite persistence
        tutor/                 Anthropic-backed coach + review streaming
        ui/                    reusable @clack primitives (card/set pickers, formatting)
      services/
        draft/                 draft screen + entrypoint
        review/                review walkthrough + entrypoint
        stats/                 reporting queries + stats screen
  web/                         @mtg-tutor/web -- the Next.js client, the one with card art
    app/
      page.tsx                 set picker
      draft/[sessionId]/       the draft board
      callback|sign-in|sign-up WorkOS AuthKit route handlers
      providers.tsx            AuthKit session -> Convex identity bridge
    middleware.ts              redirects unauthenticated visitors to WorkOS
packages/
  backend/                     @mtg-tutor/backend -- Convex: the shared session store
    convex/
      schema.ts                sets, draftSessions, reviewVerdicts
      sets.ts                  Scryfall + 17Lands ingestion
      draft.ts                 start / state / pick / results / save
      http.ts                  the streaming coach endpoint
      auth.config.ts           validates WorkOS RS256 JWTs
```

**A draft session is `{setCode, format, seed, pickedNames[]}` and nothing else.** No board state is stored; every read replays the draft from the seed. A finished 45-pick draft replays in 0.16ms, which is noise next to the round trip that asked for it.

**Every session read and write goes through `loadBoard`.** It requires an identity and refuses sessions belonging to someone else, so ownership is enforced in one place rather than six. A new function that queries `draftSessions` directly is how that regresses.

**Environment variables have exactly one boundary per app.** `apps/cli/src/core/env.ts`
and `apps/web/app/env.ts` both use `@t3-oss/env-core` to validate the environment
against a schema; nothing else reads `process.env` directly. This matters more than it
looks: most of the variables the web app depends on are read *inside*
`@workos-inc/authkit-nextjs`, not in our code, so nothing in this repo reveals that they
are required and nothing fails at the point one goes missing. An unset
`NEXT_PUBLIC_WORKOS_REDIRECT_URI` once produced a green build and a 500 on every route.
`apps/web/next.config.ts` imports the schema so validation runs at the start of every
build.

Turborepo runs builds in strict env mode, so anything a build reads must also be declared
in `turbo.json` — in **`globalEnv`**, deliberately, because a task-level `env` key
*replaces* rather than merges and has already silently dropped a variable once.

**Some variables are set in two places, unavoidably.** `convex dev` provisions the WorkOS
credentials into `packages/backend/.env.local`; Convex's schema documents `localEnvVars`
as writing "to the local `.env` file" with no way to target another directory, and Next
only reads its own. So three values get copied into `apps/web/.env.local` once. In
production it is manual by design — the same schema permits only `localEnvVars: false`
for prod deployments: *"Prod deployments must configure environment variables directly in
the deployment platform."* Turborepo adds none of these; the list matches Convex's own
non-monorepo Next.js quickstart.

**Core must stay pure.** `@mtg-tutor/core` has no dependencies and imports no `node:*` builtins, so the exact same code runs in Node, in a server runtime, and in the browser. `pnpm --filter @mtg-tutor/core test` enforces this — `scripts/check-purity.ts` fails the build on any non-relative import.

**The principles corpus is generated, not read.** `docs/draft-principles.yaml` is the authored source; `scripts/generate-principles.ts` compiles it into `src/tutor/principles.generated.ts` so loading it needs no filesystem and no YAML parser at runtime. Edit the YAML, then run `pnpm --filter @mtg-tutor/core generate`.

**The service convention.** Each service exports `async function run(argv)` from its `index.ts`; a one-line `main.ts` is the `pnpm <service>` target, and `cli.ts` imports the same `run()` so the bin and `pnpm run` share one code path.

**Adding a service:**
1. `apps/cli/src/services/<name>/index.ts` exporting `async function run(argv: string[])`, plus a `main.ts` shim.
2. Add `"<name>": "tsx src/services/<name>/main.ts"` to `apps/cli/package.json`, and a root-level passthrough script.
3. Optionally add a `case "<name>"` in `cli.ts` for the unified bin.
4. Put anything UI-agnostic in `packages/core`, never the reverse — `core` must not import from an app.

Scoring, bots, and the deck builder all share one `cardValue()` function (`core/scoring`), so tuning card evaluation is a single-file change.

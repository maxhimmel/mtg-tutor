# mtg-tutor

An interactive CLI that helps you get better at drafting Magic: The Gathering. Simulate a full 8-person, 3-pack draft against bots, get every pick **scored and explained** against real-world [17Lands](https://www.17lands.com/) win-rate data, and track your progress over time.

## Why

Reading pick guides is passive. Improvement comes from **reps with objective feedback**. `mtg-tutor` gives you the reps (a full draft — 42 picks for a modern Play Booster set), the objective feedback (each pick scored 0–100 vs the statistically best card still in the pack), the reasoning (why the better card was better — removal, win-rate gap, whether it wheels), and the long-term view (are your early picks strong but your late picks sloppy? do you commit to colors too slowly?).

## How it works

- **Ground truth = our own data, derived from 17Lands' public datasets.** Card quality comes from GIH WR and ALSA that we compute ourselves from the [public draft/game datasets](https://www.17lands.com/public_datasets) — the source 17Lands sanctions for outside use — not from their live API. Cards without enough data fall back to a per-rarity baseline measured from the same set. The live API is kept only as a testing oracle (`pnpm validate-set-stats`), never a runtime dependency.
- **Card pool = Scryfall.** The set's cards, types, mana costs, and rarities come from Scryfall; packs are generated from the rarity pools (1 rare/mythic, 3 uncommons, 11 commons per 15-card pack).
- **Bots draft against you.** Each of the 7 bots commits to colors as it picks, so signals flow and packs wheel realistically.
- **Everything lives in Convex.** Set data is ingested once per set and shared across devices; drafts are stored against your account. The CLI and the web app are peer clients of the same backend — draft in the terminal, review it in the browser with card art.

## Install

```bash
pnpm install
pnpm login      # WorkOS device flow; opens a browser
```

Requires Node 20+ and pnpm 10+, plus a reachable Convex deployment: set
`CONVEX_URL` in `apps/cli/.env` (see `apps/cli/.env.example`). Because the CLI is
a peer client rather than a standalone tool, it needs `convex dev` running or a
deployed backend — deliberate, so a feature cannot ship to the web app and skip
the terminal.

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

> **Note on set coverage:** scoring quality depends on how much data a set has in the 17Lands public datasets. Recent, heavily-played sets score best. A set we haven't built stats for is scored on rarity baselines alone — which makes grades close to meaningless — and both clients say so rather than implying a good draft. (The datasets go back years, so this is a matter of which sets we've ingested, not of sets "aging out.")

## Development

```bash
pnpm test              # unit suites for every package (vitest, via turbo)
pnpm build             # build every package in dependency order
pnpm verify-data       # sanity-check the live 17Lands + Scryfall response shapes
pnpm smoke-draft fdn   # headless full-draft smoke test, against Convex
pnpm login             # sign in; the CLI needs a session to reach the backend
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

4. **After the first deploy**, on the *production* Convex deployment, set the
   coaching key (coaching returns 503 until it is):

   ```bash
   pnpm --filter @mtg-tutor/backend exec convex env set ANTHROPIC_API_KEY <key> --prod
   ```

The set list is populated by the build itself. After `convex deploy`, the build
runs `seed-set-stats` then `ingest-sets`, which upload every committed stats
artifact under `packages/backend/data/` into the deployment and rebuild the
`sets` docs the app lists — production has its own database, nothing carries over
from dev, so this runs on every deploy. The set list is therefore exactly the
artifacts committed there (currently `sos`, `tdm`); commit a new
`<set>.<Format>.json` and the next deploy picks it up. To seed a deployment by
hand — e.g. before the first build — run `pnpm seed-set-stats` then
`pnpm ingest-sets` (add `--prod` to target production).

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
        config.ts              derives the .convex.site host
        env.ts                 the single boundary that reads process.env
        auth/                  WorkOS device flow, token store, authed Convex client
        tutor/coach.ts         consumes the deployment's /coach stream
        ui/                    reusable @clack primitives (card picker, formatting)
      services/
        auth/                  login / logout
        draft/                 draft screen + entrypoint
        review/                review walkthrough + entrypoint
        stats/                 stats screen
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
      sets.ts                  Scryfall + our-stats ingestion; setStats store
      draft.ts                 start / state / pick / results / save
      http.ts                  the streaming coach endpoint
      auth.config.ts           validates WorkOS RS256 JWTs
```

**Both clients are peers; neither owns the domain.** The CLI holds no database, no API
key and no set data — it authenticates with a WorkOS device flow (`mtg-tutor login`) and
drives the same Convex functions the web app does. A feature therefore cannot ship to one
client and silently skip the other, which is the whole reason the CLI still exists.

**A draft session is `{setCode, format, seed, pickedNames[]}` and nothing else.** No board state is stored; every read replays the draft from the seed. A finished draft replays in 0.16ms, which is noise next to the round trip that asked for it.

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

**Packs are dealt from observed shapes, not a formula.** A modern Play Booster has a wildcard slot, so a set has no fixed rarity mix — real SOS boosters span **66 distinct shapes** (5–9 commons, 0–3 rares) and every one of them contains a bonus-sheet card. `makePack` samples that observed distribution, so a Mystical Archive or Special Guest card shows up exactly as often as it does in the real format. Sets with no observed data fall back to the fixed 15-card `PACK` constants and stay playable.

The shapes, and all the win-rate data, come from the 17Lands public datasets. Adding a set is a four-step flow — availability check, build the stats artifact, seed it, then ingest the draftable set from Scryfall + those stats:

```bash
pnpm check-availability SOS TradDraft          # refuses sets without the datasets
pnpm build-set-stats SOS TradDraft             # ~1.2GB of CSV -> ~260KB artifact
pnpm seed-set-stats                            # upload committed artifacts to Convex
pnpm --filter @mtg-tutor/backend exec convex run sets:ingest '{"setCode":"sos","format":"TradDraft"}'
```

`sets:ingest` reads the seeded stats, so it must run last. It makes no 17Lands API call.

**A set's card pool is bigger than the set.** Bonus sheets (Mystical Archive, `soa`) and Special Guests (`spg`) print into a set's boosters under their own set codes, so ingestion searches the set *plus everything Arena-legal released the same day* — Special Guests is shared across sets and is not a Scryfall child of any of them, so no mapping table can find it. **Our stats' card list then decides what stays**, which drops promos, art cards and Alchemy rebalances while keeping the bonus sheet. Basic lands are added back because they are not rated and the land slot needs them. For SOS this yields exactly 346 cards: 271 `sos` + 65 `soa` + 10 `spg`.

Do not reintroduce `is:booster` to that Scryfall query. It is not set on Play Booster sets, so `set:sos is:booster` returns a 404 and made the set undraftable.

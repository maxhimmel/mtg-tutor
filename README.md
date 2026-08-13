# mtg-tutor

An interactive CLI that helps you get better at drafting Magic: The Gathering. Simulate a full 8-person, 3-pack draft against bots, get every pick **scored and explained** against real-world [17Lands](https://www.17lands.com/) win-rate data, and track your progress over time.

## Why

Reading pick guides is passive. Improvement comes from **reps with objective feedback**. `mtg-tutor` gives you the reps (a full draft — 42 picks for a modern Play Booster set), the objective feedback (each pick scored 0–100 vs the statistically best card still in the pack), the reasoning (why the better card was better — removal, win-rate gap, whether it wheels), and the long-term view (are your early picks strong but your late picks sloppy? do you commit to colors too slowly?).

## How it works

- **Ground truth = our own data, derived from 17Lands' public datasets.** Card quality comes from GIH WR and ALSA that we compute ourselves from the [public draft/game datasets](https://www.17lands.com/public_datasets) — the source 17Lands sanctions for outside use — not from their live API. Cards without enough data fall back to a per-rarity baseline measured from the same set. The live API is kept only as a testing oracle (`pnpm validate-set-stats`), never a runtime dependency.
- **Card pool = Scryfall.** The set's cards, types, mana costs, and rarities come from Scryfall; packs are generated from the rarity pools (1 rare/mythic, 3 uncommons, 11 commons per 15-card pack).
- **Bots draft against you.** Each of the 7 bots commits to colors as it picks, so signals flow and packs wheel realistically.
- **Everything lives in Convex.** Set data is ingested once per set and shared across devices; drafts are stored against your account. The CLI and the web app are peer clients of the same backend — draft in the terminal, review it in the browser with card art.
- **Mana symbols = the [Mana font](https://github.com/andrewgioia/mana)** by Andrew Gioia, self-hosted in the web app (font under SIL OFL 1.1, CSS under MIT).

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

# Dare a friend to draft one of your finished drafts
pnpm challenge

# Take one up -- paste the link you were sent
mtg-tutor draft --challenge <link>
```

The unified `mtg-tutor` CLI dispatches to the same services (`pnpm dev draft dsk`, or the built binary below).

After building (`pnpm build`), the `mtg-tutor` binary works directly:

```bash
mtg-tutor draft dsk
mtg-tutor stats
```

During a draft, arrow-key through the pack (cards are pre-sorted by win rate with hints) and read the grade + reasoning after each pick. Enter takes the card to your maindeck, `s` takes it straight to the sideboard, and `v` opens the two piles so you can move cards between them mid-draft.

When the last pack runs out you build the forty — cut down to 40 cards and set the land count — and only then does the CLI show you the suggested build, how far your deck is from it, the curve and colours side by side, your overall score and your biggest missed picks. Walk away before locking in and `mtg-tutor draft --resume <id>` puts you back on the build screen.

### Challenge a friend to your packs

Finish a draft and you can hand somebody a link to the same deal. They draft it
in a **pod of their own** off your seed, so what they take still changes what
wheels back to them — then the two drafts go side by side.

Live pod rather than a recording of your packs, and that is the whole design.
Dealing them your forty-two packs as you saw them makes every row line up
perfectly and makes their picks inert: nothing they take changes anything, so
signal-reading and wheeling — most of what a draft teaches — are switched off. It
looks like a draft and is a multiple-choice quiz with your answer key.

The price of doing it honestly is that the two pods come apart. **The boosters
dealt are identical the whole way, but the packs you SEE stop matching once the
wheel brings the first divergence back round** — at least eight picks after it,
because your own pick cannot reach your own packs until the pod passes yours on.
So the comparison says, per row, whether the two of you were actually looking at
the same cards, and the screen says out loud where it stops being one question
answered twice. Two things make that worth insisting on: the picks mostly still
AGREE across the drift, so a diff that has quietly stopped comparing anything
looks exactly like one that has not; and the drift is not monotonic, because
packs re-converge by coincidence.

The comparison reads three ways, all driving one stepper:

- **the hero** — the draft answered in a line, then only the forks
- **the braid** — where the two drafts split and rejoined, each strand inked with
  the colours that deck was committing to, and an arc joining a fork to the pack
  it changed several picks later
- **the shelf** — one pick at a time, with the whole pack both cards came off,
  because "they took the better card" and "they took the only other playable in a
  bad pack" are different lessons and two card images cannot tell them apart

Sharing is a link sent out of band. There is no friend list and no directory: the
backend cannot learn a name or an email address, and everyone in a private beta
already knows each other.

> **Note on set coverage:** scoring quality depends on how much data a set has in the 17Lands public datasets. Recent, heavily-played sets score best. A set we haven't built stats for is scored on rarity baselines alone — which makes grades close to meaningless — and both clients say so rather than implying a good draft. (The datasets go back years, so this is a matter of which sets we've ingested, not of sets "aging out.")

## Development

```bash
pnpm dev:web           # start the web stack: convex dev + next dev together (turbo, one Ctrl-C stops both)
pnpm test              # unit suites for every package (vitest, via turbo)
pnpm build             # build every package in dependency order
pnpm verify-data       # sanity-check the live 17Lands + Scryfall response shapes
pnpm smoke-draft fdn   # headless full-draft smoke test, against Convex
pnpm challenge-fixture  # fake the other half of a challenge -- see below
pnpm login             # sign in; the CLI needs a session to reach the backend
pnpm bench-llm         # what one draft costs in tokens, and whether the advice held
pnpm bench-io --challenge  # add the two-draft comparison to the I/O run (doubles it)
pnpm bench-report      # render that run as a page: cost, quality, and the answers
pnpm claude-bridge     # coach from the Claude Code CLI instead of a paid key -- see below
```

Cutting AI token usage without quietly making the coaching worse is a procedure,
not a diff — `packages/backend/bench/README.md` has it, numbered.

### Coaching from the CLI you already pay for

Tinkering with prompts costs tokens, and a free Groq allowance runs out in an
afternoon. `pnpm claude-bridge` answers the coach from the **Claude Code CLI on
this machine** instead — your subscription's usage window rather than API
credit. Two terminals:

```bash
pnpm claude-bridge     # leave it running (--echo to print the answers too)
pnpm llm claude-cli    # point the dev deployment at it (pnpm llm groq / anthropic to switch back)
```

Convex functions run in a V8 isolate with no `child_process`, so nothing inside
the deployment can shell out; the bridge is a loopback HTTP server speaking the
OpenAI-compatible wire format the provider seam already knows, and spawning one
`claude -p` per request. Nothing in the app learns that the CLI exists.
`llm.ts` refuses a non-loopback `CLAUDE_BRIDGE_URL`, because a bridge is a
laptop or it is nothing.

It narrates, which is most of what makes it usable. A call is announced when it
**arrives**, named by the pick it is about, and again when it lands:

```
-> 09:09:43 coach   Pack 1, Pick 3 — pick 3 of 45, 42 to come.  [12.4KB in]
<- 09:09:46 coach   stop - 1.1s to first token - 3.0s - 9,412 in (7,200 cached) / 312 out
```

The arrival line is the diagnostic that matters: if the coach fails and no `->`
appeared, the request never left Convex, which is a different problem entirely.
A player who clicks on mid-answer reads as `cancelled`, and the child is killed
rather than left running up usage nobody will see. `--echo` prints the answers
as they stream, for when the app is not what you are watching.

What crosses faithfully: the system/user prompt pair, `--json-schema` for the
review's structured output, streaming, the `fast` flag as `--effort low`, and
truncation at `max_tokens`. The child gets no tools, no skills, no MCP servers
and no settings file, and runs outside the repo — a coach that had picked up
this repo's `CLAUDE.md` would answer well and answer as something other than the
app.

What does not: **token counts are inflated**, because Claude Code wraps every
prompt in its own framing (~150 tokens on an empty call), and cache *writes* are
unreportable through this wire format. Benchmarks still run and are still worth
running — `bench-llm` stores baselines per provider, so a `claude-cli` run never
lands on top of a Groq or Anthropic one — but read them for output length, call
frequency and accuracy, never for what a saving is worth in money.

| Variable | Default | |
|---|---|---|
| `CLAUDE_BRIDGE_URL` | `http://127.0.0.1:8787/v1` | must be loopback |
| `CLAUDE_BRIDGE_MODEL` | `sonnet` | any `--model` alias or id |
| `CLAUDE_BRIDGE_PORT` | `8787` | read by the bridge, not the deployment |

### Testing a challenge on your own

A challenge needs two people and this deployment has one. Inviting a second
WorkOS account works and is the faithful test, but it costs that account a draft
a day and forty-two clicks a run, which is a bad loop to be in while moving a
panel three pixels. So `pnpm challenge-fixture` manufactures whichever half you
are not playing.

```bash
pnpm challenge-fixture inbound [setCode] [format]  # a challenge aimed at YOU
pnpm challenge-fixture outbound <sessionId>        # one you sent, already drafted
pnpm challenge-fixture finish <sessionId>          # bot-finish a draft in progress
pnpm challenge-fixture wipe                        # remove every fixture
```

**`inbound` is the one that cannot be faked any other way.** `accept` refuses
your own challenge on purpose, so with a single identity there is no route to the
accept path or the drafting that follows it. This invents the other drafter,
gives them a finished draft, and prints you a link — and from there everything is
real. You accept, you make all forty-two picks, and your last one stamps the
challenge finished and fires the notification, exactly as a friend's would.

**`outbound` is the fast direction:** point it at a finished draft of your own and
it deals a second pod against the same seed, so the diff is readable immediately
with your real picks on one side.

**`finish` keeps the picks you already made** and drafts on from there, so you can
play the first few by hand to watch the board behave and skip the rest without
losing what you did.

The fixture drafter is deliberately sloppy — it takes the second or third best
card about a third of the time. A greedy bot agrees with itself on every pick and
produces a comparison with nothing in it: no forks, no off-shelf callout, an
empty braid. Two *honest* drafts often do the same, which is the trap worth
knowing about: swept over 1000 seed/divergence combinations, **339 never come
apart at all** and 657 drift and then re-converge. A fixture that cannot
reproduce the phenomenon reads as a screen that works.

Every one of these is an `internalMutation`, so there is no public surface:
`npx convex run` and the dashboard both already require deployment admin
credentials, and nothing else can reach them — which matters, because they
fabricate sessions and stamp challenges finished. The script never passes
`--prod`, so dev is structural rather than something to remember. Fixture rows
are owned by a `userId` nobody can authenticate as, which is how `wipe` finds
them again; it leaves your own sessions alone and removes the challenges that
pointed at them.

`pnpm dev:web` fans out to the `dev` tasks of `@mtg-tutor/backend` (`convex dev`)
and `@mtg-tutor/web` (`next dev`) as persistent, uncached turbo tasks, so both
run in one terminal with prefixed, interleaved output. It assumes a first-time
setup has already happened: `apps/web/.env.local` filled in from
`apps/web/.env.example` (three of the values are written to
`packages/backend/.env.local` by `convex dev` on its first run), and the dev
deployment seeded once with `pnpm seed-set-stats && pnpm ingest-sets`.

Never run `next build` while `next dev` is running — they share `apps/web/.next`, and the build overwrites the dev server's bundle with one compiled under different env. The symptom is a page stuck on "Loading sets" with no error anywhere. Use `pnpm --filter @mtg-tutor/web typecheck` instead.

### The dev deployment runs on your machine

Feature work targets a **local** Convex deployment: the same backend binary,
running as a subprocess of `convex dev`, with its database in `.convex/`. Its
function calls and database bandwidth do not count against the plan's quotas,
which is the point — the storage shapes under *Architecture* below were forced by
a bill hit mid-prototype, and iterating on a schema should not be metered.

The backend lives only as long as `convex dev`, so `pnpm dev:web` starts it and
Ctrl-C stops it. `npx convex dashboard` opens it; use Chrome or Firefox, since
Safari and Brave block requests to localhost.

Creating one, once:

```bash
cd packages/backend
npx convex deployment create local   # downloads the backend, registers it in the project
npx convex deployment select local
pnpm env:push                        # a new deployment has no env vars at all
npx convex dev --once                # push schema + functions
```

Then seed it — `pnpm seed-set-stats && pnpm ingest-sets`, the same commands as
any other fresh deployment. That rebuilds the sets from the committed artifacts
but not your own drafts, which only exist where they were played; to carry those
across, `npx convex export --path snapshot.zip` against dev and
`npx convex import snapshot.zip` against local, which preserves `_id` and
`_creationTime` so the draft → picks → verdicts references survive.

Four values then point the clients at it. `convex dev` writes `CONVEX_URL` and
`CONVEX_SITE_URL` into `packages/backend/.env.local` but cannot reach into a
sibling package's env file (see `notes.md`), so copy them by hand:

| File | Variable | Value |
|---|---|---|
| `apps/web/.env.local` | `NEXT_PUBLIC_CONVEX_URL` | `http://127.0.0.1:3210` |
| `apps/web/.env.local` | `NEXT_PUBLIC_CONVEX_SITE_URL` | `http://127.0.0.1:3211` |
| `apps/cli/.env` | `CONVEX_URL` | `http://127.0.0.1:3210` |
| `apps/cli/.env` | `CONVEX_SITE_URL` | `http://127.0.0.1:3211` |

Both `*_SITE_URL` are **required** here, where against a cloud deployment they
are optional. The clients find the HTTP actions host (the streaming coach) by
swapping `.convex.cloud` for `.convex.site`, and a local deployment answers on a
second *port*, not a second host — so the swap finds nothing, the query URL
passes through as its own coach origin, and `/coach` 404s at the wrong port.

Finally `pnpm login` again: the stored session records the deployment it was
issued against, and `scripts/lib/auth.mjs` refuses a mismatch rather than send a
cloud token to a local backend.

To go back to the cloud dev deployment, reverse the two halves —
`npx convex deployment select dev`, restore the four values above to their
`combative-hamster-414` equivalents, and `pnpm login` once more.

One CLI wrinkle worth knowing: `deployment select` announces that it saved
`CONVEX_SITE_URL` but leaves the previous deployment's value in place. The next
`convex dev` corrects it. Until then the file names one deployment's coach
endpoint alongside another's query endpoint, which `pnpm bench-llm` would follow
without complaint.

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

## Who can use it, and how much

The deployment is invite-only, and a friend gets three drafts and three reviews
a day. Both of those are WorkOS configuration plus two deployment variables —
there is no users table and no admin screen, and the app reads a role straight
off the access token (`convex/roles.ts`).

**Deployment variables.** Set these on dev and again with `--prod`, *before*
merging anything that expects them — `seed-set-stats` fails closed without the
first one, and it runs on every deploy.

| Variable | What it does |
|---|---|
| `MTG_TUTOR_DEPLOY_KEY` | Lets the deploy scripts rebuild set data with nobody signed in. `openssl rand -hex 32`. Read back by the scripts through the Convex CLI, so Vercel needs no copy of it. |
| `MTG_TUTOR_ROLES` | `subject=role` pairs, comma-separated. The lockout escape hatch, not the source of truth — a membership set wrong in the dashboard locks you out of the surface that would fix it. |
| `RESEND_API_KEY`, `OWNER_EMAIL` | Optional. Emails you when someone asks for access. Unset just means the request is recorded and not mailed. |
| `RESEND_FROM`, `APP_URL` | Optional, and both needed together. Emails the challenger when a friend finishes their packs. Unset means the in-app badge is the only notice — which works on its own, so this is a nicety rather than a prerequisite. |

**Emailing a friend needs a verified sending domain, and that is why
`RESEND_FROM` has no default.** The access-request mail above sends from Resend's
shared `onboarding@resend.dev`, which only ever delivers to the Resend account
owner's own address — fine for "somebody wants in", useless for mailing anybody
else. Verify a domain in Resend, then set `RESEND_FROM` to an address on it and
`APP_URL` to the site's origin so the mail can link to the comparison. Guessing a
sender that silently fails to deliver is worse than not sending, so it fails
closed and logs which variables were missing.

The address itself is looked up through the WorkOS Management API with the
`WORKOS_API_KEY` you already set: identity carries `subject`, `role` and `org_id`
and nothing else, there is no users table, so that is the only route from a
signed-in person to an inbox.

**WorkOS, once.** All of it in the environment Convex provisioned — Convex
dashboard → Settings → Integrations → WorkOS Authentication. Not
`dashboard.workos.com`, which is a different team (see the AuthKit note above).

1. **Authorization** → define three roles. Keep the slugs short, they travel in
   the session cookie: `owner`, `tester`, `beta`. Make `beta` the environment
   default, so anyone invited without an explicit role is capped.
2. **Organizations** → create one. Every friend joins it; a user in no
   organization has no `role` claim at all and is refused everything, which is
   the closed beta working rather than failing.
3. Add yourself to it as `owner`. Your account predates the organization, so
   this is a membership rather than an invitation.
4. **Authentication** → turn **Sign up** OFF. Registration is then closed
   except when an invitation code is present, which is the whole gate.

**Inviting a friend.** Users → Invites, into that organization. WorkOS emails
them, and the invitation also carries an `acceptInvitationUrl` you can copy and
send however you like. Give a friend who should be uncapped the `tester` role;
leave everyone else on the default.

`pnpm check-access` is how you check any of this worked. It returns the role, what is
left today, and `source` — `claim` means the organization membership is
reaching Convex, `default` means it is not.

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
        challenge/             issue a link; accepting is a flag on draft
        draft/                 draft screen + entrypoint
        review/                review walkthrough + entrypoint
        stats/                 stats screen
  web/                         @mtg-tutor/web -- the Next.js client, the one with card art
    app/
      page.tsx                 set picker
      draft/[sessionId]/       the draft board
      challenge/               the link, the list, and the two-draft comparison
      callback|sign-in|sign-up WorkOS AuthKit route handlers
      providers.tsx            AuthKit session -> Convex identity bridge
    middleware.ts              redirects unauthenticated visitors to WorkOS
packages/
  backend/                     @mtg-tutor/backend -- Convex: the shared session store
    convex/
      schema.ts                sets, draftSessions, draftPicks, challenges, reviewVerdicts
      sets.ts                  Scryfall + our-stats ingestion; setStats store
      draft.ts                 start / state / pick / results / save
      challenges.ts            issue / accept / diff -- one drafter daring another
      challengeFixture.ts      dev-only: manufacture the other half of a challenge
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

The shapes, and all the win-rate data, come from the 17Lands public datasets. Adding a set is a five-step flow — availability check, build the stats artifact, seed it, ingest the draftable set from Scryfall + those stats, then prove it deals the packs its data claims:

```bash
pnpm new-set SOS TradDraft                     # runs all five steps below, scoped to this set
```

`new-set` is a thin orchestrator over the five underlying scripts, which you can
still run individually — to re-derive from local CSVs, target a different output,
or seed/ingest an existing artifact on its own:

```bash
pnpm check-availability SOS TradDraft          # refuses sets without the datasets
pnpm build-set-stats SOS TradDraft             # ~1.2GB of CSV -> ~260KB artifact
pnpm seed-set-stats sos.TradDraft              # upload the committed artifact to Convex
pnpm ingest-sets sos.TradDraft                 # rebuild the `sets` doc from Scryfall + stats
pnpm validate-pack-model SOS TradDraft         # deal 200k packs and check they match
```

The middle steps take an optional `<set>.<Format>` filter (as above) or run
over every committed artifact when omitted. `ingest-sets` reads the seeded stats,
so it must run before validation; it makes no 17Lands API call. Add `--prod` to
`pnpm new-set … --prod` (or to the individual steps) to target
production instead of your dev deployment.

**The last step exists because this pipeline's failure mode is a plausible success.** MKM once ingested "286 cards" with a bonus pool holding ten Special Guests instead of the fifty-card sheet its shapes were counted from: nothing threw, the set listed, and 11% of packs would have dealt the wrong card. `validate-pack-model` checks the artifact's shapes are coherent, that every card they assume can actually be dealt, and that 200k dealt packs come out at the rates the artifact claims — then cross-checks against [MTGJSON](https://mtgjson.com)'s booster collation, which shares no source with 17Lands. MTGJSON is an oracle only, and a patchy one (it carries an Arena booster model for well under half our sets), so it asserts where it can and says so where it cannot — the same standing the 17Lands API has in `validate-set-stats`.

**A set's card pool is bigger than the set.** Bonus sheets (Mystical Archive, `soa`) and Special Guests (`spg`) print into a set's boosters under their own set codes, so ingestion searches the set *plus everything Arena-legal released the same day* — Special Guests is shared across sets and is not a Scryfall child of any of them, so no mapping table can find it. **Our stats' card list then decides what stays**, which drops promos, art cards and Alchemy rebalances while keeping the bonus sheet. Basic lands are added back because they are not rated and the land slot needs them. For SOS this yields exactly 346 cards: 271 `sos` + 65 `soa` + 10 `spg`.

**That same-day search is a fast path, not the last word.** It answers *"what shipped on release day"*, which is only a proxy for *"what can appear in this set's boosters"* — and MKM breaks the proxy: its Arena packs carry a 50-card List sheet printed between 2005 and 2017, which no release-day query can reach. So the draft dataset's pack columns are the authoritative manifest, and Scryfall is only ever asked about names we already have. `build-set-stats` resolves whatever the bulk crawl misses by exact name and records the answer in the artifact as `packCards`; `ingest` fetches those by exact printing. A name that cannot be resolved at all **fails the build** rather than becoming a slot nothing can fill.

Do not reintroduce `is:booster` to that Scryfall query. It is not set on Play Booster sets, so `set:sos is:booster` returns a 404 and made the set undraftable.

Do not widen the pack-slot validator to accept an unrecognised slot either. `makePack` walks a fixed `SLOT_ORDER` and silently skips what it does not know, so a slot with no pool turns a loud seed failure into packs that quietly deal a card short.

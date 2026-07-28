# Issues:

1. **The coach invents mana costs.** It called `Nurturing Bristleback` a 3-drop;
   it is `5GG`. Cause found in the code, not guessed: `buildPickContext`
   (`core/tutor/pickCoach.ts`) renders the passed cards as
   `name (Colour, GIH WR x%)` only — no `cmc`, no type line, no oracle text.
   Just the _picked_ card gets `${picked.cmc} mana`. So every curve/size/effect
   claim the coach makes about a card it did not pick is invention.
   `buildReviewContext` (`core/tutor/reviewPrompt.ts`) has the same hole.
   Cheap fix: put cmc + type line on the passed cards too.

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

5. I've noticed the coach pulling advice about choosing a non-optimal card (probably because the stats are better on the optimal card versus my pick) when I'm on my second/third pack and the first few picks. As if it can't distinguish that once I'm a full pack in I'm not technically at "pick 1" any longer - I'm at all-the-picks-from-pack-1 + pack-2-pick-N.
   The prompt says `Pack 2, Pick 3` and lists the pool, but never the absolute
   pick index, how far through the draft it is, or which colours are already
   committed — `committedColors` exists in `core/scoring/score.ts` and no prompt
   builder calls it.

# Ideas:

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

4. Clicking on a draft pick shouldn't immediately be the user's pick. It should select/highlight the card with a little badge indicated w/some wording. And then have a "confirm pick" button anchored somewhere. Double-clicking should behave as the current system works and not require the confirm button.

5. Pre-load all the images in the current pack before we display that page.
   Remove the image popping in as it dynamically loads. I'd rather have a
   loading page/spinner/state than the faster image lazy loading.
   (`CardTile.tsx` currently uses a plain `<img loading="lazy">`.)

6. **Show the field, not just the win rate.** The draft dataset is every human
   pick, so we can say "34% of drafters took this card at this pick" instead of
   only "this card has the higher win rate". A pick-order distribution is a
   better teacher than a scalar, and it is the same new draft-data pass that
   roadmap #3 (`human-bots`) needs — the bots consume it, the player sees it.

7. **Sealed mode.** Six packs, no passing, build the 40. `makePack` and
   `suggestDeck` already exist, so this is mostly a new screen — and it is a
   different skill (pool evaluation and deck construction rather than pick
   order).

8. **A deck-building step.** Today `suggestDeck` just shows you the answer on
   the results screen. Building the 40 is half of Limited and the app currently
   does it for you; making the player build it and then diffing against the
   suggestion (and against real winning curves, roadmap #2) is a whole second
   practice surface on top of data we already have.

9. **Re-serve your own misses.** `stats.overview` already computes
   `topMistakes`. Storing the seed + pick index and dealing that exact pack back
   weeks later is spaced repetition on the mistakes you personally make.

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
2. **Headless runs need a token.** `smoke-draft.mjs` cannot talk to the draft
   functions anonymously. It takes `MTG_TUTOR_TOKEN`, or mints one via the
   WorkOS password grant from `SMOKE_EMAIL`/`SMOKE_PASSWORD` plus the
   deployment's `WORKOS_CLIENT_ID`/`WORKOS_API_KEY` — which only works if the
   environment has password auth enabled. Now that the device flow exists it
   could instead read `~/.mtg-tutor/credentials.json`.
3. **Draft sessions created before auth have `userId: undefined` and are now
   unreachable.** The schema still allows the field to be absent so those rows
   validate; nothing can read them. Only dev data, but it is why the field is
   optional rather than required.
4. **`draftSessions.saved` is dead.** Optional only so old rows validate;
   nothing writes or reads it. Strip it whenever that table is next migrated.

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

Separate track: the **review features** in "Deferred" above (alternate draft
lines, review-quiz trend tracking) and the archetype quiz (Ideas #1) — unrelated
to the data work.

# Deferred trade-offs (revisit when the premise changes):

1. **The draft board no longer live-syncs — revisit if we do multiplayer.**
   `DraftBoard.tsx` used to hold `useQuery(api.draft.state)` open for the whole
   draft. Answering that query replays the session, which reads the ~240KB pool,
   and every pick patches `draftSessions` and so invalidated it — meaning each
   pick paid for that read twice, once in the mutation and once in the re-run
   query. It now loads the board once and advances it from what `pick` already
   returns.

   That is only sound because a draft is single-player and nothing but this
   component ever changes the board. **A shared pod, a spectator view, or
   drafting from two devices needs a subscription back** — and naively restoring
   the old one restores the double read with it.

   The shape that would keep both: subscribe to something small and derived (a
   pick counter, or a session revision number) and fetch the board only when
   that moves. Invalidation then costs a cheap read instead of a full replay.
   Same principle as `setStatsMeta` — if a value is only there to be watched or
   compared, it belongs on a row small enough to read often.

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
3. **One Convex document per (set, format), not a per-card table** — so a draft
   mutation reads exactly one row rather than hundreds. It is now two documents,
   `sets` (~433 bytes, what a listing needs) and `setCards` (~240KB, what a
   replay needs), because Convex bills bytes read out of the database rather
   than bytes returned and the set picker was reading the whole pool to render a
   name. Ingestion still refuses anything over 900KB against the 1MB limit.
4. **`outputFileTracingRoot` must stay set** in `apps/web/next.config.ts`. Next
   traces from the project directory by default, and under pnpm 652 of the 653
   files in `next-server.js.nft.json` resolve outside `apps/web`.
5. **A `next.config.ts` that reads the backend's `.env.local` was tried and
   reverted.** Shipped code reaching into a sibling package's gitignored file,
   to save three lines set once, is a worse trade than the duplication. Convex's
   own schema documents `localEnvVars` as writing "to the local `.env` file"
   with no path option, so `convex dev` cannot populate the Next app's file.
6. **Do not add a task-level `env` key to `turbo.json`** — it *replaces* rather
   than merges with `globalEnv` and has already silently dropped a variable
   once. Verified with `turbo run build --dry=json`.

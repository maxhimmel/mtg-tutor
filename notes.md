# Issues:

Numbering is stable and therefore gappy, for the same reason the ideas below
are: `corpus.test.ts` cites issue #4. A fixed issue is deleted and its number
left empty rather than renumbering everything under it.

1. Room type cards and battle cards have text that is sideways and hard to read when they're enlarged. Can we rotate them or see if there's an alternate image to render in their enlarged state that has the text rotated so it's easier to read.

   Both are findable without guessing now: `CardText.layout` is stored, Rooms are
   Duskmourn's 23 `split` cards and battles are `transform`. Scryfall does publish
   the rotated art — a battle's `card_faces[0].image_uris` is the sideways one, so
   "is there an alternate image" is a question about which URI to ask for rather
   than about rotating in CSS. Careful: `layout` alone does not separate a Room
   from an ordinary split card (both are `split`) — `cardShapeOf` already tells
   them apart by printed subtype and is the thing to reuse.

2. It seems like the coach does a bad job of encouraging/noticing themes/synergies between chosen cards and the latest pick the user just chose.
   (`setStats.synergies` is computed and stored and read by nothing — it is the
   data that would fix this. Although, I'm not certain how synergies was initially
   calculated/derived and warrants an explanation/discussion because I fear the
   synergy data may be misrepresented.)

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
   forward-looking guard, not a repair. Another suggestion could be to compare
   the dates of ingested sets with drafts.

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
   `packRate` rebuild that broke EOE, not re-ingestion as such. The 2026-08-05
   `9-card-shape` bump behaved the same way on the two sets it was run against.

   `/review/[id]/deck` (2026-08-05) is the third reader to hit this and the first
   to handle it deliberately: it catches the `ConvexError` and renders the message
   in place with a way back, rather than a blank page. That is containment, not
   the fix — the list still cannot know before you click, and the `sourceHash`
   fingerprint above is still what would let it.

   Before go ahead fixing this issue, let's do some more research and backup
   or findings we've listed here. Let's also present a few different solutions
   that are focused around the user's experience as this app grows/developes.

4. **Show the tokens a card makes.** A card that reads "create a Map token"
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

   These findings bring up an interesting tangent: what else does `all_parts`
   and `components` return for us? I'm curious if there's anything else you
   think we could use to enhance the user's experience from that data. Also,
   what the heck is a `combo_piece`?

5. **The coach still manufactures a fault when it cannot find one — prompt
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

6. I noticed the "your call on the gap" doesn't have name highlighting as seen here (Embermouth Sentinel wasn't highlighted) and it should - just like the coach does:

```
Your call on the gap
misread
The gap to Embermouth Sentinel is 0.5pp, against a ±0.9pp margin of error: the data cannot tell the two apart. Being certain was not available here — whichever you took, it was not the clear call you said it was.
```

8. This coaching feels so offbase to me:

```
Last pick
A
90/100
You took
Stickytongue Sentinel
Graded against
−1.4pp ± 0.7pp
Mudflat Village
That gap is larger than the margin of error on the two win rates.

Your call on the gap
misread
Mudflat Village was worth 1.4pp more to this deck, against a ±0.7pp margin of error. You called it close, and the data separates them — this one was gettable.

Coach
Stickytongue Sentinel is a solid 3‑mana 3/3 with reach and a bounce effect, but Mudflat Village’s mana acceleration, creature‑only mana restriction, and graveyard recursion give it a higher deck impact (+1.4 pp versus the +0.3 pp from Sentinel’s synergy) and the margin of error shows the advantage is statistically meaningful, so the “close call” claim is inaccurate and you should have taken Mudflat Village instead. Your reasoning that “exactly what my archetype wants” is off‑base: the archetype you’re building (a creature‑heavy green/blue midrange) benefits more from the extra early mana and the ability to replay cheap creatures than from Sentinel’s bounce effect, which rarely creates a decisive advantage.
```

I could understand the misread based purely off stats - sure. But this happened at P2P1. I had 9 cards in my main deck that were all blue and green and the coach telling me a black mana card was what I was meant to take feels crazy.

Please, take my complaint with a grain of salt because I'm not an MTG expert and I, myself, need the coaching, but still - this smells funky to me.

9. I'm concerned the deck builder algorithm isn't also looking at the cards in the sideboard? I've built a deck twice now and both times gotten an essentially perfect score. I didn't think I was THAT good so I just wanted to double check the algorithm for deck building also checks sideboard pieces.

# Ideas:

Numbering is stable and therefore gappy. `build-set-stats.mjs` and the roadmap
below cite these by number, so a shipped idea is deleted and its number left
empty rather than renumbering everything under it. 4, 5 and 10 shipped on
2026-07-30; the sideboard and mana-curve ideas that took 10 and 11 after that
shipped on 2026-07-31; the deck-building step that was 6 shipped on 2026-08-05;
7 (invite-only access) and 8 (per-user daily limits) shipped on 2026-08-06.
10 is in use again as of 2026-08-08: a freed number does get reused eventually,
so anything outside this file that cares should cite by name rather than number.

1. A quiz on what archetype a mono-colored card belongs to.

- Ex. This Red card belongs in a Boros deck because ... <x,y,z>.
- The important bit is that it'd teach me what the archetypes even are, and what monocolored cards fit the type to belong in that archetype.
- Standalone: its own command and data model, not part of reviewing a draft.
- Now answerable from data rather than authored: `setStats.archetypes` carries
  per-card win rate per deck-colour-pair, so "which deck wants this card" has a
  ground truth.
- Another approach for a very similar/overlapping goal would be to ask what type of
  deck does this card belong in: mid-range, aggro, control, etc. I don't even know
  what all the deck types are and what their descriptions would be - that'd be very
  cool indeed. I think the only reason I suggested "Boros" as an archetype is
  because it's a name that fits into a MTG vernacular AND (generally) seems to
  imply aggro-style decks.

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
     how fast a format is. IMPORTANT: I wonder how valid this point is...Each
     data set belongs to a particular format. It's my understanding that drafting
     formats are generally speedy games. So maybe something can be inferred by the
     draft format alone? This app is meant to focus primarily on the draft experience.
   - **Curve and land-count truth.** End-of-turn lands in play vs winning,
     measured rather than assumed. This is now the _second_ route to a number
     the deck builder wanted and could not get — see the `DECK` note in
     `core/config.ts` for why the game dataset cannot supply it either.
   - **Gameplay coaching** (attacks, blocks, tempo) — the weakest fit. This is a
     _draft_ tutor; per-turn play coaching is a different product, and the data
     existing is not a reason to build it. CONTRADICTORY NOTE: I actually think
     this is a pretty neat idea! The main point of this app is to become a better
     MTG player!

   If we do pick this up: the pipeline already streams gzip and never keeps raw
   files, so adding replay is a new derivation pass, not new infrastructure.

3. What about a button on the side panel or something for the user to click to
   get a hint/make a suggestion/pick for them? Show the raw & context best? Or
   just the context best perhaps since the user should always be caring about
   the deck they're currently drafting? (Stats-on-hover is the always-on version —
   a passive win-rate readout. This is the on-demand, ask-for-it one.)

4. **Show the field, not just the win rate.** The draft dataset is every human
   pick, so we can say "34% of drafters took this card at this pick" instead of
   only "this card has the higher win rate". A pick-order distribution is a
   better teacher than a scalar, and it is the same new draft-data pass that
   `human-bots` in the roadmap needs — the bots consume it, the player sees it.
   - I don't full understand this note. Can you explain the perks and how this
     could improve the user's experience?

5. **Sealed mode.** Six packs, no passing, build the 40. `makePack` and
   `suggestDeck` already exist, so this is mostly a new screen — and it is a
   different skill (pool evaluation and deck construction rather than pick
   order).
   - Not too interested in this format. Low priority.

6. **Re-serve your own misses.** `stats.overview` already computes
   `topMistakes`. Storing the seed + pick index and dealing that exact pack back
   weeks later is spaced repetition on the mistakes you personally make.
   - This feels like it has the potential to be an AWESOME mini-game!
     We could introduce a star UX rating system. It could help w/user retention.

7. Is it possible to continue a draft we left in progress? Is a draft that isn't completed even tracked on the DB? It'd be pretty rad if we could just continue from where we left off with a draft we abandoned. Answer my question about this and tell me the answer before you start doing the work for this.

8. Holy FUCK awesome idea: be able to share drafts with friends! And/or send them a challenge to see what they would've drafted! And then ping the original member when their friend completed their draft. And show a diff between the 2 users!
   - This brings up a secondary thought: what is the suggested way for users to contact/share contact info in the context of the app? How do other apps encourage their users to connect with others? And what's the mechanism in which a user actually knows about a friend's info within the app for them to both connect?

   **Prototyped 2026-08-08 on the `challenge-lab` branch** (never merged; two
   labs, `pnpm challenge-lab` and `/diff-lab`). What it settled:

   **Two drafters on one seed see identical packs only through pick index 7.**
   Measured, not reasoned: the boosters *dealt* are identical the whole way,
   because the human consumes no `rng()` and every bot draws exactly
   `hand.length` numbers, so the stream position at each `openPack()` is
   invariant. But at P1P9 your own pack wheels back with your own P1P1 pick
   gone, and the bot cascade that pick set off has already moved every bot's
   `colorValue`. Two things about the drift are worth not rediscovering: the
   picks still mostly AGREE across it — 43 of 45 after a divergence at P1P1 —
   so a drifted diff looks trustworthy and is not; and drift is not monotonic,
   because packs re-converge by coincidence, so a contiguous window is
   conservative and per-row "was this the same pack" is the truth.

   **Dealing the friend a recording of your 45 packs was prototyped and
   rejected.** It makes all 45 rows compare perfectly and makes their picks
   inert — nothing they take changes what wheels back — so signal-reading and
   wheeling, which is most of what a draft teaches, is switched off. It looks
   like a draft and is a multiple-choice quiz with your answer key. The
   alignment is not worth the thing being practised. **Live pod, and the diff
   says out loud where it stops being a comparison.**

   The deal itself is free: `draft.start` already takes an optional `seed`, and
   `draftPicks.pack` has stored each pick's pack as seen since 2026-07-29 — so
   each drafter's own packs are on their own rows and a diff needs no replay,
   which also means it cannot be stranded by a re-ingest the way `review.load`
   is (issue #3).

   **The screen is an overview above a step-through.** A chronological list of
   all 45 rows was tried and is the obvious shape and the least useful one. What
   won is a hero — the draft answered in one line, then only the forks, each as
   two full card faces the way `TheChallenge` draws one — over a pack-by-pack
   stepper, where the whole shelf both cards came off is visible, because "they
   took the better card" and "they took the only other playable in a bad pack"
   are different lessons and nothing that renders two cards can tell them apart.
   Clicking a fork drives the stepper. **Still wanted, and not yet drawn: a
   branching tree of where the two drafts diverged and what that led to** — that
   is what the rejected timeline was reaching for.

   **How the two people connect: a link, sent out of band.** No friend list, no
   directory. The backend cannot learn a name or an email — identity carries
   `subject`, `role` and `org_id` and nothing else (decisions #2 and #15) — so
   anything nominal needs either a users table or a WorkOS Management API call,
   and everyone in a private beta already knows you personally.

   **What is genuinely missing, and is the real cost of this feature.** There is
   no notification primitive of any kind: no inbox, no unread, no cron, no
   badge; the only email precedent is `access.ts`. And a friend who accepts and
   wanders off leaves `draftSessions.status` at `"active"` forever — there is no
   terminal signal in the schema, so "they started and never finished" is
   unsayable. The link is also a seed that outlives the moment it was made, so
   it meets issue #3 far more often than a same-day draft does.

9. One thing this app feels like it's desperately missing is some kinda progression/indication that the user is learning and improving. Something kinda like, "I was there, but now I'm here!"

10. **Read your friend's reasoning, pick by pick.** Fell out of #8 as a
    separate thing rather than a mode of it: the interesting part of another
    person's draft is not only what they took but why, and a shared draft that
    carried their sentences would be worth reading even where the two pods have
    drifted and the picks no longer line up.

    **The data already exists.** `draftPicks.defense` is
    `{reason, confidence, challengedName, switched}`, written by the commitment
    ceremony, and decision #11 is emphatic that there is deliberately no edit
    button on it once the challenger is on screen — so the sentence is a real
    prediction made before anything was revealed rather than a rationalisation
    written after. That is exactly what makes it worth showing somebody else.
    So this is a second reader on a column that is already populated, not a new
    feature underneath one.

    Two things it would need thinking about. A `defense` only exists for picks
    made through the challenge ceremony (decision #13 — a row carrying one went
    through it, a row without one did not), so a draft taken on the passive flow
    has nothing to show. And a reason written for yourself is not a reason
    written for a friend; whether people would still be honest in that box once
    they know it is readable is the question that decides whether this is good.

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
   - Is this even still an issue?
   - Also, related kinda but not really: it'd be very rad if we could have some kinda
     mock-auth so, as a dev, I could sign in offline - but low priority.

# Roadmap (pick per future session):

Ordered by value × readiness. Each is a candidate feature branch. Cite these by
NAME rather than number — the numbers have drifted from what cites them twice
already.

`deck-builder` shipped 2026-08-05, and half of it did not. Three-colour decks
priced from measured `splashCost`, the interactive build step and the
side-by-side comparison all landed. **Real winning-deck land counts did not, and
are not recoverable from anything stored**: the 17Lands game dataset has a
`deck_<card>` column per card and would answer it exactly, but
`build-set-stats.mjs` skips basic lands entirely and collapses every other column
to presence rather than copies. So the artifact knows a winning deck ran 19.4-22.7
DISTINCT non-basics and cannot say how many were the same card twice, which is
the whole of the gap to 23. `DECK` stays 23/17, honestly labelled in
`core/config.ts`. Recovering it means a new pass over the game CSVs and a
re-ingest — see Ideas #2 for the other route to the same number.

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
5. **A test one function upstream of the hole also reads as coverage, and this
   one passes.** Trap #4 is a test that cannot go red. This is a test that is
   correct, goes red properly, and is pointed at the wrong function. `layout` and
   `backImageUrl` were added to `ScryfallCard`, to `CardText`, to `mergeCards` and
   to the validator, with tests on `mergeCards` — and every stored row had
   neither, because `textHalf` in `convex/cardText.ts` is a hand-written
   projection that nobody added them to. Scryfall returned them, the mapping
   mapped them, the validator accepted the narrower object, the re-crawl reported
   success. **Adding a card field takes five edits and the fifth is the one no
   test was watching**; `test/cardText.test.ts` now compares whole key sets rather
   than named fields, so the class fails rather than the instance. When a pipeline
   both produces and consumes a shape, test the last hop before storage, not the
   first.

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

13. **There is more than one way to make a pick, on purpose, and no column says
    which** (2026-08-05). The challenge flow was built as a replacement and spent
    a week on its own branch because merging it meant CHOOSING it. It is now one
    of two, selected by the player and switchable mid-draft, because which one
    teaches better is a question for users rather than for us.

    The earlier objection to this — that a mode toggle is unwieldy to maintain
    for the database's sake — was right about what it was aimed at and does not
    apply, for two reasons worth not rediscovering:
    - **The preference is `settings.pickCeremony`, in the localStorage-backed
      `useSettings` beside `showStats`.** No Convex read, no write, no migration.
    - **Which experience produced a pick is already recorded, per pick.** A row
      carrying a `defense` went through the challenge; one without it did not.
      Nothing ever asks what mode a _draft_ was in, which is exactly why
      switching mid-draft costs nothing — there is no session-level claim to keep
      consistent.

    **The seam is between a card being chosen and the pick landing, and nowhere
    wider.** That location is forced rather than picked: the whole 409-line
    divergence between the two boards reduced to `propose` no longer calling
    `commit` itself. Pack grid, drag, picks column, sideboard, verdict, results
    and the pass animation were byte-identical. A third experience implements
    `begin`/`open`/`stage`/`invitation` and three one-line registrations; it was
    verified by wiring a throwaway one through and reverting it, not asserted.
    Deliberately not a registry or a plugin loader — `ceremonies` is a two-key
    object literal, and an abstraction sized for hypothetical variants would cost
    more than the duplication it prevents.

    **The CLI has only the passive flow**, which is a standing asymmetry rather
    than a decision. `challenge.ts` is already client-agnostic — no React, no DOM
    — so what it would need is the two prompts and one added `sets.packContext`
    query. The web's hook is an async
    `(proposal, pack, scoring) => Defense | undefined` turned inside out for
    React; if both clients ever want it, that function is what belongs in core,
    not the React-shaped interface.

14. **The hover preview clips at a card's corner radius, not at `rounded-box`,
    and that is not a style choice** (2026-08-05). A Magic card is 63mm wide with
    a 3mm corner, so the clip is `PREVIEW_W * 3 / 63` — 15.24px at the 320px
    preview, against `rounded-box`'s 16.

    That 0.76px gap sat there unnoticed for a week because **Scryfall does not
    serve an alpha channel consistently**: WOE's adventures come back `VP8X` with
    one, MOM's transform faces as plain `VP8` without. Outside the card's own
    rounding an image with alpha is transparent, so the gap showed base-200
    against a base-200 surface and was invisible. An opaque image has to put a
    colour in those corners and it is white — which is why this presented as "MOM
    is broken and WOE is fine" rather than as a rendering bug.

    Still exactly ONE clipping curve, the surface's, which is the older ruling
    this refines rather than replaces (`144b865`): the image carries no radius and
    no inset, because two curves a pixel apart open a band that widens at the
    corners. Do not restore `rounded-box` here; it is the design system's number
    and this is the card's.

15. **A role is a JWT claim, not a row — the sequel to #2** (2026-08-06). Ideas
    #7 and #8 needed an answer to "who is this, and how much may they spend",
    which is exactly the thing #2 says there is no table for. There still is
    not. WorkOS AuthKit emits `role` as a first-class claim once a user belongs
    to an organization, Convex's `UserIdentity` carries arbitrary claims through
    on an index signature, and `roleOf` in `convex/roles.ts` is the only place
    that knows any of that. So the answer is already in hand when a function
    starts, and costs no read on a path that runs 45 times a draft.

    **Organizations rather than user metadata plus a JWT template**, which was
    the first design and is the road not taken. Metadata is private and does not
    reach the token without a template — and Convex's own AuthKit provisioning
    manages template configuration, so a future `convex deploy` could silently
    remove the claim and drop everyone, including the owner, to no access. An
    organization role needs no template because AuthKit already issues it.

    `MTG_TUTOR_ROLES` survives that change as a lockout escape hatch rather than
    a source of truth: a membership set wrong in the dashboard locks you out of
    the surface that would fix it. Read after the claim, so a working membership
    always wins.

    **The WorkOS Users Management widget was considered and rejected.** It peer-
    depends on `@radix-ui/themes`, `@tanstack/react-query` and `swr` — a second
    design system and two data layers, against one hand-built daisyUI theme and
    Convex's own reactive client — plus a server-minted token and a CORS origin,
    for a screen used about six times. The organization and the roles exist
    either way, so adding it later is small if the dashboard ever gets tedious.

16. **A deck's colours are `committedColors`, and the stored copy is settled at
    `build`** (2026-08-07). Two rulings, and one cost fact that was wrong in this
    file for a fortnight.

    **The rule.** A deck is in a colour once it plays two or more of it. That is
    already what the scorer treats as on-colour and what the coach says out loud,
    so a label disagreeing with it was going to be the confusing one whichever way
    it was wrong — a deck splashing seven white cards was named as though the
    white were not there, and its own deck list said otherwise. One card is a card
    you are stuck with rather than a colour you are in, which is why the floor is
    two. `deckColors` in `packages/core/src/draft/summary.ts`. The stored field
    kept the name `colorPair` because renaming it is a schema migration for a
    label.

    **The moment.** `draft.pick` writes the summary in its completion branch, and
    the player then spends the deck builder cutting cards — `draft.bench` has no
    status guard because that mutation IS the deck builder. So the stored colours
    could name a colour you cut. `draft.build` now recomputes them
    (`refreshedColors`), because that is where the deck actually freezes: neither
    client offers a way back into the builder once the forty is locked in.
    Deliberately NOT on every `bench` call — that would put a read on a path that
    is one patch, to keep a label fresh on a deck nobody has finished. A draft
    abandoned mid-build keeps the colours it finished with, which is honest.
    History was not backfilled; rows written before this keep their old label.

    **"Roughly 120KB of rows either way" was wrong, and it is why this sat open.**
    Refreshing needs the maindeck's colours, and the last pick's row already holds
    the whole pool: `poolBefore` carries 44 of the 45 as `{name, colors}`, and the
    45th is in that row's own `pack`. At P3P15 the pack is one card, so it is
    **one document of ~1.5KB** — `storedPool` in `draftPicks.ts`. No replay, which
    also means it cannot throw on a draft whose set has been re-ingested, and
    losing your deck to that would be a far worse bug than a wrong pip.

    Only the colours are refreshed. `overallScore`, `accuracy` and `pickCount` are
    about picks, and setting a card aside does not change a pick.

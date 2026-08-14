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

   `loadBoard` says so in human terms instead of leaking the engine's message.

   **`draftPicks` (2026-07-29) shrinks this from "unreadable" to "unreplayable".**
   Every pick now stores the pack it saw, so a stranded draft keeps its own
   history: `coachContext` and `verdictContext` read the row and never replay,
   and work fine on a session whose set has moved on. Sessions drafted before
   that date have rows only if the backfill could replay them, which by
   definition excludes the stranded ones.

   Worth knowing: the 2026-07-29 `POOL_REVISION` bump re-ingested all 17 sets on
   both deployments and stranded **nothing** — the backfill replayed every prod
   session successfully. A re-crawl from unchanged artifacts is safe; it was the
   `packRate` rebuild that broke EOE, not re-ingestion as such. The 2026-08-05
   `9-card-shape` bump behaved the same way on the two sets it was run against.

   `/review/[id]/deck` (2026-08-05) was the third reader to hit this and the
   first to handle it deliberately: it catches the `ConvexError` and renders the
   message in place with a way back, rather than a blank page. Containment, not
   the fix.

   **The fingerprint is built (2026-08-09), so the list no longer sends you into
   a wall.** `draftSessions.sourceHash` is stamped at creation from the `sets`
   row `setDocFor` had already read, so it costs nothing, and `review.list`
   compares it against the set's hash today — one ~433-byte row per distinct set
   on the page, against 25 replays of ~46KB apiece. A stale draft is badged
   before you click. Forward-looking only, as expected: sessions from before the
   stamp carry no hash.

   **It answers three ways, not two, and that is the part worth keeping.**
   `staleAgainst` returns `undefined` when either side has no hash, and that must
   never collapse to "fine" — a draft from before the stamp might be either, and
   the two answers send a reader in opposite directions. `undefined === undefined`
   is true, so a naive comparison calls a draft fresh precisely when it knows
   least about it.

   **It is a hint and cannot be a guard**, which is why `challenges.accept`
   replays rather than comparing hashes. Two blind spots, both real:
   `ingest-sets --force` re-crawls Scryfall and writes a new pool under the SAME
   hash, and the hash is absent entirely when a set is ingested with no artifact
   to hand — the CLI's on-demand path. Only a replay answers "would this seed
   still deal those packs", and that is the one question an accept has to get
   right, because getting it wrong is silent: both drafts work and the comparison
   is nonsense.

   **`review.load` stopped replaying on 2026-08-11, and nothing replays now.** A
   stranded draft opens: it rebuilds from `draftPicks` rows, which cannot strand
   because every pick recorded the pack it saw. It also fixed something that had
   been wrong quietly — a replay has no context rows, so the walkthrough had been
   grading picks by RAW-POWER scores the player was never shown.

   **It costs more, and the expectation that it would be cheaper was wrong.**
   `pnpm bench-io`, fdn seed 42: 218.0KB replaying against 262.7KB reading rows.
   The rows are an ADDITION and the replay itself was free — the comment in that
   function had said exactly this for months and was right about bytes and wrong
   only about bytes being the question. A draft that cannot be opened costs
   infinity. It would have been 287.6KB but for `colorWinRates`, which that query
   had been returning to no reader at all.

   The old note, kept because the number is still the right comparison for the
   NEXT reader that wants a whole draft: `challenges.diff` reads two
   whole drafts out of `draftPicks` for a measured 138.5KB, against
   `review.load`'s old 218KB — cheaper than what it replaced, and immune to this
   issue by construction.

   Another suggestion could be to compare the dates of ingested sets with drafts.

   Before going ahead with the rest of this, let's do some more research and back
   up the findings listed here. Let's also present a few different solutions
   focused on the user's experience as this app grows/develops.

   The next time I tell you to clean up these notes, please tell me why this insanely long and overexplained issue #3 is still in this doc. After reading all of this it seems done to me. Please explain because clearly I don't understand.

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

9. See deck builder UI w/Progenitus. The mana pips on the card placard bleed over the edge and the card's name isn't visible at all.

10. The "//" separator on the card placard's mana section is white and hard to read.

11. I noticed when drafting modern horizons 3 that devoid-type cards technically don't have a mana color. Fine/whatever. But I don't like how the UI reflects that - the mana pips, curve bar-graph should work off of what colors of mana I need to SPEND -- overriding the mechanic of the card. That's what a human reading this would care about: how big is my mana base in the actual colors of mana-cost for this card?

12. When a card is hovered and the enlarged version is shown and then I click/select the card the hover disappears. That feels incorrect because I didn't STOP hovering over the card.

- It also disappears when i scroll even tho the card is still being hovered upon
- be thorough w/this fix because we've already improved/fixed other bugs regarding similar mechanics and I don't want a spaghetti mess w/all these fixes.

13. Love that the coach noticed the incongruency here:

```
Last pick
A+
100/100
Nothing scored higher
Forum of Amity
Your call on the gap
read it right
You took the card worth 2.7pp more than Burrog Barrage, against a ±1.0pp margin of error. You said it was clear, and it was.

Coach
Wait — Forum of Amity taps for White/Black, not Blue/Red, and it's committed as "on those colors" here, but the text clearly makes W/B mana. That's an off-color land for a UR deck; it doesn't fix anything you're actually casting. Grading the pick as printed: since it produces the wrong colors for your pool, it's a near-blank here despite the eye-popping stats (which reflect a totally different archetype's love of it).

Their reasoning "staying open, not committed to anything" doesn't hold up either — you're 9 picks in with a Blue/Red pool already flagged as committed, so the open-drafting window per has closed, and taking an off-color land isn't "staying open," it's just not advancing your deck. Burrog Barrage is also off your colors (green), so neither pack option actually served this UR pool — but between them you'd rather take a card you might splash or that at least does something (removal-ish) than a land that produces neither of your colors.
```

- I had 6 cards in my main deck that were blue(U) and red(R). And only 2 cards that were white(W) in my sideboard.
- I think the problem is that the coach seems to not have known that I picked that card directly into my sideboard.

# Ideas:

Numbering is stable and therefore gappy. `build-set-stats.mjs` and the roadmap
below cite these by number, so a shipped idea is deleted and its number left
empty rather than renumbering everything under it. 4, 5 and 10 shipped on
2026-07-30; the sideboard and mana-curve ideas that took 10 and 11 after that
shipped on 2026-07-31; the deck-building step that was 6 shipped on 2026-08-05;
7 (invite-only access) and 8 (per-user daily limits) shipped on 2026-08-06.
10 is in use again as of 2026-08-08: a freed number does get reused eventually,
so anything outside this file that cares should cite by name rather than number.
8 (challenge a friend) shipped on 2026-08-09 and is the one exception to the
delete-and-leave-empty rule: 8b and 8c are follow-ons that cite it, so it keeps
a one-line stub rather than orphaning them. 11 (coach from the local Claude Code
CLI) shipped on 2026-08-13; what it can and cannot be trusted for is in
`README.md`, and the roads not taken are decision #19.

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

   **Answered, and the expensive half is now built.** `human-bots` shipped the
   draft-data pass, so `pool_*`, `draft_id` and `pack_card_*` are all read
   already; what is left is deciding where a distribution gets stored, because
   unlike the fitted weights it does not collapse to five numbers.

   What it buys, concretely. Today a pick is graded against one scalar — this
   card's win rate is 1.4pp higher than that one — and issue #8 in this file is
   somebody correctly not believing it. "62% of drafters took Mudflat Village
   here, and the ones who did won more" is a different KIND of claim: it says
   what the field does, so a player who disagrees with it learns they are making
   an unusual pick rather than a wrong one, which is the distinction the grade
   cannot currently draw.

   Three specific gains, in the order they are worth building:
   - **A pick can be unusual-but-fine.** The margin already says the data cannot
     separate two cards (trap #3). A pick-rate distribution says something
     stronger: the field is split. That is the honest reading of most close
     calls and the app currently has no way to say it.
   - **It prices the wheel.** "Taken 8% of the time by this pick" IS the
     probability a card comes back, which is the one number a drafter deciding
     whether to speculate actually wants, and nothing in the app knows it.
   - **It is a better teacher than a win rate for cards nobody rates.** ALSA is
     already this distribution flattened to a mean, and the mean is what hides
     the bimodal cards — the ones a third of drafters take first and the rest
     never take at all, which are exactly the cards worth explaining.

   The measurement trap to avoid: pick rate is what humans DO, win rate is what
   works, and the two disagree — that gap is the most interesting thing here and
   must not be presented as one number. Trap #1 is the same mistake one level up.

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

8. **Shipped 2026-08-09** — challenge a friend to your packs, then read the two
   drafts side by side. What it is and how to test one alone are in `README.md`;
   the rulings that came out of building it are decisions #17 and #18. The
   design write-up that used to sit here is gone with the idea, as a shipped
   idea should be.

   The number is not left empty the way the note at the top of this section
   describes, because 8b and 8c below are follow-ons that cite it and would be
   orphaned by an empty slot. They are future work, deliberately not built.

8b. I'm curious - is it possible for me to send a challenge of "draft-A" to multiple different friends? -- or is it only one challenge per draft?

If multiple people can get challenges to the same draft it'd be pretty rad to have a ranking system and toggle between each person's journey in comparison to Me vs Friend-A OR Friend-A vs Friend-B, etc.

I'm certain that's asking a lot and would appreciate some thought going into this idea. The last thing I wanna do is smash a square peg into a round hole - I want the proposed solution to be either a refactor IF APPROPRIATE or fit in smoothly to the current system - but don't be afraid to throw out existing non-conforming implementations that conflict with this feature-ask.

8c. If "8b" is possible then a great new idea: we have a "daily challenge" draft!

- Once a day we could spin up a new draft challenge where anyone who's a member could test their skills at drafting today's packs - which would be the same for anyone who tries.
- And then we could leverage the challenge diff views for this daily challenge.
- And see the best drafts/decks people made, most popular archetype - biggest/most common mistakes.

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

    `defense` related: how come we don't show the `defense` reasoning w/the
    current challenge mode?

11. New app title:

- Title: P1P1
- Taglines: ["Where every draft starts.", "Draft on instinct. Leave with reasons."]

12. Could we experiment with adding some kinda icons to all the principle types (SIG, EVAL, MISTAKE, CURVE, MANA, etc etc) and then render them slightly more concisely and definitely more interestingly/eye-catching/cool when they're referenced (i.e. by the coach/"your call on the gap")

13. It'd be kinda cool if we removed all mention of mana char references (UWBRG) and instead used the mana font/symbols. Here's an example from the coach:

```
Coach
Spectacular Skywhale fits your spells-matter UR shell fine — flying and instant/sorcery synergy
```

But I'd like further research into all parts of the app.

17. **A static page for what `detectRole` calls things** (2026-08-14). The
    classifier is a handful of regexes over rules text, and since it moved to
    ingest its answer is STORED -- so it decides which deck need a pick can meet
    (DECK-06, DECK-08) for the life of a pool, and correcting it costs a
    re-ingest rather than a deploy.

`scripts/show-roles.mjs` prints the distribution, examples with the phrase
that matched, and the arguable lists. It is a terminal dump, and the thing
actually wanted is a page: every card in a set, its role, the matched
phrase, filterable by role, so a wrong call is spotted by scrolling rather
than by grepping. Static HTML written to disk and opened directly -- no
route, no auth, no deployment, because this is a tool for whoever is editing
the regexes and not a feature of the app.

**The measured reasons it is worth having**, over 17 sets and 5,119 cards:
56 of 282 cards called removal by "deals N damage to" (19.9%) are aiming at
a PLAYER rather than a creature; 98 of 923 evasion cards (10.6%) GRANT
flying or trample rather than have it; and 44 fight/bite spells sit in
`other` because "deals damage equal to its power to target creature" matches
nothing. Fixing those is its own re-ingest, so seeing them first is the
cheap half.

# Deferred (from Draft Review grilling, 2026-07-21):

Out-of-scope for the Draft Review MVP, noted so we don't lose them:

1. Deep multi-ply permutation re-simulation (chess.com-style alternate lines —
   replay the whole draft down a different branch). The MVP stores the RNG seed
   specifically to keep this possible later without a retrofit.
   - Worth a second look at how close we are to something like this w/the
     newly added challenge mode ...
   - **Closer than expected: the single-ply case shipped 2026-08-09.**
     `forkImpact` in `core/src/draft/diff.ts` re-runs the pod with exactly one
     pick swapped and counts how many of your remaining packs come out
     different. It is sound because the engine is deterministic in a specific
     way — hand length at a given pick is the same for every seat regardless of
     who took what, each bot draws one number per card in its hand, and the
     human draws none — so the rng stream position is invariant and swapping a
     pick changes which cards are where and nothing else. A finished draft
     replays in ~0.16ms, so a handful of lines costs under a millisecond.
   - What it cannot do is the multi-ply part, and the obstacle is not cost. Past
     the wheel your real next pick may not exist in the counterfactual pack, so
     something has to decide what you would have done — and every answer to that
     is a policy. `reach` carries the assumption out loud ("and drafted the same
     way after"); `delay` needs none, because your own pick cannot reach your own
     packs before the wheel. Going deeper means either a stated model of the
     player or an interface that lets them choose, and that is the design
     question this item is really waiting on.
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
   - Is this even still an issue? Structurally yes — `schema.ts` still has
     `userId: v.optional(v.string())` with the "set once auth lands" comment, so
     the shape that allows an unreachable row is unchanged. Whether any such row
     survives is a question for the deployment rather than the code, and user
     tables here are disposable: if the answer is "a few dev rows", the fix is to
     delete them and make the field required, not to migrate them.
   - Also, related kinda but not really: it'd be very rad if we could have some kinda
     mock-auth so, as a dev, I could sign in offline - but low priority.

# Roadmap (pick per future session):

Ordered by value × readiness. Each is a candidate feature branch. Cite these by
NAME rather than number — the numbers have drifted from what cites them twice
already.

`expert-principles` shipped 2026-08-14, in eight phases. The draft principles now
decide exactly one thing — which card is put up against you when the win rates
cannot separate the top of a pack — confined to the `gapMargin` band where there
is no measurement to overrule, and firing on 21.6% of challenged picks. The grade
stopped docking a pick for a difference it cannot see (13.0% of real fdn picks
move to 100, all A→A+). The deck builder answers to `/principles`: land count by
DECK-03/04, mana base from pip counts with MANA-02's floors before MANA-01's
proportions. `turn` and `role` are settled at ingest so the browser and the server
judge one deck, with parity asserted over 23,940 real picks at zero divergences.

**Two things it left.** I/O is +18% per draft against a ~2.1MB baseline, which
overran the +12% it was gated at — the gate cited the 2.98MB figure from decision
#3, which predates the `draft.pick` split and was already stale. That promotes
the macro I/O review to the next phase. And the signal feature the principles
themselves argue for (SIG-03/04/05) was built, fitted over 75,646 picks and
priced at −0.04pp beside `openness`, 1.1pp worse in its place: being closer to
how a strong drafter DESCRIBES signal-reading did not make it a better predictor
of what drafters DO. Reverted; the harness and the finding are in
`policy.ts` and `diagnose-openness.mjs`.

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

`human-bots` shipped 2026-08-11 and its tooling finished on 2026-08-13. The pods
are fitted conditional logits over the pack (`core/draft/policy.ts`), `pnpm
fit-bot-policy` re-derives them, `pnpm bench-bots` scores any policy against real
human picks, and both read cached packs off `datasets/` rather than the network —
a refit went from ~15 minutes to seconds, which is what makes ablation cheap
enough to run before committing to a hypothesis rather than after. Every finding
that came out of it lives beside the code it constrains: `policy.ts` for what the
features are and why each earns its place, `bench-bots.mjs` for how to read the
sampled row against the argmax row, `draftCache.mjs` for what is cached and what
deliberately is not. Nothing stranded, and a pod name is frozen the moment a row
carries it — improving bots means ADDING a name, never re-fitting one in place.

**What did not ship is the player-facing half.** Ideas #4 (show the field) is
still unbuilt, and the expensive part it was waiting on — a draft-data pass that
reads `pool_*` and `draft_id` — now exists and is fast.

**Both queued bot items are answered, and both answers are no** (2026-08-14).
`fit-bot-policy --shape` fits a free indicator per bucket along an axis instead
of asserting a formula, which is the sharpness diagnostic from trap #7 kept
rather than thrown away. Over fdn+dsk, 75,646 train / 36,145 held-out, against a
52.52% baseline:

- **The lane ramp is right and the principles are wrong about it.** Nine free
  stage weights reproduce the shipped `laneFit + laneFitLate × progress` line
  within 0.27 at six of nine stages, monotone throughout, still climbing at
  P3late, and score 52.5% — nine parameters buying nothing over two. SIG-02/11/12
  describe a step onto a plateau by mid-pack-2; drafters do a ramp. **No refit.**
- **`cheapness` does not exist, and the evidence for it was lands.** Turns 1, 2
  and 3 fit to +0.013, +0.050, −0.007. The gradient that looked like cheapness in
  the first probe was `curveTurn` flooring lands at turn 1 — see trap #10.
- **`creatureNeed` does not exist, and neither does any other need.** All four
  `deckNeeds` interactions came back at zero, two with the wrong sign, while
  their main effects are alive (`removal` +0.319). Drafters have standing
  preferences about what a card does and do not visibly count what they hold.

What did turn up, unasked for: a four-drop is taken **less** than its win rate
says (−0.34, +0.4pp held-out, carrying nearly the whole curve-bank gain on its
own), and `removal` is the largest role main effect. Both are free — `turn` and
`role` are already on `EngineCard`. Neither is shipped: both were chosen by
looking at the held-out set and confirmed nowhere else, and a new feature means a
new pod name, which is a thing a person has to choose between. The reasoning is
in `policy.ts` beside the features it is about.

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

1.  **`trophyPickRate` cannot be fitted against.** It is the pick rate among 3-0
    drafters and is the only decision-level ground truth we hold, which makes it
    the obvious objective for a pick scorer — and it is nearly circular with
    `maindeckRate`. Maindeck rate ALONE ranks trophy picks at rho 0.90, against
    0.81 for the card value being improved. A weight search against it duly found
    +0.12 held-out, which is not a better scorer but one that has learned to
    predict one drafter behaviour from another. Use it as a CONSTRAINT — it
    catches a wrong sign or a wrong shape, and did both — never as a target.
2.  **A fixture with no gaps hides a whole class of bug.** `splashCost` paid a
    card 1.5pp to add a colour, because a width nobody drafted falls back to the
    format's own rate, which is higher than a measured wider archetype. Every
    test fixture had contiguous archetype widths; the real data had a hole. Found
    by reading a stored pick.
3.  **Most of the gaps a pick is graded on are smaller than the error bars on the
    win rates they came from.** A GIH WR is a proportion over `gihGames`, so it
    carries a standard error of sqrt(p(1-p)/n), and a difference of two carries
    the sum of their variances — about **±1pp between two well-sampled commons**,
    against a `winRateGapK` of 750 that turns 1pp into 7.5 points of grade. A 94
    and a 100 can be the same pick. `gapMargin` computes it and the coach prompt
    states it, because a scorer that reports a difference the data cannot resolve,
    with no error bar beside it, gets believed. One sigma deliberately: two would
    call nearly every pick in the format a tie.
4.  **A test that cannot fail reads as coverage.** Both the replay corpus and the
    value fingerprint were written with input batteries that could not have
    noticed the change they existed to catch — every ALSA value sat at the nudge's
    pivot or past its clamp. Perturb the thing under test and watch the guard go
    red before trusting it.
5.  **A test one function upstream of the hole also reads as coverage, and this
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
6.  **A comparison drawn from one side of itself agrees by construction.** The
    results screen sets your forty beside the one `suggestDeck` would have built,
    and for the whole life of that screen the suggestion was handed the MAINDECK
    rather than the pool — so a builder asked for the best 23 spells out of the 23
    you had already kept could only ever hand them back. Every deck matched
    near-perfectly and the screen read as a compliment. It was found by a player
    saying "I didn't think I was THAT good", not by anything in the codebase,
    because nothing counted the gap: `deck_built` said the forty was locked in and
    no event said whether the comparison had anything to tell them. **When two
    things are compared, measure the DISTANCE between them, not just that both
    arrived** — a gap pinned at zero is the signature, and it is invisible until
    something is counting it. `build_compared` now is.

7.  **An average over every decision hides the decisions that matter most.** The
    first fitted bot policy scored 47.7% top-1 against real human picks, well past
    the shipped bot's 46.8%, and every aggregate in `bench-bots` said it was
    better. It was also passing rares and mythics at P1P1 about twice as often as
    humans do — 34% against 61% on SOS, and the same on all four sets checked.
    A bomb is one card in fourteen and one pick in forty-two, so being wrong about
    it costs almost nothing in the mean and nearly everything in whether the pod
    feels real. **Found by drafting, not by measuring**: a mythic came round at
    P1P2 and did not look like something a person would pass.

    **The failure was in CONFIDENCE, not ranking**, which is the part worth
    carrying. The same model's argmax found bombs MORE often than humans (80.6%);
    sampling from it found them far less (34.4%). A model can rank correctly and
    still put the wrong probability on being right, and only the sampled number
    shows it — every accuracy metric in the harness was blind to it.

    **The first diagnosis was wrong and cost a fit.** The obvious suspect was
    pooling sets whose value scales differ — SOS squeezes its cards into
    0.61-0.67 where others spread wider — so a per-pack z-score went in. The fit
    gave it a weight of 0.11 and an ablation cost of −0.02pp, because within a
    pack a z-score is just `value / sd` and therefore competes with `value` for
    the same job. Scale was never the problem. **A plausible cause is not a
    diagnosis, and fitting one proves nothing on its own.** It cost fifteen
    minutes at the time and costs seconds now, which removes the excuse for not
    checking and none of the reason the check was needed.

    What found it was measuring the thing directly: fit a sharpness multiplier per
    stage of the draft and see where it lands.

        P1 early 1.25   P1 mid 1.0    P1 late 0.5
        P2 early 1.25   P2 mid 1.0    P2 late 0.5
        P3 early 1.0    P3 mid 0.75   P3 late 0.5

    Confidence belongs to the PACK, not the draft: high on a full pack, low on the
    dregs, and it resets three times. `progress` climbs monotonically across all
    42 picks and cannot express that shape at any weight, so the fit settled for
    one global level — too flat at P1P1, too sharp on the last few cards. The
    general lesson: **an interaction term can only bend a model along the axis you
    gave it.** Check that the axis is the one the behaviour actually varies on.

    `bench-bots` now reports the P1P1 bomb rate beside the aggregate, with the
    human rate first, because the aggregate on its own said nothing was wrong.

8.  **"Agrees with the human 48% of the time" is not a score until you know what
    two humans score.** This file spent three separate attempts looking for a
    ceiling for pick agreement — including `crowd`, which ranks by observed pick
    rate and was expected to be one and is not. The ceiling fell out of sampling
    for free, and it is arithmetic rather than a measurement: two independent
    draws from a distribution `p` agree with probability `sum(p^2)`, and an argmax
    matches a draw with probability `max(p)`. So a calibrated model's sampled row
    estimates how often TWO HUMANS handed the same pack would agree with each
    other (~39% on fdn) and its argmax row estimates the ceiling for any
    deterministic rule (~54%). Most of the gap to 100% is people disagreeing, not
    headroom, and a policy scoring 48% is much closer to the top of its range than
    the number looks.

    The general form: before treating agreement-with-a-human as an accuracy, ask
    what the irreducible disagreement is. Any metric whose label is a human
    decision has one, it is usually large, and reading the raw number without it
    invites paying for headroom that does not exist.

9.  **A computation that proceeds with less information than it needs is
    indistinguishable from the feature not existing.** Nine bugs in the
    `expert-principles` week, and not one of them threw, crashed or failed a
    typecheck. Every single one returned a well-formed, plausible answer that
    meant less than it claimed.

    The mechanism was always a fallback with a good reason behind it:

    | the fallback                     | the reason                     | what it did                                |
    | -------------------------------- | ------------------------------ | ------------------------------------------ |
    | `turn?: number` optional         | old pools lack it              | scorer ran with its deck-shape half off    |
    | `bandNames ?? []`                | old rows lack it               | verdict named one card instead of three    |
    | `role != null` guard             | might not be ingested          | every card met zero needs                  |
    | `engineHalf`'s field list        | a deliberate which-side choice | dropped two fields at storage, silently    |
    | a harness deriving absent inputs | be robust to stale caches      | reported 0.0% for a working feature, twice |

    **Why it bites here in particular.** This app's outputs are numbers that look
    fine. A scorer missing half its inputs still returns a grade; a harness
    missing a field still prints a percentage. There is no null to trip over.
    `validate-pack-model` already has the phrase for it one layer up — "this
    pipeline fails by succeeding plausibly" — and this is the same disease in the
    scoring code.

    **The distinction that makes it actionable**, because the answer is not
    "throw everywhere":
    - **Absence that is an ANSWER** should be modelled and kept. An unrated card
      genuinely has no error bars, so `gapMargin` returning undefined is
      information and refusing to invent a margin is correct.
    - **Absence that is a GAP** should be loud. An un-ingested pool has no roles
      because the pipeline did not run; that is not "no needs", it is "no
      answer", and it must fail rather than score.

    An optional field collapses those two into one shape, which is why narrowing
    `turn`/`role` to required mattered more than it looked: it turned a quiet
    degradation into a push failure.

    **The review question**: if this input were missing, would anything say so?
    `VALUE_FINGERPRINT`, `BOT_FINGERPRINT` and `corpus.test` each answer it for
    one known failure. Nothing answers it for a new one — which is how the
    "a card field needs five edits" note got read at the start of the session
    and the trap got walked into anyway.

10. **A bucket that pools two populations will fit cleanly and mean nothing**
    (2026-08-14). The queued `cheapness` bot feature had an obvious prior — of
    course drafters favour the cheap end — and the first probe agreed with it
    precisely: turn1 +0.155, turn2 +0.083, turn3 +0.032, turn4 −0.302, a clean
    monotone gradient any reviewer would have accepted. It was lands. `curveTurn`
    floors at one, so every card in the Play Booster land slot is a turn-1 card,
    and lands are **40% of the turn-1 cards on both fdn and dsk**. Given a column
    of their own, turns 1, 2 and 3 fit to +0.013, +0.050 and −0.007 — no cheap-end
    preference at all, and the feature would have shipped on a coefficient that
    was really "people take the dual land".

    **The tell was available and nobody had to measure anything to see it.** Every
    other reader of `turn` drops lands before counting: `manaCurve` leaves them
    out of the chart, `deckNeeds` filters them, `fitOf` refuses to argue about
    them. Three call sites had already made the same correction, and a fourth
    reader inherited the field without it. **When a field has an established
    convention at every existing call site, a new reader that skips it is the
    thing to check first** — the divergence is in the reader, not in the data.

    **And this is the class of failure a nice fit cannot rule out**, which is why
    it goes here rather than in a commit message. The contaminated feature was not
    noisy or unstable; it was strong, monotone, correctly signed, and it improved
    held-out accuracy. Everything that would normally be taken as confirmation was
    present. What separated it from a real effect was splitting the bucket, which
    only happens if somebody asks what is actually IN it.

    **A corollary about ablation, learned the same afternoon.** Do not ablate a
    bank of indicators one column at a time. The columns partition the pack and a
    conditional logit is invariant to a constant added to every candidate, so
    dropping one lets the rest re-level and re-express every difference that
    mattered: `--shape turn --ablate` prices all seven of its columns at +0.00pp
    while the bank as a whole is worth +0.45pp. Read that as "the ablation is the
    wrong instrument for a partition", never as "the axis is worthless" — to price
    a bank, compare it against a plain run.

# Deferred trade-offs (revisit when the premise changes):

0. **What the client may compute, now that scoring says "nothing".** Three bugs
   in a week came from one shape: `EngineCard` is deliberately thin because
   `setCards` is read on every pick, so anything needing a mana value or a type
   line could only run in the browser -- and the principle tiebreak did, while
   the grade ran on the server. The two then disagreed about the same pack on
   screen, three times, and each was patched where it surfaced before anyone
   traced it to the type.

   **Resolved for scoring** on 2026-08-14: `turn` and `role` are settled at
   ingest, and `needs` lives on `ScoringContext` built by `packScoringContext`,
   so a context without needs is unrepresentable and two callers cannot hold
   different ones. `diagnose-tiebreak.mjs` asserts the grade and the challenge
   name one card and holds at zero divergences.

   **The general rule is not written down anywhere and should be.** The working
   version: a client may compute what is CHEAPER to recompute than to send, and
   must not compute anything the server also decides. The second half is the one
   that was violated -- not by putting logic in the browser, but by putting it
   ONLY there, which made the server's answer a different answer rather than the
   same one arrived at twice.

   The premise changes if a rule ever needs data too big for `EngineCard`. Then
   the choice is a query before the pick rather than a field on the card, and
   the round trip is the thing to weigh -- not whether the browser is allowed to
   think.

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

1.  **Ingestion refuses to overwrite rated data with unrated data** — a guard
    against a re-ingest that comes back all-null (a brand-new set, or an upstream
    hiccup) wiping a good snapshot.
2.  **No Convex auth component and no `users` table.** WorkOS AuthKit issues
    RS256 JWTs that Convex validates directly against WorkOS' JWKS
    (`convex/auth.config.ts`). `draft.ts` only ever needs an opaque owner key and
    `identity.tokenIdentifier` already is one, so a user row would be dead weight
    and a sync webhook would be a second thing to keep correct.
3.  **A set's storage shape is chosen per reader, not once for the set.** Convex
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

4.  **Persisting the board was considered and rejected.** Having `draft.pick`
    advance a stored board instead of replaying was the headline of the I/O plan,
    and the pool split above ate its value: a board row averages ~11KB against
    the 46KB pool it would replace, and has to be rewritten on every pick. That
    is ~1.65x for the one change that carries real divergence risk — a stored
    board must advance bit-identically to replay, forever, or drafts silently
    diverge. The premise changes only if the pool grows a lot; it shrank.
5.  **`outputFileTracingRoot` must stay set** in `apps/web/next.config.ts`. Next
    traces from the project directory by default, and under pnpm 652 of the 653
    files in `next-server.js.nft.json` resolve outside `apps/web`.
6.  **A `next.config.ts` that reads the backend's `.env.local` was tried and
    reverted.** Shipped code reaching into a sibling package's gitignored file,
    to save three lines set once, is a worse trade than the duplication. Convex's
    own schema documents `localEnvVars` as writing "to the local `.env` file"
    with no path option, so `convex dev` cannot populate the Next app's file.
7.  **Do not add a task-level `env` key to `turbo.json`** — it _replaces_ rather
    than merges with `globalEnv` and has already silently dropped a variable
    once. Verified with `turbo run build --dry=json`.
8.  **What the score reads, and what it deliberately does not.** `cardValue` is
    frozen: bots pick by it, so it decides the deal, and every context-dependent
    judgement lives in `contextValue` instead where it can change without
    stranding a draft. Three terms, none tuned — archetype fit and splash cost
    are measured win rates carried in their own units, and the trust correction
    is one-sided because self-selection flatters in one direction only.
    - I kinda disagree: I feel like card scores should be impacted by what is currently in the maindeck & sideboard. I'm not convinced one way or the other, but I do think it's absolutely worth re-litigating.

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

9.  **Every card written into a prompt carries its rules text, and the model is
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

17. **What a comparison of two drafts is allowed to claim** (2026-08-09, the
    challenge feature). Five rulings, and the first is the one everything else
    is downstream of.

            **Live pod, not replayed packs.** Dealing the friend a recording of your
            forty-two packs aligns every row and makes their picks inert — nothing they
            take changes what wheels back — so signal-reading and wheeling, which is
            most of what a draft teaches, are switched off. It looks like a draft and is
            a multiple-choice quiz with your answer key. Prototyped and rejected on the
            merits, and it will keep looking like an obvious simplification, because the
            thing it costs is invisible in the diff it produces.

            **`samePack` is per row and computed, never a constant.** The prototype's
            `DRIFTS_AFTER = 7` is an artifact of `DRAFT.seats`, and worse it assumes
            drift is monotonic. Swept over 1000 seed/divergence combinations on
            `fakeSet`: the delay between diverging and seeing a different pack is never
            less than 8 and 8 exactly is reachable — that is the wheel, and it holds for
            a divergence at ANY index — **339 combinations never drift at all**, and 657
            drift and then re-converge. Two people can take different cards and still
            see all forty-two packs identical. The first seed I picked for the tests was
            one of the 339, so the drift assertions passed by never being exercised: a
            fixture too uniform to reproduce the phenomenon is trap #4 in a new costume.

            **Their score is their stored score.** A replay grades on raw power, and the
            whole point of comparing two people rather than two attempts is that each
            was graded against their own pool. That is why the diff reads `draftPicks`
            rather than replaying — which also makes it the one full-draft reader that a
            re-ingest cannot strand, and it costs 138.5KB against `review.load`'s 218KB.

            **The comparison is a braid, not a tree.** A tree fans out and never
            rejoins; two drafts run a fixed forty-two picks in parallel and re-converge
            constantly, so every fork drawn as a branch claims two futures that never
            happened. And the branch point is where the PACKS first differed, not where
            the picks did — at least eight picks apart — so a diagram drawn on
            disagreements puts the fork where the effect is and gets the causation
            backwards. The arc between the two is the one claim the drawing exists to
            make.

            **"Challenge" means two things in this repo on purpose.** The friend invite
            (plural: `challenges`, `convex/challenges.ts`, `/challenge/*`) and the
            counter-argument the commitment ceremony puts to a pick (singular:
            `core/src/tutor/challenge.ts`, `TheChallenge`, `draftPicks.defense

        .challengedName`, decision #11). Renaming either was considered: the

    ceremony's sense is load-bearing in the validators, and the invite's is the
    word the feature is called by everywhere outside the code. The comparison
    logic is therefore `core/src/draft/diff.ts`and not a second`challenge.ts`.

18. **The row is the grant, and `ownedSession` never learned about it**
    (2026-08-09). A challenge names both drafts, so "may I read this one"
    reduces to "am I one of the two people on a row that names it" — no share
    table, no ACL, and `ownedSession` is untouched, because it answers a
    different question and runs forty-two times a draft where a widened check is
    somewhere to be silently wrong forever.

    **Two gates, and the second is easy to miss.** `challengeParty` cannot guard
    the landing page: the person the link was written for is by definition not
    yet on the row, so a party check refuses precisely the invitee.
    `challengeInvite` asks only that they are signed in, because the id IS the
    capability — that is what a link is — and grants reading the offer and
    taking it up, nothing behind it. Missing row and wrong row refuse in the
    same sentence, so nothing answers "does this challenge exist" to anyone who
    asks.

    **`accept` is deliberately not idempotent.** It deals a draft and spends a
    quota token, so the friendly-looking "just return the existing session"
    hands somebody two drafts. Revoking is illegal once accepted, because by
    then the friend has spent one of their three for the day.

    **No status column, on `challenges` or on `draftSessions`.** The state is
    the timestamps, for the reason `accessRequests` has none. "Accepted and
    wandered off" stays derivable rather than teaching
    `draftSessions.status` a third literal every existing reader would have to
    learn.

19. **The coach can answer from the Claude Code CLI, and what that costs is
    fidelity rather than money** (2026-08-13, Ideas #11). Five rulings, and the
    first decides the shape of the rest.

    **A loopback HTTP server, because nothing else can reach a laptop.** Convex
    functions run in a V8 isolate with no `child_process`, so no amount of
    cleverness inside the deployment shells out. The only seam that reaches this
    machine is a request, and `llm.ts` already speaks openai-compatible — so the
    whole feature is an endpoint that spawns `claude -p`, and the app learns
    nothing. `scripts/claude-bridge.mjs` is the only file that knows the CLI
    exists.

    **One process per request, which is the slow choice and the honest one.**
    Keeping a session alive with `--input-format stream-json` would skip a
    ~1s spawn per pick and would carry conversation history between calls. Every
    call this app makes is a fresh single turn, so a bridge that answered pick 12
    while remembering pick 11 would be answering a question the app never asked —
    and answering it well, which is what makes it dangerous.

    **It refuses shapes it does not implement.** A multi-turn body, a tool
    definition, a `json_object` response format: 400, not a best effort. This is
    a bridge for one caller, and the failure mode of the friendly alternative is
    a fluent answer to a quietly altered question, which nothing downstream can
    detect. The wire contract it does implement was captured off the AI SDK
    rather than read out of a spec.

    **`--bare` was the obvious flag and is the wrong one.** It disables hooks,
    plugins, auto-memory and `CLAUDE.md` discovery in one switch — and documents
    that Anthropic auth is then strictly `ANTHROPIC_API_KEY`, which would spend
    money on every call, the one thing this exists to avoid. The isolation is
    therefore assembled by hand (`--tools ""`, `--setting-sources ""`,
    `--disable-slash-commands`, `--strict-mcp-config`, a cwd outside the repo)
    and the key is scrubbed from the child's environment. Likewise
    `--system-prompt` rather than `--append-system-prompt`: appending leaves
    Claude Code's own instructions in front of this app's, which is a different
    model answering.

    **Token counts from this provider are not comparable and the benchmark is
    still worth running.** Claude Code frames every prompt (~150 tokens on an
    empty call) and cannot report cache writes through this wire format, so
    input totals are inflated and no saving can be priced here. Output length,
    call frequency and accuracy are all real. What keeps that from being a trap
    is the provider NAME: usage rows record `claude-cli`, and `bench-llm` keys
    baselines and transcripts by provider, so a free run cannot land on top of
    an Anthropic one. `local` kept its old name for the same reason — renaming
    it would orphan every stored baseline.

    `max_tokens` has no equivalent on the CLI and is enforced in the bridge, by
    real output tokens where they are known and by four-characters-per-token
    while streaming, where the real count only arrives after the answer does. A
    `length` finish here means "about here" where Anthropic's means "exactly
    there" — which is the right side to err on: without it, a verdict that would
    be cut off in production reads as fine locally, and that is precisely the
    prompt somebody is here to tune.

20. **Caching the feature matrix was the obvious optimisation and is the wrong
    one** (2026-08-13, `scripts/lib/draftCache.mjs`). `fit-bot-policy` and
    `bench-bots` each spent five sixths of a fifteen-minute run gunzipping 17Lands
    CSVs, and the cache that suggests itself is the thing the fit consumes:
    feature rows. But feature rows are exactly what changes when somebody is
    iterating on `POLICY_FEATURES`, so that cache is stale on the runs it exists
    for — and stale silently, refitting against columns that no longer mean what
    their names say, which is the train/serve skew `policy.ts` exists to prevent
    arriving through the door marked optimisation. Keying on the feature list
    fixes the correctness and leaves a cache invalidated by every experiment worth
    running.

    What does not change when the policy does is the DEAL — which cards were on
    offer and which one was taken — so that is what is stored, and features are
    recomputed every run in seconds. Three things follow, and the third is why
    this is written down rather than left in the file header: the cache is thirty
    times smaller, so it holds every draft rather than a sample; it serves any
    consumer of these files rather than just the fit; and **it decides nothing.**
    `draft_id` is stored as the dataset spelled it, never hashed, because the
    train/test split is FNV over that id and the two scripts keep their own copies
    of that hash on purpose — a cache that hashed centrally would quietly become
    the shared helper both of those comments forbid. The only thing it is allowed
    to decide is when it is stale.

21. **A required field on pipeline data cannot be required on the deploy that
    introduces it** (2026-08-14, the failed `expert-principles` production
    deploy). `validators.ts` had the distinction almost right: `draftPicks.pack`
    is a snapshot written once and never rewritten, so a new field is absent from
    every historical row and cannot be required; `setCards.cards` is rebuilt by
    ingest, so it can. True in the steady state, and silent about the only moment
    it matters.

    The deploy command is `convex deploy && seed-set-stats && ingest-sets`. **The
    schema push comes first and the pipeline that fills the new field is queued
    behind it.** So on the one deploy that introduces the requirement, the push
    validates rows the pipeline has not reached, fails, and takes the pipeline
    down with it — ingest can never run, because the push it sits behind can
    never pass. Not a transient; retrying is retrying the same deadlock.

    **It passed dev and died on prod, which is the shape to expect.** A dev
    deployment has usually been re-ingested by hand long before the strict schema
    lands, so its rows are already conformant and the push sails through. Prod's
    are whatever the last successful deploy left. Any check that "the schema is
    fine" run against dev is answering a different question.

    The fix taken was to **clear `setCards` and deploy once**: a strict schema
    validates an empty table trivially, and that table is the one thing in the
    database defined as rebuildable. It changes no code, at the cost of the app
    showing no sets for the minutes ingest takes. The alternative — widen,
    deploy, narrow, deploy — has no downtime and was rejected because
    `_EngineShapeMatchesCore` deliberately binds the validator to core's
    `EngineCard`, so widening breaks the typecheck in about five places and edits
    the live scoring path twice to ship no behaviour change.

    **The trap inside the fix**: after emptying the table, confirm ingest logs a
    re-crawl and not `unchanged, skipped`. A `POOL_REVISION` still matching the
    stored `sourceHash` would skip every set against a table that was just
    emptied, and the deploy would report SUCCESS with production holding no cards
    at all. `--force` is the way back in.

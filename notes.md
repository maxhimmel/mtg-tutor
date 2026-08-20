# Issues:

Numbering is stable and therefore gappy, for the same reason the ideas below
are: `corpus.test.ts` cites issue #3. A fixed issue is deleted and its number
left empty rather than renumbering everything under it. 1, 4, 6, 9 and 10
shipped on 2026-08-15; 11 (mana pips off the cost, not the colour) and 12 (the
hover preview surviving a click and a scroll) on 2026-08-17; 14 (the deck
builder's principle citation drawn as a badge like every other) and 15 (forced
picks out of the misses lists) on 2026-08-19.

4 and 18 (the same report twice, and the scorer now charges an off-colour card
for the deck it is not going to be in), 13 (the coach knows a card went
straight to the sideboard), 14 (one word for practice) and 17 (the scroll box's
lip cut from the scroll position) shipped on 2026-08-20.

5 (the coach arguing for a card using the one you took instead), 6 (the scorer
still holding up cards the deck cannot cast, which was 4 and 18 not actually
fixed) and 7 (the stats panel losing its room to a token picture) shipped later
the same day. 6 is the one worth reading about rather than only counting: the
term shipped for 4 and 18 was correct and never fired, for two independent
reasons, and neither of them was visible in any number the app collected. The
rulings are decisions #23 and #24; the trap the instrument fell into is #14.

6 had a third half nobody reported, found while three agents were re-checking
the first two. **The review screen was never asking the scorer at all.**
`review.ts` put only `rawBest` on a stored pick, so the CONTEXT_BEST mark was
the review model's own nomination -- or, with no verdict fetched, the raw-power
best, which is the exact defect `Verdict.tsx` was fixed for on the live board
and which sat unfixed two screens away. So both of the day's scoring fixes
stopped at the board: a screen read AFTER the draft went on nominating cards the
deck cannot cast, from a model that had never been told the colour rule.

The general shape is worth more than the fix: **a rule taught to a scorer only
reaches the surfaces that ask the scorer.** Three did and one did not, and the
one that did not was the one nobody had a complaint about yet.

15 shipped in two parts, and the second is worth reading before touching the
floor again. The filter went in first at `REVIEW.decisionPickMinCards` = 5,
which had been the number since the review quiz was written and had never been
measured. The test is `cardsInPack >= this`, so 5 KEPT the pick that sees five
cards -- the tenth of fourteen -- and dropped only the last four of a pack. The
first real drill run dealt exactly that pick and it was reported as a miss that
was not one. Raised to 6 the same day, which drops the last five.

**A metric was added to settle this and a person settled it first.**
`stats_viewed.forced` counts the misses the floor withholds and it is still
worth having, but it answers "how many does the floor withhold" where the
question was "is the floor in the right place" -- and no size of number answers
that. Worth remembering the next time an instrument goes in beside a threshold:
the instrument measures the setting, and only somebody standing in front of the
result can say whether the setting is wrong.

The floor is shared with the coach on purpose (`COACH.minPackCards` reads off
it) so both moved: three fewer coached picks per draft out of about thirty, on
picks whose advice was always going to be "you had no choice". The stored
per-player `coachMinPackCards` is a localStorage setting and does NOT move with
it -- anyone who drafted before this keeps the 5 they were serialised at, and
the `Coach >=N` control on the board is where it changes. Deliberately not
migrated: 5 is a legal value somebody could have chosen, and rewriting a
deliberate choice to fix a stale default is the worse of the two errors.

2.  It seems like the coach does a bad job of encouraging/noticing themes/synergies between chosen cards and the latest pick the user just chose.

    **Still open, and the cause is NOT missing data.** Investigated 2026-08-20;
    the ruling and the numbers are in "Deferred trade-offs" #3. Short version:
    `setStats.synergies` is unusable and was never what would have fixed this,
    and the coach is handed the pool as bare NAMES while being told never to
    reason from a name -- so it is obeying the rule with nothing to notice a
    theme in. The experiment worth running is the pool's rules text. Nothing
    has been built.

3.  **A re-ingest can still strand a draft, through the half nobody guarded**
    (rewritten 2026-08-18). Everything this item used to describe is gone.
    `draftPools` gives every session its own packed cards, so the PACKS are
    beyond a re-ingest's reach, and `draftSessions.sourceHash`, `staleAgainst`,
    the stale badge and the "can no longer be rebuilt" error were all deleted
    with the hazard they existed for.

    **The card TEXT was not.** `sets.ingest` replaces a set's `setCardText` rows
    wholesale, so a card that leaves a pool loses its row while a draft in
    progress goes on holding that card in boosters nothing can reach to update.
    The board joins the two halves by name and `hydrateCard` throws on a name it
    cannot find — deliberately, because a blank frame with no name is worse — and
    it throws during RENDER, so the board went white with the reason in the
    console and the back button as the only way out.

    Handled on 2026-08-18: the board asks before the answer can take the page
    down, names the cards that left, and puts a delete on that screen. A FINISHED
    draft lands there too and is offered its review first, because `review.load`
    reads the rows each pick wrote and rebuilds nothing.

    **Never reproduced live.** The mechanism is read off the code and verified
    there; nobody has watched it happen. Worth knowing before trusting the copy
    on that screen.

    Not a hazard the eighteen-set re-ingest of 2026-08-17 hit: card counts held
    for every set, all 29 distinct cards of a pre-re-ingest draft still resolved,
    and every pool card in all 18 sets has a text row.

4.  Something that's been bothering me is the coaching section when we take unimportant picks that aren't meant to be graded. As well as the coach when we've run out of tokens.

- A. I think the coach advice looks ugly - i know it can't be as nuanced because it's algorithmic, BUT it's be nice if we could improve upon it because it hasn't been touched since the apps inception.
- B. I would like you to consider some frontend/UX options on how we can convey to the user that the normally intelligent (ai-driven) coach is now essentially disabled. I'm not sure what the solution is, but would love some research and like 5 suggestions/solutions/options.

5. Kinda weird the coach and the scorer text say two different things about the margin of error:

```
Last pick
A
91/100
You took
Brush Off
Graded against
−1.2pp ± 1.1pp
Sundering Archaic
That gap is larger than the margin of error on the two win rates.

Coach
Brush Off is a fine counterspell that fits your
 shell and stays cheap when it counters a spell. Sundering Archaic edges it out by removing a permanent unconditionally on a 3/3 body, but the gap is within the margin of error, so this pick is essentially a coin flip — no need to second-guess it.
```

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
`README.md`, and the roads not taken are decision #19. 11 again — the app title,
which is live in `apps/web/app/layout.tsx` as "P1P1 — Draft on instinct. Leave
with reasons." — and 12 (principle marks) and 13 (mana symbols in prose) shipped
on 2026-08-15.

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
   - I love that we now have a way to see the N-closest cards if they're in some kinda
     error margin. So maybe we show all rather than only one?

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

   **Explored on 2026-08-17 and put down, with two things worth keeping.**

   The wheel is largely already in the stats we store. Measured over 6,001
   drafts each on fdn, woe and mh3 against the wheel counted directly (a card
   first offered in a pack's opening five picks, seen again eight or more picks
   later): `wheel% vs ALSA` r = 0.91-0.92, `vs ATA` r = 0.91-0.94. Bucketed into
   a three-way sentence it agrees 83.5-91.0% of the time, and every disagreement
   is a card ON a threshold moving between adjacent buckets — nothing is ever
   told to come back when it will not.

   But the coefficients do not transfer. fdn fits ALSA at -0.027 where woe and
   mh3 fit +0.072 and +0.076, so a single global formula is worse than any
   per-set one and the "free" version still needs three stored numbers per set.
   And the misses are systematic: cards around ALSA 5.4-5.7 run ~20pp above the
   line, which is where most playables live.

   **The road not taken, and it should stay not taken.** Simulating the pod
   forward to compute a live wheel probability was proposed and rejected on the
   spot: it would hand a player a readout of what the other seats are doing, in
   an app whose subject is learning to READ what the other seats are doing.
   Cheap, accurate, and teaches the opposite of the thing.

   What the exploration was really circling is a smaller idea that does not need
   this one: the stats already on the hover panel are unreadable, and holding
   Shift already swaps them for a definition that is identical for every card.
   Making that explanation read the value is a deploy, not a pipeline. Left
   undone deliberately — several passes at the wording went nowhere and it wants
   a fresh start rather than more iteration.

5. **Sealed mode.** Six packs, no passing, build the 40. `makePack` and
   `suggestDeck` already exist, so this is mostly a new screen — and it is a
   different skill (pool evaluation and deck construction rather than pick
   order).
   - Not too interested in this format. Low priority.

6. **Shipped 2026-08-18** — the packs you got wrong, dealt back, at
   `/drills/misses` and `mtg-tutor practice`. What it is and what it refuses are
   in `README.md`; the reasoning that shaped it is in the commits and in
   `core/src/drills/`.

   The number keeps a stub rather than being left empty, because the drills
   category it opened is where Ideas #1 and roadmap #3 are now expected to land,
   and both cite this shape. Two things it deliberately did NOT do, so that
   picking either up is a decision rather than a discovery:
   - **Nothing is recorded.** A run writes no row, so the same misses come back
     until you draft more (`skip` pages past them for a sitting). Whether being
     dealt your own mistakes teaches anybody anything is a question about
     people, and `drill_answered` is what answers it: `fixed` is a pick got
     wrong once that would now be got right. Persisting attempts is Deferred #2,
     and this is the evidence it is waiting on.
   - **No star rating, no streak, no retention loop.** Those are the reward half
     of a mini-game and they are only worth building over a drill somebody
     already wants to play twice. The events say whether that is true before any
     of it is designed.

7. **Shipped, and the note went with it** — resuming an abandoned draft. The
   question this held ("is a draft that isn't completed even tracked on the
   DB?") is answered yes: `draftSessions.status` carries `"active"`, and
   `draft.unfinished` lists every open draft on the screen the app opens on,
   with a picks-so-far count and a `promised` flag so a draft a friend is on the
   other side of cannot be thrown away. `draft_resumed` is the event.

   The number is kept rather than reused, because the entry below cites 8 and
   the renumbering that briefly closed this gap took 8's number with it.

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

10. **Shipped 2026-08-19** — the reason you wrote for a pick is now readable,
    on your own review and on both sides of a challenge diff. The sentence was
    written and stored from the day the commitment ceremony landed and read by
    exactly one thing, the coach prompt; the two screens that show picks back to
    a person both dropped it in their projections. Four projections carry it now
    and nothing new is read — `storedPicks` collects whole documents, so the
    field was already paid for.

    The number keeps a stub rather than being left empty, because the honesty
    question this was waiting on is not answered by shipping it, only opened:
    - **A reason written for yourself is not a reason written for a friend.**
      Whether people stay honest in that box now that it is readable is the
      thing that decides whether this was a good idea, and it is measurable —
      `pick_made` already carries `confidence`, `challenged` and `stood` per
      pick, so a change in how the box is used after somebody's first shared
      draft is visible in data already being collected. Nobody has looked.
    - **Most rows have nothing to show**, because a `defense` exists only for a
      pick made through the ceremony (decision #13) and the CLI has only the
      passive flow. Every reader draws the absence as absence rather than
      filling it, and `diff_viewed.reasons` is the count that says whether the
      panel is a feature or an empty box — near zero across real challenges
      means the thing to fix is the ceremony being off, not the panel.
    - **The heads-up is at the link, not at the box.** "They will see your
      reasons" is said once, in `ChallengeAFriend`, at the moment a private
      draft becomes a shared one — rather than under the textarea, where it
      would be read forty-five times a draft about a link most drafts never get.

11. **The coach cannot see what a Map is either** (2026-08-15, fell out of
    shipping the token feature). Decision #9 is that every card written into a
    prompt carries its rules text, because a type line cannot say whether a card
    kills something and a model asked to judge from the name answers from the
    name. "Create a Map token" is exactly that failure one level down: the coach
    is handed a card whose text names a thing it has never been told the rules
    of, and Map, Junk, Blood, Clue and Incubator are all set-specific enough
    that recall is the worst place to get them from.

    The data is now stored, which is the whole reason this is worth writing
    down: `setCardText.tokens` carries a name and a type line per token, and the
    token's own rules text is the one thing it does NOT carry — that lives only
    in the picture. So this is not free. It is either a fourth Scryfall field to
    ingest (`oracle_text` off the token sheet, which the crawl already fetches
    and throws away) or nothing.

    Price it before building it: roadmap #4 measured rules text at +947 input
    tokens per coached pick, and a token's text on the ~6 cards a pick shows is
    the same shape of cost for a much rarer payoff.

12. **A static page for what `detectRole` calls things** (2026-08-14). The
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

13. I want to improve the coach's (actually the AI being used anywhere in the app) vernacular. I want the AI to talk more like a seasoned friendly MTG player.

Here's an example I don't like:

```
Fine pick, but the gap to Spectral Sailor is right at the margin, so they're essentially indistinguishable in the data. Balmor is a strong payoff card that pushes you toward spells-matter, while Spectral Sailor is a cheaper, higher-floor flyer that fits nearly any blue deck — either is defensible at pick 1.
```

- I don't like "higher-floor" and "defensible". What the heck does higher-floor mean in this context?

It'd be extremely rad to do some deep research, find some blog posts or something, and collect a list of terms off the internet and store them as a reference here in the project.

- Secondarily, I think YOU (the AI helping me develop this app) should also be aware of that same vernacular because you make some wacky suggestions for things I really don't like/never heard before such as "The Forty" when the term "Deck" is the norm.

- Lastly, I think this particular idea should be done in a minimum of 2 phases:
  1. Research and author the list of vernacular.
  2. Improve the runtime app's usage of AI with proper terminology.
  3. Do a pass of everything in the app and update labels, title, etc, EVERYTHING.

14. Can we look into some tried and true plugins/packages for resizing, window-drag-n-drop, etc as a standard the app could use?

- I'd love to be able to have the drafting window have sections be resizable and adjust their layouts if appropriate
- It'd be cool to empower users to move sections where they like

15. Could we have some kinda UI element that shows HOW a score is being added up to give the results it's giving when I make a pick? Some kinda snazzy infographic that explains the weights/calculations.heuristics/etc???

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

   **Now has a second customer and a gate.** The misses drill (Ideas #6) grades
   a retry against the pick's own stored answer and forgets it, which is why it
   needed no schema — but "you fixed six of ten today" is the sentence this item
   would turn into "and four of those you had missed twice before". Both surfaces
   want the same row: which question, what was answered, when. Deliberately not
   built ahead of the drill's own numbers, because a table designed before anyone
   has played twice is a guess about what to store.

# Still open from shipped work:

Numbering is gappy here for the same reason it is above: a fixed item is deleted
and its number left empty rather than renumbering everything under it. 3 (the
CLI's review quiz printing the answer beside the question) shipped 2026-08-19.

1. **`stats.overview` disagrees with itself about a draft with no summary**
   (2026-08-17, found while giving the web app `/stats`). `recent` maps a
   missing summary to `overallScore: 0` while `avgScore` filters those sessions
   out through `scored`, so a completed session carrying no summary would plot
   as a zero column and drag the chart's axis floor down while the header
   average ignored it. The window is already filtered to `status === "complete"`
   and `draft.pick` writes the summary in its completion branch, so this needs a
   completion that wrote none — narrow, real, and not worth widening the query
   for ahead of the overhaul that screen is going to get. Left visible rather
   than filtered, because filtering hides a disagreement between two fields of
   one query.
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

3. **The drill's deck rail stops short of the fold once it pins** (2026-08-18).
   Its height is measured at rest, where the masthead and the page heading sit
   above it; pinned, the masthead has scrolled away and that much screen goes
   unused at the bottom. No `calc` can be right in both states — see
   `useRailHeight` — so the only exact fix is to stop the page scrolling at all:
   a fixed-height board where the pack scrolls in its panel and the deck scrolls
   in its rail, which is what that screen probably wants to be anyway. Deferred
   because it changes how the whole route lays out to buy back a strip of empty
   panel.

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
says (−0.34), and `removal` is the largest role main effect. Both were chosen by
looking at the held-out set and confirmed nowhere else, which is the caveat that
was written down at the time and turned out to be the whole story.

**Both were confirmed on sets nobody had looked at, on 2026-08-17. One died.**
Refitted with the corrected colours and ablated one at a time:

    ablation, held-out top-1   fdn+dsk   woe+blb   four sets   ALL EIGHTEEN
      turnFour                 +0.40pp   −0.10pp    +0.10pp     not fitted
      removal                   0.00pp   +0.60pp    +0.20pp       +0.10pp

`turnFour` CHANGES SIGN out of sample — everything on the two sets it was found
on, less than nothing on two it was not — so its pooled positive is the
discovery sets showing through a mean. Dropped, and it was the one that looked
stronger. **A feature discovered on a held-out set has been SELECTED on that
set, so its held-out number is a training number wearing the wrong label.**

`removal` never changes sign (+0.26, +0.52, +0.36 across three fits) and shrank
with breadth to +0.10pp pooled over all eighteen. Shipped anyway, on the
sharper question of whether it makes the pods act more HUMAN rather than more
accurate: it is closer to the human P1P1 bomb rate on all three sets checked,
better or equal on top-1 on all three. `table2` and `sharks2`; the menu still
reads "A real table" and "Sharks", because a pod id is a storage key and the
label is the product.

**The colour fix is priced in the same run**, on the identical fdn+dsk split
this probe used — same 75,646 train / 36,145 held-out, same seven features, only
the colours corrected: 52.52% → 52.8% held-out top-1. That reaches every new
draft through the data rather than through the weights.

All eighteen 17Lands draft datasets are cached in `datasets/` (308MB,
gitignored), so the next experiment of this kind costs seconds.

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

11. **A harness built out of the wrong projection reports the app as broken in
    exactly the way it is looking for** (2026-08-20, `diagnose-offcolour`). The
    first run said the scorer nominated an off-colour card 55% of the time in
    pack 1 and 30% in pack 3 against a human 24.6% and 2.3%, which is a
    plausible number for a real bug and was the bug being hunted. It was also
    measured with the colour terms switched off, by the harness itself.

    The pool was built out of `{name, colors}` — the `PoolCard` projection a
    stored row carries, and the correct shape for `committedColors`, which is
    what it was copied from. `commitment` weights its share by `cardValue`, so a
    pool of projections totals zero, returns a zero share, and pins commitment
    at 0 for all 45 picks. Every colour term is multiplied by it.

    **Trap #9 in the instrument rather than in the app**, and worse than trap #9
    in one specific way: a fallback inside the app degrades a feature, while a
    fallback inside the thing measuring the app degrades the EVIDENCE, and there
    is nothing further out to catch it. The number it produced was not absurd.
    It pointed the right direction. It would have been quoted in a commit
    message and believed, and the real fix would then have been judged against
    a baseline that was 20 points too pessimistic.

    What caught it was printing an intermediate nobody had asked for — mean
    commitment per pack — on the way to answering something else. The general
    form: **an instrument must report the inputs its verdict is scaled by, not
    just the verdict.** `diagnose-offcolour` now prints commitment per pack
    beside the rates and refuses to print a table at all if it never leaves
    zero. The refusal is the part worth copying; the print is what makes it
    unnecessary.

    Related and cheaper: `backtest-scoring` had been throwing on every run since
    `computeCardValue` learned to read a type line, and nothing said so, because
    nothing runs it but a person. A harness with no caller rots silently.

12. **`splashCost` is flat past three colours, so a wide deck adds a fourth for
    free** (2026-08-20, noticed while measuring the above; NOT fixed). The
    artifact carries no four- or five-colour archetypes, so `winRateAtWidth`
    falls back to the format baseline and the `worst` running maximum keeps the
    three-colour figure: fdn prices widths 3, 4 and 5 at 0.0432 identically.
    A deck already committed to three colours therefore pays
    `splashCost(4) - splashCost(3)` = **zero** to add a fourth, and 52% of the
    off-colour nominations measured were made to pools already three wide.

    The off-colour term now covers most of this by a different route -- a card
    the deck will not play is charged its whole value, regardless of width (see
    decision #24; it was "whatever it was worth above the baseline" for four
    days, which charged most cards nothing) -- so this is no longer producing
    the visible bug. Decision #23 also narrows the colour set the width is read
    off, so the "already three wide" premise is much rarer than when this was
    measured. It is
    written down because the flatness is still there and is still wrong, and
    because the honest reading is not obviously "fix it": there is no measured
    four-colour win rate to charge against, and inventing one is the thing
    `splashCost`'s own comment refuses. See the monotonicity note there.

13. **A max-of-many is significant against its own null and still smaller than
    chance** (2026-08-20, `setStats.synergies`). The obvious check on the stored
    synergy lists says they are real: against a correct no-synergy baseline the
    top-8 partners sit **+3.1pp high, with a quarter of them past z = 2**, on
    every set. That is the number a reviewer would accept, and it is worthless.

    The lists are the top 8 of several hundred candidates per card. Selecting
    the maximum of many noisy draws produces a large positive value with
    probability one — so "the selected entries beat their own mean" is not
    evidence of anything, it is the definition of selecting them. **A null has
    to be put through the SAME selection to be a comparison.** Simulate the
    whole pipeline — real candidate sets, correct null means, real sampling
    noise at each pair's own n, then take the top 8 — and pure noise produces a
    LARGER top-8 than the real data on all eighteen sets.

    So the honest reading flips from "+3.1pp and significant" to "less structure
    than chance", on the same data, from adding one step to the null.

    **What makes this its own trap rather than an instance of #7.** Trap #7 is
    an aggregate hiding the decisions that matter; this is a comparison that is
    correctly computed, correctly signed, and pointed at a quantity that was
    never the question. It also cannot be caught by looking at the winners:
    inspecting the top partners is exactly the step that reproduces the
    selection. What catches it is asking what the number would be **if there
    were nothing there at all**, and the only way to answer that is to build the
    nothing and run it through the same machine.

    The general form, for anything that ships a "best N" out of a candidate set:
    **the significance of a selected item is not the significance of the
    selection.** Corollary worth keeping — this cost nothing to settle. The
    simulation reads the committed artifacts alone, needs no re-ingest and no
    stored field, and would have been as cheap on the day the statistic was
    written as it was on the day it was retired.

    A cheaper tell that was available the whole time and nobody looked: 8.5% of
    the stored "best partners" have a lift of zero or less, and across the
    eighteen sets a stored partner shares a colour with its card only 27.6-66.3%
    of the time, median about 40% (woe 27.6, blb 29.0, fdn 34.7, sos 66.3 —
    counting coloured pairs only, colourless cards skipped). On most sets a
    MAJORITY of a card's best partners are cards it cannot cast alongside it in
    a two-colour deck. That needed no statistics to see, only a reader.

14. **An instrument that builds its own copy of the thing it measures will go
    on measuring the old one** (2026-08-20, `diagnose-offcolour.mjs`). The
    harness has a paragraph refusing to reimplement "off-colour", and it imports
    `isOnColor` and `committedColors` for exactly that reason. It then assembled
    the scoring context BY HAND -- `{ colors, commitment, archetypes,
contextFor }` -- because `packScoringContext` also wants `needs` and the
    harness did not care about needs.

    So when the colour rule moved (decision #23), the app changed and the
    instrument did not. It went on reporting the old rule's numbers, correctly,
    with the right imports at the top of the file, and nothing anywhere could
    have said so. It now calls `packScoringContext` like the mutation does.

    **The second half is worse and is the general form.** The same file printed
    "the colour terms charged it 0.34pp" under its table, from a filter naming
    `splash` and `archetype`. That filter was written before the off-colour term
    existed and nobody widened it -- so the number under a table measuring the
    off-colour term **excluded the off-colour term**. It read as a healthy small
    charge and it was a subtotal of the two terms that were not the subject. The
    true figure was 1.28pp, which is still far too small, which is the finding
    the instrument was built to surface and had been hiding for four days.

    The rule: **a harness must not enumerate what it sums.** Sum everything and
    exclude by name, as it now does (`t.label !== "trust"`), so a new term joins
    the total by default rather than by somebody remembering. An allowlist in an
    instrument is a silent undercount waiting for the next field.

# Deferred trade-offs (revisit when the premise changes):

0a. **`apps/web` has no DOM test harness, and the hover preview is the reason
to know it.** No jsdom, no happy-dom, no testing-library anywhere in the
monorepo, so nothing in the web app can be tested at the component level --
only pure functions it exports and the seams (`analytics.ts`,
`previewPlacement.ts`) that were extracted for the purpose.

**Why that is worth writing down rather than shrugging at.** The card hover
preview has now been fixed FIVE times -- `4775c63`, `56da759`, `f9c0f8b`,
`61ff7a9`, and the click/scroll fix on 2026-08-17 -- and not one of those
changes could go red in CI. Every one of them is a rule about what happens
on an event: the pointer leaves, the anchor unmounts, a drag starts, the
route changes, a stage opens. Those are exactly the rules a DOM harness
tests and a pure function cannot.

The dismiss-on-click bug is the demonstration. `CardTile` called
`hidePreview()` on click, which was right when a click WAS the pick, and
two later commits changed what a click means without touching it. A test
asserting "the preview survives a click" would have failed the moment
`9cdbcde` landed. Nothing failed, and it shipped, and it took a person
noticing the preview vanish under their own cursor.

**The current answer is still no**, and deliberately: two dev dependencies
and a vitest environment config against a repo that has kept its moving
parts few on purpose, and the extraction trick has worked twice now
(`previewPlacement.ts` pins the placement rule, `plot.ts` pins the stats
axis). What it does not cover is event wiring, which is where all five of
those bugs lived.

**The premise changes** when a sixth regression lands in the same file, or
when a rule cannot be extracted into a pure function without contorting the
component around the test. Either is the signal to stop paying for this in
people noticing.

0.  **What the client may compute, now that scoring says "nothing".** Three bugs
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

1.  **The draft board no longer live-syncs — and it is now cheap enough to
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

2.  **`llmUsage` stores raw rows with no rollup — revisit when prod volume makes
    a full-table read expensive.** Every model call appends one ~150-byte row.
    That is nothing next to the ~240KB documents that drained the tier, so
    aggregating at read time is free at current volume and a rollup cron would be
    moving parts bought against a cost that does not exist yet.

    The premise changes when months of real traffic accumulate: "total tokens
    ever" then reads every row, which is exactly the `sets.list` pattern. At that
    point fold raw rows into daily per-area totals and prune the raw rows on a
    retention window. The benchmark harness is unaffected either way — it filters
    by `runId` and only ever reads one run.

3.  **`setStats.synergies` does not survive its own noise floor, and the coach's
    problem was never this data** (investigated 2026-08-20, nothing built;
    Issues #2 is the complaint). Left in the artifact rather than deleted,
    because deleting it is a rebuild of eighteen sets and a re-seed to remove a
    field nothing reads — but it must not be picked up, and the comment that
    used to sit in `validators.ts` invited exactly that by framing the omission
    as a BYTE cost with pool indices as the way to afford it.

    **The statistic.** `build-set-stats.mjs:527` is

        lift(a,b) = pairWinRate(a,b) − (soloWr(a) + soloWr(b)) / 2

    and the halves are measured over different populations: `pairWinRate` comes
    from `inDeck`, the win rate of games where both cards were in the 40, while
    `soloWr` is GIH WR (`:522`), games where the card was in HAND. GIH exceeds
    deck WR by roughly `(1−p)·IWD` per card, so the baseline sits on a higher
    scale than the thing subtracted from it and the shortfall varies with each
    card's own IWD.
    - **The zero point is about −1.4pp, not 0** (−0.61 to −1.76 by set) under a
      purely additive no-synergy null. The "median lift 1.93pp" this was once
      defended with is a distance from a zero the formula never produces.
    - **The ranking prefers low-IWD partners by construction**, because
      `−(1−p)·IWD/2` is in the baseline. Stored partners run 0.3-1.2pp below
      their set's mean IWD — the same order as the whole claimed signal.
      Independently, `corr(lift, mean IWD)` = −0.171 on fdn and
      `corr(lift, mean GIH WR)` = +0.116, so the subtraction fails at the one
      job it exists for.
    - **Pure noise put through the same top-8 selection beats it on all
      eighteen sets**: fdn 2.72pp simulated against 2.10 observed, SOS 2.70
      against 1.44, and the same at p90. There is no structure in these lists
      that chance does not already account for. Trap #13 is the general form.

    Two collaborating defects. `isBasic` (`:420`) tests `slot === "land"`, which
    is the five basics only, so every dual and utility land is a spell here and
    lands are over-represented in partner slots by 1.1-2.5x on 17 of 18 sets —
    `readGameData`'s own comment about spurious land partners, defeated one
    function from where it is written. And **8.5% of all 38,711 stored partners
    have a lift of zero or less** (SOS 17.6%, worst −26.6pp) while
    `schema.ts:166` calls the field "best partners first": the list is padded to
    eight with whatever cleared `MIN_PAIR`, not filled with eight good ones.
    Where the lists are not noise they are archetype membership, which
    `archDelta` already scores and explicitly recentres to avoid charging twice.

    **What the complaint actually is.** `summarizePool`
    (`core/src/tutor/pickCoach.ts:11`) writes the pool as bare NAMES grouped by
    colour, and `poolBefore` is stored as `{name, colors}` with no text — while
    the system prompt tells the model never to reason from a card's name because
    these sets are newer than it is (decision #9). It is obeying the rule.
    Nothing in `core/src/tutor/` asks it to look for synergy at all.

    **The experiment, in order.** First a prompt-rule-only version as a CONTROL,
    expected to be worse: a model asked about synergy with only names in front of
    it answers from names, which is what `CARD_TEXT_RULE` exists to stop. Then
    the pool's rules text for the ~6-8 cards nearest the pick, selected in the
    browser where the text already sits. That costs **no Convex read bytes** —
    the browser holds the full pool as whole cards and paid for the text once per
    session, and mutation arguments are not database reads. Tokens: the whole
    pool is ~3,200 mid-draft and ~6,500 by pick 42, too much; ~6-8 cards is about
    +1,000 against a variable part of ~1,071, and the system prompt stays cached.
    Measure how often the coach's reply NAMES a pool card, baseline first — a
    feature that never names one has silently not shipped.

    **Two corrections worth not rediscovering.** Intersecting partners against
    the pool server-side saves nothing: Convex bills the document retrieved, so
    the pack's rows are paid for before any filtering, and an intersection only
    reduces what is RETURNED. And repairing the statistic (deck-scale both sides,
    all lands excluded, a higher `MIN_PAIR`, shrinkage for multiplicity) costs
    nothing to EVALUATE — the null simulation is the acceptance test and needs
    nothing stored. Expect it to end at no: with SE ≈ 2.2pp at n≈500 and real
    effects likely under 2pp, the `MIN_PAIR` that would resolve them collapses
    the eligible set to archetype-mates.

    **The premise changes** if a corrected statistic clearly beats the noise
    simulation, or if the pool-text experiment lands and the coach still cannot
    see a theme the data would have given it. Until one of those, treat any
    synergy number as unbuilt.

    If it stays in the artifact: `schema.ts:166` should stop calling it "best
    partners first", and `validators.ts:291` should say the signal did not
    survive measurement rather than that it was priced out on bytes.

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
    stranding a draft. FOUR terms now, none tuned — archetype fit and splash
    cost are measured win rates carried in their own units, the trust correction
    is one-sided because self-selection flatters in one direction only, and the
    off-colour charge added on 2026-08-20 charges a card the deck cannot cast
    its whole value, because that is what it adds to the deck.

    **Re-litigated on 2026-08-20, and the disagreement was right.** The note
    that used to sit here — "card scores should be impacted by what is currently
    in the maindeck & sideboard, and it is absolutely worth re-litigating" — was
    correct, and issues #4 and #18 were it being right twice more. The scorer
    did read the pool, through `commitment`, but everything it did with what it
    read was priced as a SPLASH: what a deck gave up by running the extra colour.
    That is a real measured number and the wrong question late in a draft, where
    the card is not going into the deck at any price.

    So the answer is not "the score should read the pool" — it always did — but
    **which claim the pool is being used to make.** A term was added for the
    other future: an off-colour card is worth what a Mountain is worth, in
    proportion to commitment, because a card that does not make your deck adds
    nothing you did not already have. `pnpm diagnose-offcolour` is the harness.
    What is still NOT read is the sideboard, and the maindeck only through
    colour and value share — the curve and the roles reach the tiebreak, not the
    score.

    **That term then did nothing for four days and the numbers below said it was
    working.** Both halves of why are decisions #23 and #24: it was asked about a
    colour set that called four fifths of pools five-colour, and its anchor was a
    deck win rate standing in for a card's. Do not read the paragraph above
    without them.

    **Confirmed on five sets it was not built on**, which the roadmap's
    `turnFour` post-mortem is the reason for: a term checked only on the sets it
    was developed against has been selected on them. Developed on fdn/dsk/woe,
    run over all eight cached sets — off-colour nomination rate, human first:

        pack        P1              P2              P3            all
        human      15.3%            6.6%            9.4%          10.3%
        ours        5.9%            2.6%            4.8%           4.4%

    Every set moves the same way and none changes sign.

    **Both columns moved when the colour rule did, and that is not a mistake in
    the table.** "Off-colour" is defined by `deckColorsFor` now, so the HUMAN
    figure is a different measurement than the one this note used to carry
    (23.3/4.0/1.9 against the old rule). A drafter taking a card outside their
    best two or three colours late is common and mostly a sideboard or hate
    pick; against a five-colour reading of their own pool it barely registered.
    Comparing a number here to a number in an older commit is comparing two
    questions.

    We now sit BELOW the human rate everywhere rather than at twice it, and when
    we do name an off-colour card it beats the best on-colour card by 11.7pp —
    so it is mostly packs holding nothing the deck can play. That is the right
    direction to be wrong in for this app, and it is still a direction: a scorer
    that never nominated one would be broken the other way, which is what the
    floor of about 4.8% at P3 is measuring rather than a success.

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

    **Amended 2026-08-20, and the amendment is decision #23.** The rule below is
    unchanged and still the one rule for a DECK's colours. What moved is that the
    scorer stopped asking it about a POOL, where it answers a different question
    and calls four fifths of them five-colour. See `deckColorsFor`.

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

22. **A setting belongs on the surface it changes, and that is not the same as
    belonging ONLY there** (2026-08-19). Three rulings, and the third is about
    the shape of a control rather than where it lives. The account menu carried every setting
    in the app and was emptied on purpose: the card stats, the coach threshold
    and the ceremony sat two clicks from the one screen any of them affects,
    with their state unreadable until you opened the dropdown, and they were
    changed by almost nobody. `setting_changed.where` exists to police exactly
    that, and the terms strip on the draft board is what it bought.

    **The rule had a hole nobody had stood in.** Three of the six settings can
    only be reached once you are already committed to the thing they govern:
    the ceremony needs an open draft and a pack on screen, the diff layout needs
    a finished challenge, and the pod and set-view toggles do not render at all
    while the set list is empty or still loading. So there is no way to decide
    how you want to draft BEFORE drafting, which is the moment somebody actually
    wants to decide it.

    `/settings` is a second door and not a replacement. Nothing moved: the terms
    strip stays, the picker keeps its view toggle, the diff keeps its layout
    picker, and every control on the page is the same control through the same
    `update` seam. What the page adds is the one thing a toolbar cannot do --
    every setting and what its value MEANS, readable at rest, in one screenful.

    **Told apart rather than merged.** `where` gained `"settings"` rather than
    reusing `"menu"`, because `"menu"` is the surface this replaces and pouring
    the new one into that bucket destroys the only comparison worth having. A
    value in PostHog cannot be split back apart. `settings_opened` fires on
    arrival beside it, because opens-with-no-changes and no-opens-at-all are
    opposite findings -- the first says leave the defaults alone, the second
    says move the link -- and `setting_changed` alone reports both as silence.

    **Fires on arrival, not on the way out**, which was the first shape and is a
    measurement trap: a per-visit count of what moved reads better in one row
    and can only be sent from an unmount, which does not happen when a tab is
    closed. Every visit ending in a close would be missing and every visit
    ending in a navigation kept. A biased count is worse than a coarser one.

    The premise changes if the page turns out to be where settings are actually
    changed. Then the on-surface controls are the redundant half, not this, and
    the numbers to read are already being collected.

    **A short range of small integers should offer all of them.** The coach
    threshold went through three option lists in two days: [2, 3, 5, 7, 9] with
    no derivation, then even steps, then every value from 2 to 10. The first was
    arbitrary and did not contain the app's own floor; the second fixed the
    derivation and KEPT THE COARSENESS, which is the part worth writing down --
    a principled reason for the spacing is not a reason for there to be spacing
    at all. Somebody wanting the coach quiet for the last four picks had to
    choose between three and five, and no argument existed for why they should.
    The only real decision on a range this small is where it stops: 2 rather
    than 1 because commenting on the one card you have no choice about is what
    the explain-anyway button is for, and 10 rather than the server's 15 because
    past it every setting is the same answer with a longer silence.

    **The blurb under it is computed and cross-checked against the rule.** A
    threshold N silences the coach for the last N-1 picks whatever the pack size
    is, which is why it is phrased that way rather than as "coaches the first
    nine" -- that would be wrong on one of the two pack shapes. `useSettings.test`
    counts the picks `isDecisionPick` actually silences, on both a fourteen and
    a fifteen card pack, and asserts the sentence names that number. Copy and
    the rule it describes are two places that can disagree, and this boundary
    has now produced two off-by-ones in one week.

23. **A pool is not a deck, and the scorer spent a fortnight asking a deck's
    question about a pool** (2026-08-20, notes.md #6). Decision #16 says a deck's
    colours are `committedColors` -- two or more of a colour in the forty -- and
    that ruling is untouched. What was wrong is where it was being asked.

    Over a POOL the same rule answers something else entirely: two copies of
    anything clears the bar. Measured over 12,000 real 17Lands drafts across
    eight sets, by the last pick it calls **82% of pools four or five colours and
    1.7% of them two**, while the top two colours hold **84.5% of the pool's
    value**. Decision #16's own memory says this out loud -- "over a whole 42-card
    draft POOL it gives four or five" -- and `leanColors` exists because the
    challenge braid hit it. Nobody connected that to the scorer.

    **Every colour term reads that set, so one wrong answer switched all of them
    off at once, and none of them said so.** Nothing is off-colour when you are
    in every colour. `splashCost` charges nothing to widen a deck already priced
    at five. `commitment`'s value share pins near 1.0 because no card is outside
    it. `archDelta` looks up "WUBRG", an archetype almost nobody drafted. Four
    terms returning a confident zero, on a code path with no error in it.

    **The fix is not a new rule.** `suggestDeck` has ranked all twenty candidate
    colour sets by "best 23 castable cards, minus the measured cost of the width"
    since it was written. That loop is now `deckColorsFor` and both callers share
    it, so the grade and the deck the grade is about cannot name two decks for
    one pool -- the failure `ScoringContext.needs` already has a paragraph about,
    one level up. `scorePick`'s `onColor` and `targetOnColor` moved with it,
    because leaving the "off your committed colors" warning on one definition and
    the number that scored it on another is the same bug wearing a hat.

    **NOT A CAP, which #16 forbids and meant.** The width is whatever the
    archetype table can price: a third colour wins wherever the set says it is
    cheap, which in snc (-0.3pp) is most of the time and in fdn (-4.3pp) is rare.

    **What it is still wrong about, deliberately.** Candidates are ranked on the
    cards the pool HAS, so while the pool is short of 23 playables a wider set
    can win on slots that were counting as nothing rather than on cards -- which
    mid-draft is every comparison. Padding those slots with a replacement card
    was tried and put back: `formatBaseline` sits at about the median card, which
    makes a colour set you hold three cards in beat one you hold twenty-four
    mediocre cards in. The number that would work is what you will actually draft
    into those slots, which depends on what is open, which is the thing nothing
    here knows. A guess would have been worse than the known limitation.

24. **`formatBaseline` is a deck's win rate and `cardValue` is a card's, and
    they are close enough to swap by accident** (2026-08-20, the other half of
    #6). The off-colour term shipped four days earlier shrank an uncastable card
    "toward the format's own baseline", reasoning that a card which never gets
    cast leaves your deck where it was.

    The reasoning is right and the number was not on the right scale.
    `formatBaseline` is a sample-weighted mean over ARCHETYPE win rates;
    `cardValue` is a CARD's GIH win rate. Measured across all eighteen sets the
    baseline lands at the **31st to 50th percentile of that set's own card
    values** -- it IS the median card. So the term charged an uncastable card at
    most its excess over a median playable: nothing at all for the half of every
    set below that line, a point or two for the rest. Over 609,630 real picks it
    charged **1.28pp against a 3.90pp winning margin**, and both cards a person
    reported in #6 were charged exactly zero.

    Decision #10 already had the right number and the right argument.
    `SCORING.basicLandValue` is 0 because every other card's value answers "how
    much better is a deck with this in it", and for a card that is never in the
    deck the answer is zero by construction. **A card you cannot cast is the same
    card as a Mountain.** `trapCorrection` keeps the baseline and should: it
    distrusts a measurement and pulls it back toward the population it was
    measured in. This one believes the measurement and says the card is in the
    wrong deck. They were never the same anchor; they only looked like it.

    **Still scaled by `commitment`, and that is generous rather than harsh.**
    Measured forward over the same drafts -- take a card off your colours now,
    does the deck you finish with cast it -- the real rate runs 0.71 under
    commitment 0.1, 0.25 through the middle and 0.02 past 0.8, where
    `1 - commitment` offers 0.95, 0.65 and 0.15. Charging the measured rate was
    declined: it is observational, it sees only the off-colour cards drafters
    CHOSE to take, and leaving a pivot open is the right direction to be wrong
    in. Written down because the next person to look at this will find the term
    lenient, not severe, and should know that was on purpose.

    **What the two rulings bought, and what they cost.** Off-colour cards held up
    as the better pick: **22.1% -> 4.4%**, against a human 10.3% on the same
    packs. And the half that stings: over 122,238 decision picks the F rate goes
    **3.7% -> 6.8%**, about one more per draft, on picks that spent a card the
    deck cannot play -- while A+ goes UP, 40.3% -> 43.0%, because the uncastable
    card is no longer beating the pick that was made.

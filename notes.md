# notes.md

Max's backlog: what is open, what is worth doing next, what is still wrong.
**This file is written by Max.** An agent removes an entry when the work ships
and adds nothing — a finding that outlives its own work item becomes a factory
work item, and a ruling worth keeping goes in `docs/rulings.md`.

The rulings moved there on 2026-09-03: measurement traps, deferred trade-offs,
and decisions worth not re-litigating. Entries here still cite them by number
(`trap #3`, `decision #23`) and those numbers did not change.

Numbers are stable and therefore gappy: a resolved item becomes `--` rather than
renumbering, because code cites them (`corpus.test.ts` cites issue #3, `diff.ts`
cites idea #8, `drill.ts` cites idea #1). What shipped is in the git history, not
here.

# Issues:

2.  It seems like the coach does a bad job of encouraging/noticing themes/synergies between chosen cards and the latest pick the user just chose.

    **Still open, and the cause is NOT missing data.** Investigated 2026-08-20;
    the ruling and the numbers are in "Deferred trade-offs" #3. Short version:
    `setStats.synergies` is unusable and was never what would have fixed this,
    and the coach is handed the pool as bare NAMES while being told never to
    reason from a name -- so it is obeying the rule with nothing to notice a
    theme in. The experiment worth running is the pool's rules text. Nothing
    has been built.

3.  --
4.  --
5.  --

6.  **`validate-pack-model`'s default sample under-powers a rare bonus slot, and
    the false failure NAMES A CARD so it reads as a finding.** MSH failed on
    2026-08-26 with "Chaos Warp came out 0.72x expected" and is fine: its bonus
    slot is in 4.26% of packs, so Chaos Warp's expectation is ~118 occurrences
    and 0.72x is three Poisson standard errors. At `--packs 1500000` it passes,
    worst 1.09x. Below roughly 15% slot frequency, check the `bonus dealt N%`
    line before believing any per-card ratio. The fix is for the check to scale
    its own sample, or report an interval rather than a point.

    Ruled out while diagnosing it, and worth not re-deriving: the bonus pool is
    NOT dealt uniformly. `sampleUnique` weights every slot by observed
    `openedRate`, and every slot in all 26 sets is fully rated, so the uniform
    fallback never fires. STX was briefly deferred on the belief that it did,
    then imported and validated — its Mystical Archive is in 100% of packs
    against MTGJSON's 100%, pool 63 against 63, worst 1.06x. The set whose bonus
    sheet is in EVERY pack is the strongest test of this available.

7.  **FIN pools `Wastes` at an observed rate of zero**, so it is dealt in no
    pack ever and `validate-pack-model` reports it as never dealt. Correct
    behaviour reported as a failure: 17Lands never saw Wastes in a FIN pack, and
    `build-set-stats` adds basics to the land slot without asking whether the
    set opened them. Harmless — a zero weight is never drawn — and left because
    both fixes cost something. Dropping zero-rate cards at build time would
    discard cards a thin dataset merely never saw; teaching the validator to
    accept them would blind it to the MKM failure it exists to catch.

8.  **STX has no archetype data at all, and degrades silently everywhere but
    one.** 17Lands'
    game dataset for STX carries `opp_colors` but no `main_colors`, alone among
    the 26 — KTK (2014) and PIO have it. Oldest set with TradDraft data, so it
    reads as an early-dataset schema difference: not ours to fix, and no other
    set is at risk. The artifact therefore has 0 archetypes and 0 colorWinRates
    where others carry 494-1,887 and 13-30.

    Nothing breaks, which is the problem — every fallback is deliberate and
    quiet. `formatBaseline([])` is 0.5, `archDelta` returns 0, and
    `deckColorsFor`'s `priced` guard drops the triples and stops charging
    `splashCost`. So STX gives two-colour deck suggestions only, no splash
    pricing, no archetype-fit term, with nothing saying so.

    It shipped because STX's five colleges ARE pairs, so pairs-only is close to
    right here by luck rather than design.

    **"Should the app say so" is answered for exactly one surface.** The
    archetype quiz refuses STX by name and explains the hole, because a drill
    either has questions or it does not and there is no quiet fallback available
    to it. The coach and the deck builder both have one and both still take it,
    and `coach_shown` still cannot tell a set with no archetype data apart from
    one where the coach was merely quiet.

9.  Change vernacular/vocabulary from "colours" to "colors".

- NEVER say "colours"

10. More thorough default set selection when running/testing/prototyping features.

- You (the AI) tend to only select FDN
- I want you to also choose a couple more.
- I suggest also using SOS (because it emphasizes specific archetype color combos)
- I also suggest using TDM (because it seems to want 3-color decks)

# Ideas:

2. **The replay dataset is deliberately unused, and only ONE of the three things
   this entry wanted it for actually needs it.** Format speed and real land
   counts are both in the **game** dataset the pipeline already streams; only
   the keep-or-mull decision needs replay. Measured and argued in
   `.omc/plans/mulligan-trainer.md` §1b and §7, which also answers the
   scepticism recorded below with numbers.

   17Lands publishes three public datasets per set/format and the stats pipeline
   pulls **draft** and **game**. The sizes this entry used to quote were the
   wrong format's: 431MB for FIN is PremierDraft, and this app is TradDraft-only,
   where FIN's replay is 51MB against 22MB of draft and all 26 sets come to about
   1.5GB. (`build-set-stats.mjs` cites this item by number — renumber with care.)

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

6. --
7. --
8. Shipped — challenge a friend. Kept as a stub because 8b and 8c cite it.

8b. I'm curious - is it possible for me to send a challenge of "draft-A" to multiple different friends? -- or is it only one challenge per draft?

If multiple people can get challenges to the same draft it'd be pretty rad to have a ranking system and toggle between each person's journey in comparison to Me vs Friend-A OR Friend-A vs Friend-B, etc.

I'm certain that's asking a lot and would appreciate some thought going into this idea. The last thing I wanna do is smash a square peg into a round hole - I want the proposed solution to be either a refactor IF APPROPRIATE or fit in smoothly to the current system - but don't be afraid to throw out existing non-conforming implementations that conflict with this feature-ask.

8c. If "8b" is possible then a great new idea: we have a "daily challenge" draft!

- Once a day we could spin up a new draft challenge where anyone who's a member could test their skills at drafting today's packs - which would be the same for anyone who tries.
- And then we could leverage the challenge diff views for this daily challenge.
- And see the best drafts/decks people made, most popular archetype - biggest/most common mistakes.

9. **Shipped as `asked-again` 2026-08-31. Three things stayed open.**
   - **The headline is confounded by memory** — the first answer came with a
     reveal naming the card — and the clean measure is a question's FIRST
     answer over time. That needs a bucketing rule and two buckets of history,
     neither invented yet. It carries a bias that must be stated beside any
     trend drawn from it: the ranking deals the widest gaps first, so the
     questions get HARDER as history grows, which works against showing
     improvement. **`gap` is on every answer written from 1 Sep 2026**, unread,
     so that bias can be corrected for rather than only stated; rows before
     that date carry none and there is no honest number to backfill one with.
   - **No rest interval, on purpose.** Nothing measured derives one, so
     `rankMisses` sorts least-recently-asked first instead. A retention curve
     is what would earn a number here.
   - **The archetype quiz writes nothing.** Its question is a card and two
     decks out of a set's statistics — no pick behind it, so being asked again
     corrects no error of yours. Taking it costs a second identity shape on the
     row or a second table.

10. --
11. --

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

13. --
14. Can we look into some tried and true plugins/packages for resizing, window-drag-n-drop, etc as a standard the app could use?

- I'd love to be able to have the drafting window have sections be resizable and adjust their layouts if appropriate
- It'd be cool to empower users to move sections where they like

15. Maybe this could be an "issue" too. We keep making changes to the bots and how they pick. Do we have a benchmark or anything to see if the bots get better/worse with these changes? I KNOW we have a BUNCH of data from real life drafters - some of which went 3-0 who I think we refer to as "trophy" drafters or something (I think). So, what if we built real drafting benchmarks based on real data from the best of the best? And not just one, but a comprehensive set from different sets we could test against. I just want the packs I'm being passed to feel believable - like I'm actually drafting with real humans.

16. --

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
   - **It is now readable about your own draft, not only a challenge**
     (2026-08-21). `review.lines` runs the same function over your own stored
     boosters and the review's pick panels offer it on the graded card or on any
     of the pack's best. The two numbers are drawn as different kinds of claim,
     which is the whole discipline this entry is about: `delay` is exact, and
     `reach` carries the policy below and says so on screen. `line_explored`
     records `reach` and `of`, because if `reach` is almost always zero then a
     single-ply line mostly says "your pick changed nothing" and this is a toy
     rather than a lesson — a count of clicks could not tell us that.
   - **The function was answering about a draft nobody played until then**, which
     is trap #15 and is worth reading before trusting any fork number recorded
     before that date.
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

   **The row exists and this half does not read it** (2026-08-31,
   `asked-again`). Both quiz surfaces write to `pickAnswers`; `stats.progress`
   reads the drill's rows only. What is left is a design question rather than a
   schema one: a review guess is graded leniently against a card the coach may
   name after the fact, and every review is a different draft of a different
   set, so what a trend over quiz outcomes may CLAIM is unanswered. The data
   accumulates from today either way.

# Still open from shipped work:

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

   **Still open, and the draft board's two-column rail did NOT touch it**
   (2026-08-21). That change split the DRAFT board's side panel into a coach
   column and a picks column above 1440px; this item is about the PRACTICE
   drill's rail, which is a separate implementation (`MissesDrill.tsx`, sharing
   only the primitives) and the only place `useRailHeight` is used. The draft
   board's rail is still not sticky and so still cannot reproduce this — the
   split deliberately did not make it sticky, precisely because pinning it would
   inherit this defect on a second screen.

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

`believable-packs` shipped 2026-08-21, and it started from two screenshots of
packs that could not be real. It is the first time a bot change was gated on
something other than pick accuracy, and that is most of the story.

**The complaint was right twice, for two different reasons.** SOS P2P10 had
Moseo, Vein's New Dean still in the pack at pick 10 — real ALSA 0.98, so a real
table never passes it once — and the pod had it ranked 164th of 346 because its
GIH win rate is 0.6277. MH3 P1P8 had Subtlety, which the pod ranks 11th of 294
and passed seven times anyway. One is a ranking failure and one looks like a
sampling failure, and `bench-bots` is structurally blind to both: top-1 scores
one seat's decision, and both complaints are about what happens to a card across
eight seats.

**So the first thing built was `pnpm bench-packs`**, which compares SURVIVAL —
of the packs that opened a card, what fraction still hold it at pick k — against
real Arena pods, where the wheel was produced by seven actual humans passing to
an eighth. Nothing was fitted to that curve, which is what makes it usable as a
gate for a policy that reads pick order.

**Win rate is not pick order, and that is a selection effect rather than noise.**
A bomb everyone first-picks ends up in every deck that opened it, bad ones
included, so its win rate regresses toward the mean; a narrow synergy card only
reaches decks built to support it, so its win rate is inflated by the company it
keeps. Spearman between `value` and ALSA runs 0.40–0.71 across the eighteen sets.
`cardValue` ranks Cyclonic Rift 288th of 305 in SOS.

**Three candidates were measured before the one that shipped.** `iwd` is the
textbook fix — a within-deck contrast that should divide out deck quality — and
it is WORSE than raw win rate on every column and every set (mean spearman 0.596
against 0.682). So are `ohWr`, `gdWr` and `deckWr`. `maindeckRate` is the only
game-side statistic that beats win rate (0.865) and closes about a quarter of
the pack gap. Real, and not enough.

**Temperature was the obvious answer to the second screenshot and is not one.**
`policy.ts` had refused a temperature on the grounds that any value but 1 would
be a number with no derivation; `bench-packs --temps` is that derivation, and it
says 1. Against the shipped ranking, sharpening helps early and saturates —
pick-8 survival 10% → 7% between t=1 and t=0.25, against a real 1% — while the
error over every card gets worse. Sharpening a wrong ranking only makes a pod
more certain about the wrong card. With the ranking fixed, t=1.3 tracks the
first four picks slightly better and costs 0.02 picks on the aggregate. **The
original claim survives its own disproof:** the ARGUMENT for 1 was wrong (a
logit's residual entropy is not a model of how drafters disagree) and 1 is right
anyway, now for a measured reason.

**What shipped is `tableValue`** — the set's own spread of `value`, handed back
out in the order a real table takes cards. Ordering from ALSA, spacing from the
existing distribution, because ALSA is compressed at the top and a policy reading
it raw would think the twenty best cards in SOS were interchangeable.
`table3`/`sharks3` are refitted on it and `table3` is `DEFAULT_POD`.

    survival of the alsa<=1.5 cards, mean |sim − real| over every card

      sos 0.877 → 0.402    ktk 0.971 → 0.330    blb 0.683 → 0.368
      mh3 0.929 → 0.353    otj 0.807 → 0.355    dsk 0.783 → 0.272
      woe 0.903 → 0.406    lci 0.735 → 0.267    fdn 0.767 → 0.332
      eoe 0.896 → 0.352

Ten sets, no exceptions, ~2.4x on every one.

**`rareOpen` collapsing from +1.67 to +0.05 is the confirmation the whole thing
was right.** That feature shipped because humans take rares beyond what their
win rate justifies and do it from a full pack — a real effect, and a patch over
a ranking that was wrong about bombs. Told what a table actually wants, the fit
has no use for it, and prices it NEGATIVE for the sharks. `removal` goes the
same way, 0.36 → 0.08. `value` turns negative in both tiers, which reads
correctly: conditioned on what a table wants, a card whose win rate is higher
than its pick order suggests is one drafters have been shown to under-take. The
three structural terms — `laneFit`, `laneFitLate`, `opennessLate` — move less
than 8%. **The lane and the signal were right all along; what was wrong was the
number they multiplied.**

**Held-out top-1 goes 49.3% → 55.7% and that is not six points of progress.**
`tableValue` is built from an aggregate of the very picks the fit is scored
against, which is exactly what `bench-bots` refuses `crowd` for. The rule is
kept and the exception is argued rather than smuggled: these pods are not a
claim that a model understands drafting, they are a simulation of a table, and
what a table wants is a fact about tables. `bench-bots` prints the caveat beside
the number; `bench-packs` is the gate.

**Nothing about the scorer moved.** `tableValue` is read only by bots, by rule:
it is derived from what the field DID, so grading a person against it is marking
them against the crowd rather than against what wins — the circularity
`trophyPickRate` is kept out of the scorer for.

`asked-again` shipped 2026-08-31. Three surfaces asked a question with a known
right answer and none wrote the answer down, so `/stats` was averaging
`overallScore` across drafts of different sets to reach for "am I getting
better".

**The one thing here worth not re-deriving is why the readout is built on the
drill.** A run of draft scores cannot be made into a direction: each is a
different set, different packs and a different pod, and trap #3 is that most of
the gaps a pick is graded on are smaller than the error bars on the win rates
they came from. The drill asks the same pack twice out of the same pool against
an answer written down at the time — the only comparison this app can draw with
no set-to-set variance in it. That is also why the review's rows are stored and
unread (Deferred #2), and what is left open is Ideas #9.

`drafter-fit` shipped 2026-09-02, in four phases, and most of what it produced
is a list of things it turned out not to be able to say. The panel is "How you
draft" on `/stats`; the estimator is `dials.ts` / `dialFit.ts` / `draftDials.ts`
in core; `pnpm fit-drafter`, `pnpm measure-tau` and `pnpm fit-set-baselines` are
the harnesses and none of them needs a deployment.

**The model is the shipped pod with one multiplier per BUNDLE of its columns.**
Not ten free weights: a person brings ~42 picks a draft against the 571,996
`table3` was fitted on, and `value`/`valueOpen` mean nothing apart -- fitted free
they trade places between drafts while their sum sits still. At theta = 1 the
dialled score IS `policyScore`, asserted per pod, and the bundles are a partition
the module refuses to load without.

**Nothing here was checked only against itself, and that is the part worth
keeping.** `fit-drafter` deals simulated drafters whose dials are written down
first, because a per-drafter fit always returns six numbers and a real player's
truth is written nowhere -- a broken estimator would produce a confident,
readable, unfalsifiable panel. `measure-tau` then checks the row walk against
370,325 REAL drafters: `table3` is the optimum of the ten-weight problem on that
population, so their pooled theta has to come back at 1, and it does on all six
dials with every interval under 0.04.

**Four dials of six can be moved at all.** Mean within-pack spread of each
bundle's contribution over real fdn packs, in logit units: `table` 4.101, `lane`
0.938, `power` 0.793, `signal` 0.416, `rare` 0.029, `removal` 0.011. A drafter
dealt at 1.5x or 0.5x on `rare` or `removal` is never once called different at
any draft count, as it must be.

**Two of the four reach a screen, and the other two failed for opposite
reasons.** `power` is not SEPARABLE from `table` -- both are raw power, `table`
carries five times the spread and absorbs it, and a 1.5x drafter is called 13% of
the time after twenty-five drafts. `table` is measurable and not separable from
`lane`: at fifteen drafts a `lane` x1.5 drafter lights up `lane` at 100% and
`table` at 92%, and the confusion SHARPENS with more data rather than washing
out, which is what says it is real. Of that pair `lane` is kept, and that is a
judgement rather than a measurement -- committing early or staying open is a
decision a player makes on purpose, where "you take the cards the field takes" is
close to a restatement of the grade every pick already gets. `SHOWN_DIALS` in
core is where this is decided, so no surface can hold a second opinion about it.

**The shark axis is not sayable, and it was the best thing this could have
said.** `FITTED_POLICIES` records that the two tiers differ on essentially one
coefficient -- `valueOpen` 17.17 against 20.82 -- which sits inside the bundle
with the least spread. A drafter playing `sharks3` against `table3` is called on
`power` 2% of the time after TWENTY-FIVE drafts. Do not promise "here is where
you sit against a drafter who goes 3-0".

**How many drafts, measured rather than guessed.** At 80% detection of a
1.5x/0.5x difference: `lane` about five drafts, `signal` about ten, `table` ten,
`power` never. False positives on a drafter who really is the pod run 0-2%
against a nominal 5%. Those two numbers are what the panel's empty state prints.

**`tau` is 0.229** -- the spread of real drafters, maximising the marginal
likelihood over 370,325 of them across all eighteen cached sets, each set's
population centred on its own pooled theta. Sharp rather than nominal: 2,741
below best at 0.20 and 13,748 below at 0.30. Per set it runs 0.151 (ktk) to 0.362
(mh3), and mh3 being the outlier is the estimator noticing that drafters disagree
with each other more in a Modern Horizons format. 3-0 drafters come in at 0.211,
slightly more alike than everybody else, which is the third time this data has
said that about them.

**THE SET IS AS BIG AS THE PLAYER.** `table3` is a compromise across eighteen
sets and no single set is the compromise: pooled `power` sits at 0.28 in ktk and
1.33 in woe, `table` at 0.72 in mh3 and 1.35 in ktk. Across sets the spread of
those offsets is 0.28, 0.14, 0.07 and 0.11 on the four live dials, against a tau
of 0.229 -- so a player measured against the pod alone is told about the set they
drafted at up to the size of what is read about them, and three drafts is three
sets rather than a sample of eighteen. `DIAL_BASELINES` is one vector per set and
`rebaseCurvature` applies it, additively, because the stored curvature is a
quadratic at theta = 1 and moving its expansion point is exactly one subtraction.
Held out, a player with twenty drafts in ONE format went from being called
different on `lane` 15% of the time and `signal` 16% to 3% and 9%.

**A draft is stored as twenty-eight numbers.** Its gradient and Hessian at
theta = 1, on the digest, from rows `draft.pick` has already read. They ADD, so a
new draft updates a drafter without re-reading an old one, and sharpness falls
out of the same numbers -- the collapsed one-parameter model is the row sum of
the gradient and the full sum of the Hessian. Stored UNCORRECTED and rebased on
read, because the baselines are refittable and a curvature stored already-
corrected would freeze whichever vintage was current that day.

**One yardstick whatever pod dealt.** The pod decides which cards a player was
offered, not how they chose between them. Measuring a `sharks3` draft against
`sharks3` would put one history on two rulers that differ on `valueOpen`, and it
is not the ruler `DIAL_BASELINES` was fitted in.

**Sharpness is a DIRECTION and never a figure.** The one-step estimate off stored
curvature is biased -- 0.24 against a truth of 0.50 on a drafter who is half as
decisive -- so the sign survives the approximation and the value does not. The
type it arrives in carries no number for a screen to print.

**Three refusals rather than three degradations**, each counted where a reader
can see it: a pool with no pick order at all (a whole draft measured on a
different column from the rest of a history), a curvature whose `DIAL_FINGERPRINT`
no longer matches (six numbers that still sum and still fit and mean nothing), and
a set nobody has measured (an unknown offset, routinely larger than the thing
being read -- which bites hardest on a brand-new set, where this app is most
useful and 17Lands has published nothing).

**What is still open.**

- The backfill has run on the LOCAL deployment only. Prod needs
  `internal.migrations.backfillDials` after the deploy.
- `habitsCalled` on `stats_viewed` is the number that decides whether any of this
  was real. If drafts climb past five and ten across the userbase while it stays
  at zero, the counts that came out of a simulated drafter did not survive a real
  one, and nothing else would report that.
- `lane` and `table` still do not separate. Prising them apart, or accepting one
  axis and saying so, is the next real question.
- The 17Lands drafters sat at tables of humans and the app's players sit at
  tables of pods, whose wheel differs by 0.27-0.41 in `bench-packs`. `openness` is
  computed over packs somebody else passed, so `tau` and the baselines are both
  carried across that gap.

3. **`mulligan-trainer`** — a keep/mull practice mode. **Researched 2026-08-27;
   `.omc/plans/mulligan-trainer.md` is the plan and it changes the shape of this
   item. Read that, not this paragraph.**

   Three things from it belong here because they constrain work outside the
   drill:
   - **Two thirds of what this entry promised does not need replay at all.**
     Format speed (`num_turns`) and real deck land counts (`deck_<card>`,
     basics included) are in the GAME dataset the pipeline already streams. So
     `contextValue`'s stored-and-unscored speed term and `DECK`'s 23/17
     convention are both answerable now, as that plan's Phase 0 — and Ideas #1's
     deck-type quiz is waiting on the same one derivation.
   - **The availability gate stays, and it is now a fact rather than a
     preference.** BRO, NEO and ONE publish no replay in either format (403) and
     SNC has PremierDraft only, so requiring it would de-ingest four shipping
     sets. `USED_KINDS` in `scripts/lib/datasets.mjs` stays `["draft", "game"]`.
   - **`won` cannot be the label**, which is worth not re-deriving: it is
     censored by the very decision being judged, deck quality alone moves it
     9.8pp between terciles, and `on_play` LOSES (57.80% against 59.11%) because
     it proxies having lost the game before — trap #10 in a column that looks
     like a clean binary.

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

5. **`ui-regression-harness`** — the class of defect the two-column rail
   produced twice in one afternoon, and the reason no test suite saw either.

   Both were geometry. The rail overflowed its own track by 324px because an
   arbitrary Tailwind variant sorts ahead of a named one (trap #17). Then the
   card preview stopped drawing a double-faced card's back, because that same
   324px moved `[data-preview-edge]` inside the 652px a front and a back need
   side by side — reported 2026-08-21 from a screenshot, fixed by letting the
   block stand past the wall rather than lose a side. `previewPlacement.test.ts`
   was green through both and deserved to be: `place` is pure, thoroughly
   covered, and correct at every viewport it is handed. Nothing hands it the
   board's.

   **The numbers the rule depends on live in CSS, and nothing in TypeScript
   knows them.** 1440, 300, 360, 684, the 24px gutters and the 24px gap are
   literals inside `className` strings plus one `@theme` variable; the wall is
   whatever those compute to at runtime. So the pure function gets tested
   exhaustively at invented widths — 1400, 900, 660 — while the widths the app
   actually renders at go unasserted, and moving the layout moves them silently.
   A person hovering a card is currently the only thing that closes that loop.

   Two rungs, and the first is worth having even if the second never ships.
   - **Name the layout in TS and assert the real geometry in vitest.** One
     module owning the rail widths, the gutter, the gap and the `wide`
     breakpoint, read by the board's classes AND by a test that walks the widths
     friends actually run (1280, 1440, 1512, 1600, 1728, 1920) checking what the
     rules promise at each: the track holds the rail, a two-sided card draws two
     boxes, the panel is never dropped for a token. No browser, no server, runs
     in milliseconds — and it is the rung that would have caught both defects,
     #17 as arithmetic and this one as a face count.
   - **A real browser over a seeded draft.** Playwright at three widths against
     a fixed session: nothing overflows the viewport, hovering a transforming
     card yields two images, the stats panel is never on top of the card the
     pointer is on. This is the rung that catches what arithmetic cannot — the
     emitted cascade, stacking contexts, `inert` — and it is also the one that
     drags in a running server, a fixture draft and a flake budget.

   **It reverses a standing preference, which is why it is a roadmap item and
   not a task.** UI work here is verified by opening localhost, on the grounds
   that a screenshot harness for a card game is a lot of machinery to maintain
   for someone who can just look. That holds for defects that are visual. These
   two were arithmetic wearing a layout — invisible until somebody hovered the
   right card at the right width — and the first rung answers them without any
   of the machinery the preference was refusing.

Separate track: the **review features** in "Deferred" above (alternate draft
lines, review-quiz trend tracking) and the archetype quiz (Ideas #1) — unrelated
to the data work.

# Swamp's first run (2026-09-03): what the factory earned, and what it cost:

    One session, from `swamp repo init` to a merged production fix. Written
    while it was fresh because most of what follows is not recoverable from the
    artifacts -- those record what was decided, not which habits produced the
    bad decisions.

    THE SHORT VERSION. `@swamp/software-factory` drove six work items. It found
    a real user-facing bug nobody was looking for. It also cost five plan cycles
    on one item and three human interventions that should not have been needed,
    and roughly all of that overrun was driver error rather than machine
    friction.

## What the gates actually caught, with receipts:

    Not theory -- each of these is a thing that would have shipped.

    **A causal claim nobody had measured.** Three plan cycles chased a media
    query. The real cause was daisyUI's `.card figure{display:flex}` descendant
    rule reaching a `<figure>` through `Panel`. It surfaced because a reviewer
    asked whether the plan's central claim was *measured* rather than argued --
    and finding it exposed a live defect on the review walkthrough, the review
    breakdown and the challenge diff, where a player's own words rendered at 5%
    of the available width. Nobody was looking for that. It was found doing
    paperwork on a dev-tool bug.

    **An unrepeatable measurement, ordered so it could not be taken.** Three
    separate times, the plan placed the before-capture where it could not
    observe the defect: after the fix, then while an override suppressed it,
    then with the capture spec edited too late so before and after were
    different crops. Each caught before implementation.

    **A vacuity bug rebuilt one layer up.** The headline assertion
    (`framedInnerWidth === declaredWidth`) is a property of the frame, not its
    contents -- a sign-in redirect satisfies it. That is the same defect as the
    chart suite passing over five of twenty specimens, recommitted an hour after
    committing the fix for it.

    **A gate cleared by paperwork.** `findings-clear` passed because a blocking
    finding was marked `resolved: true` with a note that was an
    acknowledgement, not a fix. Caught by the next review cycle. This is the
    one worth fearing: the machine cannot tell a resolution from a sentence.

    **The git wall.** `change-summary` requires a branch and a base branch and a
    `cel` gate refuses `submit` when they match. It bit on the smoke test and
    stayed honest afterwards.

    **The cycle limit.** `planning` jammed at maxCycles and parked for a human.
    Correct: that work item had genuinely gone round too many times.

## What it cost, and whose fault that was:

    **Five plan cycles on `panel-figure-rule`, and three of them were mine.**
    The gate blocks on critical/high only. Cycles 1 and 2 had one high each,
    and instead of fixing that one blocker I rewrote the whole plan -- which
    invited a fresh full review and generated a new crop of mediums. Treating a
    passing gate as a failing one is the single most expensive habit of the day,
    and it is what caused both cycle-override requests.

    **Four claims asserted without checking, each caught by a reviewer.** A CSS
    combinator read as child when it was descendant. A Tailwind equivalence
    (`text-sm` is not font-size-only). An invented sample distribution ("one to
    three sentences") for a field capped at 140 characters. And -- twice -- a
    reviewer's own citation propagated into a plan without opening the file,
    including one refuted by a source already sitting in my own research.

    **A string replace that silently matched nothing**, so a commit listed a fix
    its diff did not contain. Verified by grep only after a reviewer found it.

    **`pnpm test` was red for several commits.** vitest collects `*.spec.ts` and
    claimed the Playwright suite. The working loop was `check-charts` and
    `typecheck`; neither runs vitest. Caught only by running the full suite
    before merging.

## Changes worth making to the machine:

    **1. Write the rework rule into the constraints.** "Only critical/high
    triggers a rework; record mediums and lows as accepted with a reason and
    advance." This is the highest-value change and it is one paragraph in
    `agent-constraints/planning-conventions.md`. It removes most of the loop
    count and both cycle-override interventions.

    **2. Declare `change-summary` on `review` as well as `implementing`.** After
    a review finds something, fixing it produces a new commit, which makes the
    recorded `headSha` false -- and re-recording requires leaving `review` and
    coming back, which unpins `artifact-fresh` and demands a fresh review. Each
    fix invalidates the record describing the previous one. A fix-up should not
    cost a stage round-trip.

    **3. Add to `research-conventions.md`: open every file you cite.** Never
    carry a citation from a review into an artifact without reading the file.
    Two of the four unchecked claims came from exactly this.

    **4. Put the reviewer brief in the definition's `systemPrompt`, not in the
    dispatch.** Every review prompt was hand-written, so calibration drifted
    between cycles. Two things belong there permanently: keep each finding under
    ~700 characters (long ones were truncated in transit repeatedly), and
    "a clean verdict is a real verdict -- do not inflate a medium to force a
    change."

    **5. Consider whether `resolved: true` should require more than a string.**
    The one integrity failure of the day. No obvious fix inside the engine, but
    a driver rule helps: a resolution names the commit that applied it, or it is
    not a resolution.

    **6. The express lane never fired.** Both real work items declared
    `touchesGraphics`, so both took the full lane. The routing worked exactly as
    designed; it just never got exercised on real work. Watch whether it ever
    does -- if not, the flags are miscalibrated.

## What to keep exactly as it is:

    Research as an unskippable initial stage, with `contradictions` required.
    It turned "the components are broken" into "this is documented behaviour"
    within minutes, on the first real work item.

    Lane routing by declared fact rather than judgement. Inverse `cel` gates
    over triage booleans mean exactly one transition is satisfied and nobody
    chooses -- which matters because a driver with a long context will choose
    the express lane.

    Versioned, immutable artifacts. Three superseded plans and every finding
    remain retrievable. When a plan was dropped, nothing was lost -- and the
    fallback is the plan *plus* the reasoning that killed it.

    Splitting rather than widening. Four work items were split out mid-session
    (the nav overflow, the card-body trap, the daisyUI specimens, the plugin
    task) instead of being absorbed. Each split cost one command and kept every
    item's triage honest -- and the triage itself decided where work belonged:
    `dev-narrow-bays` declared `touchesUserFacingFlow: false`, so a shipped fix
    could not go in it.

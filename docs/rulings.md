# Rulings

What has already been decided, measured, or priced, so it is not re-derived.
Moved out of `notes.md` on 2026-09-03, verbatim — that file is a backlog Max
writes to, and this is a ledger agents read from. Cross-references between the
two go by section and number in both directions.

Read this before researching anything. `agent-constraints/research-conventions.md`
requires it, and `research-critic` files a finding when a change re-derives
something already settled here.

Three sections, and they answer different questions:

- **Measurement traps** — a number that does not mean what it looks like.
- **Deferred trade-offs** — considered, priced, and not done. Each names the
  premise that would have to change.
- **Decisions worth not re-litigating** — settled, with the argument.

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

    **A third instance, in a sort comparator** (2026-08-31, `rankMisses`): a
    `?? ""` on the second key sorted ahead of every real date and so did the
    first key's job unaided, and flattening the first key left the expected
    order standing. A default value in a comparator is a silent tie-break, so
    perturb EACH key, not the function.

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

    **The same shape the other way up** (2026-09-01, `pickAnswers`). Trap #5 is
    a test pointed one function upstream of the hole. This is one pointed
    downstream of it, at a fold whose inputs a test can invent: `missProgress`
    was proved in core over hand-built rows, including two `fixed: true`
    attempts of one question -- which the store could not write, because the
    mutation refused any row naming the card the last one named. So a green
    assertion of `heldOn: 1` sat directly on a panel whose `heldOn` could not
    leave zero, and the layer with the defect had no tests at all. **When a
    fold's inputs come out of a store, at least one test has to build them
    through the store.** The events knew, for what it is worth:
    `drill_answered` carries the tier and the outcome, so PostHog could see a
    fixed question answered `stood` while the app's own panel said it had never
    happened.

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

15. **A default that is only correct for history will be silently wrong for
    everything current** (2026-08-21, `forkImpact`). `walk` built its engine as
    `new DraftEngine(deal, botRng(seed))` and took the third parameter's default.
    That default is `"legacy"`, and it is right: an absent `pod` on a stored
    session means the bot that was running before pods existed, so the default
    encodes a real fact about old rows. `replayDraft` two files over takes `pod`
    explicitly and says why — "bots decide what wheels, so replaying under the
    wrong policy diverges below".

    `DEFAULT_POD` is `table2`. Every draft anyone has played since pods shipped
    carries one, so the default applied to none of them, and both walks ran a pod
    that had never dealt to the player. The baseline then met a card the wrong
    bots had taken and `walk` answers a card it cannot find by stopping.

    Measured by calling the real function on 200 `table2` drafts, forking at pick
    5 with 36 later packs available: **`of` came back 0.2 and `reach` was 0.0 in
    all 200**. The challenge diff had been printing "Changed 0 of your 0 later
    packs" for every modern draft. With the pod threaded through, `of` is 36.0.

    **The sting is which answer it produced.** Zero reach is not a broken-looking
    number — it is the most interesting thing the function can say, "this pick
    changed nothing", arrived at by not running. Trap #9's family, and the
    specific lesson is narrower: a default that describes the PAST is a landmine
    the moment the present stops matching it, because nothing about the call site
    changes on the day that happens.

    Two things followed. The baseline is loud now — running out of NAMES is an
    unfinished draft and an honest stop, but a name that is not in the pack it was
    taken from means this is not the draft that was played, and that throws into
    the "weights unavailable" the readers already draw. And the three existing
    tests played legacy and asked about legacy, so they stayed green throughout:
    trap #4, in a battery that looked thorough because it had three cases and
    every one of them shared the assumption.

16. **An omitted empty value and an absent one are the same shape, and the
    saving that creates them is free** (2026-08-21, `draftPicks.recordPick`).
    `terms` carries a distinction the panel that draws it depends on: `[]` means
    the deck made no difference to this card, absent means the row never recorded
    any. `recordPick` wrote

        ...(rec.score.terms.length > 0 ? { terms: rec.score.terms } : {})

    which costs nothing in bytes and collapses the two forever.

    **The empty case is not exotic, which is what made it bite.** `commitment` is
    `share * min(1, picksMade / totalPicks)`, so it is exactly 0 at the first pick
    of every draft; that zeroes the archetype, splash and off-colour terms, a
    well-maindecked card takes no trust correction, and `contextValue` filters the
    zeros out. So P1P1 stores `[]` routinely — and the review told people that
    pick predated a field it did not.

    **Both comments asserting the distinction held blamed the wrong layer.** They
    named `toRecordedPick`'s `?? []`, which is downstream and correct — `PickScore`
    requires an array. The information was already gone. The general form:
    **when a distinction matters, check the WRITER, because a reader can only
    preserve what it was given** — and a conditional spread is the cheapest way
    in the language to throw one away without looking like you have.

    It was found in review rather than by anything running, and the test that
    pins it had to be written twice: the first version had no `draftPools` row,
    so the query it drove refused either way and was green against both
    implementations. Trap #4 again, in a test written the same afternoon as the
    note citing trap #4.

17. **Tailwind sorts an arbitrary breakpoint variant ahead of the named ones, so
    it cannot beat them** (2026-08-21, the draft board's two-column rail). The
    rail was told to be 684px wide inside a 360px track and hung 324px of the
    picks column off the right of the screen.

    Not the arithmetic, which was right in every particular. At 1440px both
    `min-[1440px]:grid-cols-[minmax(0,1fr)_684px]` and
    `lg:grid-cols-[minmax(0,1fr)_360px]` match, at the same specificity, and
    Tailwind emits every arbitrary `min-[…]` variant in a block BEFORE the
    named-breakpoint blocks — so the `lg:` rule is later in the sheet and wins at
    every width the other was written to own.

    **It broke asymmetrically, which is why it looked like a layout bug rather
    than a cascade one.** The `<aside>`'s own `min-[1440px]:grid-cols-[300px_360px]`
    DID apply, because its base class is a bare `flex` and any variant outranks a
    bare utility. So the inner grid took the new width while the track containing
    it kept the old one — the one combination of the two that overflows.

    `--breakpoint-wide: 90rem` in `@theme` fixes it, because named breakpoints
    sort by value. 90rem rather than 1440px so it sits unambiguously between the
    stock `xl` (80rem) and `2xl` (96rem) instead of resting on a unit comparison.

    **What actually settled it was reading the emitted CSS**, not reasoning about
    the cascade: the 1440 block opened at byte 243708 and the `lg:` rule that beat
    it sat at 247911. Three lines of Python over `.next/static/css/app/layout.css`
    answered in seconds a question that a screenshot can only pose. Worth
    remembering the next time a Tailwind override "should" apply — the stylesheet
    is on disk and it is checkable.

18. **An ablation refits, so a feature with a correlated substitute still in the
    vector reports only what it adds OVER the substitute** (2026-08-21,
    `believable-packs`). `fit-bot-policy --ablate` priced `tableValueOpen` — the
    entire point of the `table3` fit — at +0.59pp held-out top-1, below the bar
    this repo sets for shipping a feature at all, and comfortably arguable as
    "not worth a pod name".

    It is measuring the wrong thing. Zeroing that column lets `valueOpen` climb
    back from 16 to something near its old 43 and do the job badly, and doing it
    badly costs six tenths of a point of ACCURACY and most of the PACK. Measured
    the other way — `bench-packs --ranks gih`, which makes `table3` rank by win
    rate and changes nothing else — the same removal costs 0.402 → 0.840 picks
    on sos, 0.353 → 0.934 on mh3, 0.330 → 0.890 on ktk. All the way back to the
    pod it replaced.

    **The general form:** an ablation answers "what does this column add to a
    model free to re-arrange itself around its absence". That is the right
    question for a feature with no substitute — `opennessLate` has none, and its
    +1.10pp is honest — and the wrong one for a second measure of something the
    vector already has. Two correlated columns will each ablate cheap and the
    pair will be load-bearing. Trap #13 is the same confusion about a maximum.

19. **17Lands `pick_number` is zero-indexed, and reading it as one-indexed fails
    silently in the shape of a slightly-too-good baseline** (2026-08-21). A fresh
    14-card booster is pick 0. `bench-packs` compared it against a simulation
    counting from one, so every real column landed one pick early: the real table
    looked a pick faster than it is and the pod looked worse than it is.

    Nothing about the output said so. Both curves were the right shape, both
    monotone, both ending at zero, and the conclusion the run supported — the
    pod passes bombs far too long — was TRUE, which is what made it survive. It
    was caught by an unrelated check noticing that "real pick 1" packs averaged
    exactly 13.00 cards.

    It had already produced one wrong finding and put it in a commit message:
    that our packs open a first-pick card twice as often as real ones, blamed on
    the bonus sheet. Aligned properly the two are 47% and 48%. `build-set-stats`
    reads the same column correctly (`row[pickNoI] === "0"`), which is what makes
    this a reading error rather than a data one — **and the correctly-written
    line was three files away from the incorrectly-written one the whole time.**

20. **A number a model is asked to compare is a number it is allowed to round**
    (2026-08-22). The coach's gap line stated "INSIDE the margin" in words when
    the score called two cards indistinguishable, and on the other branch handed
    over `1.2pp` against `±1.1pp` and stopped. So on a real miss the model did
    the comparison itself, and answered "within the margin of error, so this pick
    is essentially a coin flip" beside a panel saying the gap was larger than the
    margin — two answers about one pick, on one screen.

    At one significant figure every narrow miss in this app looks like a tie, so
    the asymmetry only ever fires where it does the most damage. **Hand a model
    the verdict, not the arithmetic**, wherever the app has already computed one:
    the branch that states its conclusion is fine and the branch that leaves two
    numbers on the table is the bug, and they look identical in review.

21. **A rule taught to a scorer reaches only the surfaces that ask the scorer**
    (2026-08-20). The colour rule shipped, was correct, and never fired on the
    review screen — which put only `rawBest` on a stored pick and so marked
    CONTEXT_BEST from the review model's own nomination. Three surfaces asked the
    scorer and one did not, and the one that did not was the one nobody had
    complained about yet. `pickCoach.ts` cites this by name.

22. **The widest gap among k noisy numbers is wide when nothing is there, and a
    two-sigma gate on it is not a two-sigma test.** The archetype quiz asks
    which of a card's decks wants it most and which least, and gated that on
    best-minus-worst clearing two standard errors. Over 2,000,000 simulated
    draws of k independent nulls that gate passes 18.7% of pure noise at four
    decks and 59.8% at ten -- so the bank it reported as 1,149 questions was
    really 335, and the false ones were concentrated on the cards played in the
    most decks, which is the commons.

    This is trap #13 wearing different clothes and it was not recognised as one
    while being written. What caught it was asking what the number would be if
    NOTHING were there, which is the same question trap #8 asks about "agrees
    with the human 48% of the time" and the one no amount of staring at the
    output would have answered -- 1,149 questions across 21 sets looked
    exactly like a healthy result.

    The fix is a threshold per k rather than a threshold, and the setting
    becomes a false-positive RATE. `rangePValue` in `core/drills/archetypes.ts`
    is the null, in closed form; `pnpm diagnose-archetype-quiz --calibrate`
    simulates it independently and the test pins one against the other. Its k=2
    answer must be 1.96, because with nothing to maximise over the range test IS
    the ordinary two-sided z-test -- anything that misses that is wrong
    elsewhere too.

    **The sequel, and it is the part that changed the feature.** Controlling the
    per-test rate is not controlling what a player sees: 5% over everything
    TESTED was still about a third of what got SERVED, because only a tenth of
    candidates have an answer at all. Benjamini-Hochberg controls the right
    thing and leaves 25 questions across eighteen sets. There was no gate that
    was both honest and playable -- so the inseparable cards became the drill's
    third answer instead of its rejects.

23. **An instrument beside a threshold measures the setting, not whether the
    setting is right** (2026-08-19). `stats_viewed.forced` was added to settle
    where the decision-pick floor belongs and a person settled it first, on the
    first real run. The metric answers "how many does the floor withhold", and no
    size of that number answers "is the floor in the right place". Worth having;
    not worth waiting for.

24. **A prior that shrinks every parameter evenly, over parameters whose data
    is wildly uneven, invents differences that are not there** (2026-09-01).
    `fit-drafter` dealt a simulated drafter who is uniformly TWICE as decisive
    as the pod -- identical preferences, sharper picks -- and the six-dial fit
    called them different from the field on `table`, `lane` and `signal` at
    100%. Three claims that this person weighs something more than the field,
    about somebody who weighs nothing differently at all.

    The shrinkage was not too strong. It was EVEN. The bundles move a real fdn
    pack by 4.10, 0.94, 0.79, 0.42, 0.029 and 0.011 logits, so one pull of equal
    force leaves the well-measured bundles near the truth and the badly-measured
    ones at the prior -- and the SPREAD between them then reads as an opinion.
    Dividing afterwards by a separately fitted overall scale does not undo it,
    because the parameters were never scaled together.

    The fix is to fit the shared scale FIRST and centre the prior there. False
    positives on that drafter went from 100% on three dials to 0-7%. The general
    form: whenever a prior is centred at a point the data may be uniformly
    displaced from, estimate the displacement before shrinking toward it.

    **The same mistake was then made again, one level up, in the same phase**
    (2026-09-01). `measure-tau` fitted the spread of real drafters with the
    prior at `table3` -- and `table3` is a compromise across eighteen sets that
    no single set is, so pooled `power` sits at 0.30 in ktk and 1.46 in blb.
    Each set's own offset was being counted as spread BETWEEN its drafters:
    0.241 against 0.229 pooled, and 0.246 against 0.151 on ktk alone. Centring
    each set's prior on its own population fixes it, and `fitTauGrouped` is
    that.

    Twice, by two different routes, in one phase. The tell both times was a
    number that stayed suspiciously large where the data was thinnest.

25. **An exemption travels with the conditions that earned it, and reusing a
    mark does not reuse them** (2026-09-02). `GapMark` has no axis and argues
    for it in its own docblock: it "rides inside an eyebrow beside the numbers
    it draws", so the marks carry the relation and the text carries the values.
    The habits panel reused that mark and deliberately printed no numbers --
    taking the conclusion and leaving the premise behind. Two more followed:
    its reference rule is at ONE here rather than zero and was unlabelled,
    which is the case `Reference` exists for by name; and it sizes its scale
    per call, so two stacked rows were drawn on different scales, looked
    comparable, and said nothing about it.

    **And the second version only shrank it.** The proportions were wrong AND
    the mark was empty, and fixing the first made the second no better -- a
    1.5px span with a 4px dot in a panel track is not a small chart. `MARK.band`
    already existed for "an interval, a margin, a range", and `DeckBands` is
    the model CLAUDE.md names. The tell that a drawing has nothing in it is
    that resizing does not help.

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
    fast the format is, and nothing has measured that. IWD has a sound
    measurement argument and no derivable weight — the first attempt took 0.37
    from `1 - corr^2`, and how redundant a signal is says nothing about how far
    it should move an answer. A term whose magnitude cannot be justified does not
    belong in the score.

    **This entry used to say speed's sign needed the REPLAY dataset. Only that
    half is struck** (2026-09-04). Format speed is a mean over `num_turns`,
    column 17 of the GAME dataset the pipeline already streams, and all 25 cached
    game files were measured for it without touching replay: MH3 8.29 turns to
    KTK 10.03. What is NOT struck is the sign-dependence itself — no work here
    measured whether speed's sign moves with how fast a format is, and it remains
    the reason speed is stored and not scored. The dataset was the wrong obstacle;
    the obstacle is still there.

    **And `speed` does not measure what its name suggests, which is the finding
    worth not re-deriving.** It is `ohWr - gdWr` (convex/sets.ts) and asks WHEN
    IN A GAME a card is best for you. `deckSpeed` — a card's mean game length
    minus the mean for the colours it was played in — asks HOW LONG THE GAME
    RUNS when the card is in the deck. Correlated against each other: −0.28 over
    252 fdn cards, −0.29 over 269 woe cards, −0.35 and −0.36 on the cards that
    clear their own error bar. Right sign, about a tenth of the variance shared.
    Neither substitutes for the other, so anyone reaching for one should check
    which question they are asking.

    **`deckSpeed` is orthogonal to win rate at −0.001 over all 270 measured fdn
    cards**, which is the population figure. An earlier draft of this entry
    quoted +0.088; that came from the 39 most extreme cards — selected on the
    very variable being correlated — and had no business standing for the whole
    set. The conclusion survives and is stronger than the number it was made on.

    **The within-set spread is as large as the between-set spread, and that is
    what made a drill possible.** Colour pairs inside one set differ by about 1.6
    turns, against a 1.74-turn range across all 25 formats — so game length is a
    fact about the deck at least as much as about the format. But a pair's speed
    is NOT a property of the pair: the spread between pairs is 0.294 turns and
    the spread of one pair across sets is 0.250, a ratio of 1.18, and WR runs
    from −1.09 to +0.24 depending on the set. Folding deck speed into the
    colour-pair archetype would throw away the half that varies.

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

25. **The Comprehensive Rules are a dev-time input, never a shipped one.** They
    are the only complete list of what Magic's mechanics are called and are not
    licensed for redistribution: the Fan Content Policy carves verbatim rules
    content out of what it permits, and the CR document itself grants nothing
    beyond a publisher colophon. So the rules decide WHICH mechanics exist and
    supply a section number to cite, `docs/set-mechanics.yaml` carries a sentence
    somebody wrote, and `checkOriginal` fails the run on twelve consecutive words
    shared with the original. The file is gitignored and must stay so.

    **Not fetched at build time either.** There is no stable URL, no `latest`
    alias, and the txt's date drifts independently of the docx and pdf -- the
    site once offered `20260807.docx`, `20260807.pdf` and `20260819.txt` with
    `20260807.txt` a 404, and the one third-party "always latest" redirect was
    broken for exactly that reason. `refresh-mechanics` is a local script.

    **Where the game prints a rules card, it replaces our prose -- and almost
    none of them do.** A booster's inserts are mostly places to put cards: mh3's
    Energy Reserve is "(Place your energy counters in this area.)" and nothing
    else, woe's On an Adventure and otj's Plot are storage markers with the rule
    restated shorter than we say it. Two qualify, LTR's and dft's, and the same
    test settles a two-faced one face at a time -- dft's back is a large "4" with
    no text and is not stored. Choosing automatically was declined: it needs a
    threshold on length, and the first set to ship a terse rules card or a wordy
    placemat breaks it in silence. `refresh-mechanics` reports every unclaimed
    insert with its text beside ours, so the next one is a decision somebody
    makes rather than a default nobody hears about.

    **Ability words will never be derivable.** Rule 207.2c names all 60 and says
    outright they have no rules meaning and no entries in the rules, so there is
    nothing to cite -- and it is not exhaustive: `corrupted` is on 26 paper cards
    and appears nowhere in the CR, not even in the release published for its own
    set. Scryfall's catalog is the better list of which words exist.

26. **A band drawn beside a decision must be sized by the decision, not by
    convention** (2026-08-27, the archetype quiz's reveal). The chart on that
    panel draws each deck's lift with a band around it, and the obvious band is
    a 95% confidence interval. It is the wrong one and it would have been wrong
    silently: two 95% intervals stop overlapping at about 2.8 error bars, and
    that drill's threshold moves with how many decks a card has -- 2.34 at
    three, 3.16 at ten. So on a card compared across many decks a player would
    have seen two bands clearly missing each other under a verdict saying the
    decks are level, and been right to disbelieve the screen.

    `decisionBand` in `core/drills/archetypes.ts` is sized so that TWO BANDS
    TOUCHING IS EXACTLY THE THRESHOLD, which makes it not a confidence interval
    and deliberately so. Anybody "fixing" it back to one restores a picture that
    argues with the grade beneath it.

    The general form, which is the reason this is here rather than only in that
    file: a chart under a decision is part of the decision. Drawing it with the
    statistic that is conventional for a number ON ITS OWN will disagree with
    whatever rule the number is actually being judged by, and the disagreement
    shows up as a reader who does not believe the app.

27. **The charting library question is answered: visx, and it was not close**
    (2026-08-28). Nivo and Tremor were the two asked about and both were
    measured before the answer.

    `@tremor/react` is dead -- last commit 2025-01-13, published peer
    `react: ^18.0.0`, React-19 and Tailwind-4 issues open since 2024 and 2025.
    Tremor Raw does want Tailwind 4, but it is copy-paste source carrying
    `bg-gray-100 dark:bg-gray-800` on nearly every component, which is a second
    theming system running beside daisyUI's `data-theme`. Nivo genuinely
    supports React 19 -- and its `inheritedColor` path routes every colour
    through `d3.rgb()`, so `var(--color-primary)` comes back NaN, and the way
    round it is a MutationObserver rebuilding the palette in JS because daisyUI
    fires no event on a theme swap. Adopting it means building a bridge back to
    the styling we already have.

    **The general finding is the part worth keeping.** Of thirty-odd graphics
    here, four are a shape a chart library has a component for; and of the
    sixteen defects the audit found, NOT ONE was a missing chart type. They
    were a missing axis, a scale that saturated, bars that could not sum to
    their own total, a `%` on a figure that was points, and three charts that
    overflowed a phone without looking broken. Scales, axes, tick generation,
    tooltip anchoring, responsive measurement -- that list is the defect list,
    and it is exactly what visx is. It ships no chart components at all, which
    is what leaves the braid and the card-segment curve possible.

    Recharts 3 is the escape hatch if a chart ever needs interaction more than
    it needs a shape, and only then: 7.3MB unpacked against visx's 54-221KB per
    package, carrying @reduxjs/toolkit, react-redux, immer and victory-vendor
    at runtime.

    **What it actually cost, measured against `main` on the same machine:**
    +23-26kB First Load JS on the eight routes that draw a chart, and +0kB on
    the twelve that do not -- `/glossary` included, whose figures stayed HTML.
    So the à-la-carte packaging is real and a route pays only for what it
    imports, which is the property Nivo does not have (`@nivo/bar` pulls its
    nine sibling packages whatever you use).

    **The kit is `app/charts/`, and its one structural idea is the GUIDES.**
    Axis, legend and tooltip are not three features but one question — can a
    reader who has never seen this work out what it says — answered at three
    distances: across the room, at arm's length, at the cursor. `Plot` requires
    `legend` and `tip`, and off is `{ none: "reason" }` rather than `false`,
    because the reasons turn out to be the valuable part and a boolean throws
    them away. That is not a guard rail: turning a guide off stays one line, on
    purpose, since a kit that makes the exception expensive gets worked around.

    **The tooltip is deliberately NOT visx's.** `useTooltip` holds position in
    React state and re-renders per pointer move, which is the exact pathology
    `CursorTip.tsx` was rewritten to fix -- it writes its content imperatively
    from one animation frame and damps by elapsed time rather than by frame.
    visx for the scale and the marks; `useCursorTip` for what the pointer is
    over. Two things it learned the hard way and neither is worth rediscovering:
    the box must be PORTALLED to `document.body`, because `position: fixed` is
    only fixed until an ancestor becomes a containing block and any `z-*` on
    one caps it; and it draws mana pips, so a tip that names a colour says it
    the way the rest of the app does.

# Shipping a pipeline change (2026-09-04):

**A change to `build-set-stats` is not shipped until the artifacts under
`packages/backend/data/` are rebuilt and COMMITTED.** The deploy runs
`convex deploy && seed-set-stats && ingest-sets`, and both scripts read the
committed artifacts — never the CSVs. So a branch that changes the pipeline and
leaves the artifacts alone deploys a pipeline nothing has run: every set carries
the old shape, forever, and the feature is silently dead in production while
passing every test and working perfectly on the machine that rebuilt one set by
hand. The deck-speed drill shipped exactly that way and it was caught by a human
opening the page, which is the only thing that could have caught it.

**The rebuild is its own `data:` commit**, in the shape of `3d5462f4` — what
moved, per set, with numbers, and an explicit note on any set deliberately left
alone. The artifacts are committed precisely so this is a reviewable diff.

**The command is `pnpm new-set <SET> <FORMAT>`.** It orchestrates availability →
archive → build-set-stats → seed → ingest → validate-pack-model →
refresh-mechanics for one set, reuses the archived CSVs when both are present,
and is LOCAL ONLY. Do not hand-roll a loop over `build-set-stats`: the
orchestrator also runs the two validation steps, and skipping them is how a set
gets seeded with a pack model nothing checked.

**No revision bump is needed for this case, and that is not an oversight.**
`POOL_REVISION`, `CRAWL_REVISION` and `META_REVISION` gate ingest's derivation
FROM an artifact; they cannot put a new field INTO one. The artifact's own hash
is the fingerprint here — `seed-set-stats` hashes the file and `ingest-sets` keys
on `POOL_REVISION:sourceHash` — so a rebuilt artifact re-seeds and re-derives on
deploy and an unchanged one costs one small read. Bump a revision only when the
stored CARD shape or the crawl changes; see the docblock at `sets.ts:180`, which
is the actual test.

**And run the query, not the function under it.** Every claim that the drill
worked came from calling `deckSpeedQuestions` on an artifact, which cannot see
`deal` at all — not its four refusals, not the roles read, not whether the data
survived an ingest. `convex-test` runs the real query against a seeded set in
milliseconds (`test/drillDeckSpeed.test.ts`), and the refusal it did not have is
the one that shipped wrong: STX was told "it comes back the next time this set's
data is refreshed" about a set 17Lands will never publish colours for.

# Verify at the layer that breaks (2026-09-04):

Every bad hour of the deck-speed drill was the same mistake: **evidence gathered
one layer below the thing that could fail.** None of it was fabricated and all of
it was green.

    claimed                     tested                  broke
    the drill works             deckSpeedQuestions      deal: pager, mute, roles
    it is ready to test         seed-set-stats          ingest-sets never ran
    the field is missing        a grep over a table     the field was there
    the tooltip works           typecheck               hit target under the marks
    the tests prove the fix     a test that passed      it passed against the bug too

Each answer was true about the question actually asked and useless about the
question that mattered, which is what makes this hard to catch from inside: the
terminal says green either way.

**Test the seam a person crosses.** A Convex query is not covered by testing the
function it calls; `convex-test` runs the real query in milliseconds and is what
`test/drillDeckSpeed.test.ts` does. A chart is not covered by a typecheck; there
is a Playwright harness against `/dev` and `tests/browser/cursorTip.spec.ts` is
what it looks like. A pipeline change is not covered by a green suite.

**And watch a regression test fail before believing it.** Reinstate the defect,
see red, restore, see green. The first tooltip test passed against the bug it was
written for — it hovered the SVG's vertical centre, which the margins put below
every mark, on empty plot that behaves identically whichever order the elements
are painted in. One minute of reinstating the bug is the only reason that is not
sitting in the repo as proof the tooltip works.


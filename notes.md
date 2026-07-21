# Issues:

1. The suggested decks have incorrect spell counts when including the Evolving Wilds/multi-colored lands. Those 2 card types should detract from the 17-lands count.

2. I did a draft and went wide with my color choices because I was focusing on dragon synergies, but it kept complaining that I should solidify my color choice.

3. **17Lands `card_ratings` returns empty stats for rotated sets** (found 2026-07-21).
   The endpoint still returns the full card list, but every entry has
   `seen_count: 0`, `game_count: 0`, `ever_drawn_win_rate: null` — so `loadSetData`
   silently falls back to `RARITY_BASELINE` for every card and scoring is
   rarity-only. Evidence from `~/.mtg-tutor/cache/` by fetch date: BLB (Jul 2) and
   MH3 (Jul 6) have real data; WOE (Jul 8), MKM, TDM, FDN, DSK all have zero. MSH
   (a currently-running set) still returns data. So this looks like a 17Lands-side
   change around Jul 7-8 that stopped serving historical aggregates for sets no
   longer in rotation — not a date-range bug (tested no-params, the set's own
   release window, and 2019->today; all return zeros).
   Impact: practicing a *current* set still works; practicing older sets does not.
   Options to explore: 17Lands' public data downloads, a different endpoint/param,
   or caching a good snapshot per set before it rotates out.

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
4. Keep review logic UI-agnostic in `core/` for an eventual React frontend (e.g.
   expose the decision-pick threshold as a slider to the user).

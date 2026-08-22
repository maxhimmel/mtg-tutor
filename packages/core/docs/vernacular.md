# How Limited players talk

The evidence behind [vernacular.yaml](./vernacular.yaml), which is the machine
readable source and wins wherever the two disagree — the same relationship
`draft-principles.md` has with its own YAML. Sources are numbered in
[vernacular-sources.md](./vernacular-sources.md) and cited here by number.

This file is the part a person reads: the quotes the voice rules were derived
from, and the reasoning that decided which words are a problem and which are
fine. Nothing here is recalled — every quote was read on the page it is
attributed to.

## The sentence that started it

> Spectral Sailor is a cheaper, higher-floor flyer that fits nearly any blue deck
> — either is defensible at pick 1.
>
> — the coach

LSV reviewed the same card in the *Core Set 2020* Limited Set Review, rating it
3.0:

> As much as I rail against 1/1's for 1, this letting you draw extra cards goes a
> long way in my book. Spectral Sailor is a real threat if the game ever slows
> down, and a 1/1 flier does have some effect on the board (even if it's not
> much). — [3]

What LSV does and the coach did not: he names the concrete thing the card does
("letting you draw extra cards"), he says when it is good ("if the game ever
slows down"), and he concedes the weakness in a parenthetical rather than hedging
the sentence. No abstraction nouns at all.

## The diagnosis: grammar, not vocabulary

**"Floor" is real Limited vernacular.** It is defined in strategy writing as
"what a card does with no help from other cards" [4], and LSV uses it:

> The floor is pretty high here, as a 3-mana 2/2 flier is solid, and if you ever
> curve this into a 5-drop you will be very happy with the results. — [3]

The abstraction is the **predicate of a clause**. "A cheaper, higher-floor flyer"
takes the same word and stacks it in front of a noun as a hyphenated modifier,
which no Limited writer does. Same term, different grammar, completely different
register — and that is most of what was wrong. This is why the corpus is rules
about sentence shape rather than a dictionary.

**"Defensible" is a different problem.** It appears in none of the sources read.
It is debate-club register that arrived from outside this game, and it is the one
word on the avoid list with no MTG provenance whatsoever.

## How good Limited writers sound

**Sentence shape.** Short to medium declaratives, usually one idea each, joined
with "and" or "but" rather than subordinated. First person for opinions, second
person for the reader.

**They almost never quote numbers in prose.** Across a whole colour of the M20
set review the only numbers are mana costs and power/toughness — "a 3-mana 2/2
flier", "five-mana 5/5 flier" — even though the writer certainly has more. The
data lives in the grade; the prose stays qualitative. 17Lands say the same thing
about their own numbers: win rate is "an aid, a starting point" and should not be
used to "end a discussion" [2].

**Hedging is casual and personal, not statistical.** "I'm not super high on
this", "I'd really hope to do better", "I don't hate the idea of boarding this
in", "I only play reluctantly" [3].

**Closeness is said plainly:**

> I think this pick is relatively close. — Ryan Saxe [6]

> Moonsnare Specialist is probably slightly better than Network Disruptor in my
> Izzet deck, but it's not by much. — Ryan Saxe [6]

> Card evaluations have large error bars at the beginning of any Limited format.
> — Ryan Saxe [5]

**Conceding a weakness, in an aside:**

> Sleep Paralysis is a fine removal spell, and you will rarely cut it. It's never
> exciting, but it sure gets the job done. — [3]

> Sage's Row Denizen provides a mediocre body and a mediocre win condition, which
> with their powers combined…makes a mediocre card. — [3]

**What they never do:** stack hyphenated abstract modifiers before a noun; borrow
evaluative words from finance, law or debate; quote a statistic to settle a card
discussion; hedge with pseudo-precision ("moderately strong"); explain the
obvious.

**What not to copy.** LSV puns constantly, and it is charming because it is him.
A coach imitating it will land badly more often than not. Take the warmth and the
brevity; leave the puns.

## The scale evaluation is denominated in

LSV's ratings are worth knowing because the whole scale is expressed in **how
often you cut the card**, not in abstract power [3]:

| | |
|---|---|
| 3.0 | "Good playable that basically always makes the cut." |
| 2.5 | "Solid playable that rarely gets cut." |
| 2.0 | "Good filler, but sometimes gets cut." |
| 1.5 | "Filler. Gets cut about half the time." |
| 1.0 | "Bad filler. Gets cut most of the time." |

That is the single best steer for the coach's evaluative language, and it is
where VOICE-10 comes from. Note also that grade scales are **not
interchangeable** — Draftsim uses 0–10 with different band meanings — so "this is
a 3" is ambiguous across communities.

## Terms that are genuinely contested

Flagged so the app does not codify one camp's slang as universal.

- **Tempo.** The most contested word in the game. Card Kingdom notes that "most
  players will either laugh 'tempo' off as a meaningless buzzword, or simply
  claim they know it when they see it" [12]; Wizards' official line reduces it to
  board presence [10], which many players would say is a different thing. Use it
  only where the concrete meaning is obvious. Do not define it.
- **BREAD vs KETO.** BREAD (Bombs, Removal, Evasion, and…) is still widely
  taught, and its most prominent teachers publicly dropped it — Limited Resources
  482 is titled "A Fresh Look at BREAD (And Why You Shouldn't Use It)" [7] — and
  replaced it with KETO: Kill spells, Efficient creatures, Top end, Other [8].
  Both camps exist. Do not present BREAD as received wisdom.
  The principles corpus is not naive about this — `EVAL-01` states BREAD and
  `EVAL-08` carries a critique — but the critique it carries is CABS, and the
  replacement BREAD's own most-cited teachers actually made is KETO. Worth a
  principle of its own rather than a note here, and worth deciding on the
  evidence rather than by whichever corpus was edited last.
- **Hate drafting.** Contested on value, not meaning. Wizards argues against it,
  partly because it corrupts your own read of the signals [11]; it is
  situationally correct in paper top tables and close to pointless on Arena.
- **Rare drafting.** Contested on economics rather than strategy, and it varies
  enormously between paper leagues and Arena.
- **"Gas".** Real [13], informal, and slightly generational. Fine in speech,
  reads as try-hard in written coaching.

## One factual correction this research produced

**17Lands renamed IWD to IIH on 2025-08-01.** From their own changelog [1]:

> 2025-08-01: We renamed "Improvement When Drawn" to "Improvement In Hand" to
> better reflect the definition of the metric. The definition remains the same.

The old name was imprecise in a way worth knowing. The metric is Games in Hand
Win Rate minus Games Not Seen Win Rate, and games-not-seen excludes cards
**tutored** to hand as well as drawn — so "in hand" is the honest description and
"when drawn" never was. Two caveats 17Lands attach to their own numbers, both
worth respecting:

- On IIH: it "does not weight by the number of games in each situation, which may
  overvalue powerful late-game cards." [1]
- On ALSA: "When P1P1 contents are missing, ALSA is slightly elevated for cards
  that often do not wheel." [1] — relevant any time the app reasons "this should
  have wheeled".

## Terms used without a source

These are in the corpus marked `sourced: false`. They are standard in speech and
were found in use, but no page defining them could be reached: **beater**,
**cutting** (starving a colour downstream), **curve out**, **at parity**,
**signpost uncommon**, **raredraft**.

Blocked during the research and worth another attempt: the r/lrcast wiki (Reddit
network policy), TCGplayer's LSV set reviews (bot-blocked — the LSV material here
comes from the Wayback copy of the original ChannelFireball posts), MTG Arena Zone
(403) and MTG Wiki (402).

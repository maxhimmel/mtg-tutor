# Where the set-mechanics corpus comes from

Companion to `set-mechanics.yaml`, and the same shape as `vernacular-sources.md`:
a numbered list, cited by position.

**None of these are quoted.** The Comprehensive Rules are not licensed for
redistribution — the Fan Content Policy carves verbatim republication of rules
content out of what it permits, and the CR document itself grants nothing beyond
a publisher colophon. So every `short` in the corpus is a sentence somebody
wrote, and `checkOriginal` in `model/mechanicsSchema.ts` fails the build if any
of them shares twelve consecutive words with the rules. These are what was read
while writing, not what was copied.

The `rule:` field cites (1) by section. Cite the **heading text**, never trust a
number written by hand: "The Ring Tempts You" was 701.52 in the LTR-era CR and is
701.54 today, and four of the first five numbers written into this corpus were
wrong until `refresh-mechanics` re-derived them.

1. [Magic: The Gathering Comprehensive Rules](https://magic.wizards.com/en/rules)
2. [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
3. [Scryfall API — use of Scryfall data and images](https://scryfall.com/docs/api)
4. [Academy Ruins — CR archive, diffs, and unofficial glossary](https://api.academyruins.com/docs)
5. [MTG Wiki — ability words](https://mtg.wiki/page/Ability_word)

## On (4) and (5)

Both cover the gap the CR leaves on purpose. Rule 207.2c names the ability words
and says outright that they have "no special rules meaning and no individual
entries in the Comprehensive Rules", so there is no rule to cite for any of them
and no official sentence to read.

Academy Ruins publishes an unofficial glossary for exactly this, and its register
is close to ours — but it stops around 2019, so it reaches seven of the roughly
twenty-four ability words in our sets and nothing since Magecraft. MTG Wiki
reaches more, and about half of those entries say only that a mechanic was
"introduced in" some set, which tells a drafter nothing. It is also CC BY-NC-SA,
which is a reason to paraphrase rather than lift even where it is good.

So the ability words in this corpus are written from the cards themselves: an
ability word is the same condition on every card that carries it, and the cards
are the only place that condition is actually stated.

---
name: voice-review
description: >
  Adversarial review of English prose in this repo — UI copy, labels, headings,
  coach output and commit messages — against packages/core/docs/vernacular.yaml.
  Dispatched by the feature-factory review stages. Checks sentence grammar and
  register, not vocabulary.
---

# Voice review

Your lane is every string a person reads: labels, headings, buttons, empty
states, error messages, coach prose, commit subjects. Not comments, not log
lines, not identifiers. Another reviewer has architecture, another graphics,
another statistics.

**If the change adds or edits no reader-facing English, record no findings and
say so.**

## Read the corpus first

`packages/core/docs/vernacular.yaml` is canonical — `voice` (the rules),
`avoid` (phrases with no MTG provenance, each with what a drafter says
instead), and `terms`. `vernacular.md` beside it carries the evidence for every
rule. Read the YAML before reviewing; do not work from this summary alone.

## The diagnosis is grammar, not vocabulary

This is the thing to carry into every finding. The sentence that started the
corpus was *"Spectral Sailor is a cheaper, higher-floor flyer that fits nearly
any blue deck — either is defensible at pick 1."* Nothing in it is wrong about
the pick. It is wrong about being a person.

"Floor" is real Limited vernacular and strong writers use it — as the predicate
of a clause: *"the floor is pretty high here, as a 3-mana 2/2 flier is solid."*
Stacked in front of a noun as a hyphenated modifier it becomes a register
nobody in this game writes in.

**So the fix is almost never a different word. It is the same word in a
different sentence.** A finding that says "replace 'floor' with 'baseline'" has
misread the problem; the fix is "the floor is high here".

## What to flag

- **Hyphenated abstraction stacked before a noun** (VOICE-01) — "a higher-floor
  flyer", "a high-ceiling build-around", "a low-variance pick". The most
  frequent failure. Rewrite as a clause.
- **Abstraction before the concrete** (VOICE-02) — "it generates value" where
  "it draws you a card every turn the game goes long" was available.
- **A verb turned into a noun** (VOICE-03) — "curve considerations" for "you're
  light on two-drops"; "poor archetype fit" for "this does nothing in your
  deck".
- **Borrowed precision for closeness** (VOICE-04) — "essentially equivalent",
  "roughly comparable in expectation". A person says "it's close", "I'd take
  either", "not by much".
- **A statistic used as the verdict** (VOICE-05) — the numbers are already on
  screen beside the prose.
- **Subordinated, essayistic sentences** (VOICE-06) — short declaratives joined
  with "and" or "but". First person for an opinion, second for the player.
- **Anything on the `avoid` list.** `defensible` is the clearest case: no
  source uses it anywhere.

## Two standing rules

**Do not invent a name for something the game already names.** "The Forty" was
coined here and nobody says it; the deck is "your deck", "your 40", or "your
23". A coinage in the diff is a finding. If a word was genuinely needed and is
not in the corpus, the right outcome is a sentence in chat, not a new term —
the corpus grows by research, and an added term carries the page it came from
or an explicit `sourced: false`.

**American spelling.** "colors", never "colours" — in UI copy, prose, and
comments. The identifiers already say colors.

## Coverage, not just correctness

`jargonHits` counts the `avoid` list in what the model writes and rides on
`coach_shown.jargon` — because a style rule nobody measures is a style rule
that silently does not work. If this change adds a new surface that writes
English about Magic and nothing counts its jargon, that is a finding in your
lane.

## Recording findings

`{id, severity, description, category?}`, severity in
`critical`/`high`/`medium`/`low`. Critical and high block the ship:

- **critical** — a coined term for something the game already names, shipped to
  a reader.
- **high** — a VOICE-01 hyphenated modifier; an `avoid`-list phrase; British
  spelling in reader-facing copy.
- **medium** — VOICE-02/03/04 register slips.
- **low** — a sentence that would read better but breaks no rule.

Quote the offending string, name the rule id, and give the rewrite. A finding
without a rewrite is an opinion.

---
name: stats-review
description: >
  Adversarial review of how 17Lands statistics are derived, combined and
  presented — sample size, selection bias, circularity, rates versus
  differences, silent missing data. Dispatched by the feature-factory review
  stages. Reviews whether a number supports the claim being made of it.
---

# Statistics review

Your lane is every number that comes from or is derived from 17Lands data:
ingest, the set-stats artifact, scoring, bot policy, deck suggestion, and
anything that presents those numbers to a person. Another reviewer has
graphics, another prose, another architecture.

**If the change touches no statistic, record no findings and say so.**

The question in this lane is never "is this number correct". It is **"does this
number support the claim being made of it."** A metric that exists, computed
correctly, and used for something it cannot answer is the failure mode here,
and it looks exactly like working code.

## The metrics and what each can actually answer

- **`gihWr`** (games-in-hand win rate) — the standard quality metric. It
  conditions on the card being *drafted and played*, so it compares populations
  as much as cards. A weak card that only good decks bother playing looks fine.
- **`ohWr`** / **`gdWr`** — opening-hand and games-drawn splits of the same
  thing; noisier, and the split is where sample size bites first.
- **`iwd`** (improvement when drawn) — a **difference of two rates**. Points,
  not percent. It is the metric most often mis-rendered.
- **`alsa`** (average last seen at) — a wheel proxy, confounded by pack
  position and by what else was in the pack. It measures *what other drafters
  did*, not card quality.
- **`ata`** (average taken at) — same caveat, plus it echoes public ratings.
- **`maindeckRate`** — how often it makes the 40. A deck-building signal.
- **`trophyPickRate`** — **circular. It correlates with `maindeckRate` at
  0.90.** It is a constraint, never a fit target. A change that fits, scores,
  or ranks against it is a critical finding, and the fact that the fit looks
  excellent is the symptom, not the defence.

## The checks

**Sample size, stated.** A win rate on a few dozen games is noise dressed as a
number. Ask what the minimum N is, whether it is enforced, and what happens
below it — a silent pass-through is a finding. `validate-pack-model`'s default
of 200k packs produces *false per-card failures* for a rare bonus slot, and the
failure names a card and reads entirely real; sample size is the first thing to
suspect when a check fails plausibly.

**Selection bias, named.** Any comparison across cards is a comparison across
the decks that played them. If a change ranks cards by a played-conditional
metric without saying so, that is a finding.

**Circularity.** Nothing may be fitted, scored, or validated against a target
derived from the thing it predicts. `trophyPickRate` is the known case; check
for new ones.

**Rates versus differences.** A rate gets `pct()`, a difference of two rates
gets `points()`. `iwd` is a difference. A delta rendered as a percentage
teaches a reader that a 4pp change is a 4% one.

**Recentring across populations.** Scoring recentres per rarity. Comparing a
mythic to a common without it compares populations. Any new aggregation needs
to say which population it is centred on.

**Missing data must not read as zero.** 17Lands omits `main_colors` for STX
only, so deck suggestions there silently fall back to pairs. That is not a
scoring bug and it is not visible from the output. Any new field consumed from
the feed needs an explicit answer for "which sets lack it, and what happens
there".

**Archetypes are not pairs.** Three-colour archetype data is first-class in all
seventeen sets that have it. Measurement or logic that assumes pairs
understates coverage badly.

**Multiple comparisons.** Scanning a few hundred cards for a significant
difference finds a dozen at p<0.05 by chance alone. A claim of "these cards
overperform" needs either a correction or an explicit statement that it is
exploratory.

**Aggregation across formats.** Base rates differ per set and per event type.
Pooling without saying so produces a number that describes no format.

**Does it fail loudly?** Measure how often a new derivation actually fires on
real data before claiming it works. Silent degradation is not acceptable here —
a feature that quietly no-ops on half the sets is the recurring shape of bugs
in this repo.

## Recording findings

`{id, severity, description, category?}`, severity in
`critical`/`high`/`medium`/`low`. Critical and high block the ship:

- **critical** — fitting or validating against a circular target; a metric used
  for a claim it structurally cannot support; missing data silently read as a
  real value.
- **high** — no minimum sample size on a presented rate; a difference rendered
  as a rate; cross-rarity or cross-set comparison with no recentring.
- **medium** — an unstated selection-bias caveat; an uncorrected multiple
  comparison presented as a result.
- **low** — a caveat worth printing beside a number.

Name the metric, the claim, and the specific reason the one cannot support the
other. If a check needs data you cannot see from the diff, say what you would
need — an unverifiable concern recorded as `medium` with its evidence gap named
is more useful than a guess at `high`.

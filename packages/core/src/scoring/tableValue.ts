import type { Rarity } from "../model/card.js";

// What a real table pays for a card, as opposed to what it wins once played.
//
// WHY `value` COULD NOT DO THIS JOB
//
// `cardValue` is 17Lands GIH win rate, and a win rate is conditioned on the card
// already being in a deck and drawn. That makes it a good answer to "how much
// does this card win" and a bad answer to "how early is this card taken", and
// the two come apart hardest exactly where a drafter notices:
//
//   Cyclonic Rift          gih 0.5702, which ranks it 288th of 305 in sos
//                          alsa 0.81 -- a real table takes it first, always
//   Ral Zarek              gih 0.5825, 276th
//                          alsa 0.78
//   Moseo, Vein's New Dean gih 0.6277, 164th of 346
//                          alsa 0.98
//
// The mechanism is selection. A bomb everyone first-picks ends up in EVERY deck
// that opens it, including the bad ones, so its win rate regresses toward the
// format mean; a narrow synergy card only ever reaches the decks built to
// support it, so its win rate is inflated by the company it keeps. Spearman
// between `value` and real pick order runs 0.40-0.71 across the eighteen
// committed sets -- the ranking a pod picks by is only loosely the ranking a
// table picks by, and the pod passes bombs no table would.
//
// WHAT WAS TRIED FIRST, AND WHY IT IS NOT HERE
//
// `iwd` (improvement when drawn) is the textbook fix: a within-deck contrast
// between games where the card was drawn and games where it was not, which
// should divide out deck quality. It ranks WORSE than raw win rate against pick
// order on all eighteen sets (mean spearman 0.596 against 0.682), and
// `bench-packs --ranks iwd` deals packs worse than what ships on every column.
// So do `ohWr`, `gdWr` and `deckWr`. `maindeckRate` is the only game-side
// statistic that beats win rate (0.865), and it closes about a quarter of the
// gap in the pack bench -- real, and not enough.
//
// SO THIS READS PICK ORDER ITSELF, WHICH NEEDS A WORD ABOUT CIRCULARITY
//
// `bench-bots` forbids a fitted policy from reading draft-dataset aggregates
// over the answers -- that is why `crowd` is a baseline there and not a
// candidate. ALSA is such an aggregate, and this reads it anyway, because the
// rule and this use do not collide:
//
//   The rule protects a CLAIM: that a policy predicts human picks. A policy fed
//   the aggregate answer cannot be scored on that, and `bench-bots` top-1 is
//   meaningless for any pod built on this file. That stands, and is why the pods
//   using it are gated on `bench-packs` instead.
//
//   What is being built here is not a claim, it is a SIMULATION. The bots exist
//   to pass packs the way a table passes them, and the best available estimate
//   of what a table does is what tables did. Reading it is the answer rather
//   than a shortcut past one.
//
// It costs nothing in coverage: a set is only ingestable when 17Lands has
// published both its draft and its game datasets (see `USED_KINDS`), so every
// set the app can deal has ALSA for every card it can deal.

/**
 * A card, as this file needs to see one.
 *
 * Structural rather than `EngineCard`, because ingest calls this while a card is
 * still in halves and the benchmark scripts call it over rows off the committed
 * artifact. One definition with two callers is the point: a `tableValue` the
 * scripts computed differently from the one ingest stored would fit weights
 * against a column the bots never see, silently.
 */
export interface TableValueInputs {
  name: string;
  /** As `computeCardValue` settled it. The scale this borrows, and the fallback. */
  value: number;
  /** 17Lands "average last seen at": the pick a real table stops passing it. */
  alsa?: number;
  rarity?: Rarity;
}

/**
 * The set's own spread of card quality, handed out again in the table's order.
 *
 * A QUANTILE MAP, AND THE ALTERNATIVE IS WORSE
 *
 * The obvious move is to feed ALSA to the fit raw and let a coefficient sort out
 * the units. That gets the ordering right and the SPREAD wrong, and the spread
 * is what decides whether a card is passed. ALSA is compressed at the top -- the
 * twenty most-wanted cards in sos all sit between 0.36 and 1.06 -- so a policy
 * reading it raw would think they are nearly interchangeable and pass them
 * around. Win rates are not compressed like that.
 *
 * So the ordering comes from ALSA and the spacing comes from the set's existing
 * `value` distribution: the same numbers, redealt to the same cards, in the
 * table's order. That is an assumption -- that a format's quality is spread the
 * way its win rates are spread -- and it is the one `bench-packs` measured. It
 * takes survival of the first-pick cards from 100/57/38/26/20/16/13/10 to
 * 100/48/24/12/7/3/2/1 against a real 100/55/33/17/10/5/2/1.
 *
 * ONLY CARDS WITH A PICK ORDER GET AN ENTRY, and the map is deliberately not
 * total. Those without are basics and cards no logged draft ever opened, and
 * neither is a card a table has an opinion about -- so the honest answer is
 * nothing rather than a copy of `value`. Every reader falls back to `value`
 * anyway (`policyFeatures` does it inline), and the difference shows up where it
 * matters: an absent `tableValue` on a stored card means "17Lands published no
 * pick order for this", and cannot be confused with "the two orderings agreed".
 */
export function tableValues(cards: readonly TableValueInputs[]): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = cards.filter((c) => c.alsa != null);
  if (ordered.length === 0) return out;

  // Ascending ALSA is descending desirability: alsa 0.4 means the card is gone
  // before the pack has moved.
  const byWant = [...ordered].sort((a, b) => a.alsa! - b.alsa!);
  const spread = ordered.map((c) => c.value).sort((a, b) => b - a);
  byWant.forEach((card, i) => out.set(card.name, spread[i]));
  return out;
}

/**
 * How far `tableValue` moved a set's ranking. Reported by ingest.
 *
 * Not a check that can fail -- there is no wrong answer -- but a set where this
 * is near zero has told you its win rates already ranked like its table, and one
 * where it is large has told you the pods were badly wrong before. Both are
 * worth seeing go past, because the failure mode of this whole file is being
 * silently inert: a `tableValue` column that came out equal to `value` would
 * change no pick and no test would notice.
 */
export function tableValueShift(cards: readonly TableValueInputs[]): {
  moved: number;
  spearman: number;
} {
  const rated = cards.filter((c) => c.alsa != null);
  if (rated.length < 2) return { moved: 0, spearman: 1 };

  const byValue = [...rated].sort((a, b) => b.value - a.value);
  const byWant = [...rated].sort((a, b) => a.alsa! - b.alsa!);
  const rank = (list: TableValueInputs[]) => new Map(list.map((c, i) => [c.name, i]));
  const rv = rank(byValue);
  const rw = rank(byWant);

  const n = rated.length;
  let sd = 0;
  let moved = 0;
  for (const c of rated) {
    const d = rv.get(c.name)! - rw.get(c.name)!;
    sd += d * d;
    if (Math.abs(d) > n * 0.1) moved++;
  }
  return { moved, spearman: 1 - (6 * sd) / (n * (n * n - 1)) };
}

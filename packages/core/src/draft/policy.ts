import type { EngineCard } from "../model/card.js";
import { cardValue } from "../scoring/value.js";
import type { BotMemory } from "./bots.js";

// What a fitted bot policy looks at.
//
// ONE DEFINITION, BECAUSE TRAIN AND SERVE MUST NOT SKEW
//
// These features are computed twice in this repo: by `fit-bot-policy` over the
// 17Lands draft dataset, and by a `Bot` mid-draft. If the two ever disagree, the
// weights are fitted against something the bot never sees and the whole exercise
// measures nothing -- and it would fail silently, because both halves would keep
// working. So the definition lives here and both import it.
//
// EVERY FEATURE HAS TO BE COMPUTABLE BY A BOT AT PICK TIME
//
// That is the constraint that rules the list. The dataset carries plenty the fit
// could use -- the drafter's rank, their eventual record, what they did next --
// and none of it is available to a bot choosing a card, so none of it is here.
//
// AND BOUNDED, SO ONE COEFFICIENT MEANS ONE THING ALL DRAFT
//
// `laneFit` and `openness` are SHARES rather than running totals. A running
// total grows with the pool, so its coefficient would have to mean something
// different at pick 3 and pick 40 -- which is the job of the two interaction
// terms, deliberately and separately, rather than something smuggled into the
// units.

/**
 * The feature names, in the order the weight vector is written.
 *
 * Exported because the fit prints them beside the fitted numbers, and a weight
 * vector whose order is implicit is one nobody can check.
 */
// FIVE, AND TWO WERE MEASURED OUT RATHER THAN LEFT OUT
//
// A first pass carried `openness` and `colorless` as well. `fit-bot-policy
// --ablate` refits with one term held at zero, over 458k picks across all 18
// sets, and priced them at -0.02pp and -0.04pp -- neither pays for itself, and
// the same thing held on fdn alone.
//
// `colorless` was there because an artifact scores 0 on both shares, exactly
// like a card in a colour nobody is in, and those are not the same situation.
// True, and worth nothing: the fit says humans do not treat them differently
// once raw power is known.
//
// `openness` is the interesting one, because it is the term this whole exercise
// was for. Signal-reading is real -- `opennessLate` is worth +0.50pp -- but only
// as an interaction. What has flowed says nothing about a pick in pack 1 and
// quite a lot by pack 3, so the main effect is dead weight beside it.
export const POLICY_FEATURES = [
  // Raw power, centred on the format's rough midpoint so the coefficient is
  // "how much a point of win rate is worth" rather than an offset.
  "value",
  // How much of what I have already taken is in this card's colour. The lane.
  "laneFit",
  // Humans take rares beyond what their win rate justifies. Measured rather
  // than asserted: had it not been true the fit would have returned ~0.
  "rare",
  // The two interactions, and between them the finding. A lane is worth more
  // late; a signal is worth NOTHING until late and then a great deal.
  "laneFitLate",
  "opennessLate",
] as const;

export type PolicyWeights = readonly number[];

/**
 * The fitted weights, indexed by POLICY_FEATURES above.
 *
 * PROVISIONAL -- fitted on fdn alone while the 18-set run finishes. Replaced
 * before this lands.
 */
export const FITTED_POLICIES: Record<"table" | "sharks", PolicyWeights> = {
  table: [28.198, 2.0497, 0.9601, 7.5473, -13.0344],
  sharks: [28.198, 2.0497, 0.9601, 7.5473, -13.0344],
};

/** How far into the draft this pick is, in [0, 1]. */
export function draftProgress(pickIndex: number, totalPicks: number): number {
  if (totalPicks <= 1) return 0;
  return Math.min(1, Math.max(0, pickIndex / (totalPicks - 1)));
}

const RARE_SLOTS = new Set(["rare", "mythic"]);

/**
 * The feature row for one candidate card.
 *
 * Written into a caller-supplied array so scoring a pack does not allocate 14
 * of these per pick per bot -- 7 bots x 42 picks x 14 cards is 4,116 rows a
 * draft, and a draft replays inside a Convex query.
 */
export function policyFeatures(
  card: EngineCard,
  memory: BotMemory,
  progress: number,
  out: number[] = new Array(POLICY_FEATURES.length),
): number[] {
  const laneFit = memory.laneFit(card);

  out[0] = cardValue(card) - 0.5;
  out[1] = laneFit;
  out[2] = card.slot !== undefined && RARE_SLOTS.has(card.slot) ? 1 : 0;
  out[3] = laneFit * progress;
  out[4] = memory.openness(card) * progress;
  return out;
}

/**
 * A fingerprint of the fitted policies, and the guard on the one rule that
 * makes pods safe.
 *
 * A policy name is frozen the moment a session stores it: bots decide what
 * wheels, so editing `table`'s weights re-deals every draft that recorded
 * `table` and strands the lot -- silently, because nothing else would notice.
 * `VALUE_FINGERPRINT` exists for exactly this reason one layer down, and this is
 * the same idea for the bots.
 *
 * DELIBERATELY NOT FOLDED INTO POOL_REVISION, which its sibling is. That
 * revision forces a re-ingest, and it should: it stamps what the stored CARD
 * data looks like. A new pod changes no card and no pool, so a re-ingest would
 * be work for nothing -- and worse, it would move every set's `sourceHash` and
 * badge every existing draft as stale when not one of them has moved.
 *
 * Its job is a test that goes red, not a migration.
 *
 * Feature NAMES are hashed as well as weights, because the weights are a
 * positional array: reordering POLICY_FEATURES without touching a number would
 * silently repoint every coefficient at a different feature.
 */
export const BOT_FINGERPRINT = ((): string => {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  eat(POLICY_FEATURES.join(","));
  for (const name of Object.keys(FITTED_POLICIES).sort()) {
    eat(name);
    for (const w of FITTED_POLICIES[name as keyof typeof FITTED_POLICIES]) eat(w.toFixed(6));
  }
  return h.toString(36);
})();

const SCRATCH: number[] = new Array(POLICY_FEATURES.length);

/** The fitted score for one card: the dot product, and nothing else. */
export function policyScore(
  card: EngineCard,
  memory: BotMemory,
  progress: number,
  weights: PolicyWeights,
): number {
  const f = policyFeatures(card, memory, progress, SCRATCH);
  let s = 0;
  for (let i = 0; i < weights.length; i++) s += weights[i] * f[i];
  return s;
}

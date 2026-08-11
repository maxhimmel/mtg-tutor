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
export const POLICY_FEATURES = [
  // Raw power, centred on the format's rough midpoint so the coefficient is
  // "how much a point of win rate is worth" rather than an offset.
  "value",
  // How much of what I have already taken is in this card's colour. The lane.
  "laneFit",
  // How much of what I have SEEN is in this card's colour -- the signal, and the
  // one thing no bot in this app has ever been able to read.
  "openness",
  // Artifacts and lands go in any deck, which neither share above can express:
  // a colourless card scores 0 on both, identically to a card in a colour I have
  // wholly ignored, and those are not the same situation.
  "colorless",
  // Humans take rares more than their win rate justifies. Measured rather than
  // asserted -- if that is not true the fit returns ~0 here and says so.
  "rare",
  // The two interactions. A lane matters more late and a signal matters more
  // early, which is a claim about drafting that this is the chance to check.
  "laneFitLate",
  "opennessLate",
] as const;

export type PolicyWeights = readonly number[];

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
  const openness = memory.openness(card);

  out[0] = cardValue(card) - 0.5;
  out[1] = laneFit;
  out[2] = openness;
  out[3] = card.colors.length === 0 ? 1 : 0;
  out[4] = card.slot !== undefined && RARE_SLOTS.has(card.slot) ? 1 : 0;
  out[5] = laneFit * progress;
  out[6] = openness * progress;
  return out;
}

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

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
// SIX, AND TWO OTHERS WERE MEASURED OUT RATHER THAN LEFT OUT
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
  // The same power again, scaled by how much pack is left. This is the term
  // that makes the pod pick up bombs, and it was arrived at by eliminating two
  // wrong answers first.
  //
  // The first fit passed rares and mythics at P1P1 roughly half as often as
  // humans (34% against 61% on SOS, and alike on every set checked) while its
  // aggregate top-1 said nothing was wrong. Sampling from the model found bombs
  // far LESS often than its own argmax did (80.6%), so the ranking was right and
  // the confidence was not.
  //
  // A per-pack z-score was tried and is not it: within a pack a z-score is just
  // `value / sd`, so it competes with `value` for the same job, and the fit gave
  // it a weight of 0.11 and an ablation cost of -0.02pp. Scale was not the
  // problem.
  //
  // Fitting a sharpness multiplier per stage of the draft found what is:
  //
  //   P1 early 1.25   P1 mid 1.0    P1 late 0.5
  //   P2 early 1.25   P2 mid 1.0    P2 late 0.5
  //   P3 early 1.0    P3 mid 0.75   P3 late 0.5
  //
  // Confidence should be high on a full pack and low on the dregs, and it RESETS
  // every pack. `progress` climbs monotonically across all 42 picks and cannot
  // express that shape at any weight, so the fit settled for one global level --
  // too flat at P1P1, too sharp on the last few cards. Pack size is the variable,
  // and a bot is holding it.
  "valueOpen",
  // How much of what I have already taken is in this card's colour. The lane.
  "laneFit",
  // Humans take rares beyond what their win rate justifies. Measured rather
  // than asserted: had it not been true the fit would have returned ~0.
  "rare",
  // And they do it FROM A FULL PACK. Rarity is a first-pick phenomenon: nobody
  // is rare-drafting the twelfth card of a pack.
  //
  // Found by separating two questions the bomb count had been running together.
  // At P1P1 the model matches humans on taking the highest-VALUE card (38.4%
  // against 43.3%, right shape across every gap bucket) and misses badly on
  // taking the rare or mythic (39.8% against 60.2%). Those differ because a
  // rare is often NOT the best card in the pack and humans take it anyway --
  // which is the whole content of `rare`, held at one flat weight the fit could
  // only set by averaging a first pick together with a twelfth.
  "rareOpen",
  // The two interactions, and between them the finding. A lane is worth more
  // late; a signal is worth NOTHING until late and then a great deal.
  "laneFitLate",
  "opennessLate",
] as const;

export type PolicyWeights = readonly number[];

/**
 * The fitted weights, indexed by POLICY_FEATURES above.
 *
 * FROZEN. A name here is settled the moment a session stores it -- see
 * `PodPolicy` in bots.ts. Re-fitting one of these in place re-deals every draft
 * that recorded it. Add a name instead; `BOT_FINGERPRINT` below goes red either
 * way, which is what it is for.
 *
 * Produced by `pnpm fit-bot-policy`, pooled across all 18 committed sets. Both
 * are conditional logits over the pack, fitted to which card the human took.
 *
 *   table    all drafters
 *            283,777 train / 174,540 held-out picks from 11,862 drafts
 *            top-1 48.2% train, 48.2% held out
 *
 *   sharks   drafters who went 3-0 (event_match_wins == 3)
 *            437,408 train / 223,026 held-out picks from 17,037 drafts
 *            top-1 50.0% train, 49.9% held out
 *
 * WHAT IS STILL WRONG WITH THESE, MEASURED
 *
 * Sampled, they take the rare or mythic at P1P1 45.0% of the time on SOS where
 * humans take it 60.2%. The two interactions above moved that from 34.4%, which
 * put it back level with the old bot's 46.1% -- so the regression is gone and a
 * gap the app has always had is not. Closing it needs something a linear model
 * in these six features does not have; three fits made no further progress on
 * it. `bench-bots` prints the number so it stays honest.
 *
 * Train and held-out agree to a tenth of a point in both, which is what says
 * five parameters are not memorising 280k decisions.
 *
 * WHAT THE TWO DISAGREE ABOUT, WHICH IS ALMOST NOTHING
 *
 * Only `valueOpen` really moves: 43.05 to 47.93. Strong drafters differ from the
 * field by caring MORE about raw card quality on a full pack, not by reading
 * signals differently -- every other coefficient matches to two significant
 * figures. They are also more predictable than the field (49.9% against 48.2%),
 * which is the same fact from the other side.
 *
 * `value` and `rare` both ablate to ~0 beside their interactions and are kept
 * anyway: each is the main effect of an interaction that is present, and pack
 * size never reaches zero in play, so each pair is nearly collinear rather than
 * one of them being dead. Note `rare` alone is NEGATIVE -- rarity is worth
 * something out of a full pack and slightly less than nothing out of the dregs,
 * which is the shape the flat term could not take.
 *
 * `opennessLate` is large and negative, and that is not "humans avoid open
 * colours". It is the only route openness has into the score, so it carries the
 * whole shape of a term that is worth nothing early and a great deal late; the
 * ablation prices it at +1.47pp, the second most valuable feature here.
 */
export const FITTED_POLICIES: Record<"table" | "sharks", PolicyWeights> = {
  table: [3.7889, 43.0546, 1.8065, -0.3002, 1.5222, 7.9243, -16.2986],
  sharks: [3.7963, 47.934, 1.8479, -0.3142, 1.4838, 7.8993, -16.4302],
};

/** How far into the draft this pick is, in [0, 1]. */
export function draftProgress(pickIndex: number, totalPicks: number): number {
  if (totalPicks <= 1) return 0;
  return Math.min(1, Math.max(0, pickIndex / (totalPicks - 1)));
}

const RARE_SLOTS = new Set(["rare", "mythic"]);

/**
 * How much choice is left in the pack, in [0, 1].
 *
 * Normalised by the largest booster anyone deals rather than by this pack's own
 * opening size, so the number means the same thing in a 13-card set and a
 * 15-card one -- eight cards left is eight cards left.
 */
const MAX_PACK = 15;
export const packOpenness = (packSize: number) =>
  Math.min(1, Math.max(0, packSize / MAX_PACK));

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
  packSize: number,
  out: number[] = new Array(POLICY_FEATURES.length),
): number[] {
  const laneFit = memory.laneFit(card);
  const value = cardValue(card) - 0.5;

  out[0] = value;
  out[1] = value * packOpenness(packSize);
  out[2] = laneFit;
  const rare = card.slot !== undefined && RARE_SLOTS.has(card.slot) ? 1 : 0;

  out[3] = rare;
  out[4] = rare * packOpenness(packSize);
  out[5] = laneFit * progress;
  out[6] = memory.openness(card) * progress;
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
  packSize: number,
): number {
  const f = policyFeatures(card, memory, progress, packSize, SCRATCH);
  let s = 0;
  for (let i = 0; i < weights.length; i++) s += weights[i] * f[i];
  return s;
}

import type { EngineCard } from "../model/card.js";
import { cardValue } from "../scoring/value.js";
import type { BotMemory, PodPolicy } from "./bots.js";

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
//
// AND NOTHING ABOUT THE DECK, WHICH WAS MEASURED RATHER THAN OVERLOOKED
//
// `turn` and `role` have been on `EngineCard` since the principles work, so a
// bot can read a mana value and a role at pick time and two obvious features
// come for free: a `cheapness` that says drafters favour the cheap end, and a
// `creatureNeed` that says they take a body when their deck is short of bodies.
// Neither is here. `fit-bot-policy --shape` fitted a free indicator per bucket
// instead of asserting a formula, over fdn+dsk, 75,646 train / 36,145 held-out:
//
//   the seven below                        52.52%
//   + one indicator per curve turn + land  53.0%    (+0.45pp, and see below)
//   + every `deckNeeds` need, paired with
//     its own main effect                  52.8%
//
// THE DECK IS INVISIBLE. All four need interactions came back at zero, two of
// them with the wrong sign -- `bodyShort` -0.015, `removalShort` -0.026,
// `cheapShort` +0.035, `topFull` +0.110 -- while their main effects are alive,
// `removal` at +0.319 the largest. Drafters have standing preferences about what
// a card DOES and do not visibly count what they are holding. Since `deckNeeds`
// is imported here rather than restated, that is a finding about the exact rule
// the pick scorer grades a person against, not about a paraphrase of it. It does
// not make the tiebreak wrong -- that one is normative and fires only where the
// win rates have already run out -- but it is the third time now that a
// principle has described a good drafter without predicting a real one.
//
// AND `cheapness` DOES NOT EXIST; THE OBVIOUS EVIDENCE FOR IT WAS LANDS. The
// first curve probe found exactly the gradient the feature wanted -- turn1
// +0.155, turn2 +0.083, turn3 +0.032, turn4 -0.302 -- and it was an artifact.
// `curveTurn` floors at one, so every land is a `turn` of 1, and lands are 40%
// of the turn-1 cards on both sets. Given a column of their own, turns 1, 2 and
// 3 fit to +0.013, +0.050 and -0.007: indistinguishable from each other and from
// nothing. Every other reader of this field drops lands first -- `manaCurve`,
// `deckNeeds`, `fitOf` all do -- and a feature that had not would have fitted
// cleanly, ablated positive and measured nothing about the curve.
//
// What is left of that +0.45pp is one contrast and not a curve: a four-drop is
// taken LESS than its win rate says, at -0.34 against the rest. `land` alone is
// worth +0.00pp, `turn4` alone carries nearly all of it. Not shipped, because it
// was chosen by looking at the held-out set and has not been confirmed anywhere
// else -- and because a new feature means a new pod name, which is a thing a
// person has to pick between, for four tenths of a point.
// TWO CANDIDATES WERE CONFIRMED ON SETS NOBODY HAD LOOKED AT. ONE SURVIVED.
//
// `--shape` over fdn+dsk turned up two effects unasked for -- a four-drop taken
// LESS than its win rate says (-0.34, carrying nearly the whole curve-bank gain)
// and `removal` as the largest role main effect (+0.319). Neither shipped at the
// time, for a stated reason: both had been chosen by looking at the held-out set
// and confirmed nowhere else.
//
// Confirming them elsewhere killed one and promoted the other. Refitted with the
// corrected colours (revisions 13 and 14) and ablated one at a time, held-out
// top-1:
//
//                     fdn+dsk    woe+blb    four sets    ALL EIGHTEEN
//   turnFour           +0.40pp    -0.10pp     +0.10pp      not fitted
//   removal             0.00pp    +0.60pp     +0.20pp        +0.10pp
//
// Mirror images, and the mirror is the finding. `turnFour` carries everything on
// the two sets it was found on and less than nothing on two it was not; its
// pooled positive is those sets showing through a mean, which is the shape of an
// overfit rather than of a small effect. `removal` is worth nothing beside
// `turnFour` on fdn+dsk and six tenths of a point where nobody had looked.
//
// THE GENERAL FORM, which is why this sits here rather than in a commit: a
// feature discovered on a held-out set has been SELECTED on that set, so its
// held-out number is a training number wearing the wrong label. The only test it
// has not already passed is a set nobody looked at. Trap #8 is the same
// confusion about a different quantity.
//
// AND THEN THE POOLED FIT SHRANK IT. Over all eighteen sets -- 571,996 train /
// 284,334 held-out, the way `table` itself is fitted -- `removal` is worth
// +0.10pp, against +0.60pp on the two sets it was confirmed on. Its coefficient
// is stable everywhere (+0.26, +0.52, +0.36) and the log-likelihood improves
// consistently (1.3456 -> 1.3416), so this is a REAL effect and a small one,
// which is a different verdict from `turnFour` above: that one changed sign.
//
// It is not here because +0.10pp does not clear the bar this file has set. The
// features that were measured out -- `openness`, `colorless`, `signal` -- went
// at -0.02, -0.04 and -0.04pp, and the ones that stayed are worth +0.45pp to
// +1.47pp. A tenth of a point buys a pod name frozen forever, seven
// registration points across four packages, and a second weight vector every
// future reader has to understand. That is a lot of permanent structure for an
// effect you could not see in a draft.
//
// THE SHAPE TO NOTICE, because it is the one that fooled `turnFour`: an effect
// measured on two sets and then on eighteen went 0.60 -> 0.20 -> 0.10. Breadth
// shrinks an estimate that was concentrated. Neither number is wrong; the wide
// one is the one that answers "what will this be worth on the next set", which
// is the only question a shipped policy is asked.
//
// The colour fix is priced in the same run, on the identical fdn+dsk split the
// probe used: 52.52% -> 52.8% held-out on the same seven features, which is what
// four hundred and ninety-nine cards getting their colours back is worth to
// predicting a human.
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
  //
  // A LINEAR RAMP, AND THE PRINCIPLES SAY IT SHOULD BE A STEP. THE RAMP WINS.
  //
  // `laneFit * progress` climbs evenly from nothing at P1P1 to everything at the
  // last pick, and the corpus describes something else entirely: SIG-01 and
  // SIG-02 say the first few picks are expendable and to commit around pick
  // five, SIG-11 that the plan is settled by the middle of pack 2, SIG-12 that
  // pack 2 is where you stop switching. That is a step onto a plateau, and it is
  // a different claim from a line that is still rising at pick 42.
  //
  // `--shape lane` replaced both lane terms with nine free stage weights and let
  // the data choose. It chose the ramp:
  //
  //          P1early  P1mid  P1late  P2early  P2mid  P2late  P3early  P3mid  P3late
  //   free      2.12   3.43    4.04     5.73   5.94    6.52     7.42   7.54    8.69
  //   shipped   2.39   3.30    4.12     4.94   5.84    6.65     7.47   8.38    9.19
  //
  // Monotone across all nine, no plateau, still climbing at the end, and within
  // 0.27 of the shipped line at six of the nine stages. Held-out top-1 is 52.5%
  // either way: nine free parameters buy nothing over two. The one visible
  // deviation is a +0.80 bump at P2early, which is where SIG-11 points -- but a
  // bump is not a plateau, and pack 3 goes on climbing straight past it.
  //
  // So the refit this was queued for does not happen. Note what the probe DID
  // establish: the axis is right. That is the failure `valueOpen` had, where
  // confidence resets every pack and `progress` cannot express it at any weight
  // -- commitment really does accumulate monotonically across a draft, so the
  // one interaction term can carry it.
  "laneFitLate",
  "opennessLate",
  // What a card DOES, and the only one of the four roles that earned a column.
  // Drafters have standing preferences about the job a card does and do not
  // visibly count what they are holding -- every `deckNeeds` interaction fitted
  // to zero while this main effect did not. See the block above this list for
  // what it is worth and what it cost to be sure of that.
  "removal",
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
 *
 * AND THE FEATURE THE PRINCIPLES ARGUE FOR INSTEAD, WHICH IS WORSE
 *
 * That reading has a competitor. `openness` correlates with `laneFit` at about
 * +0.44 -- stable across fdn and dsk at both checkpoints, measured by
 * `scripts/diagnose-openness.mjs` -- because a drafter takes out of what they
 * are shown, so a large negative coefficient could be a redundancy correction
 * rather than an opinion about signals.
 *
 * The draft principles define a signal more narrowly than `openness` does, and
 * all three of them point the same way: SIG-03 says a signal is a card somebody
 * PASSED you, SIG-04 that you read it off what is ABSENT, SIG-05 that the
 * informative event is a good card arriving LATE. `openness` counts the
 * drafter's own picks, weights a card out of a fresh pack exactly like one
 * wheeling back at six, and reports an abundance rather than a surprise.
 *
 * A feature built to the narrower spec -- passed cards only, weighted by the
 * complement of `packOpenness`, minus the drafter's own unweighted passed share
 * so the set's composition divides out -- was implemented and fitted over
 * fdn+dsk, 75,646 train / 36,145 held-out picks:
 *
 *   these seven features                     52.5% held-out top-1
 *   + signal + signalLate                    52.5%  (-0.04pp and +0.00pp ablated)
 *   signal and signalLate in openness' place 51.4%  -1.1pp
 *
 * It earns nothing beside `openness` and is a full point worse in its place, so
 * it is not here. Worth writing down because the argument for it is a good one
 * and will occur to somebody again: being closer to how a strong drafter
 * DESCRIBES signal-reading did not make it a better predictor of what drafters
 * DO. The script's header carries the rest.
 */
export const FITTED_POLICIES: Record<"table" | "sharks" | "table2" | "sharks2", PolicyWeights> = {
  table: [3.7889, 43.0546, 1.8065, -0.3002, 1.5222, 7.9243, -16.2986],
  sharks: [3.7963, 47.934, 1.8479, -0.3142, 1.4838, 7.8993, -16.4302],

  // THE SEVEN-LONG VECTORS ABOVE ARE NOT STALE, THEY ARE FROZEN. `policyScore`
  // iterates the WEIGHTS, not the feature row, so each of them ignores the
  // eighth column entirely and deals exactly what it always dealt. That is what
  // makes adding a feature additive rather than destructive, and it is why these
  // two are still here rather than being edited in place.
  //
  // Refitted over all eighteen sets with the colours corrected (POOL_REVISION 13
  // and 14) and with `removal` added:
  //
  //   table2    all drafters      571,996 train / 284,334 held-out
  //             49.3% held out, against 49.2% without `removal`
  //   sharks2   3-0 drafters      109,420 train /  55,475 held-out
  //             50.8% held out
  //
  // `removal` fits to +0.3557 for the field and +0.3564 for the sharks, which is
  // the same number twice: whatever separates a strong drafter from the field,
  // it is not how much they want removal. `valueOpen` remains the only
  // coefficient that really moves between the tiers (43.6 against 48.0).
  table2: [3.3236, 43.6123, 1.9992, -0.3877, 1.6652, 7.0121, -13.6627, 0.3557],
  sharks2: [3.3956, 48.0251, 2.0645, -0.1621, 1.3524, 6.9176, -13.9007, 0.3564],
};

/**
 * How sharply each pod samples from its own scores. Frozen with the name.
 *
 * A pod's logits go through `softmax(score / temperature)`, so 1 samples exactly
 * the fitted distribution and lower values sharpen toward its argmax. Every pod
 * shipped before `bench-packs` existed samples at 1, and has to keep doing so
 * forever: a stored session replays against its pod, and a sharper table takes
 * different cards, which changes what wheels back to the human.
 *
 * See the header of `gumbel` in bots.ts for why 1 is the wrong value and
 * `bench-packs.mjs` for the measurement that says what the right one is.
 */
export const POD_TEMPERATURE: Record<PodPolicy, number> = {
  legacy: 1,
  table: 1,
  sharks: 1,
  table2: 1,
  sharks2: 1,
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
  out[7] = card.role === "removal" ? 1 : 0;
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

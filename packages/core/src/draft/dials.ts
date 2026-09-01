import {
  FITTED_POLICIES,
  POLICY_FEATURES,
  draftProgress,
  policyFeatures,
  type PolicyCard,
  type PolicyWeights,
} from "./policy.js";
import { BotMemory, type StoredPod } from "./bots.js";

// What ONE drafter does differently from the table, in as few numbers as the
// data can carry.
//
// WHY NOT JUST REFIT `POLICY_FEATURES` PER PLAYER
//
// Because it would be noise wearing a coefficient's clothes. `fit-bot-policy`
// fits ten weights over 571,996 picks; a person arrives with ~42 a draft. And
// the ten columns are collinear by construction -- `value` is -1.5932 while
// `valueOpen` is 17.1665, and neither number means anything without the other,
// because they are the same quantity asked twice at different pack sizes. Fit
// that pair free on forty-two decisions and the two weights trade places
// between drafts while their sum barely moves. Every reading off them would be
// real-looking and wrong, which is the failure mode `policy.ts` spends its
// length avoiding one layer down.
//
// SO THE RATIOS INSIDE A BUNDLE ARE FROZEN AND ONLY ITS OVERALL WEIGHT MOVES
//
// A bundle is a group of columns that say ONE thing about a drafter. `laneFit`
// and `laneFitLate` are both "how much does committing to a colour matter",
// differing only in when; the fit over half a million picks already settled how
// those two trade off, and a person's forty-two picks have nothing to add to
// that. What a person's picks CAN say is whether the pair, as a pair, matters
// more or less to them than it does to the field.
//
// So the model is the shipped policy with one multiplier per bundle:
//
//   u(card) = SUM over bundles b of  theta_b * (w_b . f)
//
// where `w` is a shipped pod's weights and `f` is `policyFeatures`. At
// theta = 1 this IS that pod, exactly -- see `dialledScore`'s test. That
// identity is the whole reason this file imports the weights rather than
// restating them: a drafter is measured as a deviation from a policy the app
// actually deals with, not from a paraphrase of one.
//
// It is also just a conditional logit again, on `bundles.length` columns instead
// of ten, so the arithmetic downstream is the same arithmetic `fit-bot-policy`
// already runs -- with the null at one rather than at zero.
//
// WHAT A BUNDLE IS NOT
//
// It is not a claim that a drafter thinks in these six categories. It is a claim
// about what forty-two picks can separate, which is a much weaker and much more
// checkable thing -- and `bundleSpread` below is how it gets checked rather than
// asserted.
//
// THE NAMES HERE ARE CODE NAMES. Nothing in this file is cleared to appear on a
// screen: "dial" is not a word this game uses, and what a player is shown has to
// come out of `docs/vernacular.yaml` instead.

/**
 * The bundles, and the columns each one owns.
 *
 * A PARTITION, ENFORCED BELOW, WHICH IS THE POINT OF THE THROW AT THE BOTTOM.
 *
 * Every column of `POLICY_FEATURES` belongs to exactly one bundle. If a feature
 * were left out, `dialledScore` at theta = 1 would quietly stop equalling the
 * pod it is built from -- the drafter would be measured against a policy that
 * ignores a column the bots read -- and nothing downstream could tell. A new
 * feature in `policy.ts` therefore has to be placed here, and until it is, this
 * module refuses to load.
 */
export const DIAL_BUNDLES = [
  {
    id: "power",
    // What wins. Both columns are `cardValue` centred, differing only in how
    // full the pack is -- see `valueOpen` in policy.ts for why that interaction
    // exists and why a per-pack z-score is not it.
    features: ["value", "valueOpen"],
  },
  {
    id: "table",
    // What a real table pays, which is a different question from what wins and
    // is the reason `tableValue.ts` exists at all.
    features: ["tableValue", "tableValueOpen"],
  },
  {
    id: "lane",
    // Committing to a colour, and the ramp that says it matters more as the
    // draft goes on. The `--shape lane` probe settled the ramp; a person's
    // picks are not being asked to re-litigate it.
    features: ["laneFit", "laneFitLate"],
  },
  {
    id: "signal",
    // Reading what has flowed. One column, because `openness` earns nothing as
    // a main effect and lives entirely in its interaction with progress.
    features: ["opennessLate"],
  },
  {
    id: "rare",
    features: ["rare", "rareOpen"],
  },
  {
    id: "removal",
    features: ["removal"],
  },
] as const;

export type DialId = (typeof DIAL_BUNDLES)[number]["id"];

export const DIAL_IDS: readonly DialId[] = DIAL_BUNDLES.map((b) => b.id);

/** Which columns of a `policyFeatures` row each bundle reads. */
export const BUNDLE_COLUMNS: readonly (readonly number[])[] = DIAL_BUNDLES.map((bundle) =>
  bundle.features.map((name) => {
    const at = POLICY_FEATURES.indexOf(name);
    if (at === -1) throw new Error(`dial bundle "${bundle.id}" names no such feature: ${name}`);
    return at;
  }),
);

{
  const owned = new Map<number, string>();
  for (let b = 0; b < DIAL_BUNDLES.length; b++) {
    for (const column of BUNDLE_COLUMNS[b]) {
      const already = owned.get(column);
      if (already !== undefined) {
        throw new Error(
          `${POLICY_FEATURES[column]} is in two dial bundles, "${already}" and ` +
            `"${DIAL_BUNDLES[b].id}". A column in two bundles is counted twice at theta = 1, ` +
            `so the model would not be the policy it claims to be a deviation from.`,
        );
      }
      owned.set(column, DIAL_BUNDLES[b].id);
    }
  }
  const missing = POLICY_FEATURES.filter((_, k) => !owned.has(k));
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} belong${missing.length === 1 ? "s" : ""} to no dial bundle. ` +
        `Every policy feature must be placed in exactly one, or a drafter is fitted against ` +
        `a policy that ignores a column the bots read -- silently. Add it to DIAL_BUNDLES.`,
    );
  }
}

/**
 * The bundle scores for one candidate: `w_b . f`, one number per bundle.
 *
 * Written into a caller-supplied array for the same reason `policyFeatures` is:
 * a draft is ~600 candidates and a recovery run is tens of thousands of drafts.
 */
export function bundleScores(
  features: readonly number[],
  weights: PolicyWeights,
  out: number[] = new Array(DIAL_BUNDLES.length),
): number[] {
  for (let b = 0; b < BUNDLE_COLUMNS.length; b++) {
    let s = 0;
    for (const k of BUNDLE_COLUMNS[b]) s += (weights[k] ?? 0) * features[k];
    out[b] = s;
  }
  return out;
}

/**
 * The dialled utility of one candidate. At `theta` all ones this is exactly the
 * pod's own `policyScore`, which is the identity the whole file rests on.
 */
export function dialledScore(bundles: readonly number[], theta: readonly number[]): number {
  let u = 0;
  for (let b = 0; b < bundles.length; b++) u += theta[b] * bundles[b];
  return u;
}

/** A drafter who picks exactly like the pod they are being compared against. */
export const NEUTRAL_DIALS: readonly number[] = DIAL_BUNDLES.map(() => 1);

/**
 * The same drafter written as a weight vector, which is what makes them dealable.
 *
 * A dial multiplies every column in its bundle, so
 *
 *   SUM_b theta_b * (w_b . f)  =  (theta scaled w) . f
 *
 * and a dialled drafter is therefore an ordinary policy with different numbers
 * in it -- not a new kind of thing the engine would need to learn about. Which
 * is what lets a harness DEAL one: `policyScore` takes the weights, so a
 * simulated drafter with chosen dials is generated by the app's own scorer
 * rather than by a copy of it written to test it. Measurement trap #5 is that
 * copy, and this is how it is avoided rather than remembered.
 */
export function dialledWeights(
  theta: readonly number[],
  weights: PolicyWeights,
): PolicyWeights {
  const out = [...weights];
  for (let b = 0; b < BUNDLE_COLUMNS.length; b++) {
    for (const k of BUNDLE_COLUMNS[b]) {
      if (k < out.length) out[k] = weights[k] * theta[b];
    }
  }
  return out;
}

/**
 * Which bundles a pod's weights can express an opinion with at all.
 *
 * A DIAL ON A BUNDLE THAT DOES NOT MOVE A PACK IS NOT A WEAK MEASUREMENT, IT IS
 * NO MEASUREMENT.
 *
 * `table3` prices `removal` at 0.0515. Multiply that by two and every card in
 * the pack moves by about a twentieth of nothing, so the likelihood is flat
 * along that dial and its fitted value is whatever the noise says. That reads
 * identically to "this player is average on removal", which is the confusion
 * worth refusing outright.
 *
 * A conditional logit only ever sees DIFFERENCES within a pack -- adding a
 * constant to every candidate changes no probability -- so the quantity that
 * decides whether a bundle can be dialled is its spread across the cards on
 * offer, not its level. This returns exactly that: the mean, over packs, of the
 * standard deviation of each bundle score WITHIN a pack, in logit units.
 *
 * Which is directly comparable across bundles, because every one of them is
 * already multiplied by its own fitted weight -- these are contributions to one
 * score, not features in six different units.
 */
export function bundleSpread(packs: readonly (readonly number[])[][]): number[] {
  // Sized from the rows rather than from DIAL_BUNDLES, so a caller handing this
  // something the wrong width gets a short answer instead of one padded with
  // zeros -- and a zero here reads as "this bundle cannot be dialled", which is
  // the one conclusion that must never arrive by accident.
  const width = packs.find((p) => p.length > 0)?.[0].length ?? 0;
  const totals = new Array(width).fill(0);
  let counted = 0;

  for (const pack of packs) {
    if (pack.length < 2) continue;
    counted++;
    for (let b = 0; b < width; b++) {
      let sum = 0;
      let sumSq = 0;
      for (const card of pack) {
        sum += card[b];
        sumSq += card[b] * card[b];
      }
      const mean = sum / pack.length;
      totals[b] += Math.sqrt(Math.max(0, sumSq / pack.length - mean * mean));
    }
  }

  return counted === 0 ? totals : totals.map((t) => t / counted);
}

/**
 * Where each set's own drafters sit, relative to the pod.
 *
 * WHY A SET NEEDS A ZERO OF ITS OWN
 *
 * `table3` is one policy fitted across eighteen sets, and no single set is that
 * compromise. Pool the real 17Lands drafters of each and their dials come back
 * nowhere near 1: `power` at 0.28 in ktk against 1.33 in woe, `table` at 0.72 in
 * mh3 against 1.35 in ktk. Across sets those offsets have a spread of 0.28,
 * 0.14, 0.07 and 0.11 on the four live dials -- against a between-drafter tau of
 * 0.229. So a player measured against the pod is being told about the set they
 * drafted at up to the size of what is being read about them.
 *
 * And it does not average out of a real history. `fit-set-baselines` builds
 * players out of real drafters who are average for their set by construction,
 * holds the baselines out of them, and asks how often they are called different
 * anyway. Somebody with twenty drafts in ONE format -- which is what this app's
 * players do, and why `RecentSets` exists -- is called on `power` 9% of the
 * time, `table` 14%, `lane` 15% and `signal` 16%, against an honest 5%.
 * Corrected, 4%, 3%, 3% and 9%. Across twenty drafts in DIFFERENT sets the
 * offsets partly cancel and the gain is small, which is the shape it should
 * have and is not the case anybody is in.
 *
 * FITTED, NOT FROZEN, WHICH IS THE OPPOSITE OF A POD NAME
 *
 * `FITTED_POLICIES` is frozen because a stored session replays against its pod
 * and re-fitting one re-deals every draft that recorded it. Nothing here is dealt
 * from. These are read when a drafter is MEASURED, so refitting them re-reads
 * existing drafts rather than stranding them -- a player's dials would move,
 * which is a thing to tell them about and not a thing to prevent.
 *
 * Produced by `pnpm fit-set-baselines --emit`, over every cached drafter of each
 * set. The held-out halves in the same script are what established the method;
 * these use all of them.
 */
export const DIAL_BASELINES: Record<string, readonly number[]> = {
  blb: [1.4641, 0.8825, 1.0076, 0.9715, -0.1377, 3.5995],
  dft: [0.8748, 1.0815, 0.9970, 1.0346, 1.6274, 0.3980],
  dmu: [1.2879, 1.0296, 0.9540, 0.8654, 1.0865, 1.1827],
  dsk: [0.8088, 1.0781, 1.0119, 1.1213, 1.1791, 1.9907],
  ecl: [0.5935, 0.9223, 0.9452, 1.0475, 1.8986, 1.7993],
  eoe: [0.6396, 1.1040, 1.0559, 1.1183, 0.9532, 1.7862],
  fdn: [1.2030, 0.8899, 1.0403, 1.0352, -0.2252, 4.2932],
  ktk: [0.2963, 1.3499, 0.8578, 0.7561, 2.1872, 0.6708],
  lci: [1.0788, 1.0064, 1.1131, 1.1306, 1.5963, 0.2692],
  mh3: [0.9276, 0.7195, 0.8934, 0.7720, -0.1821, 3.3756],
  mkm: [0.7908, 1.1487, 0.9615, 0.9328, 1.5724, -1.8925],
  mom: [0.8917, 0.9770, 1.0130, 1.0219, 1.1867, 0.7438],
  neo: [0.8991, 1.1337, 1.1102, 1.1137, 1.6836, 0.7414],
  otj: [0.7554, 1.0544, 0.9867, 1.0062, 1.2831, -1.1220],
  snc: [0.8104, 1.0838, 0.9707, 1.0149, 1.6666, -1.1896],
  sos: [0.9413, 0.8957, 0.9820, 1.0214, 0.4060, 0.5504],
  tdm: [1.0993, 1.1075, 0.8740, 0.8978, 3.0013, 1.4230],
  woe: [1.3251, 0.8990, 1.0400, 1.0152, -0.4679, 2.3069],
};

/**
 * A set's zero, or nothing if nobody has measured it.
 *
 * UNDEFINED RATHER THAN A FALLBACK TO `NEUTRAL_DIALS`, on purpose. A set with no
 * baseline is not a set that sits at the pod -- it is a set whose offset is
 * unknown and, on the evidence above, probably large. Handing back ones would
 * make "we have not measured this format" indistinguishable from "this format is
 * unremarkable", and the caller would never learn which it had.
 *
 * That matters most exactly where this app is most useful. A brand-new set has
 * no 17Lands data at all, so it has no baseline and cannot have one until the
 * datasets catch up -- and a drafter's readout there is carrying an unknown
 * offset. The caller decides what to do about that; it must not be decided here
 * by a default.
 */
export function setBaseline(setCode: string): readonly number[] | undefined {
  return DIAL_BASELINES[setCode.toLowerCase()];
}

/**
 * The pod whose weights a drafter is measured against, whatever pod dealt.
 *
 * A YARDSTICK IS NOT A PROPERTY OF THE DRAFT
 *
 * The pod decides what wheels, so it decides which cards a player was offered.
 * It does not decide how they chose between them, and the dials are about the
 * choosing. Measuring a `sharks3` draft against `sharks3` and a `table3` draft
 * against `table3` would put one player's history on two rulers -- and the two
 * tiers differ on `valueOpen`, so the same picks would read differently
 * depending on which table the person happened to pick from a menu.
 *
 * So every draft is measured against this one, and the pod that dealt is left
 * where it belongs: in what the packs contained.
 *
 * It is also what `DIAL_BASELINES` was fitted against, and a baseline in one
 * ruler's units applied to a curvature in another's is nonsense that would not
 * look like nonsense.
 */
export const DIAL_YARDSTICK: StoredPod = "table3";

/**
 * A fingerprint of everything a stored curvature's numbers mean.
 *
 * A gradient is in the units of specific bundles times specific weights. Change
 * `POLICY_FEATURES`, regroup `DIAL_BUNDLES`, or refit the yardstick, and every
 * curvature already written is a vector of numbers in units nothing records --
 * still six long, still summing, still producing a confident readout, and
 * measuring something nobody can name. `BOT_FINGERPRINT` exists for the same
 * hazard one layer down and this is the same idea.
 *
 * Stored beside each curvature so a reader can throw out the ones that no longer
 * mean what they say, and SAY how many it threw out. Its job is a number on a
 * screen going down, not a migration.
 */
export const DIAL_FINGERPRINT = ((): string => {
  let h = 0x811c9dc5;
  const eat = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  eat(POLICY_FEATURES.join(","));
  for (const bundle of DIAL_BUNDLES) eat(`${bundle.id}:${bundle.features.join("+")}`);
  eat(DIAL_YARDSTICK);
  for (const w of FITTED_POLICIES[DIAL_YARDSTICK]) eat(w.toFixed(6));
  return h.toString(36);
})();

/** One decision as a draft stores it: what was on offer, and what was taken. */
export interface DraftRow {
  pack: readonly PolicyCard[];
  // Null as well as undefined: the 17Lands cache uses null for a row naming a
  // card the ingested pool does not have, and that must stay "no label" rather
  // than quietly becoming index 0.
  picked: PolicyCard | undefined | null;
}

/** What was on offer, in bundle scores, and which one was taken. */
export interface DialPick {
  bundles: readonly (readonly number[])[];
  chosen: number;
}

/**
 * A draft's rows turned into the observations the fit consumes.
 *
 * ONE COPY, FOR THE REASON `BotMemory` IS ONE COPY.
 *
 * Three callers want this: a harness dealing simulated drafters, a script
 * reading `draftPicks` off a deployment, and eventually a query. The 17Lands fit
 * has its own walk of the same shape in `fit-bot-policy`, which is allowed to be
 * separate because it reads a different row format -- but a second copy of the
 * MEMORY ORDER would not be. `openness` must not see the pack the features were
 * computed against, or the fit learns "take whatever colour this pack is heavy
 * in" and calls it signal-reading; that ordering is a one-line mistake with no
 * symptom, so it lives here and nowhere else.
 *
 * NO DECISION-PICK FLOOR, DELIBERATELY, AND IT IS NOT THE SAME QUESTION
 *
 * `REVIEW.decisionPickMinCards` keeps the dregs out of the review quiz and the
 * misses drill, because taking the last playable off a three-card pack is not a
 * decision somebody should be shown as a miss. This is a different use: the pod
 * these dials are measured against was fitted over every pick with two or more
 * cards on offer, so filtering the drafter's picks and not the population's
 * would move theta by the difference between two samples rather than by
 * anything about the drafter.
 */
export function dialPicksFrom(
  rows: readonly DraftRow[],
  weights: PolicyWeights,
): DialPick[] {
  const memory = new BotMemory();
  const picks: DialPick[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { pack, picked } = rows[i];
    const chosen = picked ? pack.findIndex((c) => c.name === picked.name) : -1;

    if (chosen >= 0 && pack.length >= 2) {
      const progress = draftProgress(i, rows.length);
      picks.push({
        bundles: pack.map((card) =>
          bundleScores(policyFeatures(card, memory, progress, pack.length), weights),
        ),
        chosen,
      });
    }

    memory.see(pack);
    if (picked) memory.take(picked);
  }

  return picks;
}

/**
 * The weights a drafter is measured against, and why they are not a free choice.
 *
 * A player's picks are made out of packs a pod passed them, so the comparison
 * that means anything is against the pod that dealt the draft. Measuring a
 * `table3` draft against `sharks3` would price the drafter and the difference
 * between the two tiers together, and report the sum as the person.
 *
 * NOT called a baseline, though it was for one commit. A set's own zero is a
 * baseline -- see `setBaseline` -- and it is a vector of DIALS, where this is a
 * vector of WEIGHTS. Two things one word apart that live one screen apart is how
 * the wrong one gets passed.
 */
export function podWeights(pod: StoredPod): PolicyWeights {
  return FITTED_POLICIES[pod];
}

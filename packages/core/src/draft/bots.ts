import type { EngineCard } from "../model/card.js";
import { cardValue } from "../scoring/value.js";
import { FITTED_POLICIES, POD_TEMPERATURE, type PolicyWeights, policyScore } from "./policy.js";

// A bot commits to colors as it drafts: it tracks accumulated value per color
// and biases future picks toward its strongest colors, producing readable
// signals (open colors flow downstream) and meaningful wheels.
//
// WHAT A BOT KNOWS, AND WHAT IT DOES NOT
//
// `colorValue` accumulates from the bot's OWN picks only. Nothing a bot sees and
// passes ever reaches it, so the pod emits signals downstream and no seat can
// read one -- see roadmap `human-bots` in notes.md, which is about closing that.
//
// TWO THINGS THAT CANNOT CHANGE WITHOUT STRANDING DRAFTS
//
// Bots pick by `cardValue`, so what a bot takes decides what wheels back to the
// human. A session is {seed, pickedNames} replayed, so any change to the
// arithmetic below re-deals every stored draft and `replayDraft` starts throwing.
// `corpus.test.ts` is the tripwire. See decision #8 in notes.md.
//
// And the RNG DRAW PATTERN is load-bearing beyond the deal: exactly one `rng()`
// per card in hand, unconditionally, with the human drawing none. `forkImpact`
// (draft/diff.ts) is sound only because that makes the stream position invariant
// under a swapped pick. Draw a different number of times -- even "skip the draw
// when noise is zero" -- and fork weights silently stop measuring anything.

/**
 * What a bot has taken, and the colour lane that falls out of it.
 *
 * Split out of `Bot` so a harness can score the policy against real human picks
 * without driving an engine: `bench-bots` reconstructs this from the `pool_*`
 * columns of the 17Lands draft dataset and asks what the shipped bot would have
 * done. Measuring a reimplementation of the policy instead of the policy is
 * measurement trap #5, so there is deliberately only one copy of this arithmetic.
 */
export class BotMemory {
  private colorValue = new Map<string, number>();
  private poolQuality = 0;
  private seenValue = new Map<string, number>();
  private seenQuality = 0;
  readonly pool: EngineCard[] = [];

  take(card: EngineCard): void {
    this.pool.push(card);
    const q = quality(card);
    this.poolQuality += q;
    for (const c of card.colors) this.colorValue.set(c, (this.colorValue.get(c) ?? 0) + q);
  }

  /**
   * A pack this bot looked at, whether or not it took from it.
   *
   * The half of a draft the bots have never had. Call it AFTER scoring the pack
   * and before the next one, so `openness` is a statement about what has already
   * flowed rather than about the choice currently in hand -- a feature that could
   * see the pack it is being asked about would let the fit learn "take the colour
   * this pack happens to be heavy in", which is not signal-reading.
   *
   * Reads nothing the legacy policy scores, so accumulating it costs the deal
   * nothing -- which is what lets this land before any policy uses it.
   */
  see(pack: readonly EngineCard[]): void {
    for (const card of pack) {
      const q = quality(card);
      this.seenQuality += q;
      for (const c of card.colors) this.seenValue.set(c, (this.seenValue.get(c) ?? 0) + q);
    }
  }

  colorBias(card: EngineCard): number {
    if (card.colors.length === 0) return 0;
    // Reward the bot's strongest matching color; cap so a real bomb can still
    // pull the bot off its lane, but committed colors are clearly preferred.
    let best = 0;
    for (const c of card.colors) best = Math.max(best, this.colorValue.get(c) ?? 0);
    return Math.min(0.05, best * 0.3);
  }

  /** Share of the quality this bot has TAKEN that sits in this card's colour. */
  laneFit(card: EngineCard): number {
    return share(card, this.colorValue, this.poolQuality);
  }

  /** Share of the quality this bot has SEEN that sits in this card's colour. */
  openness(card: EngineCard): number {
    return share(card, this.seenValue, this.seenQuality);
  }
}

// What one card adds to a colour's weight. Above the format's rough midpoint
// only, so a pile of unplayables cannot claim a lane -- the same expression the
// colour commitment has always used.
function quality(card: EngineCard): number {
  return Math.max(0, cardValue(card) - 0.5);
}

function share(card: EngineCard, weights: Map<string, number>, total: number): number {
  if (total <= 0 || card.colors.length === 0) return 0;
  let best = 0;
  for (const c of card.colors) best = Math.max(best, weights.get(c) ?? 0);
  return best / total;
}

/**
 * What one bot thinks one card is worth, before noise.
 *
 * Pure and separately exported so the benchmark scores the same expression the
 * engine does. Noise stays in `pick` because it is a tie-breaker carrying no
 * information -- a harness measuring how human-like the policy is wants the
 * policy, not the coin flip.
 */
export function botScore(card: EngineCard, memory: BotMemory): number {
  return cardValue(card) + memory.colorBias(card);
}

/**
 * Which pod a draft was dealt against.
 *
 * A POLICY NAME IS FROZEN THE MOMENT A SESSION STORES IT. Bots decide what
 * wheels, so a draft is only replayable against the policy it was dealt with --
 * which is why `draftSessions.pod` records one and why an absent value means
 * `legacy` forever. Improving the bots later means ADDING a name here, never
 * editing the weights under an existing one. `BOT_FINGERPRINT` exists to go red
 * if somebody does.
 */
export type PodPolicy = "legacy" | StoredPod;

/**
 * The pods a draft can be STARTED against, which is not the same set.
 *
 * `legacy` has no stored representation -- it is what an absent
 * `draftSessions.pod` means -- so it must not be requestable either, or a row
 * could carry the string "legacy" and a row could carry nothing and the two
 * would mean the same thing by convention rather than by construction. Nobody
 * chooses the old bot; you get it by having drafted before pods existed.
 */
/**
 * What a session may CARRY, which is every pod but `legacy` -- that one is what
 * an absent `pod` means, so it is never written down.
 *
 * A VALUE, AND THE TYPE COMES OFF IT RATHER THAN THE OTHER WAY ROUND. It used
 * to be `Exclude<PodPolicy, "legacy">`, which no test could iterate -- and for a
 * year `corpus.test.ts` pinned the deal for `table` and `sharks` while `table2`,
 * the pod every real draft has used since it was fitted, went unpinned. A list
 * something can walk is what turns "remember to add a golden hash" into a red
 * test on the day the pod is added.
 */
export const STORED_PODS = ["table", "sharks", "table2", "sharks2", "table3", "sharks3"] as const;
export type StoredPod = (typeof STORED_PODS)[number];

/**
 * What a new draft may be started AS, which is a smaller set and has to be.
 *
 * `table`, `sharks`, `table2` and `sharks2` are superseded fits. They stay in
 * `PodPolicy` and in the schema forever, because the drafts that recorded them
 * replay against them and would strand otherwise -- but nobody should be
 * offered one, any more than anybody is offered `legacy`.
 *
 * `OfferedPod` STAYS TWO WIDE, and that is a constraint rather than a
 * coincidence: `PodToggle` in the web app is a two-way switch that finds "the
 * other one" by taking the first entry that is not the current one. A third
 * offered pod would silently turn it into a broken toggle whose aria-label
 * lies. Widening this means rewriting that control first.
 *
 * SEPARATE FROM `StoredPod` BECAUSE `challenges.accept` PROVES THEY DIFFER. It
 * deals the friend a session carrying the CHALLENGER's pod, whatever that was,
 * because a challenge is the same packs and a different pod deals a different
 * forty-two. So a draft can legitimately be created today carrying `table`,
 * which is exactly the thing this type must not permit anyone to choose. One
 * type doing both jobs made that a typecheck error, which is how this was found.
 */
export type OfferedPod = Extract<PodPolicy, "table3" | "sharks3">;

/**
 * The pod a new draft gets when nobody says otherwise.
 *
 * Here rather than in the web app's DEFAULT_SETTINGS, because the CLI starts
 * drafts too and a default that lived in one client would silently deal the
 * other a different table -- the CLI is not a lesser client. It began that way
 * and the CLI got `legacy` while the browser got this.
 *
 * `table3` and not `sharks3`: a pod fitted to 3-0 drafters sends the signals a
 * strong table sends, and reading those is not the skill anybody drafting here
 * is trying to practise. Harder to learn from, not just harder to beat.
 *
 * The `3` is a storage key and never reaches a person -- the web app's `PODS`
 * still labels this one "A real table", which is what it has always been called
 * and what it still is. A refit gets a new NAME because a name is frozen the
 * moment a session records it; it does not get a new identity.
 *
 * MOVING THIS IS THE MIGRATION, and there is no other one. `sanitize` in the web
 * app drops a `pod` that is no longer offered, so every browser holding "table2"
 * in localStorage falls back to whatever this says. Drafts already taken keep
 * their own stored pod and replay against it, untouched.
 */
export const DEFAULT_POD: OfferedPod = "table3";

/**
 * Gumbel noise, which is what turns an argmax into a draw from the softmax.
 *
 * Adding an independent Gumbel(0,1) to each candidate's logit and taking the
 * largest samples exactly from softmax(logits) -- and it does it with ONE
 * uniform per candidate, which is the only reason a sampled bot is allowed here
 * at all: `forkImpact` is sound because every bot draws exactly one number per
 * card in its hand and the human draws none, so the rng stream position is
 * invariant under a swapped pick. A sampler that drew once per PICK would be
 * cheaper and would silently turn fork weights into noise.
 *
 * TEMPERATURE IS PART OF A POD, AND EVERY POD SHIPPED SO FAR SETS IT TO 1.
 *
 * The original argument for 1 was that the fit models how real drafters
 * disagree, so sampling at 1 reproduces the measured spread -- and that any
 * other value would be a number with no derivation behind it. The second half
 * still stands and is why the parameter below is not a free knob. The first half
 * does not: a conditional logit's residual entropy is everything the model
 * CANNOT SEE, and sampling at 1 re-emits all of it as independent per-card coin
 * flips. Real drafters differ because they hold different pools and are chasing
 * different decks -- correlated within a seat and across a draft -- not because
 * each of them re-rolls at every card. Seven seats each deviating independently
 * pass cards no real table passes, which `bench-packs` measures and which no
 * pick-accuracy number can see.
 *
 * So a temperature has to be DERIVED, from a quantity the coefficients were not
 * fitted to. `bench-packs` is that quantity: how long a card survives in a pack
 * across eight seats, taken from real Arena pods. See `POD_TEMPERATURE`.
 */
function gumbel(u: number): number {
  // mulberry32 returns [0, 1), and both ends send this to an infinity.
  const clamped = Math.min(1 - 1e-12, Math.max(1e-12, u));
  return -Math.log(-Math.log(clamped));
}

export class Bot {
  private readonly memory = new BotMemory();
  private readonly weights: PolicyWeights | null;
  private readonly temperature: number;

  constructor(
    private readonly policy: PodPolicy = "legacy",
    private readonly rng: () => number = Math.random,
    private readonly noise: number = 0.01,
    // Overridden only by `bench-packs`, which sweeps it to derive the value a
    // new pod should ship with. Nothing in the app passes this: a pod's
    // temperature is bound to its NAME, like its weights, because it decides
    // what wheels and a stored session replays against it.
    temperature?: number,
  ) {
    this.weights = policy === "legacy" ? null : FITTED_POLICIES[policy];
    this.temperature = temperature ?? POD_TEMPERATURE[policy];
  }

  get pool(): readonly EngineCard[] {
    return this.memory.pool;
  }

  pick(pack: EngineCard[], progress = 0): EngineCard {
    let best = pack[0];
    let bestScore = -Infinity;
    for (const card of pack) {
      // Exactly one draw per card, whichever policy is running, and drawn
      // before it is used so the two branches consume the stream identically.
      const u = this.rng();
      const s = this.weights
        ? policyScore(card, this.memory, progress, this.weights, pack.length) / this.temperature +
          gumbel(u)
        : botScore(card, this.memory) + (u - 0.5) * this.noise;
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    // After the scoring loop, never before it. See BotMemory.see.
    this.memory.see(pack);
    this.memory.take(best);
    return best;
  }
}

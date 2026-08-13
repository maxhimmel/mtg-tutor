import type { EngineCard } from "../model/card.js";
import { cardValue } from "../scoring/value.js";
import { FITTED_POLICIES, type PolicyWeights, packOpenness, policyScore } from "./policy.js";

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
  // The two halves of `signal`, both counting PASSED cards only. See there.
  private passedValue = new Map<string, number>();
  private passedQuality = 0;
  private lateValue = new Map<string, number>();
  private lateQuality = 0;
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
   *
   * `taken` is the card this bot took out of this pack, and is what separates
   * the two accumulators below from `seenValue`. A signal is a card somebody
   * PASSED you (SIG-03), so the card you took yourself is not one -- counting it
   * makes the feature partly a restatement of `laneFit`, which is the collinearity
   * `signal` exists to get out of. Omit it and the passed counters read the whole
   * pack; every real caller supplies it.
   */
  see(pack: readonly EngineCard[], taken?: EngineCard): void {
    // At most one card, by name, so a pack holding two copies of a common still
    // reports the copy that was passed.
    let skipped = taken === undefined;
    const lateness = 1 - packOpenness(pack.length);

    for (const card of pack) {
      const q = quality(card);
      this.seenQuality += q;
      for (const c of card.colors) this.seenValue.set(c, (this.seenValue.get(c) ?? 0) + q);

      if (!skipped && card.name === taken!.name) {
        skipped = true;
        continue;
      }
      this.passedQuality += q;
      this.lateQuality += q * lateness;
      for (const c of card.colors) {
        this.passedValue.set(c, (this.passedValue.get(c) ?? 0) + q);
        this.lateValue.set(c, (this.lateValue.get(c) ?? 0) + q * lateness);
      }
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

  /**
   * How much MORE of this colour is reaching the bot late than its overall
   * presence at the table would predict.
   *
   * WHAT WAS WRONG WITH `openness`, WHICH THIS DOES NOT REPLACE SO MUCH AS
   * DEMOTE TO ITS CONTROL GROUP
   *
   * `openness` is the share of all quality seen that sits in a colour, and the
   * dominant term in that is how much good stuff the SET prints in that colour
   * -- which is the same number for all eight seats and every draft of the
   * format. A feature that is mostly a set constant cannot say anything about
   * this seat, and the fit's own result is what that looks like from the
   * outside: the main effect ablated to nothing and the interaction took a large
   * NEGATIVE weight, which as a claim about drafting ("late, avoid what has
   * flowed") is backwards from SIG-05 and SIG-06.
   *
   * THE PRINCIPLES SAY WHICH CARDS COUNT, AND WHEN
   *
   *   SIG-03  a signal is a card somebody PASSED you
   *   SIG-04  read signals by noticing what is ABSENT
   *   SIG-05  a bomb that shows up at pick 4 means the seats above you are not
   *           in that colour
   *
   * All three are about lateness, and `openness` weights a card seen out of a
   * fresh pack exactly like the same card wheeling back at six. In an eight-seat
   * pod a card still present at size 6 has been declined by eight drafters;
   * `packOpenness` is already the measure of that, so its complement is how much
   * a sighting is worth as evidence.
   *
   * WHY A DIFFERENCE AND NOT A RATE
   *
   * A lateness-weighted share on its own would still be dominated by the set's
   * composition -- a colour the set prints heavily is a colour that arrives late
   * heavily too. Subtracting the bot's own unweighted passed share divides that
   * out: what is left is the colour arriving late MORE than its own supply
   * accounts for, which is the absence SIG-04 is about, stated as arithmetic.
   *
   * Both halves are the bot's own observations, so this needs no set-level table
   * and is seat-specific by construction. It is zero-centred, which is what lets
   * a coefficient on it mean one thing: positive is open, negative is cut.
   */
  signal(card: EngineCard): number {
    return (
      share(card, this.lateValue, this.lateQuality) -
      share(card, this.passedValue, this.passedQuality)
    );
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
export type PodPolicy = "legacy" | "table" | "sharks";

/**
 * The pods a draft can be STARTED against, which is not the same set.
 *
 * `legacy` has no stored representation -- it is what an absent
 * `draftSessions.pod` means -- so it must not be requestable either, or a row
 * could carry the string "legacy" and a row could carry nothing and the two
 * would mean the same thing by convention rather than by construction. Nobody
 * chooses the old bot; you get it by having drafted before pods existed.
 */
export type StoredPod = Exclude<PodPolicy, "legacy">;

/**
 * The pod a new draft gets when nobody says otherwise.
 *
 * Here rather than in the web app's DEFAULT_SETTINGS, because the CLI starts
 * drafts too and a default that lived in one client would silently deal the
 * other a different table -- the CLI is not a lesser client. It began that way
 * and the CLI got `legacy` while the browser got this.
 *
 * `table` and not `sharks`: a pod fitted to 3-0 drafters sends the signals a
 * strong table sends, and reading those is not the skill anybody drafting here
 * is trying to practise. Harder to learn from, not just harder to beat.
 */
export const DEFAULT_POD: StoredPod = "table";

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
 * Temperature is 1 and is not a knob. The fit is a model of how real drafters
 * disagree, so sampling at 1 reproduces the measured spread; any other value is
 * a number with no derivation behind it.
 */
function gumbel(u: number): number {
  // mulberry32 returns [0, 1), and both ends send this to an infinity.
  const clamped = Math.min(1 - 1e-12, Math.max(1e-12, u));
  return -Math.log(-Math.log(clamped));
}

export class Bot {
  private readonly memory = new BotMemory();
  private readonly weights: PolicyWeights | null;

  constructor(
    private readonly policy: PodPolicy = "legacy",
    private readonly rng: () => number = Math.random,
    private readonly noise: number = 0.01,
  ) {
    this.weights = policy === "legacy" ? null : FITTED_POLICIES[policy];
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
        ? policyScore(card, this.memory, progress, this.weights, pack.length) + gumbel(u)
        : botScore(card, this.memory) + (u - 0.5) * this.noise;
      if (s > bestScore) {
        bestScore = s;
        best = card;
      }
    }
    // After the scoring loop, never before it. See BotMemory.see.
    this.memory.see(pack, best);
    this.memory.take(best);
    return best;
  }
}

import type { EngineCard } from "../model/card.js";
import { DRAFT } from "../config.js";
import { type Deal, dealTotalPicks } from "./deal.js";
import { Bot, type PodPolicy } from "./bots.js";
import { draftProgress } from "./policy.js";
import { scorePick } from "../scoring/score.js";
import type { ScoringContext } from "../scoring/context.js";
import { readSignals } from "../scoring/explain.js";
import type { RecordedPick } from "../model/pick.js";

export type { RecordedPick };

export class DraftEngine {
  packNo = 1;
  pickNo = 1;
  readonly humanPool: EngineCard[] = [];
  readonly history: RecordedPick[] = [];

  private hands: EngineCard[][] = []; // hands[0] = human, seat index = position
  private bots: Bot[];
  private deal: Deal;

  /**
   * Plays a deal. It does NOT deal one, and that is the whole shape of this
   * class now: `rng` drives bot noise and nothing else, so no number drawn here
   * can change which cards are in a booster. See deal.ts for why the two were
   * split.
   *
   * `pod` defaults to "legacy" everywhere it appears, which is not laziness: a
   * stored session is only replayable against the policy that played it, and an
   * absent pod has to keep meaning the bot that was running at the time.
   */
  constructor(
    deal: Deal,
    rng: () => number = Math.random,
    private readonly pod: PodPolicy = "legacy",
  ) {
    this.deal = deal;
    this.bots = Array.from({ length: DRAFT.seats - 1 }, () => new Bot(pod, rng));
    this.openPack();
  }

  // Copied, because a hand is replaced as it is picked from and rotated between
  // seats. Without the copy a second engine over the same deal would find the
  // first one's leavings -- which `forkImpact` does, twice, by construction.
  private openPack() {
    this.hands = [...(this.deal.rounds[this.packNo - 1] ?? [])];
    this.pickNo = 1;
  }

  get currentPack(): EngineCard[] {
    return this.hands[DRAFT.humanSeat];
  }

  // Off the deal rather than PACK.packsPerDraft: how many rounds this draft has
  // was decided when it was dealt, and a constant read at play time is free to
  // disagree with the boosters actually stored.
  isComplete(): boolean {
    return this.packNo > this.deal.rounds.length;
  }

  // Human picks a card; bots pick from their hands; packs rotate; state advances.
  // `ctx` is what the caller could read about this pack, and only a caller with
  // a database can read it. A replay has no context and scores on raw power --
  // which is why the stored pick, not a replay, is the truth about a score.
  humanPick(card: EngineCard, ctx?: ScoringContext): RecordedPick {
    const pack = this.currentPack;
    const score = scorePick(pack, card, this.humanPool, ctx);
    const signal = readSignals(pack, this.pickNo);

    const rec: RecordedPick = {
      packNo: this.packNo,
      pickNo: this.pickNo,
      pack: [...pack],
      picked: card,
      score,
      signal,
    };
    this.history.push(rec);

    // Remove human's pick.
    this.hands[DRAFT.humanSeat] = pack.filter((c) => c.name !== card.name);
    this.humanPool.push(card);

    // Bots pick from their own hands. They are on the same pick the human just
    // made, so `history.length - 1` is their index too -- and it counts the
    // whole draft, where `pickNo` restarts in every pack.
    const progress = draftProgress(this.history.length - 1, this.totalPicks());
    for (let seat = 1; seat < DRAFT.seats; seat++) {
      const hand = this.hands[seat];
      if (hand.length === 0) continue;
      const botPick = this.bots[seat - 1].pick(hand, progress);
      this.hands[seat] = hand.filter((c) => c.name !== botPick.name);
    }

    this.rotate();
    this.pickNo++;

    if (this.currentPack.length === 0) {
      this.packNo++;
      if (!this.isComplete()) this.openPack();
    }
    return rec;
  }

  // Pack 1 & 3 pass left, pack 2 passes right.
  private rotate() {
    const n = DRAFT.seats;
    const passLeft = this.packNo % 2 === 1;
    const next: EngineCard[][] = new Array(n);
    for (let j = 0; j < n; j++) {
      next[j] = passLeft ? this.hands[(j - 1 + n) % n] : this.hands[(j + 1) % n];
    }
    this.hands = next;
  }

  totalPicks(): number {
    return dealTotalPicks(this.deal);
  }
}

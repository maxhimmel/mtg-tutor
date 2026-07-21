import type { Card, SetData } from "../model/card.js";
import { DRAFT, PACK, packSize } from "../config.js";
import { makePacks } from "./pack.js";
import { Bot } from "./bots.js";
import { scorePick } from "../scoring/score.js";
import { readSignals } from "../scoring/explain.js";
import type { RecordedPick } from "../model/pick.js";

export type { RecordedPick };

export class DraftEngine {
  packNo = 1;
  pickNo = 1;
  readonly humanPool: Card[] = [];
  readonly history: RecordedPick[] = [];

  private hands: Card[][] = []; // hands[0] = human, seat index = position
  private bots: Bot[];
  private set: SetData;
  private rng: () => number;

  constructor(set: SetData, rng: () => number = Math.random) {
    this.set = set;
    this.rng = rng;
    this.bots = Array.from({ length: DRAFT.seats - 1 }, () => new Bot(0.01, rng));
    this.openPack();
  }

  private openPack() {
    this.hands = makePacks(this.set, DRAFT.seats, this.rng);
    this.pickNo = 1;
  }

  get currentPack(): Card[] {
    return this.hands[DRAFT.humanSeat];
  }

  isComplete(): boolean {
    return this.packNo > PACK.packsPerDraft;
  }

  // Human picks a card; bots pick from their hands; packs rotate; state advances.
  humanPick(card: Card): RecordedPick {
    const pack = this.currentPack;
    const score = scorePick(pack, card, this.humanPool);
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

    // Bots pick from their own hands.
    for (let seat = 1; seat < DRAFT.seats; seat++) {
      const hand = this.hands[seat];
      if (hand.length === 0) continue;
      const botPick = this.bots[seat - 1].pick(hand);
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
    const next: Card[][] = new Array(n);
    for (let j = 0; j < n; j++) {
      next[j] = passLeft ? this.hands[(j - 1 + n) % n] : this.hands[(j + 1) % n];
    }
    this.hands = next;
  }

  totalPicks(): number {
    return PACK.packsPerDraft * packSize();
  }
}

import { botRng, type Deal } from "./deal.js";
import { DraftEngine } from "./engine.js";
import type { PodPolicy } from "./bots.js";
import type { ScoringContext } from "../scoring/context.js";

// `scoring` is how a caller that CAN read a set's context makes a replay agree
// with the rows it is replaying. Without it a replay scores on raw power, which
// is right for anything that only wants the deal back and wrong for anything
// that wants the grades.
//
// A draft is fully determined by its DEAL plus the ordered names the human
// picked. It used to be determined by a seed replayed against whatever the set
// said at the time, which is the same statement only for as long as nobody
// re-ingests the set; the deal is stored now, so this is exact and stays exact.
//
// `seed` no longer reaches the boosters. It seeds bot noise alone -- the deal
// was settled once, before the first pick -- so nothing here can re-deal a pack.
export function replayDraft(
  deal: Deal,
  seed: number,
  pickedNames: readonly string[],
  scoring?: (engine: DraftEngine) => ScoringContext | undefined,
  // Which pod played this draft. The deal alone is not enough: bots decide what
  // wheels, so replaying under the wrong policy diverges below, which is at
  // least loud. Callers read it off the session, where absent means "legacy".
  pod: PodPolicy = "legacy",
): DraftEngine {
  const engine = new DraftEngine(deal, botRng(seed), pod);

  for (const name of pickedNames) {
    const card = engine.currentPack.find((c) => c.name === name);
    if (!card) {
      // No longer reachable by re-ingesting a set: the boosters are stored with
      // the draft, so nothing outside it can change what a pack held. What is
      // left is a genuine mismatch -- the wrong pod, or a deal and a pick list
      // from different sessions -- so it names those instead.
      throw new Error(
        `Replay diverged at P${engine.packNo}P${engine.pickNo}: "${name}" is not in the pack. ` +
          `The deal and the picks do not belong to the same draft, or the pod is wrong.`,
      );
    }
    engine.humanPick(card, scoring?.(engine));
  }

  return engine;
}

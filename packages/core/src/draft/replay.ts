import type { SetData } from "../model/card.js";
import { mulberry32 } from "../util/rng.js";
import { DraftEngine } from "./engine.js";
import type { PodPolicy } from "./bots.js";
import type { ScoringContext } from "../scoring/context.js";

// `scoring` is how a caller that CAN read a set's context makes a replay agree
// with the rows it is replaying. Without it a replay scores on raw power, which
// is right for anything that only wants the deal back and wrong for anything
// that wants the grades.
//
// A draft is fully determined by its seed plus the ordered names the human
// picked: pack generation, bot behaviour, and rotation all draw from one seeded
// stream, and the engine already keys picks by name. Replay is therefore exact,
// which is what lets a stored session be nothing but {seed, pickedNames} and
// still rebuild the full board on demand.
export function replayDraft(
  set: SetData,
  seed: number,
  pickedNames: readonly string[],
  scoring?: (engine: DraftEngine) => ScoringContext | undefined,
  // Which pod dealt this draft. The seed alone stopped being enough the moment
  // there was more than one bot policy: replaying under the wrong one deals
  // different packs and throws below, which is at least loud. Callers read it
  // off the session, where an absent value means "legacy".
  pod: PodPolicy = "legacy",
): DraftEngine {
  const engine = new DraftEngine(set, mulberry32(seed), pod);

  for (const name of pickedNames) {
    const card = engine.currentPack.find((c) => c.name === name);
    if (!card) {
      throw new Error(
        `Replay diverged at P${engine.packNo}P${engine.pickNo}: "${name}" is not in the pack. ` +
          `The set data has probably changed since this draft was created.`,
      );
    }
    engine.humanPick(card, scoring?.(engine));
  }

  return engine;
}

import type { SetData } from "../model/card.js";
import { mulberry32 } from "../util/rng.js";
import { DraftEngine } from "./engine.js";

// A draft is fully determined by its seed plus the ordered names the human
// picked: pack generation, bot behaviour, and rotation all draw from one seeded
// stream, and the engine already keys picks by name. Replay is therefore exact,
// which is what lets a stored session be nothing but {seed, pickedNames} and
// still rebuild the full board on demand.
export function replayDraft(
  set: SetData,
  seed: number,
  pickedNames: readonly string[],
): DraftEngine {
  const engine = new DraftEngine(set, mulberry32(seed));

  for (const name of pickedNames) {
    const card = engine.currentPack.find((c) => c.name === name);
    if (!card) {
      throw new Error(
        `Replay diverged at P${engine.packNo}P${engine.pickNo}: "${name}" is not in the pack. ` +
          `The set data has probably changed since this draft was created.`,
      );
    }
    engine.humanPick(card);
  }

  return engine;
}

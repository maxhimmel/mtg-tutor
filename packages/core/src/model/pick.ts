import type { EngineCard } from "./card.js";
import type { PickScore } from "../scoring/score.js";

// The record of a single human draft pick. Shared contract between the draft
// service (which produces it) and the persistence layer (which stores it), so
// it lives in core rather than inside either service.
//
// Generic in the card for the same reason PickScore is: the engine records what
// it dealt from, and a prompt builder wants the same record with the rules text
// filled in.
export interface RecordedPick<C extends EngineCard = EngineCard> {
  packNo: number; // 1-based
  pickNo: number; // 1-based within the pack
  pack: C[]; // snapshot the human saw
  picked: C;
  score: PickScore<C>;
  signal?: string;
}

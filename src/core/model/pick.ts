import type { Card } from "./card.js";
import type { PickScore } from "../scoring/score.js";

// The record of a single human draft pick. Shared contract between the draft
// service (which produces it) and the persistence layer (which stores it), so
// it lives in core rather than inside either service.
export interface RecordedPick {
  packNo: number; // 1-based
  pickNo: number; // 1-based within the pack
  pack: Card[]; // snapshot the human saw
  picked: Card;
  score: PickScore;
  signal?: string;
}

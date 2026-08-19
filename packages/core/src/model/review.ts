import type { Card } from "./card.js";
import type { PickDefense } from "../tutor/challenge.js";

// The AI's cached judgment for a single pick, frozen on first review so
// re-reviews are stable. Produced by the review tutor, stored as JSON on the pick.
export interface ReviewVerdict {
  contextBestName: string; // the AI's pick given the player's pool so far
  divergenceLesson: string; // why the raw-power best and context best agree/differ
  narrative: string; // the streamed coaching reveal
}

// A pick rehydrated from the DB for review: the full pack the human saw plus the
// deterministic scoring fields and any cached AI verdict.
export interface StoredPick {
  /** Position in the session's pick list -- picks are replayed, not stored. */
  pickIndex: number;
  packNo: number;
  pickNo: number;
  pack: Card[];
  picked: Card;
  bestName: string; // raw-power best (deterministic, from 17Lands data)
  score: number;
  isBest: boolean;
  onColor: boolean;
  /**
   * What the player said for this pick before it was graded.
   *
   * Absent on a pick made through the passive flow rather than the commitment
   * ceremony -- which is how a stored row says which of the two it was, so a
   * reader must render its absence rather than fill it in.
   */
  defense?: PickDefense;
  verdict?: ReviewVerdict;
}

export interface StoredDraft {
  id: string;
  setCode: string;
  format: string;
  seed: string;
  createdAt: string;
  colorPair: string;
  picks: StoredPick[];
}

export interface DraftListItem {
  id: string;
  setCode: string;
  format: string;
  createdAt: string;
  colorPair: string;
  overallScore: number;
  accuracy: number;
  pickCount: number;
}

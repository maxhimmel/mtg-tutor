import type { Card } from "./card.js";

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
  id: number;
  packNo: number;
  pickNo: number;
  pack: Card[];
  picked: Card;
  bestName: string; // raw-power best (deterministic, from 17Lands data)
  score: number;
  isBest: boolean;
  onColor: boolean;
  verdict?: ReviewVerdict;
}

export interface StoredDraft {
  id: number;
  setCode: string;
  format: string;
  seed: string;
  createdAt: string;
  colorPair: string;
  picks: StoredPick[];
}

export interface DraftListItem {
  id: number;
  setCode: string;
  format: string;
  createdAt: string;
  colorPair: string;
  overallScore: number;
  accuracy: number;
  pickCount: number;
}

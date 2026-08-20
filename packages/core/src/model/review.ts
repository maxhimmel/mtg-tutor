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
  /**
   * The card the grade was actually measured against -- `scorePick`'s
   * `contextBest`, read back off the stored row rather than guessed at.
   *
   * The pair is the whole point, exactly as it is on the live board: `bestName`
   * is what the data likes and this is what the DECK wanted, and the gap between
   * them is the lesson. Carrying only the first is how the review screen came to
   * mark the raw-power best as though it were the deck-aware answer whenever no
   * verdict had been fetched -- the same defect `Verdict.tsx`'s header comment
   * describes being fixed on the board, left standing here.
   *
   * It also fixes what the review MODEL is grounded on. It was told the
   * raw-power best and asked to name a context-best itself, so a screen the
   * player reads after the fact could nominate a card the grade never
   * considered -- and a colour rule the scorer has since been taught could not
   * reach it. Two authorities over one pack, which this codebase refuses in
   * three other places.
   */
  contextBestName: string;
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

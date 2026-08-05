"use client";

import type { ReactNode } from "react";
import type { Card, ChallengeOutcome, Confidence, ScoringContext } from "@mtg-tutor/core";

// The card taken and the pile it is going to, carried from the moment it is
// chosen to the moment the pick is spent. `carried` means the player pulled it
// out of the pack by hand, which changes nothing about the pick and everything
// about what is left behind -- see the pass animation in DraftBoard.
export interface Proposal {
  card: Card;
  bench: boolean;
  carried: boolean;
}

// What the player committed to, on its way to the mutation. `outcome` never
// goes to the server: it is the resolved pair for the reveal to read, and the
// row keeps the four facts the coach needs instead.
//
// A pick made with no defense at all is how the stored row says which way it was
// made -- there is no mode field on a draft, and there does not need to be.
export interface Defense {
  reason: string;
  confidence: Confidence;
  challengedName?: string;
  proposedName?: string;
  outcome?: ChallengeOutcome;
  /**
   * The card the BROWSER made the pack's context-best while building the
   * challenge -- the better of the pair it put up. Kept so the reveal can check
   * it against the card the server actually graded against.
   *
   * Both sides rank the same pack through `packScoringContext` and should always
   * agree. This is what happens when they do not: rather than grade a player's
   * stated certainty over a pair the server has since contradicted, the reveal
   * drops the calibration reading entirely. Being told nothing is recoverable;
   * being argued into defending one comparison and then scored on a different
   * one is exactly the failure that makes a demanding flow worse than a passive
   * one.
   */
  expectedBestName?: string;
}

/**
 * What the board lends whatever is standing between a card and the pick.
 *
 * Deliberately the board's own facts and nothing shaped for one ceremony: the
 * pack, how it ranks, whether a pick is in flight, and the one function that
 * spends one. A ceremony that wants something narrower reads it itself -- the
 * challenge reads `coachMinPackCards` out of settings rather than being handed
 * it, because a threshold for arguing is not something the board has an opinion
 * about.
 */
export interface CeremonyBoard {
  /** The pack being picked from, whole cards. */
  pack: Card[];
  /**
   * How this pack ranks for the deck so far. Undefined while it is being read
   * and undefined when it could not be -- there is nothing useful to say
   * differently about the two, and a ceremony that argues without it would argue
   * for a card the server then does not grade against.
   */
  scoring: ScoringContext | undefined;
  /** A pick is in flight. Every control that would spend another must be off. */
  busy: boolean;
  /** The last pick that would not go through, for the ceremony to show. */
  error: string | null;
  /** Put that message down, on the way back to the pack. */
  clearError: () => void;
  /**
   * Spend the pick. Resolves true when it landed; on false the board has put the
   * pack back and set `error`, and whatever is standing should stay standing so
   * the player is not made to retype anything.
   */
  commit: (proposal: Proposal, defense?: Defense) => Promise<boolean>;
}

/**
 * One way of making a pick.
 *
 * The board is identical under every one of these -- the pack grid, the drag,
 * the picks column, the sideboard, the verdict and the results are shared. The
 * only thing that differs is what happens between a card being chosen and the
 * pick landing, so that is all this covers.
 */
export interface Ceremony {
  /**
   * The card is chosen. Everything from here until `commit` belongs to the
   * ceremony, including deciding there is nothing to do and spending the pick
   * immediately.
   */
  begin: (proposal: Proposal) => void;
  /** It is holding the screen. The board behind it goes inert. */
  open: boolean;
  /** What it draws over the board, or null when it is not drawing anything. */
  stage: ReactNode;
  /**
   * What the board says before the first pick of a draft. It is the ceremony's
   * line because it is the ceremony that decides what the player is about to be
   * asked for, and being told "say why" by a flow that never asks would be a
   * small lie on the first screen of the draft.
   */
  invitation: string;
}

/**
 * Select a card, confirm it, and the coach explains afterwards.
 *
 * This is the seam with nothing in it, written out rather than expressed as an
 * `if` in the board, because a slot with one occupant is not a slot. It is also
 * the flow every forced pick already takes: a pack too small to argue over
 * commits straight through, which is why switching between the two cannot
 * change how the bottom of a pack plays.
 */
export function usePassivePick({ commit }: CeremonyBoard): Ceremony {
  return {
    begin: (proposal) => void commit(proposal),
    open: false,
    stage: null,
    invitation: "Pick a card to see how it scored.",
  };
}

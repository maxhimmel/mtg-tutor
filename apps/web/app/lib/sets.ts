// The shape `sets.list` returns, as the picker's two views consume it. Written
// out rather than inferred from the Convex api types so SetGrid and SetList can
// share it without either importing the other.
export interface SetSummary {
  code: string;
  name?: string;
  format: string;
  cardCount: number;
  ratedCardCount: number;
  releasedAt?: string;
  iconUri?: string;
}

/**
 * Which of the picker's ways in a draft was started from.
 *
 * Here rather than in analytics.ts because it is the shape of the picker before
 * it is the shape of an event: `start` takes it, all three surfaces supply it,
 * and `set_picked` is only the last thing done with it.
 */
export type PickSource = "recent" | "grid" | "list";

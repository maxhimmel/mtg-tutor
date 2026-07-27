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

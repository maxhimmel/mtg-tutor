// Shapes of the two upstream APIs. Types only -- fetching them is a caller
// concern, so this file stays pure and importable from any runtime.

export interface ScryfallFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { normal?: string };
}

export interface ScryfallCard {
  name: string;
  rarity: string;
  colors?: string[];
  color_identity?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { normal?: string; small?: string };
  card_faces?: ScryfallFace[];
  collector_number: string;
  booster: boolean;
}

export interface SeventeenLandsCard {
  name: string;
  color: string; // e.g. "WU", "" for colorless
  rarity: string;
  url: string;
  avg_seen: number | null; // ALSA
  avg_pick: number | null;
  seen_count: number | null;
  pick_count: number | null;
  ever_drawn_win_rate: number | null; // GIH WR
  ever_drawn_game_count: number | null;
  win_rate: number | null;
}

// `/api/card_data` wraps the card list in an envelope carrying 17Lands' own
// copyright and usage notice. The legacy `/card_ratings/data` returned a bare
// array; it still responds, but only ever with data for currently-live queues.
export interface CardDataResponse {
  copyright: string;
  notes: string;
  data: SeventeenLandsCard[];
}

export interface ColorRating {
  is_summary: boolean;
  color_name: string; // e.g. "Azorius (WU)"
  short_name: string | number; // e.g. "WU" for two-color pairs
  wins: number;
  games: number;
}

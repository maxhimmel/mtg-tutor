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

// One entry in a card's `all_parts`. Scryfall uses the same array for four
// unrelated relationships -- `token` for what the card creates, `combo_piece`
// for a card it names or is named by, `meld_part`/`meld_result` for the two
// halves of a meld -- and it lists the card ITSELF as well, so it has to be
// filtered by `component` rather than taken whole.
//
// `id` is the token's own Scryfall card id, which is what makes resolving its
// art exact: a set's token sheet can print two different tokens under one name
// and one type line -- `tdsk` has a 1/1 Insect and a 2/1 Insect, made by
// Broodspinner and Overlord of the Mistmoors respectively -- and matching by
// name would hand both cards whichever of them the crawl saw first.
//
// THERE IS NOTHING ELSE IN HERE WORTH READING, which is worth stating because
// the array looks like it should be full of relationships to mine. Counted over
// all 18 sets in the pool: 910 `token`, 1,852 `combo_piece`, and no `meld_part`
// or `meld_result` at all. Of 622 combo pieces sampled across five of those
// sets, 438 are the card pointing at ITSELF and most of the rest point at
// "Manifest", which is a Scryfall helper object and not a card anybody drafts.
// What survives is about a dozen genuine "this card names that card" links
// across eighteen sets -- Altanak, the Thrice-Called and Say Its Name -- which
// is not enough to build anything on.
export interface ScryfallRelatedCard {
  id: string;
  component: string;
  name: string;
  type_line: string;
}

export interface ScryfallCard {
  id: string;
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
  // How the card is printed: "normal", "adventure", "split", "transform",
  // "prepare", "saga", "class", "case" are the eight the ingested sets contain.
  layout: string;
  collector_number: string;
  booster: boolean;
  set: string; // Scryfall set code; a bonus-sheet card's differs from the set drafted.
  // Every related piece Scryfall knows of, and absent entirely on a card with
  // none -- which is 68-93% of the pool, measured across all eighteen ingested
  // sets, so the large majority pay nothing for this.
  all_parts?: ScryfallRelatedCard[];
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

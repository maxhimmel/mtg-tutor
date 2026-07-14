import { HTTP } from "../config.js";
import { cached } from "./cache.js";

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

export interface ColorRating {
  is_summary: boolean;
  color_name: string; // e.g. "Azorius (WU)"
  short_name: string | number; // e.g. "WU" for two-color pairs
  wins: number;
  games: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": HTTP.userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`17Lands ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// 17Lands endpoints return empty stats without an explicit date range (the
// default window is empty for rotated sets). Span from 17Lands' start to today.
const RATINGS_START = "2019-01-01";
const today = () => new Date().toISOString().slice(0, 10);

export function fetchCardRatings(
  setCode: string,
  format = "PremierDraft",
): Promise<SeventeenLandsCard[]> {
  const exp = setCode.toUpperCase();
  return cached(`17l_cards_v2_${exp}_${format}`, () =>
    get<SeventeenLandsCard[]>(
      `https://www.17lands.com/card_ratings/data?expansion=${exp}&format=${format}` +
        `&start_date=${RATINGS_START}&end_date=${today()}`,
    ),
  );
}

export function fetchColorRatings(
  setCode: string,
  format = "PremierDraft",
): Promise<ColorRating[]> {
  const exp = setCode.toUpperCase();
  return cached(`17l_colors_${exp}_${format}`, () =>
    get<ColorRating[]>(
      `https://www.17lands.com/color_ratings/data?expansion=${exp}&event_type=${format}` +
        `&start_date=${RATINGS_START}&end_date=${today()}&combine_splash=false`,
    ),
  );
}

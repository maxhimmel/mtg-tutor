import { HTTP } from "../config.js";
import { cached } from "./cache.js";

export interface SetInfo {
  code: string;
  name: string;
  releasedAt: string; // YYYY-MM-DD
  setType: string;
  cardCount: number;
}

interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  released_at?: string;
  card_count: number;
  digital: boolean;
}

// Paper set types that are actually drafted (and thus likely to have 17Lands data).
const DRAFT_TYPES = new Set(["expansion", "core", "draft_innovation", "masters"]);
// 17Lands data begins ~2019; older sets won't have ratings.
const EARLIEST = "2019-01-01";

async function fetchAll(): Promise<SetInfo[]> {
  const res = await fetch("https://api.scryfall.com/sets", {
    headers: { "User-Agent": HTTP.userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Scryfall /sets ${res.status}`);
  const body = (await res.json()) as { data: ScryfallSet[] };
  return body.data
    .filter(
      (s) =>
        !s.digital &&
        DRAFT_TYPES.has(s.set_type) &&
        s.card_count >= 100 &&
        (s.released_at ?? "") >= EARLIEST,
    )
    .map((s) => ({
      code: s.code,
      name: s.name,
      releasedAt: s.released_at ?? "",
      setType: s.set_type,
      cardCount: s.card_count,
    }))
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function fetchSetCatalog(): Promise<SetInfo[]> {
  return cached("scryfall_sets", fetchAll);
}

// Pure merge of the two upstream feeds into our Card model. Kept out of the
// fetchers so the CLI and the server produce identical cards from identical
// responses, regardless of how they got them.

import type { Card, ColorCode, Rarity } from "../model/card.js";
import { normalizeName } from "../model/card.js";
import type { ColorRating, ScryfallCard, SeventeenLandsCard } from "./sources.js";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

function toRarity(r: string): Rarity {
  return (RARITIES as string[]).includes(r) ? (r as Rarity) : "common";
}

const asColorCodes = (values: string[] | undefined): ColorCode[] =>
  (values ?? []).filter((c): c is ColorCode => "WUBRG".includes(c));

function imageOf(sc: ScryfallCard): string | undefined {
  return sc.image_uris?.normal ?? sc.card_faces?.[0]?.image_uris?.normal;
}

// Oracle text lives at the top level for single-faced cards, or split across
// card_faces for double-faced / split cards -- combine both faces there.
function oracleOf(sc: ScryfallCard): string {
  if (sc.oracle_text && sc.oracle_text.length) return sc.oracle_text;

  if (sc.card_faces?.length) {
    return sc.card_faces
      .map((f) => {
        const head = [f.name, f.mana_cost].filter(Boolean).join(" ");
        const body = [f.type_line, f.oracle_text].filter(Boolean).join("\n");
        return [head, body].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n//\n");
  }

  return "";
}

// P/T and loyalty come from the top level, falling back to the front face.
function combatOf(sc: ScryfallCard) {
  const front = sc.card_faces?.[0];
  return {
    power: sc.power ?? front?.power,
    toughness: sc.toughness ?? front?.toughness,
    loyalty: sc.loyalty ?? front?.loyalty,
  };
}

export function mergeCards(
  scryfall: ScryfallCard[],
  ratings: SeventeenLandsCard[],
): Card[] {
  const ratingByName = new Map(ratings.map((r) => [normalizeName(r.name), r]));

  return scryfall.map((sc) => {
    const r = ratingByName.get(normalizeName(sc.name));
    const combat = combatOf(sc);

    return {
      name: sc.name,
      rarity: toRarity(sc.rarity),
      colors: asColorCodes(sc.colors),
      colorIdentity: asColorCodes(sc.color_identity),
      manaCost: sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost ?? "",
      cmc: sc.cmc ?? 0,
      typeLine: sc.type_line,
      oracleText: oracleOf(sc),
      power: combat.power,
      toughness: combat.toughness,
      loyalty: combat.loyalty,
      imageUrl: imageOf(sc),
      collectorNumber: sc.collector_number,
      setCode: sc.set,
      gihWinRate: r?.ever_drawn_win_rate ?? undefined,
      gihGames: r?.ever_drawn_game_count ?? undefined,
      alsa: r?.avg_seen ?? undefined,
      avgPick: r?.avg_pick ?? undefined,
      winRate: r?.win_rate ?? undefined,
    };
  });
}

// The population's own game win rate, which is not 50%: 17Lands' users beat the
// field they are matched against, by ~9 points in SOS TradDraft. Useful context
// for reporting -- scoring instead measures per-rarity baselines directly from
// rated cards (see observedRarityBaselines), which handles the same skew without
// assuming every rarity is skewed equally.
//
// Only non-summary rows are counted -- the summary rows aggregate the others,
// and including them double-counts every game exactly once.
export function overallWinRate(ratings: ColorRating[]): number | undefined {
  let wins = 0;
  let games = 0;
  for (const cr of ratings) {
    if (cr.is_summary) continue;
    wins += cr.wins;
    games += cr.games;
  }
  return games > 0 ? wins / games : undefined;
}

// Archetype win rates keyed like "WU", skipping the summary rows and anything
// that isn't a real two-colour pair.
export function colorPairWinRates(ratings: ColorRating[]): Map<string, number> {
  const out = new Map<string, number>();

  for (const cr of ratings) {
    if (cr.is_summary) continue;
    const key = String(cr.short_name);
    if (key.length === 2 && cr.games > 0 && /^[WUBRG]{2}$/.test(key)) {
      out.set(key, cr.wins / cr.games);
    }
  }

  return out;
}

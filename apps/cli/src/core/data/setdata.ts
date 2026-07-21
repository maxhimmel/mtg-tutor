import {
  type Card,
  type Rarity,
  type ColorCode,
  type SetData,
  isBasicLand,
  normalizeName,
} from "../model/card.js";
import { fetchSetCards, type ScryfallCard } from "./scryfall.js";
import { fetchCardRatings, fetchColorRatings } from "./seventeenlands.js";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

function toRarity(r: string): Rarity {
  return (RARITIES as string[]).includes(r) ? (r as Rarity) : "common";
}

function imageOf(sc: ScryfallCard): string | undefined {
  return sc.image_uris?.normal ?? sc.card_faces?.[0]?.image_uris?.normal;
}

// Oracle text lives at the top level for single-faced cards, or split across
// card_faces for double-faced / split cards — combine both faces there.
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
function combatOf(sc: ScryfallCard): { power?: string; toughness?: string; loyalty?: string } {
  const front = sc.card_faces?.[0];
  return {
    power: sc.power ?? front?.power,
    toughness: sc.toughness ?? front?.toughness,
    loyalty: sc.loyalty ?? front?.loyalty,
  };
}

export async function loadSetData(setCode: string, format = "PremierDraft"): Promise<SetData> {
  const code = setCode.toLowerCase();
  const [scryfall, ratings, colorRatings] = await Promise.all([
    fetchSetCards(code),
    fetchCardRatings(code, format),
    fetchColorRatings(code, format).catch(() => []),
  ]);

  if (scryfall.length === 0) {
    throw new Error(`No Scryfall cards found for set "${code}". Check the set code.`);
  }

  const ratingByName = new Map(ratings.map((r) => [normalizeName(r.name), r]));

  const cards: Card[] = scryfall.map((sc) => {
    const r = ratingByName.get(normalizeName(sc.name));
    const combat = combatOf(sc);
    return {
      name: sc.name,
      rarity: toRarity(sc.rarity),
      colors: sc.colors ?? [],
      colorIdentity: sc.color_identity ?? [],
      manaCost: sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost ?? "",
      cmc: sc.cmc ?? 0,
      typeLine: sc.type_line,
      oracleText: oracleOf(sc),
      power: combat.power,
      toughness: combat.toughness,
      loyalty: combat.loyalty,
      imageUrl: imageOf(sc),
      collectorNumber: sc.collector_number,
      gihWinRate: r?.ever_drawn_win_rate ?? undefined,
      gihGames: r?.ever_drawn_game_count ?? undefined,
      alsa: r?.avg_seen ?? undefined,
      avgPick: r?.avg_pick ?? undefined,
      winRate: r?.win_rate ?? undefined,
    };
  });

  const byName = new Map(cards.map((c) => [normalizeName(c.name), c]));

  const draftable = cards.filter((c) => !isBasicLand(c));
  const pools = {
    common: draftable.filter((c) => c.rarity === "common"),
    uncommon: draftable.filter((c) => c.rarity === "uncommon"),
    rare: draftable.filter((c) => c.rarity === "rare"),
    mythic: draftable.filter((c) => c.rarity === "mythic"),
  };

  const colorPairWinRates = new Map<string, number>();
  for (const cr of colorRatings) {
    if (cr.is_summary) continue;
    const key = String(cr.short_name);
    if (key.length === 2 && cr.games > 0 && /^[WUBRG]{2}$/.test(key)) {
      colorPairWinRates.set(key, cr.wins / cr.games);
    }
  }

  return { code, cards, byName, pools, colorPairWinRates };
}

export function ratedCardCount(set: SetData): number {
  return set.cards.filter((c) => c.gihWinRate != null).length;
}

export const asColors = (s: string): ColorCode[] =>
  (s.split("").filter((ch) => "WUBRG".includes(ch)) as ColorCode[]);

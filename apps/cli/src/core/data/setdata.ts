import {
  type ColorCode,
  type SetData,
  buildSetData,
  colorPairWinRates,
  mergeCards,
} from "@mtg-tutor/core";
import { fetchSetCards } from "./scryfall.js";
import { fetchCardRatings, fetchColorRatings } from "./seventeenlands.js";

export { ratedCardCount } from "@mtg-tutor/core";

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

  return buildSetData(code, mergeCards(scryfall, ratings), colorPairWinRates(colorRatings));
}

export const asColors = (s: string): ColorCode[] =>
  s.split("").filter((ch) => "WUBRG".includes(ch)) as ColorCode[];

// Pure merge of the two upstream feeds into our Card model. Kept out of the
// fetchers so the CLI and the server produce identical cards from identical
// responses, regardless of how they got them.

import type { Card, CardToken, ColorCode, IngestCard, Rarity } from "../model/card.js";
import { isLand, normalizeName } from "../model/card.js";
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

// The back face's art -- which is also the test for whether a card HAS a back
// face rather than two halves of one picture. A transforming card's faces each
// carry their own `image_uris`; an Adventure's, an Omen's, a Room's and a split
// card's do not, because there is nothing to turn over.
function backImageOf(sc: ScryfallCard): string | undefined {
  return sc.card_faces?.[1]?.image_uris?.normal;
}

// `normal` says nothing and is what nine cards in ten are, so it is not worth a
// field on every row of a table that is read whole to review a draft.
function layoutOf(sc: ScryfallCard): string | undefined {
  return sc.layout === "normal" ? undefined : sc.layout;
}

// The tokens a card creates, with the art the set's token sheet prints for
// them.
//
// `all_parts` is four relationships sharing one array and it lists the card
// ITSELF -- Broodspinner's two parts are the Insect it makes and Broodspinner as
// a `combo_piece` -- so filtering by `component` is not tidying, it is the
// difference between "makes an Insect" and "makes an Insect and a Broodspinner".
//
// KEYED BY SCRYFALL ID, WHICH IS THE WHOLE ACCURACY OF THIS FUNCTION.
//
// A token sheet prints several tokens under one name: `tdsk` has 19 cards and
// 17 distinct names, `twoe` 18 and 15. Resolving by name picks whichever
// printing the crawl saw first, and measured against the id it is wrong for 6 of
// dsk's 45 token references and 27 of woe's 125 -- a fifth of them, silently,
// showing Broodspinner's 1/1 Insect on Overlord of the Mistmoors, which makes
// the 2/1. The id is in `all_parts` for free.
//
// Deduped by name within a card rather than by id, because two entries that
// differ only by printing are one thing to a person reading the card.
function tokensOf(sc: ScryfallCard, art: Map<string, string>): CardToken[] | undefined {
  const byName = new Map<string, CardToken>();

  for (const part of sc.all_parts ?? []) {
    if (part.component !== "token" || byName.has(part.name)) continue;
    const imageUrl = art.get(part.id);
    byName.set(part.name, {
      name: part.name,
      typeLine: part.type_line,
      ...(imageUrl ? { imageUrl } : {}),
    });
  }

  return byName.size > 0 ? [...byName.values()] : undefined;
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

// The colours of the face a drafter casts.
//
// Top level for a normal card, and the FRONT face for a two-faced one, where
// Scryfall omits `colors` on the card entirely -- `transform` and `modal_dfc`
// state it per face because the faces can differ. Left unhandled this returned
// [] for every double-faced card in the pool, which is 116 cards across the
// eighteen ingested sets and, on mh3, every planeswalker in the set.
//
// The FRONT face rather than a union of both, for the same reason `manaCost`
// one line below already takes the front: that is the half you have to pay for,
// so it is the half that decides whether you can play the card. What the back
// adds is in `colorIdentity`, which Scryfall DOES state at the top level for
// these -- so the union is not lost, it is on the field that means union.
function colorsOf(sc: ScryfallCard): string[] | undefined {
  return sc.colors ?? sc.card_faces?.[0]?.colors;
}

// The type line, which `reversible_card` does not state at the top level -- it
// puts the same one on both faces. ecl prints five shocklands that way, and they
// are `booster: true`, so they reach `mergeCards` even though the pack manifest
// drops them again afterwards. Before this they were stored with `typeLine`
// undefined against a field typed `string`, which nothing had tripped over only
// because nothing had yet asked one of them whether it was a land.
function typeLineOf(sc: ScryfallCard): string {
  if (sc.type_line) return sc.type_line;
  const faces = (sc.card_faces ?? []).map((f) => f.type_line).filter(Boolean);
  return faces.length > 0 ? faces.join(" // ") : "";
}

// Every coloured pip in a mana cost, hybrid and phyrexian included -- both are
// castable off their colour, so both require you to have it.
function pipColors(manaCost: string | undefined): string[] {
  const found = new Set<string>();
  for (const symbol of manaCost?.match(/\{[^}]+\}/g) ?? []) {
    for (const c of "WUBRG") if (symbol.includes(c)) found.add(c);
  }
  return [...found];
}

/**
 * THE COLOURS YOU HAVE TO BE IN TO PLAY THIS CARD.
 *
 * Which is not Scryfall's `colors`, and the difference is not pedantry -- it is
 * `colors.length === 0` being a special case in six readers, every one of which
 * is asking this question and getting Scryfall's answer to a different one.
 * `scripts/diagnose-colors.mjs` counts the damage: 4.08 cards per pack on mh3.
 *
 * Three rules, and the first two are corrections rather than choices:
 *
 *   A LAND is its colour identity. A land has no mana cost, so Scryfall says []
 *   and always will -- while a Boros tapland is playable in exactly one kind of
 *   deck. `deck.ts` has known this for as long as it has had a `landFitsColors`
 *   and it was the only reader that did.
 *
 *   A DEVOID card is its pips. `{1}{U}` with `colors` [] is precisely what
 *   devoid MEANS and Scryfall is right; the drafter still cannot cast it
 *   without blue. This is the one place the app deliberately disagrees with the
 *   rules of Magic, because the question on a draft screen is never what colour
 *   a card is.
 *
 *   ANYTHING ELSE is Scryfall's answer, which for a normal card is already its
 *   pips.
 *
 * A genuinely colourless card -- an artifact, a fetchland, Kozilek -- comes back
 * empty from all three, which is what keeps the empty array meaning something.
 * It now means only "playable in any deck", which is what every one of those six
 * readers already assumed it meant.
 */
function requiredColors(sc: ScryfallCard): string[] {
  // `isLand` rather than a regex of our own: it already reads the front face of
  // a "Creature — Human // Land", and two answers to "is this a land" in one
  // codebase is one more than the question supports.
  if (isLand({ typeLine: typeLineOf(sc) })) return sc.color_identity ?? [];
  const stated = colorsOf(sc) ?? [];
  return stated.length > 0 ? stated : pipColors(sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost);
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

// Returns cards without a `value` -- it depends on the set's measured rarity
// baselines, which need every card merged first, and ingest settles it right
// after. `IngestCard` rather than `UnvaluedCard` because Scryfall states a
// rarity on every printing, and the three functions that run next need one.
export function mergeCards(
  scryfall: ScryfallCard[],
  ratings: SeventeenLandsCard[],
  // The set's own token sheet, `set:t<code>`, as one crawl for the whole set
  // rather than a lookup per card. Omitted by a caller with no tokens to hand,
  // which leaves every token nameable and none of them illustrated.
  tokenSheet: ScryfallCard[] = [],
): IngestCard[] {
  const ratingByName = new Map(ratings.map((r) => [normalizeName(r.name), r]));
  const art = new Map<string, string>();
  for (const t of tokenSheet) {
    const image = imageOf(t);
    if (image) art.set(t.id, image);
  }

  return scryfall.map((sc) => {
    const r = ratingByName.get(normalizeName(sc.name));
    const combat = combatOf(sc);

    return {
      name: sc.name,
      rarity: toRarity(sc.rarity),
      colors: asColorCodes(requiredColors(sc)),
      colorIdentity: asColorCodes(sc.color_identity),
      manaCost: sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost ?? "",
      cmc: sc.cmc ?? 0,
      typeLine: typeLineOf(sc),
      oracleText: oracleOf(sc),
      power: combat.power,
      toughness: combat.toughness,
      loyalty: combat.loyalty,
      imageUrl: imageOf(sc),
      layout: layoutOf(sc),
      backImageUrl: backImageOf(sc),
      tokens: tokensOf(sc, art),
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

// `colorPairWinRates` was here: archetype win rates, keeping only keys matching
// /^[WUBRG]{2}$/. It had no callers left. The live path is the filter in
// sets.ts, which was deliberately widened to every colour count because the
// two-colour version threw away the majority archetype of ktk and snc -- and
// with it the only measure of what a third colour costs, which is what
// `splashCost` prices. Deleted rather than left dead: it is the wrong rule
// written down, sitting in the same file as the right one.

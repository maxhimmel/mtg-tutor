// Pure merge of the two upstream feeds into our Card model. Kept out of the
// fetchers so the CLI and the server produce identical cards from identical
// responses, regardless of how they got them.

import type { Card, CardHelper, CardToken, ColorCode, IngestCard, Rarity } from "../model/card.js";
import { isLand, normalizeName } from "../model/card.js";
import { allMechanics } from "../model/mechanics.js";

// The printed rules cards the corpus claims, by name. Read once: the corpus is
// compiled into a module, so this is a constant and not a lookup.
const PRINTED_RULES = new Set(
  allMechanics()
    .map((m) => m.art?.toLowerCase())
    .filter((n): n is string => n != null),
);
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

// What the token sheet holds for one printing: the face it leads with, the other
// one where there is another, and whether either says anything.
//
// A token's back was never wanted -- a token is one picture -- but a rules
// insert's is: LTR's leads with the Emblem and carries the rules on the back,
// which is the half worth reading.
//
// The rules flags are for inserts only and `tokensOf` must not consult them: a
// 1/1 Soldier has no oracle text and is still exactly the picture somebody
// wanted. See `helpersOf` for why an insert's faces are held to it.
interface SheetArt {
  front?: string;
  back?: string;
  frontHasRules: boolean;
  backHasRules: boolean;
}

const hasRules = (face: { oracle_text?: string } | undefined) =>
  (face?.oracle_text ?? "").trim().length > 0;

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
function tokensOf(sc: ScryfallCard, art: ReadonlyMap<string, SheetArt>): CardToken[] | undefined {
  const byName = new Map<string, CardToken>();

  for (const part of sc.all_parts ?? []) {
    if (part.component !== "token" || byName.has(part.name)) continue;
    const imageUrl = art.get(part.id)?.front;
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

/**
 * The rules cards the game prints for this card's mechanics.
 *
 * Scryfall files these under `combo_piece` rather than `token`, which is why
 * they were invisible: every one of LTR's 50 tempting cards has named "The Ring
 * // The Ring Tempts You" in `all_parts` since the set was ingested, and
 * `tokensOf` above drops anything that is not a token. The note on
 * ScryfallRelatedCard called combo_piece "not enough to build anything on" --
 * true of the card-names-card links it counted, and it missed these entirely.
 *
 * Narrowed by the corpus rather than by a rule about type lines. A booster's
 * inserts are mostly places to put cards -- "(Place your energy counters in this
 * area.)" is the whole of mh3's -- and only a mechanic whose entry names one is
 * claiming the printed card says more than our sentence does. So this stores
 * what somebody decided to store, and the arrival of a set with a new insert is
 * `refresh-mechanics`' problem rather than a silent behaviour change here.
 *
 * The art comes from the set's own token sheet, which is already crawled for
 * tokens -- LTR's rules card is `tltr/H13`, in the sheet, downloaded on every
 * ingest since the beginning and thrown away at this line.
 */
function helpersOf(
  sc: ScryfallCard,
  art: ReadonlyMap<string, SheetArt>,
): CardHelper[] | undefined {
  const byName = new Map<string, CardHelper>();

  for (const part of sc.all_parts ?? []) {
    if (part.component !== "combo_piece" || part.name === sc.name) continue;
    if (!PRINTED_RULES.has(part.name.toLowerCase()) || byName.has(part.name)) continue;
    // A FACE EARNS ITS PICTURE THE SAME WAY THE INSERT DID: by carrying rules.
    //
    // dft's insert is "Start Your Engines! // Max Speed" and the back face is a
    // large "4" with no oracle text at all -- a marker for where your speed has
    // got to, in the same family as the Adventure and energy placemats that were
    // left out of the corpus entirely. Storing it puts a third card in the hover
    // row that explains nothing.
    //
    // LTR's keeps both: the Emblem says what the Ring does at each step and the
    // back says what happens when it tempts you, 355 and 560 characters.
    const faces = art.get(part.id);
    const front = faces?.frontHasRules ? faces.front : undefined;
    const back = faces?.backHasRules ? faces.back : undefined;
    if (!front && !back) continue;
    byName.set(part.name, {
      name: part.name,
      typeLine: part.type_line,
      ...(front ? { imageUrl: front } : {}),
      ...(back ? { backImageUrl: back } : {}),
    });
  }

  return byName.size > 0 ? [...byName.values()] : undefined;
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
 *   ANYTHING ELSE is its PIPS -- every coloured symbol in the whole mana cost.
 *   For an ordinary card that is Scryfall's answer restated. For the two kinds
 *   it is not, the pips are the ones a drafter would give:
 *
 *     devoid      `{1}{U}` with `colors` [] is precisely what devoid MEANS, and
 *                 Scryfall is right. The drafter still cannot cast it without
 *                 blue. This is the one place the app deliberately disagrees
 *                 with the rules of Magic, because the question on a draft
 *                 screen is never what colour a card IS.
 *     adventure   `{1}{B} // {R}` is reported as ["B"], the creature half only.
 *                 Reading the whole cost calls it black-red, which is what a
 *                 drafter calls it.
 *
 *   Scryfall's stated answer survives as the FALLBACK, for the cards that have
 *   no mana cost to read: Living End is black by colour indicator alone.
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

  // THE PIPS DECIDE, and Scryfall's own answer is the fallback rather than the
  // rule. Devoid is why the pips have to win somewhere; adventures are why they
  // have to win everywhere. Callous Sell-Sword costs `{1}{B} // {R}` and
  // Scryfall reports `colors: ["B"]` -- the creature half alone -- so preferring
  // the stated answer filed 28 two-colour cards as mono-coloured, 21 of them in
  // woe, which is the adventure set and deals 0.53 of them a pack.
  //
  // Reading the whole cost calls it black-red, which is what a drafter calls it.
  // The narrow reading is defensible on the rules -- you can play it in mono-
  // black and simply never cast the adventure -- and it is not what anybody
  // means when they say what colour a card is. Half a card you cannot cast is a
  // cost, and a lane that cannot see the cost cannot weigh it.
  //
  // The fallback still matters for the cards with no mana cost at all: Living
  // End is black by colour indicator and has nothing to read pips from.
  const pips = pipColors(sc.mana_cost ?? sc.card_faces?.[0]?.mana_cost);
  return pips.length > 0 ? pips : (colorsOf(sc) ?? []);
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
  const art = new Map<string, SheetArt>();
  for (const t of tokenSheet) {
    const front = imageOf(t);
    const back = backImageOf(t);
    if (!front && !back) continue;
    art.set(t.id, {
      front,
      back,
      // A single-faced printing states its text at the top level; a two-faced
      // one states it per face and nothing at the top.
      frontHasRules: hasRules(t.card_faces?.[0] ?? t),
      backHasRules: hasRules(t.card_faces?.[1]),
    });
  }

  return scryfall.map((sc) => ({
    ...scryfallHalf(sc, art),
    ...ratingHalf(ratingByName.get(normalizeName(sc.name))),
  }));
}

// A card's two halves BY SOURCE, which is a different cut from the two halves by
// reader that engineCard/cardText make. Everything above the line is Scryfall's
// answer about the printing; everything below is 17Lands' answer about how the
// card performed. They are separated because they go stale at different times
// and for different reasons -- see `restateRatings`.

function scryfallHalf(sc: ScryfallCard, art: ReadonlyMap<string, SheetArt>) {
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
    helpers: helpersOf(sc, art),
    collectorNumber: sc.collector_number,
    setCode: sc.set,
  };
}

function ratingHalf(r: SeventeenLandsCard | undefined) {
  return {
    gihWinRate: r?.ever_drawn_win_rate ?? undefined,
    gihGames: r?.ever_drawn_game_count ?? undefined,
    alsa: r?.avg_seen ?? undefined,
    avgPick: r?.avg_pick ?? undefined,
    winRate: r?.win_rate ?? undefined,
  };
}

// TAKEN FROM `scryfallHalf`, NOT WRITTEN OUT AGAIN -- the same rule cardText.ts
// applies to the engine/text split, for the same reason. A Scryfall field added
// above and forgotten in a hand-copied list here would be silently dropped from
// every re-derived set while a full crawl kept it, which is the worst shape a
// bug can have: correct on the path anybody tests by hand.
//
// Every key is present on the object whichever card is passed -- the fields are
// spelled out, not conditionally spread -- so one dummy enumerates them all.
const SCRYFALL_KEYS = Object.keys(
  scryfallHalf(
    { id: "", name: "", rarity: "common", layout: "normal", collector_number: "", booster: true, set: "" },
    new Map(),
  ),
) as (keyof IngestCard)[];

/**
 * Re-applies 17Lands' half of a card to a pool that is already merged, leaving
 * Scryfall's half exactly as it was.
 *
 * This is what makes a re-ingest free of the network. A set's stats move often
 * -- every scoring change, every new column -- and the printing behind them
 * moves almost never, so re-crawling Scryfall to pick up a new win rate re-reads
 * ~2.7MB per set to change five numbers per card. Ingest can instead read the
 * pool it already stored and call this.
 *
 * Everything the ingest DERIVES is dropped rather than carried: `value`, `turn`,
 * `role` and `tableValue`, and the four denormalised fields the ingest stamps on
 * (`rarityBaseline`, `packRate`, `iwd`, `maindeckRate`). A card whose new stats
 * no longer carry one of those must come back without it, and spreading the
 * stored card would instead leave the old number in place -- stale, plausible,
 * and invisible. Building from `SCRYFALL_KEYS` up means only what this function
 * names can survive.
 */
export function restateRatings(
  cards: readonly Card[],
  ratings: readonly SeventeenLandsCard[],
): IngestCard[] {
  const ratingByName = new Map(ratings.map((r) => [normalizeName(r.name), r]));

  return cards.map((c) => {
    const kept = Object.fromEntries(
      SCRYFALL_KEYS.filter((k) => c[k as keyof Card] !== undefined).map((k) => [
        k,
        c[k as keyof Card],
      ]),
    ) as unknown as ReturnType<typeof scryfallHalf>;

    return { ...kept, ...ratingHalf(ratingByName.get(normalizeName(c.name))) };
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

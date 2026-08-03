import { ConvexError } from "convex/values";
import type { Card, CardContext, CardText, EngineCard, RecordedPick } from "@mtg-tutor/core";
import { normalizeName } from "@mtg-tutor/core";
import type { StoredCard, StoredCardText, StoredEngineCard } from "./validators.js";
import type { QueryCtx } from "./_generated/server.js";

// Putting the rules text back on cards the engine dealt.
//
// The engine works in EngineCard -- names, colours, rarity and the numbers a
// value comparison needs -- because that is all its document carries. Anything
// that shows a card to a person, or writes one into a prompt, needs the other
// half: the type line, the mana value, the oracle text, the statistics that
// make a win rate legible. This is where the two are put back together.
//
// Keyed by normalizeName rather than the raw name, because that is what every
// other name match in this codebase uses and a DFC's two halves must not miss
// each other over a `//`.

export type TextIndex = Map<string, CardText>;

/**
 * The rules text for a set, keyed by normalized name.
 *
 * Pass the names you actually need. The coach describes five cards -- the one
 * taken and the four best it passed -- and reading five rows costs ~3.5KB where
 * reading the set costs ~180KB. Omitting `names` reads the whole set, which is
 * what a review walkthrough or a client warming its card index wants; it is a
 * deliberate whole-set read, not a default that crept in.
 *
 * Bounded by the set's card count either way, so `.collect()` here cannot grow
 * without a set growing.
 */
export async function cardTextFor(
  ctx: QueryCtx,
  code: string,
  format: string,
  names?: readonly string[],
): Promise<TextIndex> {
  if (names) {
    const keys = [...new Set(names.map(normalizeName))];
    const rows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("setCardText")
          .withIndex("by_code_format_and_key", (q) =>
            q.eq("code", code).eq("format", format).eq("key", key),
          )
          .unique(),
      ),
    );
    return new Map(rows.filter((r) => r !== null).map((r) => [r.key, r.text]));
  }

  const rows = await ctx.db
    .query("setCardText")
    .withIndex("by_code_format_and_key", (q) => q.eq("code", code).eq("format", format))
    .collect();
  return new Map(rows.map((r) => [r.key, r.text]));
}

// Convex stores an explicitly-undefined field rather than treating it as
// absent, and an optional field is meant to be absent.
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, val]) => val !== undefined)) as T;
}

// Where a whole card comes apart. Both halves are spelled out field by field
// rather than by spreading and deleting, because a card gains fields over time
// and this is the one place that has to decide which side a new one belongs on.
export function engineHalf(c: StoredCard): StoredEngineCard {
  return defined({
    name: c.name,
    colors: c.colors,
    slot: c.slot,
    packRate: c.packRate,
    value: c.value,
  });
}

export function textHalf(c: StoredCard): StoredCardText {
  return defined({
    name: c.name,
    rarity: c.rarity,
    colorIdentity: c.colorIdentity,
    gihWinRate: c.gihWinRate,
    gihGames: c.gihGames,
    alsa: c.alsa,
    rarityBaseline: c.rarityBaseline,
    manaCost: c.manaCost,
    cmc: c.cmc,
    typeLine: c.typeLine,
    oracleText: c.oracleText,
    power: c.power,
    toughness: c.toughness,
    loyalty: c.loyalty,
    imageUrl: c.imageUrl,
    collectorNumber: c.collectorNumber,
    setCode: c.setCode,
    avgPick: c.avgPick,
    winRate: c.winRate,
    iwd: c.iwd,
    maindeckRate: c.maindeckRate,
  });
}

export function textIndex(cards: readonly CardText[]): TextIndex {
  return new Map(cards.map((c) => [normalizeName(c.name), c]));
}

function textFor(card: EngineCard, index: TextIndex): CardText {
  const text = index.get(normalizeName(card.name));
  if (!text) {
    // A card the engine dealt that the text side has never heard of means the
    // two halves of the set were written by different ingests. Loud, because
    // the alternative is a card rendering as a blank frame with no name on it.
    throw new ConvexError(
      `No card text stored for "${card.name}". Re-run the sets:ingest action for this set.`,
    );
  }
  return text;
}

export function hydrateCard(card: EngineCard, index: TextIndex): Card {
  return { ...textFor(card, index), ...card };
}

export function hydrate(cards: readonly EngineCard[], index: TextIndex): Card[] {
  return cards.map((c) => hydrateCard(c, index));
}

/** A recorded pick with every card in it whole -- what a prompt builder wants. */
export function hydratePick(rec: RecordedPick, index: TextIndex): RecordedPick<Card> {
  return {
    ...rec,
    pack: hydrate(rec.pack, index),
    picked: hydrateCard(rec.picked, index),
    score: {
      ...rec.score,
      picked: hydrateCard(rec.score.picked, index),
      rawBest: hydrateCard(rec.score.rawBest, index),
      contextBest: hydrateCard(rec.score.contextBest, index),
    },
  };
}

/**
 * The scoring context for a set's cards, by normalised name.
 *
 * Pass the names you need, and on the pick path that is the pack -- about
 * fourteen rows, ~2KB. Reading the set's would be ~50KB on a document already
 * read 42 times a draft, which is the cost the whole split exists to avoid.
 */
export async function cardContextFor(
  ctx: QueryCtx,
  code: string,
  format: string,
  names: readonly string[],
): Promise<Map<string, CardContext>> {
  const keys = [...new Set(names.map(normalizeName))];
  const rows = await Promise.all(
    keys.map((key) =>
      ctx.db
        .query("setCardContext")
        .withIndex("by_code_format_and_key", (q) =>
          q.eq("code", code).eq("format", format).eq("key", key),
        )
        .unique(),
    ),
  );
  // A card with no row is a card no archetype had enough games of. That is the
  // honest state for ~10% of a set, not an error, and scoring reads it as "no
  // context" rather than as zero.
  return new Map(rows.filter((r) => r !== null).map((r) => [r.key, r.context]));
}

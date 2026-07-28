import { v, type Infer } from "convex/values";
import type { Card } from "@mtg-tutor/core";

// Literal unions rather than bare strings, so what comes back out of the
// database is already typed as core's Rarity/ColorCode and needs no cast.
export const rarity = v.union(
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("mythic"),
  v.literal("special"),
  v.literal("bonus"),
);

export const colorCode = v.union(
  v.literal("W"),
  v.literal("U"),
  v.literal("B"),
  v.literal("R"),
  v.literal("G"),
);

export const card = v.object({
  name: v.string(),
  rarity,
  colors: v.array(colorCode),
  colorIdentity: v.array(colorCode),
  manaCost: v.string(),
  cmc: v.number(),
  typeLine: v.string(),
  oracleText: v.string(),
  power: v.optional(v.string()),
  toughness: v.optional(v.string()),
  loyalty: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  collectorNumber: v.string(),
  gihWinRate: v.optional(v.number()),
  gihGames: v.optional(v.number()),
  alsa: v.optional(v.number()),
  avgPick: v.optional(v.number()),
  winRate: v.optional(v.number()),
  // Denormalised from setStats by `ingest`, for the same reason rarityBaseline is:
  // the stats table is deliberately off the per-pick path, and these two are what
  // make the GIH WR beside them readable. ~13KB per set. See Card.iwd.
  iwd: v.optional(v.number()),
  maindeckRate: v.optional(v.number()),
  setCode: v.optional(v.string()),
  rarityBaseline: v.optional(v.number()),
  packRate: v.optional(v.number()),
});

export type StoredCard = Infer<typeof card>;

// Observed booster shapes for a set. Optional throughout: a set we have no
// draft data for keeps the fixed PACK constants.
export const packComposition = v.object({
  size: v.number(),
  shapes: v.array(
    v.object({
      slots: v.object({
        common: v.optional(v.number()),
        uncommon: v.optional(v.number()),
        rare: v.optional(v.number()),
        mythic: v.optional(v.number()),
        bonus: v.optional(v.number()),
        land: v.optional(v.number()),
      }),
      weight: v.number(),
    }),
  ),
});

// One entry per pack column in the 17Lands draft dataset -- the authoritative
// list of what a set's boosters can contain, with the slot each card fills and
// the set it was printed in. `slot` is deliberately the same vocabulary
// packComposition uses, since the shapes above are counted with these keys.
//
// This exists because a set's booster pool cannot always be discovered from
// Scryfall: MKM's Arena packs carry a 50-card List sheet of printings from
// 2005-2017, which no "released the same day" query can reach. build-set-stats
// resolves them once, and ingestion reads the answer instead of re-deriving it.
export const packCard = v.object({
  name: v.string(),
  slot: v.union(
    v.literal("common"),
    v.literal("uncommon"),
    v.literal("rare"),
    v.literal("mythic"),
    v.literal("bonus"),
    v.literal("land"),
  ),
  // Absent only for artifacts built before this field existed.
  setCode: v.optional(v.string()),
  // Expected copies of this card per booster, measured from opened packs. Feeds
  // Card.packRate, which is what lets makePack draw a slot by observed odds
  // rather than evenly.
  openedRate: v.optional(v.number()),
});

// Compile-time guard: if the stored shape ever drifts from core's Card, this
// stops type-checking rather than failing at runtime on a replayed draft.
type AssertAssignable<A extends B, B> = [A, B];
export type _CardShapeMatchesCore = AssertAssignable<StoredCard, Card>;

// Per-card statistics derived from the 17Lands public datasets by
// scripts/build-set-stats.mjs. Every rate carries its own sample size, because
// the floors used when building are deliberately looser than 17Lands' own and a
// consumer may want to be stricter.
export const cardStats = v.object({
  name: v.string(),
  gihN: v.number(), // games the card was in hand at some point
  gihWr: v.optional(v.number()),
  ohN: v.number(), // opening hand
  ohWr: v.optional(v.number()),
  gdN: v.number(), // drawn later, not in opening hand
  gdWr: v.optional(v.number()),
  gndN: v.number(), // in deck, never drawn
  gndWr: v.optional(v.number()),
  iwd: v.optional(v.number()), // gihWr - gndWr
  deckN: v.number(),
  deckWr: v.optional(v.number()),
  alsa: v.optional(v.number()),
  ata: v.optional(v.number()),
  seen: v.number(),
  taken: v.number(),
  maindeckRate: v.optional(v.number()),
  trophyPickRate: v.optional(v.number()),
});

export const draftSummary = v.object({
  overallScore: v.number(),
  accuracy: v.number(),
  colorPair: v.string(),
  pickCount: v.number(),
});

export const reviewVerdict = v.object({
  contextBestName: v.string(),
  divergenceLesson: v.string(),
  narrative: v.string(),
});

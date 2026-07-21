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
});

export type StoredCard = Infer<typeof card>;

// Compile-time guard: if the stored shape ever drifts from core's Card, this
// stops type-checking rather than failing at runtime on a replayed draft.
type AssertAssignable<A extends B, B> = [A, B];
export type _CardShapeMatchesCore = AssertAssignable<StoredCard, Card>;

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

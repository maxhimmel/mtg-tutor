import { v, type Infer } from "convex/values";
import type { Card, CardText, EngineCard } from "@mtg-tutor/core";

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

export const packSlot = v.union(
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("mythic"),
  v.literal("bonus"),
  v.literal("land"),
);

// The half of a card the draft engine reads: dealing a pack, running the bots,
// scoring a pick. Convex charges for the whole document a function retrieved
// rather than the fields it used, and a replay reads every card in the set on
// every pick -- so what is NOT in here is the point. See core's EngineCard.
export const engineCard = v.object({
  name: v.string(),
  rarity,
  colors: v.array(colorCode),
  // Which pool the card is dealt from, decided at ingest instead of re-derived
  // from the type line on every replay -- the last thing that kept `typeLine`
  // and `setCode` on this side of a card. Optional for rows written before it
  // existed, which a re-ingest fills in.
  slot: v.optional(packSlot),
  packRate: v.optional(v.number()),
  gihWinRate: v.optional(v.number()),
  gihGames: v.optional(v.number()),
  // Here rather than with the other 17Lands numbers because cardValue nudges an
  // unrated card by it, so scoring cannot be done without it.
  alsa: v.optional(v.number()),
  rarityBaseline: v.optional(v.number()),
});

// The half a person reads, and the half a prompt writes. One row per card in
// `setCardText`, not an array on the pool document, because its readers want
// SUBSETS: buildPickContext describes the picked card and the four best it
// passed, so the coach needs five of these and not four hundred.
export const cardText = v.object({
  name: v.string(),
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
  setCode: v.optional(v.string()),
  avgPick: v.optional(v.number()),
  winRate: v.optional(v.number()),
  // Denormalised from setStats by `ingest`, for the same reason rarityBaseline is:
  // the stats table is deliberately off the per-pick path, and these two are what
  // make the GIH WR beside them readable. ~13KB per set. See Card.iwd.
  iwd: v.optional(v.number()),
  maindeckRate: v.optional(v.number()),
});

// A whole card, which is what `ingest` builds from Scryfall and hands to
// `store`. Storage is where the two halves part company, so this is an argument
// shape and never a stored one.
export const card = v.object({ ...engineCard.fields, ...cardText.fields });

export type StoredCard = Infer<typeof card>;
export type StoredEngineCard = Infer<typeof engineCard>;
export type StoredCardText = Infer<typeof cardText>;

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
// Each half on its own too, so a field drifting to the wrong side of the split
// stops type-checking here rather than at whichever reader first misses it.
export type _EngineShapeMatchesCore = AssertAssignable<StoredEngineCard, EngineCard>;
export type _TextShapeMatchesCore = AssertAssignable<StoredCardText, CardText>;

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

// What one pick scored, with the two cards it names carried as names rather
// than embedded. Both are in the pack stored beside it, so embedding them would
// store every card twice and read it twice.
export const storedPickScore = v.object({
  score: v.number(),
  grade: v.string(),
  pickedName: v.string(),
  bestName: v.string(),
  pickedValue: v.number(),
  bestValue: v.number(),
  isBest: v.boolean(),
  onColor: v.boolean(),
  rankInPack: v.number(),
});

// One set-aside pick: where it sits in the pool, and when the player decided.
// See the `sideboard` note in schema.ts and `Bench` in core.
export const benchEntry = v.object({
  pos: v.number(),
  atPick: v.number(),
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

// What one model call cost. Split out so the table and the mutation that writes
// it derive from one shape and cannot drift.
//
// The token fields mirror the AI SDK's own vocabulary rather than a normalised
// one of our own, and mirror core/llm.ts's UsageReport one-for-one. The cache
// split is the reason any of this is recorded: the system prompt is ~3.4k
// byte-identical tokens on every call, so whether it was read from cache or
// written to it moves the bill more than the prompt's contents do. Every count
// past the first two is optional because reporting them is a provider's
// choice -- Groq sends no cache signal at all.
export const llmCall = v.object({
  area: v.union(v.literal("coach"), v.literal("verdict"), v.literal("frame")),
  sessionId: v.optional(v.id("draftSessions")),
  // Identifies the call within its session: pickIndex for coach and verdict,
  // phase for the two review frames.
  pickIndex: v.optional(v.number()),
  phase: v.optional(v.string()),
  provider: v.string(),
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.optional(v.number()),
  noCacheInputTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  // "stop" is the healthy case; "length" means the answer was truncated, which
  // the benchmark treats as a quality failure rather than a cheap call.
  finishReason: v.string(),
  ms: v.number(),
});

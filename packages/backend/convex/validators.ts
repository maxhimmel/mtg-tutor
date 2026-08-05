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
// Five fields per card, and every one of them is read by dealing a pack or
// scoring a pick. This document is retrieved 42 times a draft and Convex bills
// the whole of it, so anything a reader only wants to SHOW belongs in cardText.
export const engineCard = v.object({
  name: v.string(),
  colors: v.array(colorCode),
  // Which pool the card is dealt from, decided at ingest instead of re-derived
  // from the type line on every replay -- the last thing that kept `typeLine`
  // and `setCode` on this side of a card. Optional for rows written before it
  // existed, which a re-ingest fills in.
  slot: v.optional(packSlot),
  packRate: v.optional(v.number()),
  // Required, not optional -- see EngineCard.value. The formula's inputs are on
  // cardText now, so a card without this cannot be scored at all, and a push
  // validates every stored document: this deploying is the proof that no pool
  // anywhere is still missing one.
  value: v.number(),
});

// What a stored pick saw. Identical to `engineCard`, and that is worth saying
// out loud rather than leaving as a coincidence.
//
// This was briefly its own shape, so a pick could keep the statistics as they
// stood when it was made -- hydration lets the engine half win over the text
// half, so a stored pack would have described the card the player saw rather
// than the card it has since become. That stopped being possible when those
// statistics left EngineCard: `engineHalf` no longer writes them, so there is
// nothing for a snapshot to preserve. The idea is recoverable if it is ever
// wanted; it would mean writing more than the engine half here on purpose.
export const packSnapshot = engineCard;

// The half a person reads, and the half a prompt writes. One row per card in
// `setCardText`, not an array on the pool document, because its readers want
// SUBSETS: buildPickContext describes the picked card and the four best it
// passed, so the coach needs five of these and not four hundred.
export const cardText = v.object({
  name: v.string(),
  // An ingest input rather than something the app reads: it decides a card's
  // pack slot and baseline value, both settled once at ingest, and nothing
  // renders it. Kept so the fact is not thrown away. Optional in core too, so
  // no transitional dance -- a row written before it moved here simply has none.
  rarity: v.optional(rarity),
  colorIdentity: v.array(colorCode),
  // The numbers `value` is computed from at ingest. Once the answer is stored,
  // these are only ever shown to a person or written into a prompt, and both
  // read a handful of cards rather than the set.
  gihWinRate: v.optional(v.number()),
  gihGames: v.optional(v.number()),
  alsa: v.optional(v.number()),
  rarityBaseline: v.optional(v.number()),
  manaCost: v.string(),
  cmc: v.number(),
  typeLine: v.string(),
  oracleText: v.string(),
  power: v.optional(v.string()),
  toughness: v.optional(v.string()),
  loyalty: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  // How the card is printed, and the other side's art when there is one. Both
  // absent for an ordinary card, which is nine in ten, so the pair costs almost
  // nothing across a set -- see Card.layout for why neither can be derived from
  // the type line already on this row.
  layout: v.optional(v.string()),
  backImageUrl: v.optional(v.string()),
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
// `rarity` is re-required here on purpose: this is what `ingest` hands `store`,
// and Scryfall states a rarity on every printing. Neither stored half needs it,
// but the three functions between the merge and the split all do -- see core's
// IngestCard.
export const card = v.object({ ...engineCard.fields, ...cardText.fields, rarity });

export type StoredCard = Infer<typeof card>;
export type StoredEngineCard = Infer<typeof engineCard>;
export type StoredCardText = Infer<typeof cardText>;

// What scoring reads to judge a card in context. One row per card in
// `setCardContext` -- see core's CardContext for why this is a third table and
// not more fields on the pool.
//
// Synergy is deliberately absent. It belongs here by rights, but eight partner
// names a card measured at 201KB of read per draft against 41KB for the
// archetype splits -- two thirds of the cost for the weakest of the signals
// (median lift 1.93pp against archetype fit's 4.2pp). Left for its own decision.
export const cardContext = v.object({
  archWr: v.optional(v.record(v.string(), v.number())),
  speed: v.optional(v.number()),
  iwd: v.optional(v.number()),
  maindeckRate: v.optional(v.number()),
});

// One archetype's own win rate, no card dimension. Same shape setStats stores,
// so ingest copies it across rather than reshaping it.
export const colorWinRate = v.object({
  colors: v.string(),
  n: v.number(),
  wr: v.number(),
});

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
  pickedValue: v.number(),
  pickedContextValue: v.optional(v.number()),
  // Both answers to "what was the best card here". Names rather than cards,
  // because both are in the pack stored beside this.
  rawBestName: v.string(),
  rawBestValue: v.number(),
  contextBestName: v.string(),
  contextBestValue: v.number(),
  // Why the picked card was worth what it was, in win-rate points. Stored
  // rather than recomputed, because the coach reads this row instead of
  // replaying and the reasons are part of what the pick actually saw.
  terms: v.optional(v.array(v.object({ label: v.string(), delta: v.number() }))),
  isBest: v.boolean(),
  onColor: v.boolean(),
  rankInPack: v.number(),
});

// What a player committed to before a pick was graded: why they took it, how
// sure they said they were, and what they did when another card was put up
// against theirs.
//
// **Nothing on this branch writes or reads it, and that is the whole point.**
// Convex validates stored documents on push, so a deployment that has served the
// `draft-v2` branch holds draftPicks rows carrying `defense`, and pushing a
// schema that has never heard of the field fails against them. Declaring it here
// is what lets one deployment serve both while that experiment is judged.
//
// It is a placeholder with an expiry, not a feature. See notes.md, "Deferred
// trade-offs" -- either the challenge flow is adopted and this grows readers, or
// it is dropped and this comes out with a wipe. Do not build on it meanwhile.
//
// Optional on the row and every field inside it required, which is the right way
// round: a pick either went through the challenge or it did not -- a forced pick
// at the bottom of a pack has nothing to defend -- and a half-filled defense
// would mean a reader had to guess which half it got.
//
// The confidence levels are literals rather than a number, because each one is a
// specific claim about `gapMargin` and a 1-5 slider would be four claims the data
// cannot settle.
export const confidence = v.union(v.literal("sure"), v.literal("close"), v.literal("guess"));

export const pickDefense = v.object({
  reason: v.string(),
  confidence,
  // The card put up against theirs. Absent when the pack was too small for the
  // challenge to have anything to say.
  challengedName: v.optional(v.string()),
  switched: v.boolean(),
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

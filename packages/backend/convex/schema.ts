import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  card,
  cardStats,
  draftSummary,
  packCard,
  packComposition,
  reviewVerdict,
} from "./validators.js";

export default defineSchema({
  // One document per (set, format), carrying only what a listing needs. The
  // card pool lives in `setCards` instead: `list` reads every row in this table
  // to build the set picker, and Convex charges for every byte a query reads,
  // not the bytes it returns. With the pool inline that was ~240KB per set --
  // ~4MB read to return 4KB, on every page that shows the picker.
  sets: defineTable({
    code: v.string(),
    // Scryfall's display name, captured at ingest. Optional because sets
    // ingested before this field existed have none until they are re-ingested.
    name: v.optional(v.string()),
    format: v.string(),
    // Being split out into `setCards`. Optional during the migration; rows that
    // still carry it have not been migrated yet.
    cards: v.optional(v.array(card)),
    // Denormalized so `list` can report the pool size without reading it.
    // Optional until every row is migrated.
    cardCount: v.optional(v.number()),
    // Map<string, number> isn't a Convex value; stored as pairs and rebuilt.
    colorPairWinRates: v.array(
      v.object({ pair: v.string(), winRate: v.number() }),
    ),
    ratedCardCount: v.number(),
    ingestedAt: v.string(),
    // Scryfall's icon for the set, an SVG URL. Set-level metadata like `name`:
    // one cheap request refreshes both, independently of the card pool.
    iconUri: v.optional(v.string()),
    // Scryfall's release date, ISO yyyy-mm-dd, which is what `list` orders by.
    // Same cheap metadata request as the name and icon.
    releasedAt: v.optional(v.string()),
    // Pool revision + hash of the stats artifact the CARD list was built from.
    // Lets a deploy re-crawl only the sets that actually changed. Absent on
    // documents written before it existed, which means they rebuild once.
    sourceHash: v.optional(v.string()),
    // Revision of the set-level metadata above, tracked apart from sourceHash
    // so adding a field like the icon costs one request per set rather than a
    // full re-crawl of every card.
    metaRevision: v.optional(v.string()),
    // Copied from setStats by `ingest` -- the observed booster shapes, on the
    // hot-path document so pack generation needs no second read.
    packComposition: v.optional(packComposition),
  }).index("by_code_and_format", ["code", "format"]),

  // The card pool, kept apart from the metadata above for the same reason
  // setStats is: a whole set measures ~240KB, and only the draft engine ever
  // needs it. Everything that merely lists or names sets reads `sets` alone.
  // Still one document per (set, format) -- well inside Convex's 1MB limit, so
  // replaying a draft reads exactly one row rather than hundreds of card rows.
  setCards: defineTable({
    code: v.string(),
    format: v.string(),
    cards: v.array(card),
  }).index("by_code_and_format", ["code", "format"]),

  // Our own draft statistics, derived from the 17Lands public datasets rather
  // than scraped -- the datasets are the source 17Lands sanctions for outside
  // use, and they carry things no API exposes: archetype-conditional win rates,
  // card synergy, maindeck rate, and what 3-0 drafters took.
  //
  // A separate table from `setCards` on purpose. That table is read on every
  // pick, and none of this belongs on that path; keeping them apart means a
  // 198KB stats document never slows a draft down.
  setStats: defineTable({
    code: v.string(),
    format: v.string(),
    games: v.number(),
    // The population's own win rate -- 0.608 for SOS TradDraft, not 0.5, because
    // 17Lands users beat the field. Every rate here sits on that scale, so
    // anything comparing them to a 50%-centered baseline must recenter first.
    baseWinRate: v.number(),
    cards: v.array(cardStats),
    // Win rate for a card within a specific deck archetype, keyed by the deck's
    // main colors -- the context `cardValue` currently lacks.
    archetypes: v.array(
      v.object({
        name: v.string(),
        colors: v.string(),
        n: v.number(),
        wr: v.number(),
      }),
    ),
    // Each archetype's own win rate (no card dimension). `ingest` reads the
    // two-color entries into the set's colorPairWinRates, replacing the
    // /color_ratings API call -- the last runtime 17Lands dependency. Optional
    // so the schema deploys over docs seeded before it existed; storeSetStats
    // always writes it, so a re-seed fills it in.
    colorWinRates: v.optional(
      v.array(v.object({ colors: v.string(), n: v.number(), wr: v.number() })),
    ),
    // Win-rate lift when two cards share a deck, best partners first.
    synergies: v.array(
      v.object({
        name: v.string(),
        partners: v.array(
          v.object({ partner: v.string(), lift: v.number(), n: v.number() }),
        ),
      }),
    ),
    // The set's observed booster shapes, so `ingest` can put them on the set
    // document without a second round trip. See buildSetData / makePack.
    packComposition: v.optional(packComposition),
    // Every card the set's boosters can contain, with its slot and printing.
    // `ingest` reads this to fetch bonus-sheet cards Scryfall's release-day
    // query cannot find. Optional: artifacts built before it existed have none,
    // and ingestion falls back to discovery alone for those.
    packCards: v.optional(v.array(packCard)),
    builtAt: v.string(),
  }).index("by_code_and_format", ["code", "format"]),

  // A draft is fully determined by its seed plus the ordered names the human
  // picked, so that pair IS the session -- no board state is persisted. See
  // replayDraft in @mtg-tutor/core. Replaying a finished draft costs ~0.16ms.
  draftSessions: defineTable({
    userId: v.optional(v.string()), // set once auth lands
    setCode: v.string(),
    format: v.string(),
    seed: v.number(),
    pickedNames: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("complete")),
    // Dead, and optional only so the rows that still carry it keep validating.
    // A draft was never opt-in -- the row is inserted before the first pick and
    // nothing is ever deleted -- and no query has read this since stats and
    // review moved to ownSessions. Nothing writes it now; stripping it from the
    // old rows is a migration for whenever this table is next touched.
    saved: v.optional(v.boolean()),
    createdAt: v.string(),
    completedAt: v.optional(v.string()),
    // Denormalized on completion so the stats screen doesn't replay every draft.
    summary: v.optional(draftSummary),
  }).index("by_user", ["userId"]),

  // Frozen on first review so re-reviews are stable. Keyed by position in the
  // session's pick list rather than by a pick row, since picks aren't stored.
  reviewVerdicts: defineTable({
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  }).index("by_session_and_pickIndex", ["sessionId", "pickIndex"]),
});

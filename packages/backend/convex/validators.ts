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
// What a card does, in the categories a Limited deck is counted in. Mirrors
// core's CardRole exactly; a value here that core does not know is a card the
// tiebreak would silently score as nothing.
export const cardRole = v.union(
  v.literal("removal"),
  v.literal("evasion"),
  v.literal("card advantage"),
  v.literal("creature"),
  v.literal("land"),
  v.literal("other"),
);

/**
 * A card pool stored as columns, which is what `packCards` in core produces.
 *
 * Deliberately NOT `v.array(engineCard)`. That shape writes every field NAME
 * once per card, and across the 18 ingested sets those six strings are
 * 34.8%-44.5% of the document -- read whole on every pick of every draft. See
 * core's model/packedCards.ts for the measurement and for the guarantee this
 * costs: six arrays of equal length is not a shape a validator can express, so
 * the check that every card has a turn and a role lives in `unpackCards` now
 * and runs on every read instead of once per deploy.
 *
 * Optional columns carry `null` holes so index `i` still lines up, and are
 * omitted entirely when no card in the pool uses them.
 */
/**
 * One pick reduced to what the statistics screen plots.
 *
 * Columns rather than a row per pick, for the reason `packedCards` is: 42
 * objects each repeating "score" "packNo" "pickNo" is mostly field names.
 */
export const digestPicks = v.object({
  scores: v.array(v.number()),
  packNos: v.array(v.number()),
  pickNos: v.array(v.number()),
});

/**
 * A pick the player would want back, kept whole because the screen names it.
 *
 * Only the worst DIGEST_MISTAKES of a draft are stored, which is exact rather
 * than approximate for the list that reads them: a global top-K can only ever
 * draw K from any single draft, so keeping each draft's top K is sufficient.
 * See draftDigests.ts.
 */
export const digestMistake = v.object({
  pickedName: v.string(),
  bestName: v.string(),
  pickedValue: v.number(),
  bestValue: v.number(),
  score: v.number(),
  packNo: v.number(),
  pickNo: v.number(),
});

export const packedCards = v.object({
  names: v.array(v.string()),
  colors: v.array(v.array(colorCode)),
  turns: v.array(v.number()),
  roles: v.array(cardRole),
  values: v.array(v.number()),
  slots: v.optional(v.array(v.union(packSlot, v.null()))),
  packRates: v.optional(v.array(v.union(v.number(), v.null()))),
});

export const engineCard = v.object({
  name: v.string(),
  colors: v.array(colorCode),
  // Which pool the card is dealt from, decided at ingest instead of re-derived
  // from the type line on every replay -- the last thing that kept `typeLine`
  // and `setCode` on this side of a card. Optional for rows written before it
  // existed, which a re-ingest fills in.
  slot: v.optional(packSlot),
  packRate: v.optional(v.number()),
  // The curve bucket and the role, settled at ingest so the pick path can judge
  // a card against the DECK -- which the draft principles are almost entirely
  // about, and which needed a mana value and a type line the engine's half of a
  // card does not carry. See core's EngineCard for what the split cost before
  // this and what these two fields cost instead.
  //
  // Required, not optional. While they were optional a card missing them met no
  // deck need and contributed to none, so an un-ingested pool produced a scorer
  // that ran and quietly did half its job -- and a push validates every stored
  // document, so this deploying is the proof that no pool is missing either.
  turn: v.number(),
  role: cardRole,
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
// AND IT IS NO LONGER IDENTICAL, BECAUSE THE TWO HAVE OPPOSITE LIFECYCLES
//
// `setCards.cards` is pipeline data: ingest rewrites every card of every set on
// a POOL_REVISION bump, so a field added there is present everywhere as soon as
// the pipeline runs, and can be required. `draftPicks.pack` is a snapshot
// written once when a pick was made and never rewritten -- so a field added
// today is absent from every row ever stored, and requiring it makes the SCHEMA
// PUSH fail on historical data.
//
// "AS SOON AS THE PIPELINE RUNS" IS THE WHOLE PROBLEM, AND IT COST A DEPLOY.
//
// That paragraph is right about the steady state and silent about the only
// moment it matters. The deploy command is `convex deploy && seed-set-stats &&
// ingest-sets`, so the SCHEMA PUSH COMES FIRST and the pipeline that would fill
// the new field is queued behind it. On the deploy that introduces the
// requirement -- and only that one -- the push validates documents the pipeline
// has not reached yet, fails, and takes the pipeline down with it. Ingest can
// never run, because the push it is behind can never pass.
//
// This deployed fine locally and died on production, which is the shape to
// expect: a dev deployment has usually been re-ingested by hand already, so its
// rows are conformant before the strict schema ever arrives. Prod's are not.
// `turn` and `role` were narrowed here, passed dev, and stopped the first
// production deploy dead on an "Air Response Unit" carrying only
// {colors, name, slot, value}.
//
// So the rule is about ORDER and not only about a table's lifecycle. Pipeline
// data can be required EVENTUALLY; it cannot be required on the same deploy
// that introduces it. Two ways through, and the second is the one that was
// taken:
//
//   widen, deploy so ingest backfills, narrow, deploy again -- no downtime, but
//   `_EngineShapeMatchesCore` below binds this validator to core's EngineCard,
//   so widening breaks the typecheck in about five places and the scoring path
//   gets edited twice to ship no behaviour change; or
//
//   CLEAR THE TABLE and deploy once. A strict schema validates an empty table
//   trivially, and `setCards` is the one table defined as rebuildable -- ingest
//   restores it from Scryfall plus the committed artifact. It costs the minutes
//   ingest takes, with the app showing no sets throughout, and it changes no
//   code.
//
// If you clear it, watch that ingest logs a re-crawl rather than "unchanged,
// skipped". A POOL_REVISION that still matches the stored `sourceHash` would
// skip every set against a table you just emptied, and the deploy would SUCCEED
// with prod holding no cards at all.
//
// That is what happened when `turn` and `role` were narrowed to required: the
// pool validated (5,445 cards, all present) and the push died on a Juggernaut
// inside a draftPicks row from before the fields existed.
//
// So the two fields are optional here and required there, and that asymmetry is
// the honest description rather than a concession. Nothing reads them off a
// stored snapshot: `review.load` re-renders those packs and reports the score as
// it was recorded, and never rebuilds a `ScoringContext` -- the deck needs that
// would want them are computed from the LIVE pool during a draft, not from a
// pick row afterwards. Their absence here is "not needed", not "missing".
export const packSnapshot = v.object({
  ...engineCard.fields,
  turn: v.optional(v.number()),
  role: v.optional(cardRole),
});

// A token a card creates. Three fields and no more: see core's CardToken for
// why the Scryfall object it came from is not stored, and why `imageUrl` is the
// one that can be absent.
export const cardToken = v.object({
  name: v.string(),
  typeLine: v.string(),
  imageUrl: v.optional(v.string()),
});

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
  // What the card creates, on the row a reader already opens to see the card.
  //
  // Never on `setCards`, and the numbers are not close. Measured across all
  // eighteen ingested sets, a set's tokens are 2.8KB (ktk) to 16.0KB (woe),
  // mean 8.0KB -- and `setCards` is retrieved whole on all 42 picks, so that is
  // ~336KB a draft against the 2.98MB a draft and its review move today, for
  // something never dealt, never scored and never picked. Here it rides a row
  // that is read a handful at a time, by exactly the reader that wants it.
  //
  // Optional, and required in neither direction. Most cards make no tokens, and
  // on the deploy that introduces this the schema push runs BEFORE the ingest
  // that would fill it -- see decision #21 in notes.md, which cost a production
  // deploy the last time a pipeline field was narrowed on the way in.
  tokens: v.optional(v.array(cardToken)),
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
export type DigestMistake = Infer<typeof digestMistake>;

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
  // One standard error on the card's GIH win rate, so the GRADE can tell whether
  // a gap is real. `gapMargin` has always run in the browser over hydrated
  // cards; the pick path has neither `gihWinRate` nor `gihGames` since the pool
  // split, which is why the verdict could say two cards were indistinguishable
  // while the score behind it docked the player anyway. See core's CardContext
  // for why it rides this row rather than EngineCard -- it is a read that is
  // already happening, at a nineteenth of the cost.
  se: v.optional(v.number()),
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
  // Whether the data could separate this pick from the card it was graded
  // against. Optional because rows written before the grade could see a margin
  // have none, and `toRecordedPick` recomputes those from the hydrated cards --
  // the same route the browser's verdict has always taken.
  indistinguishable: v.optional(v.boolean()),
  // The other cards in the pack the data could not separate from the one this
  // was graded against. Stored by name like every other card on this row, and
  // absent on rows written before the verdict stopped naming a single winner
  // out of a tie -- those render the way they always did.
  bandNames: v.optional(v.array(v.string())),
  // Which of the band the deck wanted, and the principles that say why. Stored
  // so the review shows what the player was shown rather than recomputing it
  // against a deck that has since been rebuilt.
  preferredName: v.optional(v.string()),
  reasons: v.optional(
    v.array(v.object({ principle: v.string(), note: v.string() })),
  ),
  onColor: v.boolean(),
  rankInPack: v.number(),
});

// What the player committed to before the pick was graded: why they took it,
// how sure they said they were, and what they did when another card was put up
// against theirs.
//
// Optional on the row and every field inside it required, which is the right way
// round. A pick either went through the challenge or it did not -- a forced pick
// at the bottom of a pack has nothing to defend -- and a half-filled defense
// would mean a reader had to guess which half it got. Rows written by a client
// that knows nothing about this simply have no `defense`, which is what keeps
// the same deployment serving both -- and why `main` declares the field it never
// writes. See notes.md, "Deferred trade-offs": that declaration expires when this
// branch is judged, in whichever direction it goes.
//
// The confidence levels are literals rather than a number, because each one is a
// specific claim about `gapMargin` (see core's CONFIDENCE) and a 1-5 slider would
// be four claims the data cannot settle.
export const confidence = v.union(v.literal("sure"), v.literal("close"), v.literal("guess"));

export const pickDefense = v.object({
  reason: v.string(),
  confidence,
  // The card put up against theirs. Absent when the pack was too small for the
  // challenge to have anything to say.
  challengedName: v.optional(v.string()),
  switched: v.boolean(),
});

// The same defense as the client states it, before `draft.pick` settles it.
//
// It sends the card it first proposed; the mutation derives `switched` from
// whether the card actually taken is that one. Deriving rather than accepting
// keeps the row from being able to disagree with itself -- a stored
// `switched: true` beside a pick that never moved is a lesson taught about
// something that did not happen, and there is no way to notice it later.
export const pickDefenseInput = v.object({
  reason: v.string(),
  confidence,
  challengedName: v.optional(v.string()),
  proposedName: v.string(),
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

export const feedbackSentiment = v.union(v.literal("up"), v.literal("down"));

// Where somebody was standing when they said something.
//
// A literal union rather than a string, for the same reason event names live in
// one file (see apps/web/app/lib/analytics.ts): this is the field every reading
// of the feedback groups BY. "coach" and "Coach" arriving from two components is
// two piles that each look half as loud as the problem actually is, and nothing
// later can tell them apart. A route can be wrong and still be a label; this
// cannot.
//
// The first three are exactly llmCall's `area` above, and deliberately so: they
// are the app's three AI answers, so a complaint joins to the model call that
// produced it. The rest are the screens with no model behind them, which still
// need somewhere to point.
export const feedbackSurface = v.union(
  v.literal("coach"),
  v.literal("verdict"),
  v.literal("frame"),
  v.literal("pick"),
  v.literal("deck"),
  v.literal("results"),
  v.literal("sets"),
  v.literal("general"),
);

// What the note points at. Every field optional and the object itself optional,
// which is the opposite call from pickDefense above and made on purpose.
//
// A half-filled defense makes a reader guess which half it got, so that one is
// all-or-nothing. An anchor is best effort: knowing only the set is worth more
// than knowing nothing, and losing a paragraph somebody typed because its
// metadata was incomplete is the worst trade available in this feature.
//
// setCode and format are denormalised off draftSessions rather than joined.
// They are the dimension every reading groups by -- "all the SNC complaints" --
// and the alternative is a ~2KB session read per row to recover twelve bytes.
export const feedbackAnchor = v.object({
  sessionId: v.optional(v.id("draftSessions")),
  pickIndex: v.optional(v.number()),
  phase: v.optional(v.union(v.literal("open"), v.literal("close"))),
  setCode: v.optional(v.string()),
  format: v.optional(v.string()),
});

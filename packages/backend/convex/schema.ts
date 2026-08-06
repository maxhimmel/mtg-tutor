import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  benchEntry,
  cardContext,
  cardStats,
  cardText,
  colorCode,
  colorWinRate,
  draftSummary,
  engineCard,
  feedbackAnchor,
  feedbackSentiment,
  feedbackSurface,
  packSnapshot,
  llmCall,
  packCard,
  packComposition,
  pickDefense,
  reviewVerdict,
  storedPickScore,
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
    // Denormalized so `list` can report the pool size without reading it.
    cardCount: v.number(),
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
  }).index("by_code_and_format", ["code", "format"]),

  // Everything the draft engine needs and nothing else, kept apart from the
  // metadata above for the same reason setStats is: only a replay ever reads it.
  // Anything that merely lists or names sets reads `sets` alone, at ~280 bytes.
  //
  // ~46KB, down from ~240KB before the rules text moved to setCardText.
  //
  // One document per (set, format), and deliberately so: dealing a pack samples
  // every rarity pool, so the engine always wants the whole thing and a row per
  // card would only add per-row overhead to a read it was going to do anyway.
  // The opposite call from setCardText below, for the opposite reason.
  setCards: defineTable({
    code: v.string(),
    format: v.string(),
    // The engine's half of a card. The rules text, the art and the statistics
    // only a reader needs live in setCardText -- two thirds of what a replay
    // used to drag in on every pick.
    //
    // Strict rather than permissive, which is the point: a push validates every
    // existing document, so this deploying at all is proof that no pool anywhere
    // still carries the old shape.
    cards: v.array(engineCard),
    // How each archetype in this format actually did, at every colour count --
    // not filtered to pairs. Three colours is the majority archetype in ktk and
    // snc, and the cost of a third colour is the gap between these rates rather
    // than a constant, so scoring needs the whole table on the hot path. ~30
    // rows, under a kilobyte, on a document that is now ~24.7KB.
    colorWinRates: v.array(colorWinRate),
    // Copied from setStats by `ingest` -- the observed booster shapes, on the
    // hot-path document so pack generation needs no second read.
    packComposition: v.optional(packComposition),
  }).index("by_code_and_format", ["code", "format"]),

  // The half of a card a person reads: rules text, art, mana cost, and the
  // statistics that make a win rate legible beside it.
  //
  // One row per card, where the pool above is one document for the whole set,
  // and the difference is not taste -- it is what each side's readers ask for.
  // Dealing a pack samples every rarity pool, so the engine always wants the
  // whole set and a row-per-card would only add per-row overhead to a read it
  // was going to do anyway. This side is the opposite: buildPickContext
  // describes the picked card and the four best it passed, so the coach wants
  // FIVE of these. Five rows is ~3.5KB; five out of one blob is the whole blob.
  //
  // Keyed on normalizeName rather than the raw name, because that is what every
  // other name match here uses and a DFC's two halves must not miss each other
  // over a `//`. The display name is still on the row, inside the text itself.
  // Nested rather than spread flat, so `row.text` IS a CardText and hydrating
  // needs no projection: spreading the row itself would put `_id`, `code` and
  // `key` onto every card handed to a client.
  setCardText: defineTable({
    code: v.string(),
    format: v.string(),
    key: v.string(),
    text: cardText,
  }).index("by_code_format_and_key", ["code", "format", "key"]),

  // What scoring reads to judge a card against the deck being built. A third
  // table for the same reason setCardText is a second one: choosing the
  // context-best card in a pack needs this for the ~14 cards in that pack, never
  // for the set, so it must not ride the pool document.
  //
  // Keyed and shaped exactly like setCardText, including nesting the payload
  // under one field so spreading a row cannot put `_id` and `key` on a card.
  setCardContext: defineTable({
    code: v.string(),
    format: v.string(),
    key: v.string(),
    context: cardContext,
  }).index("by_code_format_and_key", ["code", "format", "key"]),

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

  // Which artifact each setStats row was built from, on a row small enough to
  // ask. Every deploy re-runs seed-set-stats over all 17 artifacts, and they
  // almost never change -- but Convex charges for bytes read out of the
  // database, so checking the hash on the ~270KB stats document itself would
  // cost as much as the write it was trying to avoid. Hence a separate row of
  // about a hundred bytes. Same hash ingest-sets puts on `sets.sourceHash`.
  setStatsMeta: defineTable({
    code: v.string(),
    format: v.string(),
    sourceHash: v.string(),
  }).index("by_code_and_format", ["code", "format"]),

  // A draft is fully determined by its seed plus the ordered names the human
  // picked, so that pair IS the session -- no board state is persisted. See
  // replayDraft in @mtg-tutor/core. Replaying a finished draft costs ~0.16ms.
  //
  // draftPicks does not change that. It records what each pick SAW, so a reader
  // after one pick need not rebuild the whole draft to find it; the packs are
  // still dealt from the seed and nothing reads a board back.
  draftSessions: defineTable({
    userId: v.optional(v.string()), // set once auth lands
    setCode: v.string(),
    format: v.string(),
    seed: v.number(),
    pickedNames: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("complete")),
    // Which picks the player has set aside, and when they decided it.
    //
    // Positions rather than names, because drafting two copies of a card is
    // normal and benching one of them must not bench both. The same position
    // indexes a stored pick's `poolBefore`, which is the pool in pick order --
    // so the coach can split one pick's pool into maindeck and sideboard
    // without reading anything else.
    //
    // `atPick` is what keeps an earlier pick's context from being rewritten by a
    // later decision: cutting a card at pick 40 is not evidence about the deck
    // being built at pick 5. `atPick === pos` means it was set aside as it was
    // picked, which is the strongest statement the player can make about it.
    //
    // The bare-number arm is the pre-clock shape, kept only until the backfill
    // has run on both deployments; `normalizeBench` reads either. Every reader
    // goes through it -- see model/bench.ts in core.
    sideboard: v.optional(v.union(v.array(v.number()), v.array(benchEntry))),
    createdAt: v.string(),
    completedAt: v.optional(v.string()),
    // Denormalized on completion so the stats screen doesn't replay every draft.
    summary: v.optional(draftSummary),
    // That the player has built their 40, and the one part of it `sideboard`
    // cannot say.
    //
    // No deck list. Which cards are in the deck is the maindeck half of
    // `splitPool`, which the draft screen has been writing all along -- storing
    // the deck again would be a second copy of the same decision, free to
    // disagree with the first. Lands are the half that split cannot express:
    // basics are not picks, so nothing in the session refers to them.
    //
    // Absent means the deck has not been built yet, which is what `results`
    // gates the suggestion on. Every draft finished before this existed is in
    // that state and can be built whenever the player goes back to it.
    build: v.optional(v.object({ basicLands: v.number(), builtAt: v.string() })),
    // That a review token was spent on this draft -- not when it was reviewed.
    // Re-reading a draft is free, and this flag is what makes that true: it is
    // set once, ever, and every later verdict and frame sees it and charges
    // nothing. Set idempotently by quota.claimReview, whose docblock explains
    // why five concurrent verdicts still spend exactly one.
    //
    // On this document rather than its own row because the claim is a fact
    // about the session, and because the alternative -- a lookup per verdict --
    // is a read this document was going to do anyway.
    reviewClaimedAt: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // What one pick actually saw and scored, written as it happens.
  //
  // A draft is still {seed, pickedNames} replayed -- that is what deals the
  // packs, and this changes nothing about it. What this removes is REPLAYING TO
  // READ ONE PICK. The coach and the review verdict each want a single
  // historical pick, and rebuilding one by replaying the whole draft meant
  // reading the set's entire card pool to answer a question about fourteen
  // cards: 51.5KB a call, sixty times over a drafted-and-reviewed session.
  //
  // Not a second source of truth. The engine still produces the pick; this is
  // the record of what it produced, written in the same transaction. Nothing
  // recomputes it and nothing may disagree with it.
  //
  // stats.overview deliberately keeps replaying. It reads a hundred sessions at
  // once and caches one pool per set, so reading rows instead would turn a
  // handful of pool reads into four thousand row reads.
  draftPicks: defineTable({
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    packNo: v.number(),
    pickNo: v.number(),
    // The pack as it was offered, in the engine's half of a card. The rules text
    // is joined from setCardText when a prompt needs it.
    pack: v.array(packSnapshot),
    pickedName: v.string(),
    // The pool as it stood BEFORE this pick, as the prompts consume it: names
    // grouped by colour, and nothing else. ~30 bytes a card, which is what lets
    // a pick carry its own history instead of reading the set to rebuild one.
    poolBefore: v.array(v.object({ name: v.string(), colors: v.array(colorCode) })),
    score: storedPickScore,
    signal: v.optional(v.string()),
    // What the player said for this pick before it was graded, and what they did
    // when it was argued with. Optional because it is a property of HOW a pick
    // was made rather than of the pick: a forced pick is never challenged, and a
    // client that does not run the challenge writes rows without it.
    defense: v.optional(pickDefense),
  }).index("by_session_and_pickIndex", ["sessionId", "pickIndex"]),

  // Frozen on first review so re-reviews are stable. Keyed by position in the
  // session's pick list, which is what draftPicks keys on too.
  reviewVerdicts: defineTable({
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  }).index("by_session_and_pickIndex", ["sessionId", "pickIndex"]),

  // The archetype bookends, frozen the same way and for a second reason on top
  // of stability: a frame is a model call that nothing cached, so a review page
  // reloaded fifty times was a hundred calls behind one review's worth of
  // quota. Caching it is also cheaper than not -- framePrompt replays the draft
  // and reads the ~46KB pool, twice per mount, to build a prompt whose answer
  // never changes.
  //
  // Its own table rather than a field on draftSessions, because that document
  // is read by ownedSession 45 times a draft on the coach path and the prose
  // has no business riding along.
  reviewFrames: defineTable({
    sessionId: v.id("draftSessions"),
    phase: v.union(v.literal("open"), v.literal("close")),
    text: v.string(),
  }).index("by_session_and_phase", ["sessionId", "phase"]),

  // Someone asking to be let in, from the signed-out page. Written by a public
  // mutation -- it has to be, the caller has no account and cannot get one
  // while sign-up is off.
  //
  // No status field, deliberately. Whether someone was let in is answered by
  // whether an invitation exists in WorkOS, and a flag here would be a second
  // answer to that question, free to disagree with the first the moment anyone
  // invites a friend without going through the form.
  accessRequests: defineTable({
    name: v.string(),
    email: v.string(),
    note: v.optional(v.string()),
    createdAt: v.string(),
  }),

  // What a friend in the beta said, at the moment they said it.
  //
  // A log of an experience, not a projection of state. Everything on the row is
  // what the person was looking at when they typed it, and nothing here may ever
  // be "corrected" from live data -- the complaint is about what they saw.
  //
  // WHAT IS STORED AND WHAT IS JOINED
  //
  // `quote` is the load-bearing field and the reason this is not just a note and
  // a URL. The draft coach is an httpAction returning a stream (see http.ts): the
  // prose exists for the length of one ReadableStream and one React state
  // variable, and nothing writes it down -- metrics.record stores token counts
  // and explicitly no text. It is also not reproducible, since the model is
  // nondeterministic and the prompt moves with the principles corpus. So a note
  // about the coach without a snapshot taken in the browser is unactionable, and
  // no amount of reading at query time recovers it.
  //
  // A verdict is the opposite and is deliberately NOT copied here. reviewVerdicts
  // is frozen on first review so a reread is stable, which is exactly the
  // property that makes joining it safe -- and a copy on this row would be a
  // second answer free to disagree with the first, which is why accessRequests
  // above has no status field either. Store the prose with no other home; join
  // the prose that has one.
  //
  // The rest of the anchoring is denormalised rather than joined, for the reason
  // this whole schema is split the way it is: Convex bills the bytes a query
  // READS. Joining draftSessions for a set code costs ~2KB a row and joining
  // draftPicks for what the pack held costs ~3KB, so a hundred notes would read
  // half a megabyte to print their headers. On the row it is ~60 bytes, and the
  // pick itself stays a pointer the owner can follow for the one note they act
  // on.
  //
  // NO INDEX, which is the choice rather than an omission. The only reader is
  // scripts/feedback.mjs asking for the newest N, and by_creation_time -- free,
  // already there -- answers exactly that. An index on userId or surface would
  // let a query read FEWER bytes only once the table is large enough for that to
  // matter; over a few hundred rows the script filters in JS over bytes it was
  // going to read anyway, and every index is a write cost on every submit
  // forever. Revisit when this passes ~1MB.
  feedback: defineTable({
    // Both identity keys, on purpose. userId is the tokenIdentifier every
    // user-owned table here keys on, so a note joins to its author's drafts.
    // subject is the WorkOS user id -- the distinctId convex/analytics.ts sends
    // and the one the browser identifies on -- so a note joins to its author's
    // session replay. They are `${issuer}|${subject}` and `${subject}`, and
    // carrying only one means choosing which half of the app you can reach.
    userId: v.string(),
    subject: v.string(),
    // Frozen at write time because it is not derivable later. Roles live on the
    // WorkOS token and there is no users table (see roles.ts), so nothing can
    // answer "what tier was this person when they said this" after the fact. It
    // is also the filter that matters most on read: the owner's own notes are
    // not evidence.
    role: v.string(),

    note: v.string(),
    sentiment: v.optional(feedbackSentiment),
    // The route PATTERN -- "/review/[sessionId]", not the resolved path. The id
    // is in the anchor where it can be followed; in here it would only fork one
    // screen into forty labels.
    route: v.string(),
    surface: feedbackSurface,
    anchor: v.optional(feedbackAnchor),
    // What was on screen, when nothing else holds it. Only ever written for
    // prose with no server-side copy -- today that is the coach and only the
    // coach.
    quote: v.optional(v.string()),

    createdAt: v.string(),
  }),

  // One row per model call, appended by every path that spends the deployment's
  // key.
  //
  // There is no benchmark/real-traffic flag, because a benchmark run drives the
  // same endpoints a player does and so already groups under its own session --
  // which is the point: a measured run is only worth anything if it went the way
  // real traffic goes. `by_sessionId` is how the harness reads back its own run,
  // and it is why nothing benchmark-shaped had to leak into the public API.
  //
  // Raw rows, no rollup. A row is ~150 bytes against the ~240KB documents that
  // made `sets.list` expensive, so folding them at read time costs nothing until
  // months of traffic accumulate; notes.md records the trigger for revisiting.
  //
  // No prompt or completion text is stored. The benchmark scores answer quality
  // on the responses it already holds in-process, so nothing here needs to carry
  // user prose -- which keeps the row small and the retention question boring.
  llmUsage: defineTable(
    llmCall.extend({
      // The same identity key draftSessions.userId holds -- tokenIdentifier, via
      // requireUserId. Optional because usage is worth recording even when the
      // caller could not be attributed.
      userId: v.optional(v.string()),
      createdAt: v.string(),
    }).fields,
  )
    .index("by_sessionId", ["sessionId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_area_and_createdAt", ["area", "createdAt"]),
});

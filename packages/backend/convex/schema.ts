import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  answerSurface,
  benchEntry,
  cardContext,
  cardStats,
  cardText,
  colorCode,
  colorWinRate,
  digestMistake,
  digestPicks,
  draftSummary,
  engineCard,
  feedbackAnchor,
  feedbackSentiment,
  feedbackSurface,
  packSnapshot,
  llmCall,
  packCard,
  packComposition,
  turnStats,
  packedCards,
  pickDefense,
  reviewVerdict,
  setDrillId,
  storedDials,
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
    // Lets a deploy rebuild only the sets that actually changed. Absent on
    // documents written before it existed, which means they rebuild once.
    sourceHash: v.optional(v.string()),
    // What the stored pool's SCRYFALL half was crawled from -- the crawl
    // revision plus the card identities in the artifact, and nothing about the
    // numbers. Paired with sourceHash above, which moves whenever any number in
    // the artifact does.
    //
    // The two exist apart because they go stale for unrelated reasons and only
    // one of them is expensive. Changing a scoring weight moves sourceHash for
    // every set at once and leaves every printing exactly as it was; re-crawling
    // Scryfall to pick that up costs ~2.7MB and 5-6 requests per set, and earns
    // a 429 around the sixth set in a row from a shared build IP. With this
    // stored, that deploy re-reads the pool it already has instead.
    //
    // Absent on documents written before it existed. Those crawl once more and
    // then have it, which is why nothing needed migrating for this.
    crawlHash: v.optional(v.string()),
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
    // Each archetype's own win rate (no card dimension), at every colour count
    // -- NOT just pairs. `ingest` copies these onto the set, replacing the
    // /color_ratings API call, the last runtime 17Lands dependency. Three-colour
    // archetypes are the majority in some sets and are the only thing that
    // measures what a third colour costs, which is what `splashCost` prices.
    // Optional so the schema deploys over docs seeded before it existed;
    // storeSetStats always writes it, so a re-seed fills it in.
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
    // The format's mean game length and the per-colour means each card's
    // `deckSpeed` was taken against. Optional so the schema push that introduces
    // it deploys over docs seeded before it existed -- the same ordering decision
    // #21 cost a production deploy for. A re-seed fills it in.
    turnStats: v.optional(turnStats),
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
    // That this draft was taken in answer to a challenge, and which one.
    //
    // On the session rather than found by an index on `challenges`, because the
    // one reader is `draft.pick`'s completion branch: it already holds this
    // document, so notifying costs a single get on the last pick of a draft and
    // nothing at all on the other forty-one. It is also what tells the browser a
    // draft arrived through a link, which is a property on an existing event
    // rather than a new one.
    challengeId: v.optional(v.id("challenges")),
    // Which bot policy dealt this draft.
    //
    // Bots decide what wheels, so {seed, pickedNames} stopped being enough the
    // moment there was a second policy -- replaying under the wrong one deals
    // different packs. ABSENT MEANS "legacy" AND ALWAYS WILL: every draft taken
    // before this column existed was dealt by the original
    // cardValue + colorBias bot, and that policy has to stay reachable forever
    // or all of them strand. This is the whole reason smarter bots did not have
    // to be paid for with everyone's history.
    //
    // The corollary is that a name here is FROZEN once any row carries it.
    // Improving the bots means adding a name, never re-fitting one in place;
    // BOT_FINGERPRINT in core goes red if somebody tries.
    //
    // Deliberately NOT in the localStorage-backed `useSettings` beside
    // pickCeremony (decision #13). That one is per-pick and switchable
    // mid-draft because nothing session-level depends on it. This decides the
    // deal, so it has to be on the row a replay reads.
    pod: v.optional(
      v.union(
        v.literal("table"),
        v.literal("sharks"),
        v.literal("table2"),
        v.literal("sharks2"),
        v.literal("table3"),
        v.literal("sharks3"),
      ),
    ),
  }).index("by_user", ["userId"]),

  // Every booster this draft will ever open, settled at creation.
  //
  // THIS IS WHAT TOOK THE CARD POOL OFF THE REQUEST PATH. A draft used to be
  // {seed, pickedNames} replayed against `setCards` -- and replay deals, and
  // dealing samples every rarity pool, so each of the 42 picks read the set's
  // whole card list. Only 50-64% of a set ever reaches any of the 24 boosters
  // (measured across all 18 ingested sets), so most of that read was cards this
  // draft could not contain. Measured: 36.5KB a pick against 11.9KB here.
  //
  // AND IT IS WHY A DRAFT CAN NO LONGER STRAND. Replaying against whatever the
  // set says TODAY made re-ingesting destructive: the packs a stored draft saw
  // stopped existing and nothing could repair them. `sets.sourceHash`,
  // `draftSessions.sourceHash`, `staleAgainst` and the "can no longer be
  // rebuilt" error were all written to cope with that, and all of them go.
  //
  // Its own table rather than a field on `draftSessions`, which is read by
  // `ownedSession` 45 times a draft and REWRITTEN on every pick -- a ~10KB field
  // there would be ~420KB of writes a draft to store something that never
  // changes. Written once, at creation, and never patched.
  //
  // `rounds[packNo - 1][seat]` indexes into `cards` rather than repeating them:
  // 24 boosters hold ~336 cards drawn from ~170 distinct ones, so whole cards
  // per booster would write each popular common a dozen times.
  //
  // `colorWinRates` rides along because scoring needs it on every pick, and it
  // lives on `setCards` -- so leaving it there would drag the whole 36KB
  // document back onto the path this table exists to clear. ~1KB copied per
  // draft, and a snapshot rather than a join is the more correct shape anyway:
  // these are the rates the draft was actually graded against, frozen the way
  // `reviewVerdicts` is, so a re-ingest cannot silently re-grade old picks.
  //
  // ONE ROW PER CARD WAS TRIED HERE AND IS 2.6x WORSE. Measured, not reasoned:
  // both shapes were written, and each read through the same transaction counter
  // to produce the identical EngineCard[].
  //
  //   packed column     13.8 KB, 1 document      82 B per card
  //   one row per card  35.4 KB, 172 documents  211 B per card
  //
  // A Convex row costs ~129 B before it holds anything -- `_id`,
  // `_creationTime`, `sessionId`, index entry -- and a card's engine half is
  // 82 B, so the bookkeeping is 1.6x the card. Over a draft that is 0.57 MB
  // against 1.45 MB, and creating one would insert 172 rows in place of this.
  //
  // The rule, which is NOT "arrays in columns are fine": normalise when readers
  // want a SUBSET, pack when every reader wants the whole thing. `setCardText`
  // and `setCardContext` above are row-per-card and are the two biggest wins in
  // this schema -- the coach wants 5 cards of 285 and scoring wants 14 -- and
  // they earned -94% each. This pool loses because nobody ever skips any of it:
  // dealing samples every pool and the bots score every card in every hand.
  draftPools: defineTable({
    sessionId: v.id("draftSessions"),
    cards: packedCards,
    rounds: v.array(v.array(v.array(v.number()))),
    colorWinRates: v.array(colorWinRate),
  }).index("by_session", ["sessionId"]),

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

  // What the statistics screen plots, written once when a draft finishes.
  //
  // `stats.overview` used to REPLAY every draft in the window to get its
  // per-pick scores -- a hundred sessions, each reading its set's pool and
  // context, 732KB a page view against a real history. It replayed to recompute
  // numbers that `draftPicks` already stored, and `draftPicks.ts` says plainly
  // that when the two disagree the stored rows win: a replay has no per-pack
  // context rows, so it grades on raw power and the player was shown these.
  // Reading the rows directly instead is both cheaper and the correct answer.
  //
  // Not the rows themselves, though. A draft's `draftPicks` are ~92KB, because
  // each carries the pack it saw and the pool before it -- a hundred drafts is
  // ~9MB. This is the ~1KB of it that a chart of averages actually plots.
  //
  // DELIBERATELY NOT A COPY OF `draftSessions.summary`. The overall score, the
  // accuracy and the colour pair are answered there already, and a second copy
  // here would be free to disagree with the first -- the same reason
  // `accessRequests` has no status field and there is no stored deck list. The
  // screen reads both, which costs one session row it was reading anyway.
  draftDigests: defineTable({
    sessionId: v.id("draftSessions"),
    picks: digestPicks,
    mistakes: v.array(digestMistake),
    // What this draft says about how its drafter picks, as the curvature of the
    // dial likelihood at the pod -- see core's `StoredDials`.
    //
    // OPTIONAL, AND FOR TWO REASONS THAT DO NOT EXPIRE TOGETHER. Every digest
    // written before this field existed has none, and a schema push validates
    // every stored document. And a draft on a pool with no pick order, or one
    // with no decision in it, legitimately produces nothing -- `dialsForDraft`
    // refuses rather than degrades, and absent is how that refusal is recorded.
    dials: v.optional(storedDials),
  }).index("by_session", ["sessionId"]),

  // One person daring another to draft the same packs, and the two drafts that
  // came of it.
  //
  // "Challenge" already means the counter-argument the commitment ceremony puts
  // to you before a pick lands (`draftPicks.defense.challengedName`). Two
  // meanings for one word is deliberate rather than accidental: this is the word
  // the feature is called by everywhere outside the code, and the ceremony's
  // sense never appears in the plural or as a table.
  //
  // THE ROW IS THE GRANT. Both sessions are named here, so "may I read this
  // draft" reduces to "am I one of the two people on a row that names it" --
  // which is why there is no share table and no ACL. The two gates are
  // `challengeInvite` and `challengeParty` in sessions.ts, and they are the only
  // exception to `ownedSession` in the app.
  //
  // THE _id IS THE LINK. A bearer capability, which is exactly what a link
  // sent out of band is, and `ctx.db.get` needs no index to honour one. There is
  // no separate token to rotate because there is nothing to rotate TO: revoking
  // is `revokedAt`, and a revoked row still answers, so the person holding the
  // link is told it was withdrawn rather than that it never existed.
  //
  // NO STATUS COLUMN. The state is the timestamps -- open, accepted, finished,
  // revoked -- for the same reason `accessRequests` has none: a status field is
  // a second answer to a question the data already answers, free to disagree
  // with it. "Accepted and then wandered off" is likewise derived, from
  // `acceptedAt` against the last `draftPicks` row of the accepted session,
  // rather than by teaching `draftSessions.status` a third literal that every
  // existing reader would have to learn.
  challenges: defineTable({
    // Both identity keys, for the reason the feedback table gives: the token
    // identifier is what `draftSessions.userId` matches, and the WorkOS subject
    // is what an email lookup and PostHog key on. Carrying one means choosing
    // which half of the app this row can reach.
    challengerUserId: v.string(),
    challengerSubject: v.string(),
    challengerSessionId: v.id("draftSessions"),
    // Copied rather than read off the challenger's session, because accepting
    // deals a NEW draft and these three are its arguments. A challenge is an
    // offer of a deal, and the offer should not change if the session it came
    // from is somehow edited later.
    setCode: v.string(),
    format: v.string(),
    seed: v.number(),
    // What the challenger typed. The backend can learn no name and no email --
    // identity carries `subject`, `role` and `org_id` and nothing else -- so if
    // the landing page is to say who this is from, the sender has to say so.
    // Unverified user text on a page and in a subject line: clamp it.
    fromName: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.string(),
    // Set together, once, when somebody takes the challenge up. `friendUserId`
    // is what makes a second acceptor impossible and what the party gate reads.
    friendUserId: v.optional(v.string()),
    friendSubject: v.optional(v.string()),
    friendSessionId: v.optional(v.id("draftSessions")),
    acceptedAt: v.optional(v.string()),
    // Written by draft.pick's completion branch, off `draftSessions.challengeId`
    // -- one get on a document already in hand, on the one pick in forty-two
    // that finishes a draft. Also the diff's gate: without it the challenger
    // could read their friend's picks while the friend was still making them.
    finishedAt: v.optional(v.string()),
    // Withdrawing the offer. Illegal once `acceptedAt` is set: by then the
    // friend has spent one of their three drafts for the day on it.
    revokedAt: v.optional(v.string()),
    // That the challenger has seen the finished diff, which is what the unread
    // badge counts. Qualified by side because both parties can open the diff and
    // a bare `seenAt` would not say whose eyes it means.
    challengerSeenAt: v.optional(v.string()),
  })
    .index("by_challenger", ["challengerUserId"])
    .index("by_friend", ["friendUserId"]),

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

  // Every answer the player has given to a question about a pick they had
  // already made, kept so that two of them can be set beside each other.
  //
  // WHY IT EXISTS. Three surfaces ask a question with a known right answer --
  // the review walkthrough's quiz, the misses drill, the archetype quiz -- and
  // until this table not one of them wrote the answer down. So the question
  // somebody actually opens this app with, am I getting better, had nothing
  // behind it at all: `stats.overview` was left averaging `overallScore` over
  // drafts of different sets, and its own comment concedes the problem, that a
  // standing cannot show a direction.
  //
  // A run of draft scores cannot be turned into one either. Each is a different
  // set, different packs and a different pod, and notes.md trap #3 is that most
  // of the gaps a pick is graded on are smaller than the error bars on the win
  // rates they came from. The drill is the one place that is not true: it deals
  // back a pack that was already dealt, out of a pool that was already drafted,
  // against an answer written down at the time. The same question asked twice
  // is the only comparison this app can draw with no set-to-set variance in it.
  //
  // ONE ROW PER ATTEMPT, and never patched. The second answer to a pick IS the
  // measurement, so a table keeping only the latest could say how someone is
  // doing and never how they are doing NOW against then.
  //
  // WHICH IS WHY THE ATTEMPT IS NAMED. A row cannot say on its own whether it
  // is a repeat or a retry: the two look identical, because the most ordinary
  // way to be asked a pack twice is to answer it the same way twice. The first
  // draft of this table inferred it from the card and got it exactly backwards
  // -- refusing a second row whenever it named the card the first one did,
  // which is every held answer there will ever be. `heldOn` could not be
  // reached, standing by a wrong call twice was dropped, and the fixed tier
  // re-dealt one pack ahead of its own tier forever because `at` never moved.
  //
  // So the client says which sitting an answer came from. One id per question
  // per run: a double-click collapses into one row, and the same pack a month
  // later is a different id and a different row, which is the event worth
  // counting.
  //
  // WHAT IS DELIBERATELY NOT HERE is the archetype quiz. Its question is a card
  // and two decks derived from a set's statistics: a different identity, with
  // no pick behind it and no history of the player's in it, so being asked
  // again corrects no error of theirs. Taking it would mean a second identity
  // shape on this row or a second table, and neither is worth guessing at
  // before the pick half has been played twice.
  pickAnswers: defineTable({
    // On the row rather than reached through the session, because the reader
    // this table exists for asks across every session at once. Joining for it
    // would be a ~2KB session read per answer to recover a string the caller
    // already had in hand.
    userId: v.string(),
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    asked: answerSurface,
    /** The card they took this time. */
    answered: v.string(),
    // Both of the pick's stored answers, copied off its own score at the moment
    // of the attempt -- and not a correctness flag, which is the call worth
    // explaining.
    //
    // The two surfaces grade by different rules and both rules are computable
    // from these two names, so storing a verdict would bake one of them into
    // rows that outlive it. It also keeps an old attempt honest: the score that
    // judged the pick is what the player was shown, and a re-ingest that moves
    // a win rate must not silently re-decide an answer somebody already gave.
    rawBestName: v.string(),
    contextBestName: v.string(),
    // The gap the pick was docked by, in win-rate points, off the same score.
    //
    // NOTHING READS IT YET, and it is here because it cannot be added later.
    // notes.md Ideas #9 defers the clean measure -- a question's FIRST answer
    // over time -- and names the bias it will carry: `rankMisses` deals the
    // widest gaps first, so the questions somebody meets for the first time get
    // narrower, and therefore harder, the longer they play. A trend that cannot
    // see the gap can only caveat that; one that can, corrects for it.
    //
    // Not recoverable after the fact at any sensible price. `stats.progress`
    // reads one index and no session, and recovering this would mean a digest
    // read per answer to fetch a number the writer had in its hand.
    gap: v.optional(v.number()),
    // Which sitting this answer came from. See the note above: it is the only
    // thing separating a retry from the same pack coming round again.
    attemptId: v.optional(v.string()),
    //
    // BOTH OPTIONAL, and neither is optional to a writer -- `pickAnswers.record`
    // requires them and every client sends them. Absence means one thing only:
    // a row written on 31 Aug 2026, in the day before either column existed.
    // The same distinction `pickedContextValue` keeps two files over, for the
    // same reason: a fabricated zero would be indistinguishable from a pick that
    // really was graded against itself, and there is no honest value to
    // backfill a gap with once the attempt is over.
    //
    // It reads correctly rather than merely tolerably. A legacy row's absent
    // `attemptId` can never equal an incoming one, so it never blocks a write --
    // which is right: those rows are history, and history is never a duplicate
    // of something being answered now.
    //
    // The alternative was requiring both and clearing the table, and that is
    // where this arrived from: a required column cannot be pushed while a row
    // without it exists, and the mutation that would delete the row ships in the
    // same push. Widening is not a concession here; it is the more truthful
    // schema.
    at: v.string(),
  })
    // One pick's answers, oldest first, which is the repeat itself.
    .index("by_user_and_pick", ["userId", "sessionId", "pickIndex"])
    // Every answer one surface has taken from one person, which is what the
    // misses drill folds into "have I been asked this, and did I fix it".
    //
    // A scan rather than a lookup per candidate, and the arithmetic is why: a
    // run considers up to DRILLS.draftWindow x DIGEST_MISTAKES candidates, so
    // asking by_user_and_pick about each would be 250 indexed reads to answer a
    // question about at most ten answers per run ever played. This grows with
    // runs played and nothing else. If it ever stops being small the fix is a
    // rollup and not a narrower index -- the fold genuinely wants every row,
    // because a pick fixed a year ago is still fixed.
    .index("by_user_and_asked", ["userId", "asked"]),

  // Every answer the two SET-BASED drills have taken from one person, keyed by
  // the card in the set rather than by a pick in a session.
  //
  // WHY IT IS NOT `pickAnswers`, which that table's own docblock predicted and
  // got half right. It said the archetype quiz was deliberately absent because
  // its question has "no pick behind it and no history of the player's in it",
  // and taking it would cost "a second identity shape on this row or a second
  // table". The identity argument holds and this is the second table. What did
  // not survive is the conclusion drawn from it -- that being asked again
  // "corrects no error of theirs" -- because a question with a stable right
  // answer is a retest whether or not the learner authored the original
  // mistake. Ideas #9 priced the table against ONE drill; there are two now
  // dealing the same shape, and the next set-based drill is free.
  //
  // AND IT IS NOT PRIMARILY A MEASUREMENT. Both banks are ranked
  // deterministically and both `deal` queries paged them with a `skip` the
  // client held for a sitting and reset on reload -- so a returning player was
  // dealt the identical opening eight of a set, forever. This is what the deal
  // reads to move forward. See `history.ts` in core.
  //
  // ONE INDEX, THREE READERS, and that is the whole reason the columns are in
  // this order. The mutation's duplicate check takes the full key; `deal` takes
  // `(userId, drill, setCode, format)` and gets one set's answers, bounded by
  // that set's own bank at a few hundred rows on a query already reading 270KB
  // of statistics; `drills.progress` takes `(userId, drill)` and gets the lot.
  // A second index would be a second thing to keep in step for no read it
  // cannot already serve.
  //
  // RAW ROWS AND NO ROLLUP, which is deferred trade-off #2's call for `llmUsage`
  // with a number attached. Convex caps a transaction at 32,000 documents
  // scanned, so at eight questions a sitting the whole-history read has about
  // four thousand sittings in it before anything has to change -- and the read
  // on the hot path is bounded by a set's bank whatever the history does. When
  // it does bind, the fix is a rollup, not a narrower index.
  drillAnswers: defineTable({
    // On the row rather than reached through anything, because both readers ask
    // across every set at once and there is nothing to join to.
    userId: v.string(),
    drill: setDrillId,
    setCode: v.string(),
    format: v.string(),
    /** The card, through `normalizeName`, so a DFC's halves cannot miss each other. */
    key: v.string(),
    /** What they said: a deck's colors, `same`, or one of three speed buckets. */
    answered: v.string(),
    // What the data said, at the moment they were asked -- and not a
    // correctness flag, which is the same call `pickAnswers` makes and for a
    // sharper reason here. Both drills' answers come out of `setStats`, which a
    // re-seed moves: `separated` and `wants` can flip when 17Lands data is
    // refreshed, and so can a card's residual in turns. A stored verdict would
    // let that re-seed silently re-decide an answer somebody already gave, and
    // `answerRead` recomputes the same rule from these two strings anyway.
    //
    // It also makes the flat answer legible from the row alone. `same` and
    // `middle` both mean "the data has no opinion here", which is the pair of
    // questions worth being able to read apart from the rest without joining
    // back to a set's statistics to find out.
    correct: v.string(),
    // How many error bars the question was worth. Signed in the deck-speed
    // drill. Kept as the raw measurement a reveal already prints, and NOT as the
    // difficulty -- see `margin` below for why it cannot be one.
    sigmas: v.number(),
    // How far past its own gate the question sat, as a multiple of that gate.
    //
    // WRITTEN NOW OR GONE, exactly as `gap` is on `pickAnswers` -- and `sigmas`
    // alone was the wrong number to write, which is the finding that put this
    // here. Neither drill judges a question by error bars alone. The archetype
    // quiz's bar moves with how many decks a card was measured in (2.34 at
    // three, 3.16 at ten), so at 2.5 error bars a card in three decks HAS an
    // answer and a card in ten does not; deck speed needs a residual floor
    // against the set's own spread as well as a z test, so a five-sigma card can
    // still be `middle`. Two rows with the same `sigmas` can therefore be
    // opposite questions.
    //
    // Neither the deck count nor the set's spread is on this row, and putting
    // them here would store two shapes for one idea. `margin` is the ratio each
    // drill computed at deal time with both in hand: 1.0 is exactly on the gate
    // whatever k is, and under 1.0 is a question the data has no answer to.
    //
    // NOTHING READS IT. It is stored because it cannot be recovered -- neither
    // the deck count nor the set's spread is on this row -- and because it is a
    // real ordering WITHIN one drill. It is not one across both: the archetype
    // quiz's has no effect-size leg and deck speed's is bound by one 56% of the
    // time, and a readout that banded them on one axis was deleted for it.
    // `DrillAnswerRow.margin` in core's history.ts carries the argument.
    //
    // Optional because rows written on 7 Sep 2026, before it existed, have none.
    // There is no honest value to backfill, for the same reason `gap` has none.
    margin: v.optional(v.number()),
    // Which sitting this answer came from, minted by the client: one id per
    // question per run. The same contract `pickAnswers` explains at length -- a
    // row cannot work out for itself whether a second answer is a retry or the
    // same question coming round again, and inferring it from the card gets it
    // backwards.
    attemptId: v.string(),
    at: v.string(),
  }).index("by_user_drill_set_and_key", ["userId", "drill", "setCode", "format", "key"]),

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

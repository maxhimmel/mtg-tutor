import { ConvexError, v } from "convex/values";
import {
  type DraftEngine,
  REVIEW,
  applyBench,
  buildDeck,
  buildPickContext,
  clampReason,
  compareDecks,
  deckColors,
  isDecisionPick,
  isLandCount,
  newSeed,
  normalizeBench,
  normalizeName,
  packScoringContext,
  pivots,
  splitPool,
  suggestDeck,
  summarizeDraft,
} from "@mtg-tutor/core";
import { internalQuery, mutation, query } from "./_generated/server.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  challengeFinished,
  deckBuilt,
  draftCompleted,
  draftDeleted,
  draftStarted,
} from "./analytics.js";
import { internal } from "./_generated/api.js";
import { enforce } from "./quota.js";
import { requireCaller } from "./roles.js";
import type { Caller } from "./roles.js";
import {
  loadBoard,
  ownSessions,
  ownedSession,
  requireUserId,
  setCardsFor,
  setDocFor,
} from "./sessions.js";
import { copyDeal, storeDeal } from "./draftPools.js";
import { storeDigest } from "./draftDigests.js";
import { toSetData } from "./setData.js";
import { cardContextFor, cardTextFor } from "./cardText.js";
import { hydrate, hydrateCard } from "@mtg-tutor/core";
import type { StoredPod } from "@mtg-tutor/core";
import {
  recordPick,
  storedPick,
  storedPicks,
  storedPool,
  storedScores,
  toRecordedPick,
} from "./draftPicks.js";
import { pickDefenseInput } from "./validators.js";

// The board in the engine's half of a card: names, colours, rarity and the
// numbers a score is made of.
//
// The rules text and art are NOT put back on here, and that is the point. This
// is the response a client gets 42 times a draft, and the text half of a set is
// ~180KB that does not change between picks -- so the client reads it once for
// the session and joins by name, rather than being sent it again on every pick.
// See sets.cardText and the hydration in DraftBoard.
const boardView = (engine: DraftEngine) => ({
  packNo: engine.packNo,
  pickNo: engine.pickNo,
  complete: engine.isComplete(),
  totalPicks: engine.totalPicks(),
  pack: engine.isComplete() ? [] : engine.currentPack,
  pool: engine.humanPool,
});

/**
 * Opening a draft, without deciding who asked for one.
 *
 * Split out because a draft can now be started by something other than a player
 * pressing the button -- taking up a friend's challenge deals the same way,
 * against a pinned seed -- and the ORDER below is the part that must not be
 * copied. Each of the three steps is placed against the other two, and a second
 * hand-written copy of the sequence would be free to get that subtly wrong
 * while still passing every test.
 */
export async function startSession(
  ctx: MutationCtx,
  caller: Caller,
  args: {
    setCode: string;
    format?: string;
    seed?: number;
    challengeId?: Id<"challenges">;
    pod?: StoredPod;
    /**
     * Take this session's boosters instead of dealing fresh ones.
     *
     * How a challenge is kept honest. Re-dealing from the shared seed is only
     * the same packs for as long as the set has not been re-ingested, which is
     * why `accept` used to replay the challenger's draft to check. Inheriting
     * the row makes "the same packs" true by construction instead of checked.
     */
    dealFrom?: Id<"draftSessions">;
  },
): Promise<Id<"draftSessions">> {
  const setCode = args.setCode.toLowerCase();
  const format = args.format ?? "PremierDraft";

  // Before the quota, so a set code that does not exist reports itself as a
  // bad set code rather than as a day's allowance spent on nothing.
  const setDoc = await setDocFor(ctx, setCode, format);

  // And after it, so anything that throws below rolls the token back with the
  // transaction -- which is the reason this is a component and not a counter.
  await enforce(ctx, "drafts", caller);

  // Coerced the same way mulberry32 reads it, so a caller cannot pin a seed
  // that behaves differently from one newSeed would have produced.
  const seed = args.seed === undefined ? newSeed() : args.seed >>> 0;

  const sessionId = await ctx.db.insert("draftSessions", {
    userId: caller.userId,
    setCode,
    format,
    seed,
    pickedNames: [],
    status: "active" as const,
    createdAt: new Date().toISOString(),
    // Set only when this draft answers a challenge. What `pick` reads on the
    // last pick of the draft to know whether anyone is waiting to be told.
    challengeId: args.challengeId,
    // Written once, at creation, and never patched: it decides the deal, so a
    // draft that changed pod halfway would stop replaying. Omitted rather than
    // defaulted to a literal, because absent is what the legacy pod IS.
    pod: args.pod,
  });

  // The one read of the set's card pool in a draft's whole life. Every pick from
  // here on reads the boosters this deals instead -- ~12KB against the pool's
  // ~36KB, and 42 times over. It is also what makes the draft independent of the
  // set from now on: re-ingesting cannot reach a draft that carries its packs.
  //
  // After the insert, because the pool row names the session.
  if (args.dealFrom) {
    await copyDeal(ctx, args.dealFrom, sessionId);
  } else {
    await storeDeal(ctx, sessionId, toSetData(await setCardsFor(ctx, setDoc)), seed);
  }

  // After the insert and after the quota, so nothing is reported that did not
  // happen -- a capture above `enforce` would be rolled back with the refusal
  // anyway, which is the trap analytics.ts is written around.
  //
  // `pod` rides the existing event rather than minting one. Started-against-
  // completed split by pod is the whole question -- whether a sharper table
  // drives people out of drafts -- and it is free once the property is here.
  await draftStarted(ctx, caller, { sessionId, setCode, format, pod: args.pod ?? "legacy" });

  return sessionId;
}

export const start = mutation({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    /**
     * Pins the deal. A draft is {seed, pickedNames} replayed, so fixing the seed
     * and the picks fixes every prompt the run sends -- which is what lets the
     * token benchmark compare two runs as a paired measurement instead of two
     * samples of different drafts. Normal play omits it and gets a fresh deal.
     */
    seed: v.optional(v.number()),
    /**
     * Which table to draft against. Omitted means the original bots, which is
     * what every draft taken before pods existed was dealt by -- see
     * `draftSessions.pod`. It cannot be changed once the draft starts, because
     * it decides what wheels.
     */
    // Only the pods a person may CHOOSE. The schema's union is wider on purpose
    // -- it has to accept the superseded ones a challenge copies forward -- and
    // this is the narrower question: what may a new draft be started as.
    pod: v.optional(v.union(v.literal("table2"), v.literal("sharks2"))),
  },
  handler: async (ctx, args) => {
    return await startSession(ctx, await requireCaller(ctx), args);
  },
});

export const state = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine, setDoc, colorWinRates } = await loadBoard(ctx, args.sessionId);
    return {
      sessionId: session._id,
      setCode: session.setCode,
      // The board already holds the set document to replay the draft, so
      // naming and badging the set costs nothing extra here.
      setName: setDoc.name,
      setIcon: setDoc.iconUri,
      format: session.format,
      status: session.status,
      summary: session.summary,
      sideboard: normalizeBench(session.sideboard ?? []),
      // The set's archetype table, sent once for the session. ~30 rows under a
      // kilobyte, and the board has the document open already -- so this costs
      // nothing here and saves the client a read of the 46KB pool on every pick.
      //
      // It is what lets the CHALLENGE be computed in the browser: ranking a pack
      // by contextValue needs this plus the pack's context rows, and the pack is
      // already there. Same principle as sending the set's card text once and
      // joining by name.
      colorWinRates: colorWinRates,
      ...boardView(engine),
    };
  },
});

/**
 * The drafts you walked away from.
 *
 * The other half of `review.list`, which answers for finished drafts only --
 * there is nothing to review about one still being played. Nothing answered for
 * this half at all. `draft.state` has always rebuilt a board from any session
 * id, so resuming worked from the day drafts were stored; what was missing was
 * anywhere to LEARN that an unfinished draft existed. Close the tab and the URL
 * was the only way back into it.
 *
 * IT REPLAYS NOTHING, which is what decides its shape. Rebuilding a board costs
 * that draft's own ~14KB pool row, and this is a list of every draft you have
 * open, on the screen the app opens on. So a row carries what the session
 * document already says and not one field more.
 *
 * Which is also why a row says "17 picks in" rather than "pick 17 of 42". How
 * many picks a draft has is how big its packs were, and that is in the pool row
 * this list exists not to read -- so the denominator would cost the whole
 * saving, to qualify a number a drafter can already read.
 */
export const unfinished = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const active = (await ownSessions(ctx, args.limit ?? 25)).filter(
      (s) => s.status === "active",
    );
    if (active.length === 0) return [];

    // Which of these a friend is on the other side of, so a row can say up
    // front that it cannot be thrown away instead of offering a button that
    // refuses. `discard` says why a challenged draft is kept.
    //
    // Only the challenger's side needs looking up: the friend's session names
    // its challenge on its own face, and the challenger's is named BY the
    // challenge, so this index is the only thing that can answer for it. The
    // caller's own challenges, at ~600 bytes a row, and read only once there is
    // something on the page it could be about.
    const issued = await ctx.db
      .query("challenges")
      .withIndex("by_challenger", (q) => q.eq("challengerUserId", userId))
      .collect();
    const promised = new Set<string>(issued.map((c) => c.challengerSessionId));

    return active.map((s) => ({
      id: s._id,
      setCode: s.setCode,
      format: s.format,
      createdAt: s.createdAt,
      picks: s.pickedNames.length,
      // Whether a challenge names this draft, and so whether it may be deleted.
      promised: s.challengeId != null || promised.has(s._id),
    }));
  },
});

/**
 * Throw a draft away, and everything written about it.
 *
 * Manual and per-draft on purpose. There is no cron, no retention window and no
 * auto-clear of stale sessions: an abandoned draft costs its owner nothing to
 * keep, and the one thing worse than a list cluttered with drafts you meant to
 * finish is a list that quietly finished the decision for you.
 *
 * The tables and their order are `reset.wipeDrafts`'s, narrowed to one session
 * -- rows that point at the session go before the session does, so a failure
 * part-way through leaves nothing pointing at something that is not there.
 *
 * `llmUsage` is deliberately kept, for the reason the wipe keeps it: a row there
 * records that this deployment's key was spent, which stays true after the draft
 * it was spent on is gone. It is also what `bench-report` reads. `feedback` is
 * kept for the same reason -- a note records what somebody experienced, and the
 * draft going away does not make it untrue.
 */
export const discard = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);
    const userId = await requireUserId(ctx);
    const id = args.sessionId;

    // A challenge NAMES both drafts, and that row is the whole grant -- it is
    // what lets two people read each other's picks, with no share table behind
    // it. Deleting a session it points at would leave the other person holding a
    // link to nothing.
    //
    // Refused rather than cascaded. Withdrawing a promise somebody has already
    // taken up is not what pressing delete on your own draft asks for, and there
    // is already a way to withdraw one that has not been (`challenges.revoke`).
    // Checked here as well as marked in `unfinished` above, because what a
    // client draws is not what makes this true.
    const issued = await ctx.db
      .query("challenges")
      .withIndex("by_challenger", (q) => q.eq("challengerUserId", userId))
      .collect();

    if (session.challengeId || issued.some((c) => c.challengerSessionId === id)) {
      throw new ConvexError(
        "This draft is part of a challenge with a friend, so it cannot be deleted.",
      );
    }

    for (const row of await ctx.db
      .query("draftPools")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftDigests")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftPicks")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("reviewFrames")
      .withIndex("by_session_and_phase", (q) => q.eq("sessionId", id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(id);

    // After every delete, never before: a capture scheduled ahead of the writes
    // is rolled back by anything that throws below it, and would otherwise be
    // the one report of a draft that is still there.
    await draftDeleted(ctx, {
      sessionId: id,
      setCode: session.setCode,
      format: session.format,
      status: session.status,
      picks: session.pickedNames.length,
      ms: Date.now() - Date.parse(session.createdAt),
    });
  },
});

// Set a pick aside, or take it back. Positions in the pool, not names -- see the
// field's note in schema.ts. What that does to the bench is `applyBench`, which
// both clients also use to predict this answer before it arrives.
export const bench = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    benched: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);

    if (!Number.isInteger(args.pickIndex) || args.pickIndex < 0) {
      throw new ConvexError(`${args.pickIndex} is not a pick.`);
    }
    if (args.pickIndex >= session.pickedNames.length) {
      throw new ConvexError(
        `This draft has ${session.pickedNames.length} picks; there is nothing at ${args.pickIndex}.`,
      );
    }

    const sideboard = applyBench(
      normalizeBench(session.sideboard ?? []),
      args.pickIndex,
      args.benched,
      session.pickedNames.length,
    );

    await ctx.db.patch(args.sessionId, { sideboard });
    return sideboard;
  },
});

export const pick = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    cardName: v.string(),
    /**
     * Take the card, but not to play it. Folded into this mutation rather than
     * left to a follow-up `bench` call for two reasons: that call stamps
     * `atPick` with the pick count it finds, which after this one has landed is
     * one past the card's own position, and it would re-read and re-write the
     * whole session document to append one entry. Set aside here, `atPick`
     * equals `pos` -- the strongest statement the shape can make, and the one
     * the field was designed to hold.
     */
    bench: v.optional(v.boolean()),
    /**
     * What the player committed to before this pick was graded. Optional, and
     * the mutation behaves identically without it -- the challenge is a client
     * flow, and the pick is the pick either way. Recorded rather than acted on:
     * nothing on this path reads it, and the coach does.
     *
     * Carries the card first proposed; whether they SWITCHED is derived from it
     * against the card actually taken, so the stored row cannot claim a change
     * of mind that did not happen.
     */
    defense: v.optional(pickDefenseInput),
  },
  handler: async (ctx, args) => {
    const { session, engine, colorWinRates } = await loadBoard(ctx, args.sessionId);

    if (engine.isComplete()) {
      throw new Error("This draft is already finished.");
    }

    const chosen = engine.currentPack.find((c) => c.name === args.cardName);
    if (!chosen) {
      throw new Error(
        `"${args.cardName}" is not in pack ${engine.packNo} pick ${engine.pickNo}.`,
      );
    }

    // Captured before the pick, because humanPick appends to the pool it is
    // about to be compared against.
    const poolBefore = engine.humanPool.map((c) => ({ name: c.name, colors: c.colors }));

    // What the deck is, as the player has defined it: the pool minus whatever
    // they have set aside. Scoring a pick against cards they have said they are
    // not playing is what this whole line of work exists to stop.
    const bench = normalizeBench(session.sideboard ?? []);
    const maindeck = splitPool(
      engine.humanPool,
      bench,
      session.pickedNames.length,
    ).maindeck;

    // The pack's context rows and no more -- fourteen of them, against the ~50KB
    // the set's would cost on a document already read once per pick.
    const context = await cardContextFor(
      ctx,
      session.setCode,
      session.format,
      engine.currentPack.map((c) => c.name),
    );

    // Built by the shared helper, not inline: the browser ranks this same pack
    // to name the card it argues the pick against, and the two must agree about
    // what "best for this deck" means or the challenge and the grade are about
    // different questions.
    const record = engine.humanPick(
      chosen,
      packScoringContext(
        maindeck,
        session.pickedNames.length,
        engine.totalPicks(),
        colorWinRates,
        (c) => context.get(normalizeName(c.name)),
      ),
    );
    const complete = engine.isComplete();
    const pickIndex = session.pickedNames.length;

    const sideboard = args.bench ? applyBench(bench, pickIndex, true, pickIndex) : bench;

    // Settled here rather than taken as given: `switched` is a fact about this
    // mutation's own argument list, and the one place that can state it without
    // being able to be wrong.
    const defense = args.defense && {
      // Clamped here, not trusted from the client: this string is pasted into
      // the coach prompt on every decision pick, so its length is a token bill
      // and the mutation is the only place that can actually cap it.
      reason: clampReason(args.defense.reason),
      confidence: args.defense.confidence,
      ...(args.defense.challengedName === undefined
        ? {}
        : { challengedName: args.defense.challengedName }),
      switched: args.defense.proposedName !== chosen.name,
    };

    // What this pick saw, written as it happens. Nothing recomputes it: the
    // coach and the review verdict read this instead of replaying the draft to
    // rebuild one pick out of the set's whole card pool.
    await recordPick(ctx, args.sessionId, pickIndex, record, poolBefore, defense);

    // Read ONCE on the last pick, and shared by the two things that want them:
    // the summary wants every score, the digest wants those and the misses. A
    // draft's pick rows are ~92KB, because each carries the pack it saw -- so
    // collecting them twice here would cost more than the digest saves on the
    // statistics screen it was added for.
    const storedRows = complete ? await storedPicks(ctx, args.sessionId) : [];

    await ctx.db.patch(args.sessionId, {
      pickedNames: [...session.pickedNames, chosen.name],
      ...(args.bench ? { sideboard } : {}),
      ...(complete
        ? {
            status: "complete" as const,
            completedAt: new Date().toISOString(),
            // From the stored scores, not the replayed history: this pick and
            // every one before it was scored against its pack's context, and a
            // replay has none. Maindeck for the colour pair, so it names the
            // deck rather than the pile.
            //
            // The colours here are provisional -- the deck builder is still to
            // come, and cutting a card changes them. `build` recomputes them
            // when the forty is locked in; see `refreshedColors`.
            summary: summarizeDraft(
              storedRows.map((r) => r.score),
              maindeck,
            ),
          }
        : {}),
    });

    if (complete) {
      // What the statistics screen plots, off the rows this pick just finished
      // writing. After the patch, so a draft is never digested as complete
      // before it is recorded as complete -- and inside the transaction, so a
      // throw below takes both back together.
      await storeDigest(ctx, args.sessionId, storedRows);

      await draftCompleted(ctx, {
        sessionId: args.sessionId,
        setCode: session.setCode,
        format: session.format,
        picks: session.pickedNames.length + 1,
        // From the stored createdAt rather than anything a tab remembers, so a
        // draft resumed the next morning is not reported as a long sitting.
        ms: Date.now() - Date.parse(session.createdAt),
        pod: session.pod ?? "legacy",
      });

      // Somebody may be waiting to hear about this one.
      //
      // Off `session.challengeId`, so this is a get on a document already in
      // hand rather than an index lookup, and only on the one pick in
      // forty-two that finishes a draft. After the patch and after the
      // analytics: the capture is the thing that must survive, and a scheduled
      // send here has exactly the rollback semantics posthog.capture does --
      // it is inside this transaction, so a throw below would unschedule it.
      //
      // Guarded rather than asserted. A dangling or already-finished
      // challengeId must never be able to fail somebody's forty-second pick,
      // which is the same rule analytics lives under and matters more here,
      // because ctx.db can throw where a no-op capture cannot.
      if (session.challengeId) {
        const challenge = await ctx.db.get(session.challengeId);
        if (challenge && !challenge.finishedAt) {
          const finishedAt = new Date().toISOString();
          await ctx.db.patch(challenge._id, { finishedAt });
          await challengeFinished(ctx, {
            challengeId: challenge._id,
            setCode: session.setCode,
            format: session.format,
            ms: Date.now() - Date.parse(session.createdAt),
          });
          await ctx.scheduler.runAfter(0, internal.challenges.notifyChallenger, {
            challengeId: challenge._id,
          });
        }
      }
    }

    return {
      score: record.score,
      signal: record.signal,
      pickIndex,
      // Returned every time, not only when it changed, so a client never has to
      // reconstruct what it just asked for. Forty-five entries of two numbers is
      // nothing beside the pack and pool this response already carries.
      sideboard,
      ...boardView(engine),
    };
  },
});

/**
 * The summary's colours, recomputed against the deck as it now stands.
 *
 * `draft.pick` writes the summary from the maindeck as it stood when the last
 * pick landed, and the player then spends the deck builder cutting cards --
 * `draft.bench` has no status guard because that IS the deck builder. So the
 * stored colours could name a colour you cut: splash white, cut the splash, and
 * the drafts picker still showed a white pip.
 *
 * Only the colours. `overallScore`, `accuracy` and `pickCount` are about picks,
 * and setting a card aside does not change a pick.
 *
 * Here rather than in `bench` because this is where the deck actually freezes --
 * neither client offers a way back into the builder once the forty is locked in
 * -- and doing it per card moved would put a read on a path that is currently one
 * patch. A draft abandoned mid-build keeps the colours it finished with, which is
 * an honest label for a deck nobody finished.
 *
 * Returns nothing to patch when the pool cannot be rebuilt (a session from before
 * `draftPicks`) or when there is no summary to correct (one from before the
 * summary was denormalised -- `review.backfillSummary` is what fills those in).
 */
async function refreshedColors(
  ctx: QueryCtx,
  session: Doc<"draftSessions">,
): Promise<{ summary?: Doc<"draftSessions">["summary"] }> {
  const pool = await storedPool(ctx, session._id, session.pickedNames.length);
  if (!pool || !session.summary) return {};

  const bench = normalizeBench(session.sideboard ?? []);
  const { maindeck } = splitPool(pool, bench, session.pickedNames.length);
  return { summary: { ...session.summary, colorPair: deckColors(maindeck) } };
}

// Lock in the 40. Only the land count: the cards are `sideboard`, which the
// player has been editing since pick one and goes on editing here.
//
// The "does it add to 40" check is deliberately NOT here. Counting the deck
// needs type lines to tell a drafted basic from a spell, which is a second
// table this mutation has no other reason to read -- and `results` recomputes
// the real total from hydrated cards anyway, so a check here would be a
// duplicate free to disagree with the one the player actually sees.
export const build = mutation({
  args: { sessionId: v.id("draftSessions"), basicLands: v.number() },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);

    if (session.status !== "complete") {
      throw new ConvexError("Finish the draft before building the deck.");
    }
    if (!isLandCount(args.basicLands)) {
      throw new ConvexError(`${args.basicLands} is not a number of lands.`);
    }

    const build = { basicLands: args.basicLands, builtAt: new Date().toISOString() };
    await ctx.db.patch(args.sessionId, {
      build,
      ...(await refreshedColors(ctx, session)),
    });

    await deckBuilt(ctx, {
      sessionId: args.sessionId,
      setCode: session.setCode,
      format: session.format,
      basicLands: args.basicLands,
    });

    return build;
  },
});

// The end-of-draft readout: the pool as the player left it, and -- once they
// have built their own 40 out of it -- the suggested deck, the diff and the
// picks that cost the most.
export const results = query({
  args: { sessionId: v.id("draftSessions"), mistakeLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { session, engine, setDoc, colorWinRates } = await loadBoard(ctx, args.sessionId);
    // Once per finished draft, for the pool the deck is built from and the few
    // cards the mistakes name -- not the whole set.
    const text = await cardTextFor(
      ctx,
      session.setCode,
      session.format,
      engine.history.flatMap((h) => [h.picked.name, h.score.contextBest.name]),
    );

    // The gap the score is actually made of, not a raw GIH delta. They used to
    // disagree -- a pick could be ranked the worst mistake while scoring better
    // than one ranked below it -- and the old guard silently dropped every
    // mistake involving a card 17Lands had no data for.
    //
    // And only DECISION picks. The last few cards of a pack are what is left
    // rather than what was chosen -- taking a land off the dregs to signal, or
    // because there was nothing else, is not a miss. The review quiz and the
    // misses drill already step past exactly these; this is the same threshold.
    const mistakes = engine.history
      .filter((h) => !h.score.isBest && isDecisionPick(h.pack.length, REVIEW.decisionPickMinCards))
      .map((h) => ({
        packNo: h.packNo,
        pickNo: h.pickNo,
        picked: hydrateCard(h.picked, text),
        // The card the grade was measured against. Naming the raw best here
        // while filtering on the contextual one listed picks as missing a card
        // they had actually taken.
        best: hydrateCard(h.score.contextBest, text),
        cost: h.score.contextBestValue - h.score.pickedContextValue,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, args.mistakeLimit ?? 5);

    // The deck builder reads type lines and colour identity to tell a land from
    // a spell and a splash from a lane, so both sides want whole cards.
    const bench = normalizeBench(session.sideboard ?? []);
    const { maindeck } = splitPool(engine.humanPool, bench, session.pickedNames.length);
    const drafted = hydrate(engine.humanPool, text);
    const playing = hydrate(maindeck, text);

    // Handing over the answer before the exercise is what the build step exists
    // to stop, so the suggestion and the diff are not on the wire until the
    // player has committed to a 40 of their own. The score and the missed picks
    // are, because those are about the picks -- they were settled during the
    // draft and nothing in the build can change them.
    const built = session.build
      ? buildDeck(playing, session.build.basicLands)
      : undefined;
    // Forty-five cards, not the forty the player kept. The suggestion used to
    // read the maindeck, on the reasoning that building out of cards somebody
    // has said they are not playing overrules them -- but the two decks are then
    // drawn from the same pile, and a builder asked for the best 23 spells out
    // of the 23 you already chose can only ever hand them back. The comparison
    // agreed with itself by construction and every deck scored near-perfect.
    //
    // Overruling is the whole point of a second opinion: the interesting line on
    // that screen is the card you cut that it would have played. The player's 40
    // is still theirs -- `built` and `colorPair` both read the maindeck, so the
    // deck is named by what they kept -- and the suggestion stays labelled an
    // argument rather than an answer.
    //
    // The archetype table is what lets it consider three colours at all: it is
    // the only thing that says what the third one costs here.
    const suggested = built
      ? suggestDeck(drafted, { archetypes: colorWinRates })
      : undefined;

    return {
      summary: summarizeDraft(await storedScores(ctx, args.sessionId), maindeck),
      // The pool in pick order and the positions set aside, rather than two
      // ready-made lists -- the same pair `draft.state` hands the draft screen,
      // and for the same reason: benching is keyed on position, so a split that
      // has thrown the positions away is a deck nobody can edit.
      pool: drafted,
      sideboard: bench,
      build: session.build ?? null,
      deck: suggested ?? null,
      diff: built && suggested ? compareDecks(built, suggested) : null,
      mistakes,
      status: session.status,
      // Free -- the session is already read -- and what lets the results screen
      // anchor a note to the draft it is showing without a second query.
      setCode: session.setCode,
      format: session.format,
      // Without 17Lands data every card scores off its rarity baseline, so a
      // pick can rarely be "wrong" and the score is close to meaningless.
      // Surfaced so the UI can say that rather than imply a perfect draft.
      ratedCardCount: setDoc.ratedCardCount,
    };
  },
});

// The grounded prompt for one pick, read from what that pick recorded. Internal:
// it exists only so the coach HTTP action can fetch what it needs in a single
// transaction.
export const coachContext = internalQuery({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    // No replay. The pick recorded what it saw; this reads that row and the
    // text for the cards in it, which is a few KB against the ~50KB a rebuilt
    // board costs.
    const session = await ownedSession(ctx, args.sessionId);
    const row = await storedPick(ctx, args.sessionId, args.pickIndex);
    if (!row) {
      throw new Error(
        `Session has ${session.pickedNames.length} picks; no stored pick at index ${args.pickIndex}.`,
      );
    }

    const text = await cardTextFor(
      ctx,
      session.setCode,
      session.format,
      row.pack.map((c) => c.name),
    );
    const record = toRecordedPick(row, text);

    // The sideboard as it stood at THIS pick, not as it stands now. Deciding at
    // pick 40 that something is unplayable says nothing about the deck being
    // built at pick 5, so a later bench must not rewrite an earlier pick's
    // context -- and a card set aside as it was picked must never count.
    const bench = normalizeBench(session.sideboard ?? []);
    const { maindeck, sideboard } = splitPool(row.poolBefore, bench, args.pickIndex);

    return {
      // The pool as it stood BEFORE this pick: the prompt shows it with the pick
      // added back, and judges the pick's colors against it without.
      // The defense rides along on the same row, so putting the player's own
      // words in front of the coach costs no read at all.
      userContent: buildPickContext(
        record,
        maindeck,
        sideboard,
        pivots(row.poolBefore, bench, args.pickIndex),
        row.defense,
      ),
      setCode: session.setCode,
      packNo: row.packNo,
      pickNo: row.pickNo,
      // How many cards this pick chose between, so /coach can refuse to spend
      // tokens on a pack that was picking for you.
      cardsInPack: row.pack.length,
    };
  },
});


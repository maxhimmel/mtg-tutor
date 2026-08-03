import { ConvexError, v } from "convex/values";
import {
  type DraftEngine,
  buildPickContext,
  newSeed,
  normalizeBench,
  pivots,
  splitPool,
  suggestDeck,
  summarizeDraft,
} from "@mtg-tutor/core";
import { internalQuery, mutation, query } from "./_generated/server.js";
import { loadBoard, ownedSession, requireUserId, setDocFor } from "./sessions.js";
import { cardTextFor } from "./cardText.js";
import { hydrate, hydrateCard } from "@mtg-tutor/core";
import { recordPick, storedPick, toRecordedPick } from "./draftPicks.js";

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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    await setDocFor(ctx, setCode, format);

    return await ctx.db.insert("draftSessions", {
      userId,
      setCode,
      format,
      // Coerced the same way mulberry32 reads it, so a caller cannot pin a seed
      // that behaves differently from one newSeed would have produced.
      seed: args.seed === undefined ? newSeed() : args.seed >>> 0,
      pickedNames: [],
      status: "active" as const,
      createdAt: new Date().toISOString(),
    });
  },
});

export const state = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine, setDoc } = await loadBoard(ctx, args.sessionId);
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
      ...boardView(engine),
    };
  },
});

// Set a pick aside, or take it back. Positions in the pool, not names -- see the
// field's note in schema.ts.
//
// Idempotent in both directions rather than a toggle: the client already knows
// which state it is asking for, and a toggle would flip twice on a double-click
// and land back where it started.
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

    const current = normalizeBench(session.sideboard ?? []);
    const already = current.find((b) => b.pos === args.pickIndex);

    // Re-benching something already benched keeps its original clock. The
    // mutation is idempotent, so a repeated call must not walk `atPick` forward
    // and quietly turn a pick-5 decision into a pick-30 one.
    if (args.benched && already) return current;

    const without = current.filter((b) => b.pos !== args.pickIndex);
    const sideboard = args.benched
      ? [...without, { pos: args.pickIndex, atPick: session.pickedNames.length }].sort(
          (a, b) => a.pos - b.pos,
        )
      : without;

    await ctx.db.patch(args.sessionId, { sideboard });
    return sideboard;
  },
});

export const pick = mutation({
  args: { sessionId: v.id("draftSessions"), cardName: v.string() },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);

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
    const record = engine.humanPick(chosen);
    const complete = engine.isComplete();

    // What this pick saw, written as it happens. Nothing recomputes it: the
    // coach and the review verdict read this instead of replaying the draft to
    // rebuild one pick out of the set's whole card pool.
    await recordPick(ctx, args.sessionId, session.pickedNames.length, record, poolBefore);

    await ctx.db.patch(args.sessionId, {
      pickedNames: [...session.pickedNames, chosen.name],
      ...(complete
        ? {
            status: "complete" as const,
            completedAt: new Date().toISOString(),
            // Maindeck, so the stored pair names the deck rather than the pile,
            // and agrees with what `results` computes live.
            summary: summarizeDraft(
              engine.history,
              splitPool(
                engine.humanPool,
                normalizeBench(session.sideboard ?? []),
                session.pickedNames.length,
              ).maindeck,
            ),
          }
        : {}),
    });

    return {
      score: record.score,
      signal: record.signal,
      pickIndex: session.pickedNames.length,
      ...boardView(engine),
    };
  },
});

// The end-of-draft readout: suggested deck plus the picks that cost the most.
export const results = query({
  args: { sessionId: v.id("draftSessions"), mistakeLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { session, engine, setDoc } = await loadBoard(ctx, args.sessionId);
    // Once per finished draft, for the pool the deck is built from and the few
    // cards the mistakes name -- not the whole set.
    const text = await cardTextFor(
      ctx,
      session.setCode,
      session.format,
      engine.history.flatMap((h) => [h.picked.name, h.score.best.name]),
    );

    // The gap the score is actually made of, not a raw GIH delta. They used to
    // disagree -- a pick could be ranked the worst mistake while scoring better
    // than one ranked below it -- and the old guard silently dropped every
    // mistake involving a card 17Lands had no data for.
    const mistakes = engine.history
      .filter((h) => !h.score.isBest)
      .map((h) => ({
        packNo: h.packNo,
        pickNo: h.pickNo,
        picked: hydrateCard(h.picked, text),
        best: hydrateCard(h.score.best, text),
        cost: h.score.bestValue - h.score.pickedValue,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, args.mistakeLimit ?? 5);

    // Building the 40 out of cards the player has said they are not playing is
    // the app overruling them with its own suggestion. `colorPair` reads the
    // maindeck for the same reason: it should name the deck, not the pile.
    const { maindeck, sideboard } = splitPool(
      engine.humanPool,
      normalizeBench(session.sideboard ?? []),
      session.pickedNames.length,
    );

    return {
      summary: summarizeDraft(engine.history, maindeck),
      // The deck builder reads type lines and colour identity to tell a land
      // from a spell and a splash from a lane, so it wants whole cards.
      deck: suggestDeck(hydrate(maindeck, text)),
      // So the screen can show what was set aside rather than silently drop it.
      sideboard: hydrate(sideboard, text),
      mistakes,
      status: session.status,
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
      userContent: buildPickContext(
        record,
        maindeck,
        sideboard,
        pivots(row.poolBefore, bench, args.pickIndex),
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


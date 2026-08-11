import { ConvexError, v } from "convex/values";
import {
  buildDraftFrame,
  buildReviewContext,
  buildReviewSystemPrompt,
  canonicalName,
  deckColors,
  loadPrinciples,
  normalizeBench,
  pivots,
  splitPool,
  summarizeDraft,
} from "@mtg-tutor/core";
import type { ReviewVerdict } from "@mtg-tutor/core";
import { z } from "zod";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server.js";
import type { QueryCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { api, internal } from "./_generated/api.js";
import { loadBoard, ownSessions, ownedSession, staleAgainst } from "./sessions.js";
import { cardTextFor } from "./cardText.js";
import {
  poolFromLastPick,
  storedPick,
  storedPicks,
  storedScores,
  toRecordedPick,
} from "./draftPicks.js";
import { reviewVerdict } from "./validators.js";
import { CoachUnavailableError, object, text } from "./llm.js";

// The picker list. Completed drafts only -- there is nothing to review about a
// draft still in progress. Uses the summary denormalized at completion, so this
// does not replay anything.
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sessions = await ownSessions(ctx, args.limit ?? 25);
    const finished = sessions.filter((s) => s.status === "complete");

    // Re-ingesting a set strands every draft taken against the old data, and
    // this list is where you find out -- or rather, where you used to not find
    // out, because it reads the stored summary and never replays, so a stranded
    // draft looked exactly like a readable one until you clicked it.
    //
    // One `sets` row per distinct set on the page, at ~433 bytes each, against
    // 25 replays of ~46KB apiece to learn the same thing. A hash that is absent
    // on either side answers `undefined`, not `true`: a draft from before the
    // field existed might be fine, and saying otherwise would be a warning
    // nobody could act on.
    const liveHashes = new Map<string, string | undefined>();
    for (const s of finished) {
      const key = `${s.setCode}|${s.format}`;
      if (liveHashes.has(key)) continue;
      const setDoc = await ctx.db
        .query("sets")
        .withIndex("by_code_and_format", (q) => q.eq("code", s.setCode).eq("format", s.format))
        .unique();
      liveHashes.set(key, setDoc?.sourceHash);
    }

    return finished
      .map((s) => ({
        id: s._id,
        setCode: s.setCode,
        format: s.format,
        createdAt: s.createdAt,
        colorPair: s.summary?.colorPair ?? "",
        overallScore: s.summary?.overallScore ?? 0,
        accuracy: s.summary?.accuracy ?? 0,
        pickCount: s.summary?.pickCount ?? s.pickedNames.length,
        // Whether there is a forty to compare against yet. A draft can be
        // finished and never built, and the row that links to the deck should
        // say so rather than sending you to a comparison that does not exist.
        built: s.build != null,
        // True when the set has been re-ingested since this was drafted, so the
        // walkthrough will refuse it. `undefined` means unknowable, not fine.
        stale: staleAgainst(s.sourceHash, liveHashes.get(`${s.setCode}|${s.format}`)),
      }));
  },
});

// The whole draft rehydrated for the walkthrough: every pack as the player saw
// it, the scoring they were actually shown, and any verdict already frozen.
//
// A pick is identified by its index in the session's pick list -- that is what
// reviewVerdicts and draftPicks both key on.
//
// THIS NO LONGER REPLAYS, and that is the point rather than a saving.
//
// It was the last reader that did (notes.md issue #3). Re-ingesting a set
// strands every draft taken against the old data -- the packs that draft saw no
// longer exist -- so the walkthrough was a wall you only met after clicking, on
// a row `review.list` had already badged as stale. Rows cannot strand: every
// pick recorded the pack it saw.
//
// It also fixes what the replay was quietly getting wrong. `draft.pick` scores
// against the pack's context rows, and a replay has none, so a replayed history
// carries RAW-POWER scores while the player was shown context-aware ones -- see
// storedScores. The walkthrough has been grading picks by a number the player
// never saw. The stored rows win.
//
// IT COSTS MORE, AND THAT IS THE TRADE. Measured with `pnpm bench-io`, fdn seed
// 42: 218.0KB replaying, 262.7KB reading rows. +44.7KB, once per review, taking
// a whole draft-plus-review from 2.41MB to 2.45MB.
//
// The comment this replaced said rows were "no cheaper than rebuilding them from
// a pool it has to read anyway", and about bytes it was exactly right -- the
// rows are an ADDITION, and the replay itself was free. It was wrong only about
// that being the question. A draft that cannot be opened costs infinity.
//
// It reads no set document at all, which took the sting out. `colorWinRates`
// went out on this query and no reader has ever touched it -- the draft board
// gets its own from `draft.state`, the deck screen is a different query -- so
// the ~25KB pool read went with it. Without that it was 287.6KB.
export const load = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);
    const rows = await storedPicks(ctx, args.sessionId);

    // Sessions drafted before draftPicks existed (2026-07-29) have rows only if
    // the backfill could replay them, which by definition excludes the stranded
    // ones. A ConvexError rather than a blank page, in the same voice replayFor
    // uses, so the screen that catches it can say something true.
    if (rows.length === 0) {
      throw new ConvexError(
        `This draft cannot be opened: it was taken before its picks were recorded, ` +
          `and its ${session.setCode.toUpperCase()} card data has changed since, so ` +
          `its packs can no longer be rebuilt.`,
      );
    }

    // Computed, not read off `session.summary`, which is what this used to do.
    //
    // The stored summary is a denormalisation for `list` above, which must not
    // rebuild 45 picks per row. Reading the stored copy bought nothing and cost
    // the one thing a copy always costs: it was written when the draft finished,
    // by whatever rule was in force that day. That is why the walkthrough and the
    // breakdown said "WU" about a deck the deck screen, which recomputes, called
    // "WUB". Same reason there is no stored deck list (see buildDeck).
    //
    // The pool comes out of the LAST row alone -- `poolBefore` holds 44 of the 45
    // and the 45th is in that row's own pack -- which is the same ~1.5KB trick
    // `draft.build` uses to refresh a finished deck's colours.
    const bench = normalizeBench(session.sideboard ?? []);
    const { maindeck } = splitPool(
      poolFromLastPick(rows[rows.length - 1]),
      bench,
      session.pickedNames.length,
    );

    const verdicts = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const byIndex = new Map(verdicts.map((v) => [v.pickIndex, v.verdict]));
    // The walkthrough re-renders every pack of the draft, which between them
    // hold most of the set -- so this is the one read that genuinely wants all
    // of it, and it happens once when the review opens.
    const text = await cardTextFor(ctx, session.setCode, session.format);

    return {
      id: session._id,
      setCode: session.setCode,
      format: session.format,
      seed: String(session.seed),
      createdAt: session.createdAt,
      colorPair: deckColors(maindeck),
      picks: rows.map((row) => {
        const rec = toRecordedPick(row, text);
        return {
          pickIndex: row.pickIndex,
          packNo: rec.packNo,
          pickNo: rec.pickNo,
          // The walkthrough re-renders every pack the player saw, so these go
          // out whole rather than as the engine's half of a card.
          pack: rec.pack,
          picked: rec.picked,
          bestName: rec.score.rawBest.name,
          score: rec.score.score,
          isBest: rec.score.isBest,
          onColor: rec.score.onColor,
          verdict: byIndex.get(row.pickIndex),
        };
      }),
    };
  },
});

// Frozen on first review so re-reviews are stable rather than re-rolling the
// model's opinion every time.
export const saveVerdict = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    pickIndex: v.number(),
    verdict: reviewVerdict,
  },
  handler: async (ctx, args) => {
    // Establishes ownership before writing anything keyed to this session.
    //
    // Deliberately not loadBoard: this needs to know the session is yours and
    // that the pick exists, and replaying to learn either costs a read of the
    // set's whole card pool. A pick index is in range exactly when the session
    // has a name at it -- history and pickedNames are the same list.
    const session = await ownedSession(ctx, args.sessionId);
    if (args.pickIndex < 0 || args.pickIndex >= session.pickedNames.length) {
      throw new Error(
        `Session has ${session.pickedNames.length} picks; no pick at index ${args.pickIndex}.`,
      );
    }

    const existing = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) =>
        q.eq("sessionId", args.sessionId).eq("pickIndex", args.pickIndex),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { verdict: args.verdict });
      return existing._id;
    }
    return await ctx.db.insert("reviewVerdicts", {
      sessionId: args.sessionId,
      pickIndex: args.pickIndex,
      verdict: args.verdict,
    });
  },
});

// The principles corpus is byte-identical on every call, so build it once.
let systemPrompt: string | undefined;
const system = () => (systemPrompt ??= buildReviewSystemPrompt(loadPrinciples()));

// Mirrors the reviewVerdict validator. The descriptions are load-bearing --
// they are the only instruction the model gets about what each field means.
const VERDICT_SCHEMA = z.object({
  contextBestName: z
    .string()
    .describe(
      "Exact name of the card that was the best pick given the player's pool and signals (the context-best). May equal the raw-power best.",
    ),
  divergenceLesson: z
    .string()
    .describe(
      "1-2 sentences: why the context-best and raw-power best agree or differ, and what that teaches.",
    ),
  narrative: z
    .string()
    .describe("2-4 sentences coaching the pick, citing principle ids in brackets."),
});

// The pick recorded the pool as it stood BEFORE it, which is what makes
// "context-best" mean anything: judged against the commitments the player had
// actually made, not the ones they went on to make.
export const verdictContext = internalQuery({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args) => {
    // No replay: the pick recorded its own pack and the pool it was judged
    // against, so this reads one row and the text for the cards on it.
    const session = await ownedSession(ctx, args.sessionId);
    const row = await storedPick(ctx, args.sessionId, args.pickIndex);
    if (!row) {
      throw new Error(
        `Session has ${session.pickedNames.length} picks; no stored pick at index ${args.pickIndex}.`,
      );
    }
    // The pack, and nothing else: the pool before the pick goes into the prompt
    // as names grouped by colour.
    const text = await cardTextFor(
      ctx,
      session.setCode,
      session.format,
      row.pack.map((c) => c.name),
    );
    const record = toRecordedPick(row, text);

    const existing = await ctx.db
      .query("reviewVerdicts")
      .withIndex("by_session_and_pickIndex", (q) =>
        q.eq("sessionId", args.sessionId).eq("pickIndex", args.pickIndex),
      )
      .unique();

    // The same split the live coach gets, at the same moment: what had been set
    // aside BY this pick. Reviewing against the whole pool would judge the pick
    // against a deck the player had already stopped building.
    const bench = normalizeBench(session.sideboard ?? []);
    const { maindeck, sideboard } = splitPool(row.poolBefore, bench, args.pickIndex);

    return {
      cached: existing?.verdict,
      // The only cards a context-best may name. The prompt lists these, but
      // nothing made the model stay inside the list -- see `verdict`.
      packNames: record.pack.map((c) => c.name),
      userContent: buildReviewContext(
        {
          pickIndex: args.pickIndex,
          packNo: record.packNo,
          pickNo: record.pickNo,
          // Whole cards: the review prompt describes each one and reads the
          // statistics beside its win rate.
          pack: record.pack,
          picked: record.picked,
          bestName: record.score.rawBest.name,
          score: record.score.score,
          isBest: record.score.isBest,
          onColor: record.score.onColor,
        },
        maindeck,
        sideboard,
        pivots(row.poolBefore, bench, args.pickIndex),
      ),
    };
  },
});

// Frozen on first request: a re-review shows the same verdict rather than
// re-rolling the model's opinion, which is what makes the quiz score mean
// anything across sessions.
export const verdict = action({
  args: { sessionId: v.id("draftSessions"), pickIndex: v.number() },
  handler: async (ctx, args): Promise<ReviewVerdict | null> => {
    const context = await ctx.runQuery(internal.review.verdictContext, args);
    if (context.cached) return context.cached;

    // After the cache check, so a re-review pays nothing and asks nothing;
    // before the model call, so a refusal costs no tokens. Inside the action
    // rather than in the client, because the CLI and a direct call to this
    // action have to be gated by the same thing the browser is.
    await ctx.runMutation(internal.quota.claimReview, { sessionId: args.sessionId });

    let input: z.infer<typeof VERDICT_SCHEMA>;
    try {
      input = await object({
        system: system(),
        userContent: context.userContent,
        // Headroom so the JSON isn't truncated mid-object. 1024 was not enough:
        // measured against claude-sonnet-5, 17 of 30 verdicts hit exactly that
        // ceiling and came back as NoOutputGeneratedError, i.e. the review
        // feature failed 57% of the time. The ones that fit averaged ~615
        // output tokens for three fields the schema asks to be a sentence or
        // two each -- so this ceiling buys correctness, and the prompt being
        // ~6x more verbose than it was asked to be is the real saving, now
        // measurable. See notes.md.
        maxTokens: 2048,
        schema: VERDICT_SCHEMA,
        onUsage: (usage) =>
          ctx.runMutation(internal.metrics.record, {
            ...usage,
            area: "verdict",
            sessionId: args.sessionId,
            pickIndex: args.pickIndex,
          }),
      });
    } catch (e) {
      // Callers show the data-only reveal instead; a missing key should not end
      // the review. Logged rather than swallowed silently: "the coach said
      // nothing" and "the coach could not be reached, and here is why" look
      // identical from the client, and only one of them is worth acting on.
      if (e instanceof CoachUnavailableError) {
        console.error(`Review verdict unavailable: ${e.message}`);
        return null;
      }
      throw e;
    }

    // The schema guarantees three strings, but not that they are non-empty. The
    // context-best name is the one field we cannot invent; the prose fields are
    // defaulted so a clipped narrative still teaches something.
    if (!input.contextBestName) {
      throw new Error("Review verdict was missing the context-best card.");
    }

    // ...nor does the schema guarantee the name is a card that was on offer. A
    // context-best from outside the pack is not a lesson, it is a hallucination
    // the walkthrough would render as a real alternative -- so it is refused
    // rather than shown, and deliberately not frozen: a verdict is cached on
    // first success, and caching this one would make the invention permanent.
    // Matched through canonicalName because models reach for typographic
    // apostrophes and hyphens that the pack spells with ASCII.
    const key = (name: string) => canonicalName(name).toLowerCase();
    const offered = new Set(context.packNames.map(key));
    if (!offered.has(key(input.contextBestName))) {
      console.error(
        `Review verdict named "${input.contextBestName}", which was not in the pack.`,
      );
      return null;
    }
    const result: ReviewVerdict = {
      contextBestName: input.contextBestName,
      divergenceLesson: input.divergenceLesson || "—",
      narrative: input.narrative || "(no coaching returned)",
    };

    await ctx.runMutation(api.review.saveVerdict, { ...args, verdict: result });
    return result;
  },
});

const phaseArg = v.union(v.literal("open"), v.literal("close"));

async function storedFrame(
  ctx: QueryCtx,
  sessionId: Id<"draftSessions">,
  phase: "open" | "close",
) {
  return await ctx.db
    .query("reviewFrames")
    .withIndex("by_session_and_phase", (q) => q.eq("sessionId", sessionId).eq("phase", phase))
    .unique();
}

// Same shape verdictContext returns, for the same reason: the cache is checked
// where the ownership check already is, so the action can bail before it costs
// anything. The loadBoard below is the expensive half -- it replays the draft
// and reads the set's whole card pool -- and skipping it on a hit is why
// caching frames makes a re-review cheaper rather than merely quieter.
export const framePrompt = internalQuery({
  args: { sessionId: v.id("draftSessions"), phase: phaseArg },
  handler: async (ctx, args) => {
    const cached = await storedFrame(ctx, args.sessionId, args.phase);
    if (cached) return { cached: cached.text, userContent: null };

    const { engine, cardsDoc } = await loadBoard(ctx, args.sessionId);
    const winRates = cardsDoc.colorWinRates;
    // No card text read at all: a frame lists the pool as names grouped by
    // colour and ranks the set's archetypes, and neither needs rules text.
    return {
      cached: null,
      userContent: buildDraftFrame(args.phase, engine.humanPool, winRates),
    };
  },
});

// Frozen on first success, like a verdict. Not only to stop a reload re-rolling
// the prose: without this, a review page mounted fifty times was a hundred model
// calls behind a single review's worth of quota.
export const saveFrame = internalMutation({
  args: { sessionId: v.id("draftSessions"), phase: phaseArg, text: v.string() },
  handler: async (ctx, args) => {
    await ownedSession(ctx, args.sessionId);
    if (await storedFrame(ctx, args.sessionId, args.phase)) return;

    await ctx.db.insert("reviewFrames", {
      sessionId: args.sessionId,
      phase: args.phase,
      text: args.text,
    });
  },
});

// The archetype bookends -- plain prose, no structure to enforce.
export const frame = action({
  args: { sessionId: v.id("draftSessions"), phase: phaseArg },
  handler: async (ctx, args): Promise<string | null> => {
    const context = await ctx.runQuery(internal.review.framePrompt, args);
    if (context.cached !== null) return context.cached;

    await ctx.runMutation(internal.quota.claimReview, { sessionId: args.sessionId });

    try {
      const prose = await text({
        system: system(),
        userContent: context.userContent,
        // 500 truncated the closing frame against claude-sonnet-5 while the
        // opening frame fit in 320. Same story as the verdict above.
        maxTokens: 900,
        onUsage: (usage) =>
          ctx.runMutation(internal.metrics.record, {
            ...usage,
            area: "frame",
            sessionId: args.sessionId,
            phase: args.phase,
          }),
      });

      await ctx.runMutation(internal.review.saveFrame, { ...args, text: prose });
      return prose;
    } catch (e) {
      if (e instanceof CoachUnavailableError) {
        console.error(`Draft frame (${args.phase}) unavailable: ${e.message}`);
        return null;
      }
      throw e;
    }
  },
});

// Backfills the summary for sessions completed before it was denormalized, so
// the picker doesn't show a row of zeroes.
export const backfillSummary = mutation({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const { session, engine } = await loadBoard(ctx, args.sessionId);
    if (session.summary) return session.summary;

    // Maindeck, not the whole pool, for the same reason `draft.pick` uses it:
    // the summary's colours should name the deck rather than the pile. The two
    // agreed while the label was capped at the two heaviest colours, so this read
    // as harmless; now that it names every colour the deck is in, a 45-card pool
    // would report a five-colour deck for anyone who benched nothing.
    const bench = normalizeBench(session.sideboard ?? []);
    const { maindeck } = splitPool(engine.humanPool, bench, session.pickedNames.length);

    const summary = summarizeDraft(await storedScores(ctx, args.sessionId), maindeck);
    await ctx.db.patch(args.sessionId, { summary });
    return summary;
  },
});

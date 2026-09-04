import { v } from "convex/values";
import {
  DECK_SPEED,
  dealDeckSpeedRun,
  deckSpeedBank,
  hydrateCard,
  normalizeName,
} from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { cardTextFor } from "../cardText.js";
import { requireUserId, setCardsFor, setDocFor } from "../sessions.js";

// The deck-speed drill, dealt.
//
// Like the archetype quiz and unlike the misses drill, this reads nothing about
// the player: the question is one card and the set's own statistics, so it can
// be played on a set you have never drafted, on your first day.
//
// THE COST IS THE SAME READ THE ARCHETYPE QUIZ ALREADY PAYS, and the bet behind
// it is the same one. A run reads the set's stats document (~270-412KB) and one
// text row per card served. Nothing here needs the pool document -- this drill
// has no colour or role check, because the question is about a card's own games
// rather than about which decks want it, so a land or a colourless card is a
// perfectly good question. That is one ~24.7KB read the archetype quiz makes and
// this one does not.
//
// If the `drill_*` events say this gets played, the derivation moves to seed
// time and the stats read goes away. Until then it is a subscription Convex
// serves from its own cache while a sitting pages through it.

/**
 * How many candidates to inspect past the run length.
 *
 * A question can still be refused after selection -- the set may have no text
 * row for a card the artifact still names, which is a card dropped by a
 * re-ingest. The text for the whole run is fetched in one pass, so this budget
 * keeps a thin set from serving a short run rather than bounding I/O.
 */
const READ_BUDGET = 2;

/**
 * Why a set has nothing to ask, or null when it has something.
 *
 * THREE CAUSES THAT MUST NOT SHARE A WORD, for the reason the archetype quiz
 * gives: a named cause on a screen is worth having only if it is the right one.
 *
 * - `unbuilt` -- no statistics row at all. A pipeline problem, not a fact about
 *   the set.
 * - `untimed` -- statistics, but built before this drill existed or from a game
 *   dataset with no turn column. The fix is a re-ingest and a re-seed, and it is
 *   the state every set is in on the deploy that introduces this.
 * - `unmeasured` -- turns, but no card in the set is measured sharply enough to
 *   be asked about. A real fact about a thin set, and the only one of the three
 *   that is about Magic rather than about us.
 */
type Mute = "unbuilt" | "untimed" | "unmeasured" | null;

export const deal = query({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    limit: v.optional(v.number()),
    // Where in the ranked list to start. The client holds it for a sitting, it
    // resets on reload, and nothing is stored.
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.limit ?? DECK_SPEED.runLength, DECK_SPEED.runLength),
    );
    const skip = Math.max(0, args.skip ?? 0);

    // Not about disclosure -- it is 17Lands data and a set's own cards -- but
    // about bandwidth: this read is 270KB to 412KB, the deployment URL ships in
    // the browser bundle, and an unauthenticated query that size is a shape of
    // problem this codebase has had once already.
    await requireUserId(ctx);

    const setDoc = await setDocFor(ctx, args.setCode, args.format ?? "TradDraft");
    const stats = await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", setDoc.code).eq("format", setDoc.format),
      )
      .unique();

    if (!stats) {
      return {
        questions: [],
        quizzable: 0,
        ends: 0,
        worthSaying: 0,
        mute: "unbuilt" as Mute,
        nextSkip: skip,
      };
    }
    // An artifact built before this pipeline pass existed carries no baselines
    // at all, which is a different sentence from "this set is thin" and gets its
    // own word. Tested on `turnStats` and NOT on the cards, because the two
    // floors differ -- a colour needs 200 games to be a baseline and a card
    // needs 400 -- so a set can be measured and still have no card over the
    // card floor. Reading that as `untimed` would promise a re-ingest that
    // fixes nothing, forever, and would break the analytics reading that this
    // count falls to zero once the sets are re-ingested.
    if (stats.turnStats == null) {
      return {
        questions: [],
        quizzable: 0,
        ends: 0,
        worthSaying: 0,
        mute: "untimed" as Mute,
        nextSkip: skip,
      };
    }

    const bank = deckSpeedBank(stats.cards, DECK_SPEED);
    const ranked = bank.questions;
    if (ranked.length === 0) {
      return {
        questions: [],
        quizzable: 0,
        ends: 0,
        worthSaying: 0,
        mute: "unmeasured" as Mute,
        nextSkip: skip,
      };
    }

    // Over-dealt by the read budget so a card the set has no text for costs a
    // question rather than a hole in the run.
    const candidates = dealDeckSpeedRun(ranked, limit * READ_BUDGET, skip);

    const cardsDoc = await setCardsFor(ctx, setDoc);
    const text = await cardTextFor(
      ctx,
      setDoc.code,
      setDoc.format,
      candidates.map((q) => q.name),
    );
    const engine = new Map(cardsDoc.cards.map((c) => [normalizeName(c.name), c]));

    const questions = [];
    let examined = 0;
    for (const question of candidates) {
      if (questions.length >= limit) break;
      examined++;

      // A set re-ingested since the artifact was built can have dropped a card
      // the statistics still name, and the card IS the question here -- so an
      // unservable one is not asked rather than shown in part.
      const key = normalizeName(question.name);
      const card = engine.get(key);
      const rows = text.get(key);
      if (!card || !rows) continue;

      questions.push({
        card: hydrateCard(card, text),
        // The answer, and the three numbers the reveal draws it from. `sigmas`
        // is what the screen says in words -- "fifteen error bars from flat" --
        // because a drafter can read that and cannot read a p-value.
        answer: question.answer,
        resid: question.resid,
        se: question.se,
        n: question.n,
        sigmas: question.sigmas,
      });
    }

    return {
      questions,
      // The set's whole bank, so the screen can tell "you have played them all"
      // from "this set never had many" without another query.
      quizzable: ranked.length,
      // How many of those have an end rather than the middle answer. The screen
      // does not use it; `drill_started` does, because a run drawn from a set
      // that is mostly middle is a different run and the rates should not pool.
      ends: ranked.filter((q) => q.answer !== "middle").length,
      // The format's own mean game length, so the reveal can say what the card's
      // residual is a difference FROM. Absent on an artifact built before it.
      formatTurns: stats.turnStats?.mean,
      // How far from flat this set calls worth saying, in turns. The reveal
      // draws it, and it is one number per set rather than per card.
      worthSaying: bank.worthSaying,
      mute: null as Mute,
      // Candidates EXAMINED rather than questions served, so a refused card is
      // not re-dealt on the next page.
      nextSkip: skip + examined,
    };
  },
});

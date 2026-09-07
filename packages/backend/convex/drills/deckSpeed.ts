import { v } from "convex/values";
import {
  DECK_SPEED,
  type DeckSpeedQuestion,
  dealDeckSpeedRun,
  deckSpeedBank,
  hydrateCard,
  normalizeName,
} from "@mtg-tutor/core";
import type { EngineCard } from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { cardTextFor } from "../cardText.js";
import { requireUserId, setCardsFor, setDocFor } from "../sessions.js";
import { splitByHistory } from "./history.js";

// The deck-speed drill, dealt.
//
// Like the archetype quiz and unlike the misses drill, this reads nothing about
// the player: the question is one card and the set's own statistics, so it can
// be played on a set you have never drafted, on your first day.
//
// THE COST IS THE SAME READ THE ARCHETYPE QUIZ ALREADY PAYS, and the bet behind
// it is the same one. A run reads the set's stats document (~270-412KB), the
// set's cards (~24.7KB, for roles the stats artifact does not carry), and one
// text row per card served.
//
// The pool read is for ONE thing: dropping lands. A colourless card is a
// perfectly good question here where it is not in the archetype quiz, so no
// colour check is needed -- but Evolving Wilds is the sharpest `middle` card in
// fdn and would be a player's first question, and "what kind of deck plays
// Evolving Wilds" teaches nothing.
//
// If the `drill_*` events say this gets played, the derivation moves to seed
// time and the stats read goes away. Until then it is a subscription Convex
// serves from its own cache for as long as a sitting lasts -- which is also why
// `today` is an argument rather than a clock read: a query is not re-run because
// time advanced, and a full timestamp would change the key on every call and
// throw that cache away.

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
 * - `unrated` -- 17Lands never recorded deck colours for this set, so there are
 *   no colour baselines to measure a residual against and there never will be.
 *   STX and only STX (notes issue #8). THIS IS THE ONE A RE-INGEST CANNOT FIX,
 *   and it was found by running the real pipeline over all 26 sets rather than
 *   by reasoning: `untimed` promises "it comes back the next time this set's
 *   data is refreshed", which for STX is a promise that can never be kept.
 * - `untimed` -- statistics, but built before this drill existed or from a game
 *   dataset with no turn column. The fix is a re-ingest and a re-seed, and it is
 *   the state every set is in on the deploy that introduces this.
 * - `unmeasured` -- turns, but no card in the set is measured sharply enough to
 *   be asked about. A real fact about a thin set, and about Magic rather than
 *   about us.
 * - `answered` -- every card this set can ask has been asked, and nothing is
 *   waiting to come back. THE ONLY GOOD NEWS IN THIS ENUM, and the reason it
 *   gets its own word rather than sharing `unmeasured`: those four are facts
 *   about the data and this one is a fact about the player. "There is nothing
 *   here to ask" and "you have finished it" read the same on a screen and are
 *   opposite news. It could not be reached before the drill had a memory.
 */
type Mute = "unbuilt" | "unrated" | "untimed" | "unmeasured" | "answered" | null;

export const deal = query({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    limit: v.optional(v.number()),
    // The player's own calendar day, as yyyy-mm-dd. An argument because a query
    // may not read the wall clock -- it is not re-run when time advances, so a
    // clock read here would answer with yesterday's idea of "today" for as long
    // as the subscription lived.
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.limit ?? DECK_SPEED.runLength, DECK_SPEED.runLength),
    );

    // Not about disclosure -- it is 17Lands data and a set's own cards -- but
    // about bandwidth: this read is 270KB to 412KB, the deployment URL ships in
    // the browser bundle, and an unauthenticated query that size is a shape of
    // problem this codebase has had once already.
    const userId = await requireUserId(ctx);

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
        asked: 0,
        mute: "unbuilt" as Mute,
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
      // A set with no colour data at all was never going to get baselines, so
      // the cause is 17Lands rather than our pipeline and the screen must not
      // promise a refresh. Same test and same word the archetype quiz uses.
      const cause: Mute =
        stats.archetypes.length === 0 || (stats.colorWinRates?.length ?? 0) === 0
          ? "unrated"
          : "untimed";
      return { questions: [], quizzable: 0, ends: 0, worthSaying: 0, asked: 0, mute: cause };
    }

    // Roles live on the pool document, not in the stats artifact, and the bank
    // needs them to drop lands. One read the archetype quiz already makes for
    // the same reason.
    const cardsDoc = await setCardsFor(ctx, setDoc);
    const roles = new Map(
      cardsDoc.cards.map((c) => [normalizeName(c.name), c.role as string | undefined]),
    );
    const bank = deckSpeedBank(
      stats.cards.map((c) => ({ ...c, role: roles.get(normalizeName(c.name)) })),
      DECK_SPEED,
    );
    const ranked = bank.questions;
    if (ranked.length === 0) {
      return {
        questions: [],
        quizzable: 0,
        ends: 0,
        worthSaying: 0,
        asked: 0,
        mute: "unmeasured" as Mute,
      };
    }

    // What is left of the bank once this person's own history is taken out of
    // it. THIS IS WHY THE TABLE EXISTS: `servingOrder` ranks the whole bank once
    // and `dealDeckSpeedRun` slices it, so before there was a history to read, a
    // second sitting on a set dealt the same eight cards as the first.
    const { fresh, repeats, asked } = await splitByHistory(
      ctx,
      userId,
      "deckSpeed",
      setDoc,
      args.today,
      ranked,
      limit,
    );
    if (fresh.length === 0 && repeats.length === 0) {
      return {
        questions: [],
        quizzable: ranked.length,
        ends: 0,
        worthSaying: bank.worthSaying,
        asked,
        mute: "answered" as Mute,
      };
    }

    // WHY THE TWO PILES ARE SERVED SEPARATELY RATHER THAN CONCATENATED. The
    // first version of this built one `candidates` list -- the fresh run
    // over-dealt by READ_BUDGET, then the repeats appended -- and the serving
    // loop below stopped at `limit`. With a budget of 2 and a run of 8 the fresh
    // half alone is 14 candidates, so the loop filled all 8 slots before it ever
    // reached the repeat at index 14, and the repeat was served only on a set so
    // played out that six of the fourteen had no text row. Every reader of a
    // repeat -- `dueForRepeat`, the `repeat` flag, the panel's took-back split --
    // was dead in production, and the test that covered it passed because it
    // seeded four cards.
    //
    // The budget is an over-deal for the TEXT CHECK, not a slot count, so it
    // must never be able to spend another pile's slots. Each pile is filled to
    // its own quota out of its own candidates.
    const wantFresh = Math.max(0, limit - repeats.length);
    const freshCandidates = dealDeckSpeedRun(fresh, wantFresh * READ_BUDGET, 0);
    const repeated = new Set(repeats.map((q) => normalizeName(q.name)));

    const text = await cardTextFor(
      ctx,
      setDoc.code,
      setDoc.format,
      [...freshCandidates, ...repeats].map((q) => q.name),
    );
    const engine = new Map(cardsDoc.cards.map((c) => [normalizeName(c.name), c]));

    // Fresh first so a run opens on something you have not seen, then the
    // repeats into the slots reserved for them. `serve` returns how many it
    // managed, so a pile that runs short of text rows gives its slots back
    // rather than leaving a hole.
    // Typed off the shape rather than annotated, so the return type of `deal`
    // stays the one the clients read and nothing has to restate it.
    const questions: ReturnType<typeof shape>[] = [];
    const serve = (pile: readonly DeckSpeedQuestion[], quota: number) => {
      let taken = 0;
      for (const question of pile) {
        if (taken >= quota || questions.length >= limit) break;

      // A set re-ingested since the artifact was built can have dropped a card
      // the statistics still name, and the card IS the question here -- so an
      // unservable one is not asked rather than shown in part.
      const key = normalizeName(question.name);
      const card = engine.get(key);
      const rows = text.get(key);
      if (!card || !rows) continue;

      questions.push(shape(question, card, key));
      taken++;
      }
    };

    serve(freshCandidates, wantFresh);
    // The repeats take whatever the fresh pile could not fill as well as their
    // own slots, so a set running short of new material still deals a full run.
    serve(repeats, limit - questions.length);

    /** One question as a client reads it. */
    function shape(question: DeckSpeedQuestion, card: EngineCard, key: string) {
      return {
        card: hydrateCard(card, text),
        // The answer, and the three numbers the reveal draws it from. `sigmas`
        // is what the screen says in words -- "fifteen error bars from flat" --
        // because a drafter can read that and cannot read a p-value.
        answer: question.answer,
        resid: question.resid,
        se: question.se,
        n: question.n,
        sigmas: question.sigmas,
        // Whether this card has been put to them before, so the client can say
        // so and send it to `drill_answered`. Pooling a first answer with a
        // later one is how memory of a reveal gets reported as a read, and the
        // property cannot be recovered afterwards -- the answer that would say
        // so is the row the event is about.
        repeat: repeated.has(key),
        // How far past this drill's own gate the question sat, so the client can
        // store it with the answer. `sigmas` cannot stand in for it: each drill
        // judges by a bar that moves -- with the deck count here, with the set's
        // own spread of residuals there -- so error bars alone do not say how
        // hard a question was, and neither the deck count nor the spread is on a
        // stored answer.
        margin: question.margin,
      };
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
      // How much of the set is behind them. Beside `quizzable` so a screen can
      // say "47 of 246" without a second query -- the one progress reading that
      // is true whatever the difficulty mix is doing.
      asked,
      mute: null as Mute,
    };
  },
});

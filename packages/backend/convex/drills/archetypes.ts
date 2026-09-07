import { v } from "convex/values";
import {
  ARCHETYPE_QUIZ,
  type ArchetypeQuestion,
  archetypeQuestions,
  dealArchetypeRun,
  hydrateCard,
  normalizeName,
} from "@mtg-tutor/core";
import type { EngineCard } from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { cardTextFor } from "../cardText.js";
import { requireUserId, setCardsFor, setDocFor } from "../sessions.js";
import { splitByHistory } from "./history.js";

// The archetype quiz, dealt.
//
// A set's own statistics are the whole question: which decks were measured
// playing a card, and how each of those decks does generally. Nothing about the
// player is read at all, which is the first thing separating this from the
// misses drill -- that one is built out of your drafts and cannot exist before
// you have taken one, and this one can be played on a set you have never seen.
// That is a feature rather than an accident: it is the drill somebody can play
// on their FIRST day, and the misses drill is the one that needs a history.
//
// THE COST, MEASURED AND ACCEPTED. A run reads three things: the set's stats
// document (~270KB), the set's cards (~24.7KB, for colours the stats artifact
// does not carry), and one text row per card served (~700 bytes each). About
// 300KB for a run of twelve, against ~262KB for opening one review and ~73KB
// for a misses run.
//
// The stats document is the expensive one and there is no cheaper way to it.
// Selection has to look at every card in the set, so the alternatives are ~300
// `setCardContext` rows -- more bytes, more round trips -- or a precomputed
// question bank in its own table, which is a schema change plus a re-seed to
// build a cache for a drill nobody has played yet. `convex/drills/misses.ts`
// made the same call in the other direction and said why: this is a bet, and
// the `drill_*` events are what settle it. If the quiz is played, the
// derivation moves to seed time and this read goes away.
//
// SO THE CACHE IS THE SUBSCRIPTION. A run is dealt once and frozen by the
// client, and Convex serves an unchanged query from its own cache rather than
// re-reading the document. `today` is an argument rather than a clock read for
// that reason as much as for correctness: a query is not re-run because time
// advanced, so a `new Date()` in here would go stale, and a full timestamp would
// change the query key on every call and throw the cache away. A day changes
// once a day, which is exactly the resolution `dueForRepeat` needs.

/**
 * How many candidates to inspect past the run length.
 *
 * A question can still be refused after selection -- the set may have no text
 * row for the card, which is a card dropped by a re-ingest since the artifact
 * was built. Unlike the misses drill this costs no extra document read: the
 * text for the whole run is fetched in one pass, so the budget is here to keep
 * a set with a thin bank from serving nothing rather than to bound I/O.
 */
const READ_BUDGET = 2;

/** Why a set has nothing to ask, or null when it has something. */
type Mute = "unrated" | "unbuilt" | "answered" | null;

/**
 * A run of questions, clearest first.
 *
 * EMPTY IS AN ANSWER WITH FOUR MEANINGS and the fields beside the questions are
 * what let the screen tell them apart. `mute` is `"unrated"` for a set whose
 * 17Lands data never recorded deck colours -- STX, alone among twenty-six
 * (notes issue #8) -- and `"unbuilt"` for a set with no statistics row at all,
 * which is a pipeline problem and not a fact about the set. `quizzable` is the
 * set's whole bank, so zero-with-a-table is a set whose decks never disagree by
 * enough and a small number is a set that can be played out.
 *
 * Issue #8 is explicit that the STX hole "degrades silently" and asks whether
 * the app should say so. This is the first surface that can: a drill either has
 * questions or it does not, where the coach and the deck builder both have a
 * quieter answer available and take it.
 *
 * `answered` IS THE FOURTH AND THE ONLY GOOD ONE. The other three are facts
 * about the data -- 17Lands never recorded it, or our pipeline has not run.
 * This one is a fact about the player: every card this set can ask has been
 * asked, and nothing is waiting to come back. It could not be reached at all
 * until the drill had a memory, which is why the vocabulary had no word for it
 * -- and it must not borrow one, because "there is nothing here to ask" and "you
 * have finished it" read the same on a screen and are opposite news.
 */
export const deal = query({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    limit: v.optional(v.number()),
    // The player's own calendar day, as yyyy-mm-dd. An argument because a query
    // may not read the wall clock -- it is not re-run when time advances, so a
    // clock read in here would answer with yesterday's idea of "today" for as
    // long as the subscription lived.
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.limit ?? ARCHETYPE_QUIZ.runLength, ARCHETYPE_QUIZ.runLength),
    );

    // Nothing here is private -- it is 17Lands data and a set's own cards -- so
    // this is not about disclosure. It is about bandwidth: the read below is
    // 270KB to 412KB depending on the set, the deployment URL ships in the
    // browser bundle, and an unauthenticated query that size is the shape of
    // problem this codebase has already had once. The web route is gated twice
    // over and the CLI signs in; nothing loses an answer by asking.
    const userId = await requireUserId(ctx);

    const setDoc = await setDocFor(ctx, args.setCode, args.format ?? "TradDraft");
    const stats = await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", setDoc.code).eq("format", setDoc.format),
      )
      .unique();

    // TWO CAUSES, AND THEY MUST NOT SHARE A WORD. `unrated` is a set whose
    // 17Lands game data never recorded deck colours, which is STX and only STX.
    // `unbuilt` is a set with no statistics row at all -- an ingest that ran
    // without an artifact, or a `seed-set-stats` that has not run or failed.
    //
    // One flag for both would put a NAMED CAUSE on a screen in front of a
    // player and be wrong about it half the time: "17Lands never recorded what
    // colours its decks were" is a true sentence about STX and a false one
    // about a pipeline step that did not run. That is trap #9 arriving inside
    // the surface built to stop silent degradation, which is the only place it
    // would be embarrassing rather than merely wrong.
    const decks = stats?.colorWinRates ?? [];
    const mute: Mute =
      !stats ? "unbuilt" : stats.archetypes.length === 0 || decks.length === 0 ? "unrated" : null;
    if (!stats || mute) {
      return { questions: [], quizzable: 0, asked: 0, mute: mute ?? "unbuilt" };
    }

    // Colours AND roles, neither of which the stats artifact carries -- both are
    // settled at ingest and live on the pool document. Without the colours a
    // colourless card that only ever got played in white decks is taught as a
    // white card; without the role a mono-coloured land passes the colour check
    // and gets asked about. `archetypeQuestions` says why that second one is
    // wrong about the question rather than about the data.
    const cardsDoc = await setCardsFor(ctx, setDoc);
    const pool = new Map(cardsDoc.cards.map((c) => [normalizeName(c.name), c]));
    const cardFor = (name: string) => {
      const card = pool.get(normalizeName(name));
      return card && { colors: card.colors.join(""), role: card.role };
    };

    const ranked = archetypeQuestions(stats.archetypes, decks, cardFor, ARCHETYPE_QUIZ);

    // What is left of the bank once this person's own history is taken out of
    // it. THIS IS WHY THE TABLE EXISTS: the bank is ranked deterministically and
    // `dealArchetypeRun` slices it, so before there was a history to read, a
    // second sitting on a set dealt the same eight cards as the first.
    const { fresh, repeats, asked } = await splitByHistory(
      ctx,
      userId,
      "archetypes",
      setDoc,
      args.today,
      ranked,
      limit,
    );
    if (fresh.length === 0 && repeats.length === 0) {
      return { questions: [], quizzable: ranked.length, asked, mute: "answered" as Mute };
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
    const freshCandidates = dealArchetypeRun(fresh, wantFresh * READ_BUDGET, 0);
    const repeated = new Set(repeats.map((q) => normalizeName(q.name)));

    // One read per distinct name, the same shape `misses.deal` uses. The whole
    // run's text in one pass rather than per question, because the names are
    // all in hand before any of them is needed.
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
    const serve = (pile: readonly ArchetypeQuestion[], quota: number) => {
      let taken = 0;
      for (const question of pile) {
        if (taken >= quota || questions.length >= limit) break;

      // Checked rather than caught, for the reason the misses drill checks: a
      // set re-ingested since the artifact was built can have dropped a card
      // the statistics still name, and `hydrateCard` throws on that by design.
      // Here the card IS the question, so an unservable one is simply not
      // asked -- there is no partial version of it worth showing.
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
    function shape(question: ArchetypeQuestion, card: EngineCard, key: string) {
      return {
        card: hydrateCard(card, text),
        color: question.color,
        // The two decks the question is about, and the whole table behind it.
        // `decks` is what the reveal draws: being graded on the two ends and
        // shown every deck in between is the honest shape of this screen.
        wants: question.wants,
        spurns: question.spurns,
        sigmas: question.sigmas,
        // Whether there IS an answer, which is a third of what this drill
        // teaches. Never `pValue`: the screen says "1.1 error bars apart",
        // which a drafter can read, and a p-value is a number they cannot.
        separated: question.separated,
        // Whether this card has been put to them before, so the client can say
        // so on the question and send it to `drill_answered`. Pooling a first
        // answer with a later one is how memory of a reveal gets reported as a
        // read, and the property cannot be recovered afterwards -- the answer
        // that would say so is the row the event is about.
        repeat: repeated.has(key),
        // How far past this drill's own gate the question sat, so the client can
        // store it with the answer. `sigmas` cannot stand in for it: each drill
        // judges by a bar that moves -- with the deck count here, with the set's
        // own spread of residuals there -- so error bars alone do not say how
        // hard a question was, and neither the deck count nor the spread is on a
        // stored answer.
        margin: question.margin,
        // `sd` rather than `variance`, because the only reader is the reveal's
        // band and a band is drawn in the units the lift is in. It is what lets
        // the screen show that a figure off 300 games is a wider claim than one
        // off 1,630 -- which is the whole of why a 6.9pp gap can be nothing.
        decks: question.decks.map((d) => ({
          colors: d.colors,
          lift: d.lift,
          n: d.n,
          deckWr: d.deckWr,
          sd: Math.sqrt(d.variance),
        })),
      };
    }

    return {
      questions,
      // The set's whole bank, so the screen can tell "you have played them all"
      // from "this set never had many" without another query.
      quizzable: ranked.length,
      // How many of those have an answer other than "the same". The screen does
      // not use it; `drill_started` does, because a run drawn from a set with
      // four separable cards is a different run from one drawn from blb's
      // thirty-six and the completion rates should not be pooled.
      separable: ranked.filter((q) => q.separated).length,
      // How much of the set is behind them. Beside `quizzable` so a screen can
      // say "47 of 214" without a second query -- which is the one progress
      // reading that is true whatever the difficulty mix is doing.
      asked,
      mute: null as Mute,
    };
  },
});

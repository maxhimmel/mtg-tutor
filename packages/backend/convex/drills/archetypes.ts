import { v } from "convex/values";
import {
  ARCHETYPE_QUIZ,
  archetypeQuestions,
  hydrateCard,
  normalizeName,
} from "@mtg-tutor/core";
import { query } from "../_generated/server.js";
import { cardTextFor } from "../cardText.js";
import { setCardsFor, setDocFor } from "../sessions.js";

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
// client; paging within a set re-runs this query, and Convex serves an
// unchanged query from its own cache rather than re-reading the document.

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

/**
 * A run of questions, clearest first.
 *
 * EMPTY IS AN ANSWER WITH THREE MEANINGS and the counts beside the questions
 * are what let the screen tell them apart. `mute` is a set with no archetype
 * table at all -- STX, alone among twenty-six, because 17Lands' game data for
 * it carries no `main_colors` (notes issue #8). `quizzable` is how many
 * questions the set has in total, so zero-with-a-table is a set whose decks
 * simply never disagree by enough, and a small number is a set that can be
 * played out. `skip` past the end is the fourth case and the client owns it.
 *
 * Issue #8 is explicit that the STX hole "degrades silently" and asks whether
 * the app should say so. This is the first surface that can: a drill either has
 * questions or it does not, where the coach and the deck builder both have a
 * quieter answer available and take it.
 */
export const deal = query({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    limit: v.optional(v.number()),
    // Where in the ranked list to start. Same contract as the misses drill: the
    // client holds it for a sitting, it resets on reload, and nothing is stored.
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.limit ?? ARCHETYPE_QUIZ.runLength, ARCHETYPE_QUIZ.runLength),
    );
    const skip = Math.max(0, args.skip ?? 0);

    const setDoc = await setDocFor(ctx, args.setCode, args.format ?? "TradDraft");
    const stats = await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", setDoc.code).eq("format", setDoc.format),
      )
      .unique();

    // No stats row at all is a set ingested without an artifact; no archetypes
    // is STX. Both are "this set cannot be quizzed", and neither is an error --
    // a set the picker offers is a set somebody may land here from.
    const decks = stats?.colorWinRates ?? [];
    if (!stats || stats.archetypes.length === 0 || decks.length === 0) {
      return { questions: [], quizzable: 0, mute: true, nextSkip: skip };
    }

    // Colours, which the stats artifact does not carry -- they come from
    // Scryfall at ingest and live on the pool document. Without them a
    // colourless card that only ever got played in white decks is taught as a
    // white card, which is the one way this drill could be confidently wrong
    // about something a person can see for themselves.
    const cardsDoc = await setCardsFor(ctx, setDoc);
    const colors = new Map(
      cardsDoc.cards.map((c) => [normalizeName(c.name), c.colors.join("")]),
    );
    const colorOf = (name: string) => colors.get(normalizeName(name));

    const ranked = archetypeQuestions(stats.archetypes, decks, colorOf, ARCHETYPE_QUIZ);
    const candidates = ranked.slice(skip, skip + limit * READ_BUDGET);

    // One read per distinct name, the same shape `misses.deal` uses. The whole
    // run's text in one pass rather than per question, because the names are
    // all in hand before any of them is needed.
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

      // Checked rather than caught, for the reason the misses drill checks: a
      // set re-ingested since the artifact was built can have dropped a card
      // the statistics still name, and `hydrateCard` throws on that by design.
      // Here the card IS the question, so an unservable one is simply not
      // asked -- there is no partial version of it worth showing.
      const key = normalizeName(question.name);
      const card = engine.get(key);
      const rows = text.get(key);
      if (!card || !rows) continue;

      questions.push({
        card: hydrateCard(card, text),
        color: question.color,
        // The two decks the question is about, and the whole table behind it.
        // `decks` is what the reveal draws: being graded on the two ends and
        // shown every deck in between is the honest shape of this screen.
        wants: question.wants,
        spurns: question.spurns,
        sigmas: question.sigmas,
        // `variance` is deliberately not sent: it is what chose the question and
        // says nothing to a reader, where `sigmas` already carries the same fact
        // in the one form the screen puts into a sentence.
        decks: question.decks.map((d) => ({
          colors: d.colors,
          lift: d.lift,
          n: d.n,
          deckWr: d.deckWr,
        })),
      });
    }

    return {
      questions,
      // The set's whole bank, so the screen can tell "you have played them all"
      // from "this set never had many" without another query.
      quizzable: ranked.length,
      mute: false,
      // Where the next run starts. Candidates EXAMINED rather than questions
      // served, so a refused card is not re-dealt on the next page.
      nextSkip: skip + examined,
    };
  },
});

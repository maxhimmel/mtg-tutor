import { v } from "convex/values";
import {
  DRILLS,
  REVIEW,
  cardsLeftAtMiss,
  isDecisionPick,
  missGap,
  normalizeBench,
  normalizeName,
  pickIndexOfMiss,
  rankMisses,
  splitPool,
} from "@mtg-tutor/core";
import type { Doc } from "../_generated/dataModel.js";
import { query } from "../_generated/server.js";
import { cardTextFor } from "../cardText.js";
import { digestFor } from "../draftDigests.js";
import { storedPick, toRecordedPick } from "../draftPicks.js";
import { ownSessions } from "../sessions.js";

// The misses drill, dealt.
//
// A pick you would want back is re-servable exactly as it stood, because
// `draftPicks` stored the pack it was offered from. So this rebuilds nothing
// and simulates nothing: the question was asked once already, and the answer
// was written down beside it at the time.
//
// THE CHEAP HALF FIRST. A draft's digest is ~1KB and holds both its ten worst
// picks and every pick's pack/pick numbers; its rows are ~92KB. So the whole
// selection -- which misses exist, where in the draft each one happened, how
// many cards the pack still held -- is answered off digests, and a row is read
// only for a question that is actually going to be served. Reading rows first
// and filtering after would cost roughly forty times as much to reach the same
// ten.
//
// WHAT THIS DELIBERATELY DOES NOT DO IS REMEMBER. Nothing records that a run
// happened, so two runs in a row deal the same questions -- `skip` is what a
// client uses to page past them. That is the whole of the bet: whether being
// dealt your worst picks again is worth anything is a question about people,
// and it gets answered by the `drill_*` events rather than by a table built
// before the answer is in. Persisting attempts (notes.md, Deferred #2) is the
// follow-on if it is.

/**
 * How many rows a run may read before it gives up on filling itself.
 *
 * A candidate can still be refused after its row is read -- the data could not
 * separate the two cards, or the set has been re-ingested since and no longer
 * has text for one of them -- so the loop reads past its target. Twice the run
 * length bounds that at ~20KB of rows in the worst case, where an unbounded
 * loop would happily read every mistake of every draft in the window.
 */
const READ_BUDGET = 2;

type Candidate = Doc<"draftDigests">["mistakes"][number] & {
  session: Doc<"draftSessions">;
  pickIndex: number;
};

/**
 * A run of questions, worst first.
 *
 * Empty is a legitimate answer with three different meanings, and the counts
 * beside the questions are what let the screen tell them apart: nobody has
 * finished a draft yet, or drafts exist and none of them recorded a miss worth
 * asking about, or the misses exist and their sets have moved underneath them.
 * A screen that cannot distinguish those says "nothing here" to somebody who
 * has done everything right.
 */
export const deal = query({
  args: {
    limit: v.optional(v.number()),
    // Where in the ranked list to start, so "deal me another ten" is possible
    // without anything being stored. The client holds it for the length of a
    // sitting and it resets on reload, which is the correct lifetime for a
    // number that only exists to avoid repeating the run just played.
    skip: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? DRILLS.runLength, DRILLS.runLength));
    const skip = Math.max(0, args.skip ?? 0);

    const drafts = (await ownSessions(ctx, DRILLS.draftWindow)).filter(
      (s) => s.status === "complete",
    );

    const candidates: Candidate[] = [];
    for (const session of drafts) {
      const digest = await digestFor(ctx, session._id);
      if (!digest) continue;
      for (const miss of digest.mistakes) {
        // A mistake whose pack/pick pair is not in the digest's own arrays
        // cannot be located, and serving it from the nearest pack would deal a
        // question out of a draft nobody took.
        const pickIndex = pickIndexOfMiss(digest.picks, miss);
        if (pickIndex === undefined) continue;
        // The same threshold the review quiz steps past. A pick with three
        // cards left is a mistake the way a forced pick is a mistake.
        if (!isDecisionPick(cardsLeftAtMiss(digest.picks, miss), REVIEW.decisionPickMinCards)) {
          continue;
        }
        candidates.push({ ...miss, session, pickIndex });
      }
    }

    const ranked = rankMisses(candidates, candidates.length).slice(skip);

    // Rows, one at a time, until the run is full or the budget runs out.
    const picked: { candidate: Candidate; row: Doc<"draftPicks"> }[] = [];
    let reads = 0;
    // How far down the ranked list this run got, which is NOT how many
    // questions it serves -- a candidate can be read and then refused. Paging
    // by the number served would re-deal every refused one on the next run.
    let examined = 0;
    for (const candidate of ranked) {
      if (picked.length >= limit || reads >= limit * READ_BUDGET) break;
      reads++;
      examined++;
      const row = await storedPick(ctx, candidate.session._id, candidate.pickIndex);
      if (!row) continue;
      // Scored 100 and still in the digest: the gap to the better card is
      // inside the error bars on it, so the grade refused to dock the pick and
      // this drill has nothing to teach about it. The digest keeps it because
      // it filters on `isBest` alone; asking it here costs a field on a row
      // that is already in hand.
      if (row.score.indistinguishable) continue;
      picked.push({ candidate, row });
    }

    // Text for the packs, one read per distinct set rather than per question --
    // a run drawn from three drafts of one set asks for the same ~14 cards
    // three times otherwise.
    const byPool = new Map<string, { code: string; format: string; names: string[] }>();
    for (const { candidate, row } of picked) {
      const key = `${candidate.session.setCode}|${candidate.session.format}`;
      const entry = byPool.get(key) ?? {
        code: candidate.session.setCode,
        format: candidate.session.format,
        names: [],
      };
      entry.names.push(...row.pack.map((c) => c.name));
      byPool.set(key, entry);
    }
    const text = new Map(
      await Promise.all(
        [...byPool].map(
          async ([key, e]) => [key, await cardTextFor(ctx, e.code, e.format, e.names)] as const,
        ),
      ),
    );

    let unavailable = 0;
    const questions = [];
    for (const { candidate, row } of picked) {
      const session = candidate.session;
      const index = text.get(`${session.setCode}|${session.format}`)!;

      // Checked rather than caught. `hydrateCard` throws on a card with no text
      // row -- deliberately, because a nameless blank frame is worse -- and a
      // set re-ingested since this draft can have dropped a card from the pool
      // while the pack that held it lives on in this row. That is notes.md
      // issue #3 arriving through a different door, and here the honest answer
      // is to leave the question out and say how many were left out, because
      // one unservable question out of ten is not worth a wall.
      if (!row.pack.every((c) => index.has(normalizeName(c.name)))) {
        unavailable++;
        continue;
      }

      const rec = toRecordedPick(row, index);
      // The deck as it stood BEFORE this pick, minus anything benched by then.
      // Not decoration: the answer is the card that best served this deck, so a
      // question asked without it is one nobody could answer.
      const { maindeck } = splitPool(
        row.poolBefore,
        normalizeBench(session.sideboard ?? []),
        candidate.pickIndex,
      );

      questions.push({
        sessionId: session._id,
        pickIndex: candidate.pickIndex,
        setCode: session.setCode,
        format: session.format,
        packNo: row.packNo,
        pickNo: row.pickNo,
        draftedAt: session.createdAt,
        pack: rec.pack,
        pool: maindeck,
        // What they took, what it was graded against, and the strongest card in
        // the pack. Three names rather than a flag, because the reveal says
        // something different about each of them -- and because the drill's
        // most interesting outcome is when the second and third differ.
        tookName: row.pickedName,
        gradedName: row.score.contextBestName,
        rawBestName: row.score.rawBestName,
        gap: missGap(candidate),
        scoreThen: row.score.score,
        gradeThen: row.score.grade,
      });
    }

    return {
      questions,
      // What the run was drawn from, so an empty one can say which kind of
      // empty it is.
      drafts: drafts.length,
      candidates: candidates.length,
      unavailable,
      // Where a following run should start. The client cannot compute it: it
      // counts questions, and this counts the candidates spent producing them.
      nextSkip: skip + examined,
    };
  },
});

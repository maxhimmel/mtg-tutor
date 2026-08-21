// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { recordPick } from "../convex/draftPicks.js";
import { api } from "../convex/_generated/api.js";
import { DraftEngine, botRng, buildSetData, dealDraft, packDeal } from "@mtg-tutor/core";
import type { Id } from "../convex/_generated/dataModel.js";

/**
 * The score's working survives the round trip, INCLUDING when there is none.
 *
 * `terms` carries a distinction the panel that draws it depends on: `[]` means
 * the deck made no difference to this card, and absent means the row never
 * recorded any. `recordPick` used to write
 *
 *     ...(rec.score.terms.length > 0 ? { terms: rec.score.terms } : {})
 *
 * which is free in bytes and collapses the two into one shape forever. Nothing
 * caught it, because every test that touched a stored score used a fixture with
 * terms in it or with the field left off entirely -- neither of which can go red
 * on the empty case. Trap #4: a battery that cannot notice the thing it exists
 * to catch.
 *
 * The empty case is not exotic. `commitment` is `share * min(1, picksMade /
 * totalPicks)`, so it is exactly 0 at the first pick of every draft, which
 * zeroes the archetype, splash and off-colour terms; a well-maindecked card
 * takes no trust correction either, and `contextValue` filters the zeros out.
 * So P1P1 stores `[]` routinely, and the review said those picks predated a
 * field they did not.
 */

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;

const card = (name: string) => ({
  name,
  colors: ["U" as const],
  slot: "common" as const,
  value: 50,
  turn: 2,
  role: "creature" as const,
});

// A recorded pick whose only variable is its terms. Everything else is the
// minimum `storedPickScore` will validate.
function pick(terms: { label: string; delta: number }[]) {
  const picked = card("Alpha");
  return {
    packNo: 1,
    pickNo: 1,
    pack: [picked, card("Passed")],
    picked,
    score: {
      score: 90,
      grade: "A",
      picked,
      pickedValue: 0.55,
      pickedContextValue: 0.55 + terms.reduce((a, t) => a + t.delta, 0),
      rawBest: picked,
      rawBestValue: 0.55,
      contextBest: picked,
      contextBestValue: 0.55,
      terms,
      isBest: true,
      indistinguishable: false,
      band: [],
      reasons: [],
      onColor: true,
      rankInPack: 1,
    },
  };
}

async function store(
  t: ReturnType<typeof harness>,
  terms: { label: string; delta: number }[],
) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("draftSessions", {
      userId: token("alice"),
      setCode: "tst",
      format: "TradDraft",
      seed: 1,
      pickedNames: ["Alpha"],
      status: "complete" as const,
      createdAt: new Date(0).toISOString(),
    });

    await recordPick(ctx, sessionId, 0, pick(terms) as never, []);

    const row = await ctx.db
      .query("draftPicks")
      .withIndex("by_session_and_pickIndex", (q) => q.eq("sessionId", sessionId))
      .unique();
    return row!.score.terms;
  });
}

describe("a pick's stored terms", () => {
  it("keeps the terms it had", async () => {
    const stored = await store(harness(), [
      { label: "off-color", delta: -0.04 },
      { label: "trust", delta: -0.01 },
    ]);

    expect(stored).toEqual([
      { label: "off-color", delta: -0.04 },
      { label: "trust", delta: -0.01 },
    ]);
  });

  // The one that goes red against the code this test was written for. An empty
  // array must survive AS an empty array: it is the answer "your deck made no
  // difference to this card", and the reader draws it differently from a row
  // that never recorded any.
  it("stores an empty list as empty, not as absent", async () => {
    expect(await store(harness(), [])).toEqual([]);
  });

  // The other half of the same distinction, so that fixing the line above
  // cannot be "over-fixed" into writing `[]` for rows that genuinely have
  // nothing. Nothing WRITES this any more -- it is what the historical rows
  // already in the database look like -- so it is asserted at the read side.
  it("still reports nothing at all for a row written before the field existed", async () => {
    const t = harness();
    const terms = await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("draftSessions", {
        userId: token("alice"),
        setCode: "tst",
        format: "TradDraft",
        seed: 1,
        pickedNames: ["Alpha"],
        status: "complete" as const,
        createdAt: new Date(0).toISOString(),
      });

      const rowId = await ctx.db.insert("draftPicks", {
        sessionId,
        pickIndex: 0,
        packNo: 1,
        pickNo: 1,
        pack: [card("Alpha")],
        pickedName: "Alpha",
        poolBefore: [],
        score: {
          score: 90,
          grade: "A",
          pickedName: "Alpha",
          pickedValue: 0.55,
          rawBestName: "Alpha",
          rawBestValue: 0.55,
          contextBestName: "Alpha",
          contextBestValue: 0.55,
          isBest: true,
          onColor: true,
          rankInPack: 1,
        },
      });

      return (await ctx.db.get(rowId))!.score.terms;
    });

    // `?? undefined` because the two "absent" spellings are not worth pinning
    // here: real Convex strips an unset optional and reads it back as undefined,
    // while convex-test round-trips it to null. What the reader downstream must
    // never see is an ARRAY, and both spellings agree about that.
    expect(terms ?? undefined).toBeUndefined();
    expect(Array.isArray(terms)).toBe(false);
  });
});

/**
 * The fork cap is read off the draft, not off a literal.
 *
 * `review.lines` capped at 42 with the comment "forty-two is every pick in a
 * draft, so nothing legitimate is refused". Three sets we ship deal fifteen-card
 * packs -- lci, mom and neo -- and their drafts are 45 picks, so the last three
 * were dropped in silence. That is not a small refusal: the client matches the
 * answers it gets against the asks it made, and a short reply meant every panel
 * on the page, including the ones already answered, fell back to a spinner that
 * never resolved.
 *
 * Asserted against a session whose own pick count exceeds the old constant,
 * because a fixture with 42 or fewer picks cannot tell the two implementations
 * apart.
 */
describe("review.lines on a draft longer than the old constant", () => {
  it("replays every pick of a 45-pick draft rather than the first 42", async () => {
    const t = harness();

    // A real deal, because the cap is only OBSERVABLE on a query that succeeds.
    // The first version of this test had no `draftPools` row, so `dealFor` threw
    // and the answer was null either way -- green against both implementations,
    // which is trap #4 written by the person who had just cited it.
    //
    // Fifteen-card packs, which is what lci, mom and neo actually deal: three
    // rounds of fifteen is the 45-pick draft the old constant of 42 truncated.
    const cards = Array.from({ length: 200 }, (_, i) => ({
      name: `Card ${i}`,
      colors: ["U" as const],
      slot: "common" as const,
      value: 50,
      turn: 2,
      role: "creature" as const,
    }));
    const set = buildSetData("tst", cards, [], {
      size: 15,
      shapes: [{ slots: { common: 15 }, weight: 1 }],
    });
    const deal = dealDraft(set, 1);
    expect(deal.rounds.length * deal.rounds[0][0].length).toBe(45);

    // The names actually taken, so the baseline walk runs the whole draft rather
    // than throwing on a card that was never in the pack.
    const engine = new DraftEngine(deal, botRng(1));
    const pickedNames: string[] = [];
    while (!engine.isComplete()) {
      const pack = engine.currentPack;
      if (pack.length === 0) break;
      pickedNames.push(pack[0].name);
      engine.humanPick(pack[0]);
    }
    expect(pickedNames).toHaveLength(45);

    const sessionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("draftSessions", {
        userId: token("alice"),
        setCode: "tst",
        format: "TradDraft",
        seed: 1,
        pickedNames,
        status: "complete" as const,
        createdAt: new Date(0).toISOString(),
      });
      await ctx.db.insert("draftPools", { sessionId: id, ...packDeal(deal), colorWinRates: [] });
      return id;
    });

    const lines = await t
      .withIdentity({
        subject: "alice",
        tokenIdentifier: token("alice"),
        issuer: ISS,
        role: "tester",
      })
      .query(api.review.lines, {
        sessionId,
        forks: pickedNames.map((_, i) => ({ pickIndex: i, theirs: `Card ${i}` })),
      });

    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(45);
    // And every answer names the pick it was computed for, which is what the
    // client keys on rather than trusting the order.
    expect(lines!.map((l) => l.pickIndex)).toEqual(pickedNames.map((_, i) => i));
  });

  it("refuses a caller who does not own the draft", async () => {
    const t = harness();
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("draftSessions", {
        userId: token("alice"),
        setCode: "tst",
        format: "TradDraft",
        seed: 1,
        pickedNames: ["Alpha"],
        status: "complete" as const,
        createdAt: new Date(0).toISOString(),
      }),
    );

    await expect(
      t
        .withIdentity({
          subject: "mallory",
          tokenIdentifier: token("mallory"),
          issuer: ISS,
          role: "tester",
        })
        .query(api.review.lines, {
          sessionId: sessionId as Id<"draftSessions">,
          forks: [{ pickIndex: 0, theirs: "Alpha" }],
        }),
    ).rejects.toThrow(/does not belong to you/);
  });
});

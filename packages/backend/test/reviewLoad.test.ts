// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

// `review.load` was the last reader that replayed (notes.md issue #3), and this
// is the test that says it no longer does.
//
// The assertion is deliberately not "it returns the right picks" -- that would
// pass just as well against a replay. It is that the walkthrough opens a draft
// the engine CANNOT rebuild: the session names a card the set no longer has, so
// `replayDraft` throws on it by construction. A test seeded with a pool that
// still replays would be trap #4 in a new costume -- green without ever
// exercising the thing it exists to catch.

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

const SET = { code: "tst", format: "TradDraft" };

const engineCard = (name: string, value: number) => ({
  name,
  colors: ["U" as const],
  slot: "common" as const,
  value,
});

const textRow = (name: string) => ({
  ...SET,
  key: name.toLowerCase(),
  text: {
    name,
    colorIdentity: ["U" as const],
    manaCost: "{1}{U}",
    cmc: 2,
    typeLine: "Creature — Test",
    oracleText: "",
    collectorNumber: "1",
  },
});

/**
 * A finished two-pick draft whose set has since been re-ingested without the
 * cards it was drafted from.
 *
 * `setCards` holds only Filler, so a replay of {seed, pickedNames} would deal
 * packs that cannot contain Alpha or Beta and throw at P1P1. The draftPicks rows
 * hold the packs as they were, which is the whole point.
 */
async function strandedDraft(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("sets", {
      ...SET,
      cardCount: 1,
      ratedCardCount: 1,
      ingestedAt: new Date(0).toISOString(),
      sourceHash: "hash-2",
    });
    await ctx.db.insert("setCards", {
      ...SET,
      cards: [engineCard("Filler", 40)],
      colorWinRates: [{ colors: "UB", n: 100, wr: 0.55 }],
    });
    for (const name of ["Alpha", "Beta", "Passed", "Filler"]) {
      await ctx.db.insert("setCardText", textRow(name));
    }

    const sessionId = await ctx.db.insert("draftSessions", {
      userId: token("alice"),
      setCode: SET.code,
      format: SET.format,
      seed: 42,
      pickedNames: ["Alpha", "Beta"],
      status: "complete" as const,
      createdAt: new Date(0).toISOString(),
      // Stamped from the pool it was DEALT from, which is not the pool above.
      sourceHash: "hash-1",
    });

    const rows = [
      { pickIndex: 0, packNo: 1, pickNo: 1, picked: "Alpha", poolBefore: [] },
      {
        pickIndex: 1,
        packNo: 1,
        pickNo: 2,
        picked: "Beta",
        poolBefore: [{ name: "Alpha", colors: ["U" as const] }],
      },
    ];
    for (const r of rows) {
      await ctx.db.insert("draftPicks", {
        sessionId,
        pickIndex: r.pickIndex,
        packNo: r.packNo,
        pickNo: r.pickNo,
        pack: [engineCard(r.picked, 60), engineCard("Passed", 50)],
        pickedName: r.picked,
        poolBefore: r.poolBefore,
        score: {
          // A number no replay could produce: `draft.pick` scores against the
          // pack's context rows and a replay has none, so a replayed history
          // carries raw-power scores while the player was shown these. 77 is
          // here to be recognised.
          score: 77,
          grade: "B",
          pickedName: r.picked,
          pickedValue: 60,
          pickedContextValue: 60,
          rawBestName: "Passed",
          rawBestValue: 50,
          contextBestName: r.picked,
          contextBestValue: 60,
          isBest: true,
          onColor: true,
          rankInPack: 1,
        },
      });
    }

    return sessionId;
  });
}

describe("review.load on a draft the engine can no longer rebuild", () => {
  // The control, and the reason the four below mean anything. `backfillSummary`
  // is the same fixture through `loadBoard`, which still replays -- so this
  // proves the draft really is stranded rather than accidentally replayable, and
  // that `review.load` opening it is a property of the change and not of a
  // fixture that was never hard.
  it("is genuinely stranded -- a reader that replays still refuses it", async () => {
    const t = harness();
    const sessionId = await strandedDraft(t);

    await expect(
      as(t, "alice").mutation(api.review.backfillSummary, { sessionId }),
    ).rejects.toThrow(/can no longer be rebuilt/);
  });

  it("opens it, because the packs came from the rows", async () => {
    const t = harness();
    const sessionId = await strandedDraft(t);

    const review = await as(t, "alice").query(api.review.load, { sessionId });

    expect(review.picks).toHaveLength(2);
    expect(review.picks.map((p) => p.picked.name)).toEqual(["Alpha", "Beta"]);
    expect(review.picks[0].pack.map((c) => c.name)).toEqual(["Alpha", "Passed"]);
  });

  it("reports the score the player was shown, not one recomputed now", async () => {
    const t = harness();
    const sessionId = await strandedDraft(t);

    const review = await as(t, "alice").query(api.review.load, { sessionId });

    expect(review.picks.map((p) => p.score)).toEqual([77, 77]);
    expect(review.picks[0].bestName).toBe("Passed");
  });

  it("still names the deck's colours, off the last row's pool", async () => {
    const t = harness();
    const sessionId = await strandedDraft(t);

    const review = await as(t, "alice").query(api.review.load, { sessionId });

    // Two blue cards, which is where `committedColors` puts the line.
    expect(review.colorPair).toBe("U");
    expect(review.colorWinRates).toHaveLength(1);
  });

  it("is still refused to anybody else", async () => {
    const t = harness();
    const sessionId = await strandedDraft(t);

    await expect(as(t, "mallory").query(api.review.load, { sessionId })).rejects.toThrow(
      /does not belong to you/,
    );
  });
});

describe("review.load on a draft with no stored picks", () => {
  it("says so, rather than returning an empty walkthrough", async () => {
    const t = harness();
    const sessionId = await t.run(async (ctx) => {
      await ctx.db.insert("sets", {
        ...SET,
        cardCount: 1,
        ratedCardCount: 1,
        ingestedAt: new Date(0).toISOString(),
      });
      await ctx.db.insert("setCards", {
        ...SET,
        cards: [engineCard("Filler", 40)],
        colorWinRates: [],
      });
      return await ctx.db.insert("draftSessions", {
        userId: token("alice"),
        setCode: SET.code,
        format: SET.format,
        seed: 42,
        pickedNames: ["Alpha"],
        status: "complete" as const,
        createdAt: new Date(0).toISOString(),
      });
    });

    await expect(as(t, "alice").query(api.review.load, { sessionId })).rejects.toThrow(
      /before its picks were recorded/,
    );
  });
});

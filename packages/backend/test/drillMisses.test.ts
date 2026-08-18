// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

/**
 * What `drills/misses.deal` chooses, and what it refuses.
 *
 * The dealing itself is not the risky part -- a stored row is a stored row.
 * The risk is all in the selection: a run that quietly serves forced picks, or
 * picks the grade itself declined to dock, or throws on a draft whose set moved
 * underneath it, is a drill that teaches the wrong lesson or no lesson while
 * looking exactly like one that works.
 *
 * So every test here is about a question that should NOT be asked, plus the
 * ordering that decides which ones are.
 */

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
  turn: 2,
  role: "creature" as const,
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

/** Eight cards, so a pick early in the pack is a real decision and a late one is not. */
const PACK = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"];

interface PickSpec {
  pickNo: number;
  took: string;
  graded: string;
  gap: number;
  indistinguishable?: boolean;
}

/**
 * One finished draft of a single eight-card pack.
 *
 * The digest is written by hand rather than by finishing a real draft, because
 * what is under test is how the digest's contents are read -- and a fixture
 * that has to drive 45 real picks to produce one miss can only ever produce the
 * misses the scorer happens to make today.
 */
async function draft(
  t: ReturnType<typeof harness>,
  user: string,
  createdAt: string,
  picks: PickSpec[],
  pool: { name: string; colors: "U"[] }[] = [],
  sideboard?: { pos: number; atPick: number }[],
) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("draftSessions", {
      userId: token(user),
      setCode: SET.code,
      format: SET.format,
      seed: 42,
      pickedNames: PACK,
      status: "complete" as const,
      createdAt,
      ...(sideboard ? { sideboard } : {}),
    });

    for (let i = 0; i < PACK.length; i++) {
      const spec = picks.find((p) => p.pickNo === i + 1);
      await ctx.db.insert("draftPicks", {
        sessionId,
        pickIndex: i,
        packNo: 1,
        pickNo: i + 1,
        pack: PACK.slice(i).map((n) => engineCard(n, 50)),
        pickedName: spec?.took ?? PACK[i],
        poolBefore: pool.slice(0, i),
        score: {
          score: spec?.indistinguishable ? 100 : 60,
          grade: "C",
          pickedName: spec?.took ?? PACK[i],
          pickedValue: 0.5,
          pickedContextValue: 0.5,
          rawBestName: "Zeta",
          rawBestValue: 0.6,
          contextBestName: spec?.graded ?? PACK[i],
          contextBestValue: 0.5 + (spec?.gap ?? 0),
          isBest: spec === undefined,
          ...(spec?.indistinguishable ? { indistinguishable: true } : {}),
          onColor: true,
          rankInPack: 2,
        },
      });
    }

    await ctx.db.insert("draftDigests", {
      sessionId,
      picks: {
        scores: PACK.map(() => 60),
        packNos: PACK.map(() => 1),
        pickNos: PACK.map((_, i) => i + 1),
      },
      mistakes: picks.map((p) => ({
        pickedName: p.took,
        bestName: p.graded,
        pickedValue: 0.5,
        bestValue: 0.5 + p.gap,
        score: p.indistinguishable ? 100 : 60,
        packNo: 1,
        pickNo: p.pickNo,
      })),
    });

    return sessionId;
  });
}

async function withText(t: ReturnType<typeof harness>, names: string[] = PACK) {
  await t.run(async (ctx) => {
    for (const name of names) await ctx.db.insert("setCardText", textRow(name));
  });
}

describe("drills/misses.deal", () => {
  it("asks the worst pick first, wherever it came from", async () => {
    const t = harness();
    await withText(t);
    await draft(t, "alice", "2026-08-01", [
      { pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.02 },
    ]);
    await draft(t, "alice", "2026-08-02", [
      { pickNo: 2, took: "Beta", graded: "Gamma", gap: 0.05 },
    ]);

    const run = await as(t, "alice").query(api.drills.misses.deal, {});

    expect(run.questions.map((q) => q.gradedName)).toEqual(["Gamma", "Beta"]);
    expect(run.questions[0].gap).toBeCloseTo(0.05, 10);
  });

  // A pick with two cards left is not a mistake, it is a pack running out. The
  // digest keeps it because it ranks on the gap alone; the drill must not ask
  // about it, and must work that out before paying to read the row.
  it("does not ask about a pick that was nearly forced", async () => {
    const t = harness();
    await withText(t);
    await draft(t, "alice", "2026-08-01", [
      { pickNo: 7, took: "Eta", graded: "Theta", gap: 0.09 },
      { pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.01 },
    ]);

    const run = await as(t, "alice").query(api.drills.misses.deal, {});

    expect(run.questions.map((q) => q.pickNo)).toEqual([1]);
    // Counted out before any row was read, so it is not among the candidates
    // either -- which is the difference between filtering it and paying for it.
    expect(run.candidates).toBe(1);
  });

  // Scored 100 and still in the digest: the gap is inside the error bars, the
  // grade refused to dock the pick, and there is nothing here to teach.
  it("does not ask about a pick the data could not separate", async () => {
    const t = harness();
    await withText(t);
    await draft(t, "alice", "2026-08-01", [
      { pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.08, indistinguishable: true },
      { pickNo: 2, took: "Beta", graded: "Gamma", gap: 0.01 },
    ]);

    const run = await as(t, "alice").query(api.drills.misses.deal, {});

    expect(run.questions.map((q) => q.gradedName)).toEqual(["Gamma"]);
    // It WAS a candidate -- only the row it cost a read to fetch says so.
    expect(run.candidates).toBe(2);
  });

  // notes.md issue #3 through a different door: `setCardText` is replaced
  // wholesale on every ingest, so a card that leaves a pool takes its text with
  // it while the pack that held it lives on in the row. hydrateCard throws on
  // that, and a run of ten must not become a wall because one of them moved.
  it("leaves out a question whose set no longer has all its cards, and says so", async () => {
    const t = harness();
    await withText(t, PACK.filter((n) => n !== "Delta"));
    await draft(t, "alice", "2026-08-01", [
      { pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.05 },
    ]);

    const run = await as(t, "alice").query(api.drills.misses.deal, {});

    expect(run.questions).toHaveLength(0);
    expect(run.unavailable).toBe(1);
  });

  it("deals the pack whole, and the deck as it stood before the pick", async () => {
    const t = harness();
    await withText(t);
    const pool = PACK.map((name) => ({ name, colors: ["U" as const] }));
    await draft(
      t,
      "alice",
      "2026-08-01",
      [{ pickNo: 3, took: "Gamma", graded: "Delta", gap: 0.05 }],
      pool,
      // The first card of the pool, set aside as it was picked. A deck the
      // player has said they are not playing must not be shown as their deck.
      [{ pos: 0, atPick: 0 }],
    );

    const [question] = (await as(t, "alice").query(api.drills.misses.deal, {})).questions;

    expect(question.pack.map((c) => c.name)).toEqual([
      "Gamma",
      "Delta",
      "Epsilon",
      "Zeta",
      "Eta",
      "Theta",
    ]);
    expect(question.pool.map((c) => c.name)).toEqual(["Beta"]);
    expect(question.tookName).toBe("Gamma");
    expect(question.rawBestName).toBe("Zeta");
  });

  it("pages past the run just played", async () => {
    const t = harness();
    await withText(t);
    await draft(t, "alice", "2026-08-01", [
      { pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.05 },
      { pickNo: 2, took: "Beta", graded: "Gamma", gap: 0.02 },
    ]);

    const run = await as(t, "alice").query(api.drills.misses.deal, { skip: 1 });

    expect(run.questions.map((q) => q.gradedName)).toEqual(["Gamma"]);
  });

  // Three kinds of empty, and a screen that cannot tell them apart says
  // "nothing here" to somebody who has done everything right.
  it("distinguishes no drafts from no misses", async () => {
    const t = harness();
    await withText(t);

    const none = await as(t, "alice").query(api.drills.misses.deal, {});
    expect(none).toMatchObject({ drafts: 0, candidates: 0, unavailable: 0 });

    await draft(t, "alice", "2026-08-01", []);
    const clean = await as(t, "alice").query(api.drills.misses.deal, {});
    expect(clean).toMatchObject({ drafts: 1, candidates: 0 });
  });

  it("never deals somebody else's draft", async () => {
    const t = harness();
    await withText(t);
    await draft(t, "bob", "2026-08-01", [{ pickNo: 1, took: "Alpha", graded: "Beta", gap: 0.05 }]);

    const run = await as(t, "alice").query(api.drills.misses.deal, {});

    expect(run).toMatchObject({ drafts: 0, candidates: 0 });
    expect(run.questions).toHaveLength(0);
  });
});

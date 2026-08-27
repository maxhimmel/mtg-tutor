// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { harness } from "./convexHarness.js";
import { api } from "../convex/_generated/api.js";

// `recentSets` collapses a list of drafts into a list of SETS, and every bug
// this can have is in that collapse: a set said twice, a set said in the wrong
// order, or somebody else's set said at all.
//
// It seeds bare session rows and no pool, no picks, no digest -- deliberately,
// because the query reads the session document and nothing else, and a fixture
// that wrote the other five tables would be asserting that the query keeps
// ignoring them rather than that it answers correctly.

const ISS = "https://example.workos.com";
const token = (s: string) => `${ISS}|${s}`;
const as = (t: ReturnType<typeof harness>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: token(subject), issuer: ISS, role: "tester" });

/**
 * One session, inserted in call order.
 *
 * The index this query reads runs on `_creationTime` descending, so the LAST
 * seeded session is the first one returned -- which is what every ordering
 * assertion below depends on and the reason none of them set `createdAt` to
 * anything meaningful.
 */
async function seed(
  t: ReturnType<typeof harness>,
  row: {
    setCode: string;
    format?: string;
    status?: "active" | "complete";
    user?: string;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("draftSessions", {
      userId: token(row.user ?? "alice"),
      setCode: row.setCode,
      format: row.format ?? "TradDraft",
      seed: 42,
      pickedNames: [],
      status: row.status ?? "complete",
      createdAt: new Date(0).toISOString(),
    });
  });
}

describe("draft.recentSets", () => {
  it("says a set once however many times it was drafted, newest first", async () => {
    const t = harness();
    await seed(t, { setCode: "fdn" });
    await seed(t, { setCode: "dsk" });
    await seed(t, { setCode: "fdn" });

    const recent = await as(t, "alice").query(api.draft.recentSets, {});

    // fdn ahead of dsk because its most recent draft is the most recent draft,
    // and once rather than twice.
    expect(recent.map((s) => s.setCode)).toEqual(["fdn", "dsk"]);
  });

  it("counts a set's formats apart", async () => {
    const t = harness();
    await seed(t, { setCode: "fdn", format: "TradDraft" });
    await seed(t, { setCode: "fdn", format: "PremierDraft" });

    const recent = await as(t, "alice").query(api.draft.recentSets, {});

    expect(recent.map((s) => s.format)).toEqual(["PremierDraft", "TradDraft"]);
  });

  // The flag the strip drops rows on, so that a set with a draft going is
  // offered by "Pick up where you left off" and not a second time beside it.
  it("marks the sets whose most recent draft is still open", async () => {
    const t = harness();
    await seed(t, { setCode: "dsk", status: "complete" });
    await seed(t, { setCode: "fdn", status: "active" });

    const recent = await as(t, "alice").query(api.draft.recentSets, {});

    expect(recent).toEqual([
      expect.objectContaining({ setCode: "fdn", open: true }),
      expect.objectContaining({ setCode: "dsk", open: false }),
    ]);
  });

  it("shows nobody else's", async () => {
    const t = harness();
    await seed(t, { setCode: "fdn", user: "alice" });

    expect(await as(t, "bob").query(api.draft.recentSets, {})).toEqual([]);
  });

  // The cap is on sessions read, not on sets returned, which is the whole
  // reason it is safe to keep it low: it can only ever cost you the OLDEST
  // set, never collapse the answer to one row.
  it("caps how far back it looks rather than how many sets it names", async () => {
    const t = harness();
    await seed(t, { setCode: "old" });
    await seed(t, { setCode: "fdn" });
    await seed(t, { setCode: "dsk" });

    const recent = await as(t, "alice").query(api.draft.recentSets, { limit: 2 });

    expect(recent.map((s) => s.setCode)).toEqual(["dsk", "fdn"]);
  });
});

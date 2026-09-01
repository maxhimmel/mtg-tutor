import { describe, expect, it } from "vitest";
import { DIAL_FINGERPRINT, dialsForDraft } from "@mtg-tutor/core";
import { dialRows } from "../convex/draftDigests.js";
import type { Doc, Id } from "../convex/_generated/dataModel.js";

// The seam between a stored pick row and the dial walk. Everything the walk does
// afterwards is tested in core against cards it was handed; what is tested here
// is that the right cards get handed over -- and in particular that a row naming
// a card outside its own pack does not become "took the first one", which is a
// preference nobody expressed and which would read as a real opinion.

const rated = (name: string, colors: string[], value: number, tableValue?: number) => ({
  name,
  colors,
  value,
  slot: "common" as const,
  ...(tableValue === undefined ? {} : { tableValue }),
});

function row(pickIndex: number, pack: ReturnType<typeof rated>[], pickedName: string) {
  return {
    _id: `row${pickIndex}` as Id<"draftPicks">,
    _creationTime: 0,
    sessionId: "session" as Id<"draftSessions">,
    pickIndex,
    packNo: 1,
    pickNo: pickIndex + 1,
    pack,
    pickedName,
    poolBefore: [],
    score: {
      score: 100,
      grade: "A+",
      pickedName,
      pickedValue: 0.5,
      pickedContextValue: 0.5,
      rawBestName: pickedName,
      rawBestValue: 0.5,
      contextBestName: pickedName,
      contextBestValue: 0.5,
      isBest: true,
      onColor: true,
      rankInPack: 1,
    },
  } as unknown as Doc<"draftPicks">;
}

const pack = (i: number, withTable: boolean) => [
  rated(`Blue${i}`, ["U"], 0.62, withTable ? 0.7 : undefined),
  rated(`Red${i}`, ["R"], 0.58, withTable ? 0.6 : undefined),
  rated(`Green${i}`, ["G"], 0.5, withTable ? 0.48 : undefined),
];

const draft = (withTable: boolean) =>
  [0, 1, 2, 3].map((i) => row(i, pack(i, withTable), `Blue${i}`));

describe("dialRows", () => {
  it("resolves the picked card out of the row's own pack", () => {
    const walked = dialRows(draft(true));
    expect(walked.map((r) => r.picked?.name)).toEqual(["Blue0", "Blue1", "Blue2", "Blue3"]);
  });

  it("leaves a card that is not in its own pack undefined, rather than guessing", () => {
    const rows = draft(true);
    rows[1] = { ...rows[1], pickedName: "Never Offered" };
    expect(dialRows(rows)[1].picked).toBeUndefined();
  });

  it("hands over the pack as it was offered, not the pool", () => {
    expect(dialRows(draft(true))[0].pack.map((c) => c.name)).toEqual([
      "Blue0",
      "Red0",
      "Green0",
    ]);
  });
});

describe("what a digest would store", () => {
  it("is a curvature carrying the current fingerprint", () => {
    const stored = dialsForDraft(dialRows(draft(true)));
    expect(stored?.fingerprint).toBe(DIAL_FINGERPRINT);
    expect(stored?.gradient).toHaveLength(6);
    expect(stored?.hessian).toHaveLength(21);
    expect(stored?.picks).toBe(4);
  });

  it("is nothing at all for a pool ingested before pick order existed", () => {
    // Absent is how the refusal is recorded, which is why the schema field is
    // optional for a reason that outlives the backfill.
    expect(dialsForDraft(dialRows(draft(false)))).toBeUndefined();
  });

  it("counts only the picks that resolved", () => {
    const rows = draft(true);
    rows[2] = { ...rows[2], pickedName: "Never Offered" };
    expect(dialsForDraft(dialRows(rows))?.picks).toBe(3);
  });
});

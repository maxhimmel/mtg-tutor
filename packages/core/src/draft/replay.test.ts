import { describe, it, expect } from "vitest";
import { fakeSet } from "../testing/fakeSet.js";
import { mulberry32 } from "../util/rng.js";
import { DraftEngine } from "./engine.js";
import { replayDraft } from "./replay.js";

const SEED = 20260721;

// Drafts a full 45 picks, choosing a different offset into each pack so the
// replay has to reproduce varied branches rather than always taking index 0.
function draftLive(): { engine: DraftEngine; pickedNames: string[] } {
  const engine = new DraftEngine(fakeSet(), mulberry32(SEED));
  const pickedNames: string[] = [];

  for (let i = 0; !engine.isComplete(); i++) {
    const pack = engine.currentPack;
    const card = pack[(i * 7) % pack.length];
    pickedNames.push(card.name);
    engine.humanPick(card);
  }

  return { engine, pickedNames };
}

// Everything a caller could observe about a draft, flattened for comparison.
const snapshot = (engine: DraftEngine) =>
  engine.history.map((h) => ({
    packNo: h.packNo,
    pickNo: h.pickNo,
    pack: h.pack.map((c) => c.name),
    picked: h.picked.name,
    score: h.score.score,
    grade: h.score.grade,
    isBest: h.score.isBest,
    best: h.score.best.name,
    signal: h.signal,
  }));

describe("replayDraft", () => {
  it("reproduces a finished draft exactly from seed + picked names", () => {
    const { engine: live, pickedNames } = draftLive();
    const replayed = replayDraft(fakeSet(), SEED, pickedNames);

    expect(snapshot(replayed)).toEqual(snapshot(live));
    expect(replayed.humanPool.map((c) => c.name)).toEqual(
      live.humanPool.map((c) => c.name),
    );
    expect(replayed.isComplete()).toBe(true);
  });

  it("reproduces mid-draft state, so a session can be resumed", () => {
    const { pickedNames } = draftLive();

    // Rebuild the board as it stood after 20 picks and confirm the pack the
    // player would be looking at is the one they actually saw.
    const partial = replayDraft(fakeSet(), SEED, pickedNames.slice(0, 20));

    expect(partial.history.length).toBe(20);
    expect(partial.isComplete()).toBe(false);
    expect(partial.currentPack.map((c) => c.name)).toContain(pickedNames[20]);
  });

  it("replaying zero picks yields an untouched opening pack", () => {
    const fresh = new DraftEngine(fakeSet(), mulberry32(SEED));
    const replayed = replayDraft(fakeSet(), SEED, []);

    expect(replayed.currentPack.map((c) => c.name)).toEqual(
      fresh.currentPack.map((c) => c.name),
    );
  });

  it("throws a diagnosable error when a name is not in the pack", () => {
    expect(() => replayDraft(fakeSet(), SEED, ["NoSuchCard"])).toThrow(
      /Replay diverged at P1P1: "NoSuchCard"/,
    );
  });

  it("a different seed produces a different draft", () => {
    const { pickedNames } = draftLive();
    // The same picks against a different seed should not line up at all.
    expect(() => replayDraft(fakeSet(), SEED + 1, pickedNames)).toThrow(/Replay diverged/);
  });
});

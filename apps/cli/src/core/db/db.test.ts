import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { scorePick } from "@mtg-tutor/core";
import type { Card, RecordedPick } from "@mtg-tutor/core";

// Point the DB at a throwaway temp file BEFORE importing db.js (getDb memoizes a
// singleton on first call). Dynamic import inside beforeAll guarantees ordering.
const DB_FILE = join(tmpdir(), `mtg-tutor-test-${process.pid}.db`);
let db: typeof import("./db.js");

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    name,
    rarity: "common",
    colors: [],
    colorIdentity: [],
    manaCost: "",
    cmc: 1,
    typeLine: "Creature",
    oracleText: "",
    collectorNumber: "1",
    gihWinRate: 0.5,
    gihGames: 5000,
    ...over,
  };
}

function recorded(pack: Card[], picked: Card, packNo: number, pickNo: number): RecordedPick {
  return { packNo, pickNo, pack: [...pack], picked, score: scorePick(pack, picked, []) };
}

beforeAll(async () => {
  process.env.MTG_TUTOR_DB_PATH = DB_FILE;
  db = await import("./db.js");
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(DB_FILE + suffix);
    } catch {
      /* ignore */
    }
  }
});

describe("draft persistence round-trip", () => {
  it("stores the full pack + seed and rehydrates it for review", () => {
    const strong = card("Strong", { gihWinRate: 0.6 });
    const weak = card("Weak", { gihWinRate: 0.5 });
    const pack1 = [strong, weak, card("Filler")];
    const history = [
      recorded(pack1, weak, 1, 1), // a mistake: took weak over strong
      recorded([strong, card("Other")], strong, 1, 2),
    ];

    const { id } = db.saveDraft("tst", "PremierDraft", history, [weak, strong], "2026-07-21T00:00:00Z", 424242);

    const loaded = db.loadDraftForReview(id);
    expect(loaded).toBeDefined();
    expect(loaded!.seed).toBe("424242");
    expect(loaded!.picks).toHaveLength(2);

    const first = loaded!.picks[0];
    expect(first.pack.map((c) => c.name)).toEqual(pack1.map((c) => c.name)); // full pack preserved
    expect(first.picked.name).toBe("Weak");
    expect(first.bestName).toBe("Strong"); // raw-power best
    expect(first.isBest).toBe(false);
    expect(first.verdict).toBeUndefined(); // no AI verdict yet
  });

  it("freezes an AI verdict on a pick and reads it back", () => {
    const pack = [card("A", { gihWinRate: 0.6 }), card("B", { gihWinRate: 0.5 })];
    const { id } = db.saveDraft("tst", "PremierDraft", [recorded(pack, pack[1], 1, 1)], [pack[1]], "2026-07-21T00:00:00Z", 7);

    const loaded = db.loadDraftForReview(id)!;
    const pickId = loaded.picks[0].id;
    db.saveVerdict(pickId, { contextBestName: "A", divergenceLesson: "power wins here", narrative: "take A [EVAL-01]" });

    const reloaded = db.loadDraftForReview(id)!;
    expect(reloaded.picks[0].verdict).toEqual({
      contextBestName: "A",
      divergenceLesson: "power wins here",
      narrative: "take A [EVAL-01]",
    });
  });

  it("lists saved drafts newest-first", () => {
    const before = db.listDrafts().length;
    db.saveDraft("zzz", "PremierDraft", [recorded([card("X")], card("X"), 1, 1)], [card("X")], "2099-01-01T00:00:00Z", 1);
    const list = db.listDrafts();
    expect(list.length).toBe(before + 1);
    expect(list[0].createdAt).toBe("2099-01-01T00:00:00Z"); // newest first
  });
});

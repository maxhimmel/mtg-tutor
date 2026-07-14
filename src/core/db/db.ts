import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { RecordedPick } from "../model/pick.js";
import type { Card } from "../model/card.js";

const DB_PATH = join(homedir(), ".mtg-tutor", "stats.db");

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(join(homedir(), ".mtg-tutor"), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_code TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL,
      overall_score REAL NOT NULL,
      accuracy REAL NOT NULL,
      color_pair TEXT,
      pick_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      pack_no INTEGER NOT NULL,
      pick_no INTEGER NOT NULL,
      pack_size INTEGER NOT NULL,
      picked_name TEXT NOT NULL,
      picked_colors TEXT NOT NULL,
      picked_gih REAL,
      best_name TEXT NOT NULL,
      best_gih REAL,
      score REAL NOT NULL,
      is_best INTEGER NOT NULL,
      on_color INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_picks_draft ON picks(draft_id);
  `);
  return db;
}

export interface SavedDraftSummary {
  overallScore: number;
  accuracy: number;
  colorPair: string;
}

function deckColorPair(pool: Card[]): string {
  const counts = new Map<string, number>();
  for (const c of pool) for (const col of c.colors) counts.set(col, (counts.get(col) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
  const order = "WUBRG";
  return top.sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("");
}

export function saveDraft(
  setCode: string,
  format: string,
  history: RecordedPick[],
  pool: Card[],
  createdAt: string,
): { id: number; summary: SavedDraftSummary } {
  const d = getDb();
  const overallScore = history.reduce((s, h) => s + h.score.score, 0) / history.length;
  const accuracy = history.filter((h) => h.score.isBest).length / history.length;
  const colorPair = deckColorPair(pool);

  const insertDraft = d.prepare(
    `INSERT INTO drafts (set_code, format, created_at, overall_score, accuracy, color_pair, pick_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPick = d.prepare(
    `INSERT INTO picks (draft_id, pack_no, pick_no, pack_size, picked_name, picked_colors, picked_gih, best_name, best_gih, score, is_best, on_color)
     VALUES (@draft_id, @pack_no, @pick_no, @pack_size, @picked_name, @picked_colors, @picked_gih, @best_name, @best_gih, @score, @is_best, @on_color)`,
  );

  const tx = d.transaction(() => {
    const info = insertDraft.run(setCode, format, createdAt, overallScore, accuracy, colorPair, history.length);
    const draftId = Number(info.lastInsertRowid);
    for (const h of history) {
      insertPick.run({
        draft_id: draftId,
        pack_no: h.packNo,
        pick_no: h.pickNo,
        pack_size: h.pack.length,
        picked_name: h.picked.name,
        picked_colors: h.picked.colors.join(""),
        picked_gih: h.picked.gihWinRate ?? null,
        best_name: h.score.best.name,
        best_gih: h.score.best.gihWinRate ?? null,
        score: h.score.score,
        is_best: h.score.isBest ? 1 : 0,
        on_color: h.score.onColor ? 1 : 0,
      });
    }
    return draftId;
  });

  const id = tx();
  return { id, summary: { overallScore, accuracy, colorPair } };
}

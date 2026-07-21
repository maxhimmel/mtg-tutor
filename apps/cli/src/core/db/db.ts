import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { RecordedPick } from "../model/pick.js";
import type { Card } from "../model/card.js";
import type { DraftListItem, ReviewVerdict, StoredDraft, StoredPick } from "../model/review.js";

// Overridable so tests (and users who relocate their data) don't write to the
// real ~/.mtg-tutor/stats.db.
const dbPath = () => process.env.MTG_TUTOR_DB_PATH ?? join(homedir(), ".mtg-tutor", "stats.db");

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;
  const path = dbPath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_code TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL,
      seed TEXT NOT NULL,
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
      on_color INTEGER NOT NULL,
      pack_json TEXT NOT NULL,
      verdict_json TEXT
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
  seed: number,
): { id: number; summary: SavedDraftSummary } {
  const d = getDb();
  const overallScore = history.reduce((s, h) => s + h.score.score, 0) / history.length;
  const accuracy = history.filter((h) => h.score.isBest).length / history.length;
  const colorPair = deckColorPair(pool);

  const insertDraft = d.prepare(
    `INSERT INTO drafts (set_code, format, created_at, seed, overall_score, accuracy, color_pair, pick_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPick = d.prepare(
    `INSERT INTO picks (draft_id, pack_no, pick_no, pack_size, picked_name, picked_colors, picked_gih, best_name, best_gih, score, is_best, on_color, pack_json, verdict_json)
     VALUES (@draft_id, @pack_no, @pick_no, @pack_size, @picked_name, @picked_colors, @picked_gih, @best_name, @best_gih, @score, @is_best, @on_color, @pack_json, @verdict_json)`,
  );

  const tx = d.transaction(() => {
    const info = insertDraft.run(setCode, format, createdAt, String(seed), overallScore, accuracy, colorPair, history.length);
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
        pack_json: JSON.stringify(h.pack),
        verdict_json: null,
      });
    }
    return draftId;
  });

  const id = tx();
  return { id, summary: { overallScore, accuracy, colorPair } };
}

interface DraftRow {
  id: number;
  set_code: string;
  format: string;
  created_at: string;
  seed: string;
  color_pair: string | null;
  overall_score: number;
  accuracy: number;
  pick_count: number;
}

interface PickRow {
  id: number;
  pack_no: number;
  pick_no: number;
  picked_name: string;
  best_name: string;
  score: number;
  is_best: number;
  on_color: number;
  pack_json: string;
  verdict_json: string | null;
}

// Most-recent-first list for the review picker.
export function listDrafts(limit = 25): DraftListItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, set_code, format, created_at, seed, color_pair, overall_score, accuracy, pick_count
       FROM drafts ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as DraftRow[];
  return rows.map((r) => ({
    id: r.id,
    setCode: r.set_code,
    format: r.format,
    createdAt: r.created_at,
    colorPair: r.color_pair ?? "",
    overallScore: r.overall_score,
    accuracy: r.accuracy,
    pickCount: r.pick_count,
  }));
}

// Rehydrate a full draft (packs + cached verdicts) for the review walkthrough.
export function loadDraftForReview(id: number): StoredDraft | undefined {
  const d = getDb();
  const draft = d.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as DraftRow | undefined;
  if (!draft) return undefined;

  const rows = d
    .prepare(`SELECT * FROM picks WHERE draft_id = ? ORDER BY pack_no, pick_no`)
    .all(id) as PickRow[];

  const picks: StoredPick[] = rows.map((r) => {
    const pack = JSON.parse(r.pack_json) as Card[];
    const picked = pack.find((c) => c.name === r.picked_name) ?? pack[0];
    return {
      id: r.id,
      packNo: r.pack_no,
      pickNo: r.pick_no,
      pack,
      picked,
      bestName: r.best_name,
      score: r.score,
      isBest: r.is_best === 1,
      onColor: r.on_color === 1,
      verdict: r.verdict_json ? (JSON.parse(r.verdict_json) as ReviewVerdict) : undefined,
    };
  });

  return {
    id: draft.id,
    setCode: draft.set_code,
    format: draft.format,
    seed: draft.seed,
    createdAt: draft.created_at,
    colorPair: draft.color_pair ?? "",
    picks,
  };
}

// Freeze the AI verdict on a pick so subsequent reviews are stable.
export function saveVerdict(pickId: number, verdict: ReviewVerdict): void {
  getDb()
    .prepare(`UPDATE picks SET verdict_json = ? WHERE id = ?`)
    .run(JSON.stringify(verdict), pickId);
}

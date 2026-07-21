import { getDb } from "../../core/db/db.js";

export interface Overall {
  drafts: number;
  avgScore: number;
  avgAccuracy: number;
  totalPicks: number;
}

export interface TrendRow {
  id: number;
  created_at: string;
  set_code: string;
  overall_score: number;
  accuracy: number;
  color_pair: string;
}

export function overall(): Overall {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT COUNT(*) AS drafts, AVG(overall_score) AS avgScore, AVG(accuracy) AS avgAccuracy,
              SUM(pick_count) AS totalPicks FROM drafts`,
    )
    .get() as { drafts: number; avgScore: number | null; avgAccuracy: number | null; totalPicks: number | null };
  return {
    drafts: row.drafts,
    avgScore: row.avgScore ?? 0,
    avgAccuracy: row.avgAccuracy ?? 0,
    totalPicks: row.totalPicks ?? 0,
  };
}

export function recentDrafts(limit = 10): TrendRow[] {
  return getDb()
    .prepare(
      `SELECT id, created_at, set_code, overall_score, accuracy, color_pair
       FROM drafts ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as TrendRow[];
}

export function scoreByPickNo(): { pick_no: number; avg_score: number }[] {
  return getDb()
    .prepare(`SELECT pick_no, AVG(score) AS avg_score FROM picks GROUP BY pick_no ORDER BY pick_no`)
    .all() as { pick_no: number; avg_score: number }[];
}

export function scoreByPackNo(): { pack_no: number; avg_score: number }[] {
  return getDb()
    .prepare(`SELECT pack_no, AVG(score) AS avg_score FROM picks GROUP BY pack_no ORDER BY pack_no`)
    .all() as { pack_no: number; avg_score: number }[];
}

export interface Mistake {
  picked_name: string;
  best_name: string;
  picked_gih: number;
  best_gih: number;
  score: number;
  pack_no: number;
  pick_no: number;
}

export function topMistakes(limit = 10): Mistake[] {
  return getDb()
    .prepare(
      `SELECT picked_name, best_name, picked_gih, best_gih, score, pack_no, pick_no
       FROM picks
       WHERE is_best = 0 AND picked_gih IS NOT NULL AND best_gih IS NOT NULL
       ORDER BY (best_gih - picked_gih) DESC
       LIMIT ?`,
    )
    .all(limit) as Mistake[];
}

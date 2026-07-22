import { api } from "@mtg-tutor/backend";
import { convexClient } from "../../core/auth/session.js";

// The aggregation runs in the deployment now (convex/stats.ts). Per-draft
// numbers come from the summary denormalized at completion; the per-pick
// breakdowns come from replay, since picks are never stored.
export type Overview = Awaited<ReturnType<typeof fetchOverview>>;

export async function fetchOverview(limit?: number) {
  const convex = await convexClient();
  return await convex.query(api.stats.overview, limit == null ? {} : { limit });
}

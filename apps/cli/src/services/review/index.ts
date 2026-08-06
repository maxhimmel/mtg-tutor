import * as p from "@clack/prompts";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { StoredDraft } from "@mtg-tutor/core";
import { convexClient } from "../../core/auth/session.js";
import { pct } from "../../core/ui/format.js";
import { spinner } from "../../core/ui/spinner.js";
import { runReview } from "./screen.js";
import { humanError } from "../../core/ui/humanError.js";

// Review service entrypoint. `argv` is [sessionId?] with optional `--passive`
// or `--breakdown`. With no id we show a picker of completed drafts.
export async function run(argv: string[]): Promise<void> {
  const mode = argv.includes("--breakdown")
    ? "breakdown"
    : argv.includes("--passive")
      ? "passive"
      : "quiz";
  const positional = argv.filter((a) => !a.startsWith("--"));

  const convex = await convexClient();
  let sessionId = positional[0] as Id<"draftSessions"> | undefined;

  if (!sessionId) {
    const drafts = await convex.query(api.review.list, {});
    if (drafts.length === 0) {
      p.outro("No finished drafts to review yet. Run a draft first: mtg-tutor draft <set>");
      return;
    }
    const chosen = await p.select({
      message: "Pick a draft to review",
      options: drafts.map((d) => ({
        value: d.id,
        label: `${d.setCode.toUpperCase()} ${d.colorPair || "—"} · ${d.createdAt.slice(0, 10)}`,
        hint: `score ${d.overallScore.toFixed(1)}, acc ${pct(d.accuracy)}`,
      })),
    });
    if (p.isCancel(chosen)) {
      p.cancel("No draft chosen.");
      return;
    }
    sessionId = chosen as Id<"draftSessions">;
  }

  const s = spinner();
  s.start("Rebuilding the draft");
  let loaded;
  try {
    loaded = await convex.query(api.review.load, { sessionId });
  } catch (e) {
    s.stop("");
    p.log.error(humanError(e));
    return;
  }
  s.stop(`Rebuilt ${loaded.setCode.toUpperCase()} — ${loaded.picks.length} picks`);

  await runReview(convex, loaded as unknown as StoredDraft, { mode });
}

import * as p from "@clack/prompts";
import pc from "picocolors";
import { listDrafts, loadDraftForReview } from "../../core/db/db.js";
import { loadSetData } from "../../core/data/setdata.js";
import { pct } from "../../core/ui/format.js";
import { spinner } from "../../core/ui/spinner.js";
import { runReview } from "./screen.js";

// Review service entrypoint. `argv` is [draftId?] with an optional `--passive`
// flag. With no id we show a picker of saved drafts.
export async function run(argv: string[]): Promise<void> {
  const mode = argv.includes("--report")
    ? "report"
    : argv.includes("--passive")
      ? "passive"
      : "quiz";
  const positional = argv.filter((a) => !a.startsWith("--"));

  let draftId = positional[0] ? Number(positional[0]) : undefined;

  if (draftId == null || Number.isNaN(draftId)) {
    const drafts = listDrafts();
    if (drafts.length === 0) {
      p.outro("No saved drafts to review yet. Run a draft first: mtg-tutor draft <set>");
      return;
    }
    const chosen = await p.select({
      message: "Pick a draft to review",
      options: drafts.map((d) => ({
        value: d.id,
        label: `#${d.id} ${d.setCode.toUpperCase()} ${d.colorPair || "—"} · ${d.createdAt.slice(0, 10)}`,
        hint: `score ${d.overallScore.toFixed(1)}, acc ${pct(d.accuracy)}`,
      })),
    });
    if (p.isCancel(chosen)) {
      p.cancel("No draft chosen.");
      return;
    }
    draftId = chosen as number;
  }

  const draft = loadDraftForReview(draftId);
  if (!draft) {
    p.log.error(`No draft #${draftId} found. Run "mtg-tutor stats" to see saved drafts.`);
    return;
  }

  // Archetype win rates come from the set's 17Lands color ratings; best-effort so
  // review still runs offline (the AI can frame archetypes from its own knowledge).
  let colorPairWinRates = new Map<string, number>();
  const s = spinner();
  s.start(`Loading ${draft.setCode.toUpperCase()} archetype data`);
  try {
    const set = await loadSetData(draft.setCode, draft.format);
    colorPairWinRates = set.colorPairWinRates;
    s.stop(`Loaded ${draft.setCode.toUpperCase()} archetype data`);
  } catch {
    s.stop(pc.yellow("Archetype data unavailable — reviewing without set win rates"));
  }

  await runReview(draft, colorPairWinRates, { mode });
}

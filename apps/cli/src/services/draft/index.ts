import * as p from "@clack/prompts";
import pc from "picocolors";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { convexClient } from "../../core/auth/session.js";
import { spinner } from "../../core/ui/spinner.js";
import { runDraft } from "./screen.js";

// Draft service entrypoint. `argv` is [setCode?, format?], plus
// `--resume <sessionId>` to pick an abandoned draft back up.
export async function run(argv: string[]): Promise<void> {
  const resumeAt = argv.indexOf("--resume");
  const positional = argv.filter((a) => !a.startsWith("--"));

  const convex = await convexClient();

  if (resumeAt !== -1) {
    const sessionId = argv[resumeAt + 1] as Id<"draftSessions"> | undefined;
    if (!sessionId) {
      p.log.error("--resume needs a session id.");
      return;
    }
    const state = await convex.query(api.draft.state, { sessionId });
    if (state.complete) {
      p.log.error("That draft is already finished. Review it with: mtg-tutor review");
      return;
    }
    await runDraft(convex, sessionId, state.setCode, state.format);
    return;
  }

  const [setArg, fmtArg] = positional;
  const format = fmtArg ?? "PremierDraft";

  const s = spinner();
  s.start("Loading ingested sets");
  const sets = await convex.query(api.sets.list, {});
  s.stop(`${sets.length} set${sets.length === 1 ? "" : "s"} available`);

  let setCode = setArg?.toLowerCase();

  if (!setCode) {
    if (sets.length === 0) {
      p.log.error(
        "No sets have been ingested yet. Pull one in with:\n" +
          `  mtg-tutor draft <set>   ${pc.dim("(ingests it for you)")}`,
      );
      return;
    }
    const chosen = await p.select({
      message: "Pick a set to draft",
      options: sets.map((set) => ({
        value: set.code,
        label: `${set.code.toUpperCase()} ${pc.dim(set.format)}`,
        hint: `${set.cardCount} cards, ${set.ratedCardCount} with 17Lands data`,
      })),
    });
    if (p.isCancel(chosen)) {
      p.cancel("No set chosen.");
      return;
    }
    setCode = chosen as string;
  }

  const known = sets.find((set) => set.code === setCode && set.format === format);
  if (!known) {
    // Ingestion lives in the backend now, so the CLI asks for it rather than
    // fetching Scryfall and 17Lands itself.
    const ingest = await p.confirm({
      message: `${setCode.toUpperCase()} (${format}) is not ingested yet. Pull it in now?`,
    });
    if (p.isCancel(ingest) || !ingest) {
      p.cancel("Nothing to draft.");
      return;
    }

    const ing = spinner();
    ing.start(`Ingesting ${setCode.toUpperCase()} from Scryfall + 17Lands`);
    try {
      const result = await convex.action(api.sets.ingest, { setCode, format });
      ing.stop(
        `Ingested ${setCode.toUpperCase()}: ${result.cardCount} cards, ` +
          `${result.ratedCardCount} with 17Lands data`,
      );
      if (result.ratedCardCount === 0) {
        p.log.warn(
          "No 17Lands win rates for this set — scoring will fall back to rarity " +
            "baselines, which makes grades close to meaningless. 17Lands stops " +
            "serving win rates once a set leaves rotation.",
        );
      }
    } catch (e) {
      ing.stop(pc.red(`Failed to ingest "${setCode}"`));
      p.log.error(e instanceof Error ? e.message : String(e));
      return;
    }
  } else if (known.ratedCardCount === 0) {
    p.log.warn(
      `${setCode.toUpperCase()} has no 17Lands win rates — scoring leans entirely on ` +
        "rarity fallbacks. Try a set with more Premier Draft play.",
    );
  }

  const sessionId = await convex.mutation(api.draft.start, { setCode, format });
  await runDraft(convex, sessionId, setCode, format);
}

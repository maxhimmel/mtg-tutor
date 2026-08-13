import * as p from "@clack/prompts";
import pc from "picocolors";
import { api } from "@mtg-tutor/backend";
import { DEFAULT_POD } from "@mtg-tutor/core";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { convexClient } from "../../core/auth/session.js";
import { spinner } from "../../core/ui/spinner.js";
import { finishDraft, runDraft } from "./screen.js";
import { humanError } from "../../core/ui/humanError.js";
import { idFromLink } from "../challenge/index.js";

// Draft service entrypoint. `argv` is [setCode?, format?], plus
// `--resume <sessionId>` to pick an abandoned draft back up, or
// `--challenge <challengeId>` to take up a friend's.
export async function run(argv: string[]): Promise<void> {
  const resumeAt = argv.indexOf("--resume");
  const challengeAt = argv.indexOf("--challenge");
  const positional = argv.filter((a) => !a.startsWith("--"));

  const convex = await convexClient();

  // A flag on `draft` rather than a command of its own, because that is what it
  // is: the same forty-two picks against the same engine, with the deal pinned
  // to somebody else's seed. `accept` spends a draft from the daily allowance
  // exactly as starting one does.
  if (challengeAt !== -1) {
    const given = argv[challengeAt + 1];
    if (!given) {
      p.log.error("--challenge needs the link you were sent, or the id at the end of it.");
      return;
    }

    // They were sent a URL, so paste a URL.
    const challengeId = idFromLink(given) as Id<"challenges"> | null;
    if (!challengeId) {
      p.log.error(`"${given}" does not look like a challenge link.`);
      return;
    }

    let sessionId: Id<"draftSessions">;
    try {
      sessionId = await convex.mutation(api.challenges.accept, { challengeId });
    } catch (e) {
      // Every refusal here is a sentence written for a person -- somebody else
      // took it, it was withdrawn, the set has moved, you are out of drafts --
      // so it is passed through rather than restated.
      p.log.error(humanError(e));
      return;
    }

    const state = await convex.query(api.draft.state, { sessionId });
    p.log.success("You're in. Same packs, your own pod.");
    await runDraft(convex, sessionId, state.setCode, state.format);
    return;
  }

  if (resumeAt !== -1) {
    const sessionId = argv[resumeAt + 1] as Id<"draftSessions"> | undefined;
    if (!sessionId) {
      p.log.error("--resume needs a session id.");
      return;
    }
    const state = await convex.query(api.draft.state, { sessionId });
    // Every pick made is not the same as finished: the deck still has to be
    // built, and walking away between the two is the state this picks back up.
    // `finishDraft` shows the results outright if it was already built.
    if (state.complete) {
      p.intro(pc.bgCyan(pc.black(` Draft: ${state.setCode.toUpperCase()} — ${state.format} `)));
      await finishDraft(convex, sessionId);
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
        label: `${set.name ?? set.code.toUpperCase()} ${pc.dim(set.format)}`,
        hint: `${set.code.toUpperCase()} · ${set.cardCount} cards, ${set.ratedCardCount} with 17Lands data`,
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
      p.log.error(humanError(e));
      return;
    }
  } else if (known.ratedCardCount === 0) {
    p.log.warn(
      `${setCode.toUpperCase()} has no 17Lands win rates — scoring leans entirely on ` +
        "rarity fallbacks. Try a set with more Premier Draft play.",
    );
  }

  // Starting a draft can be refused -- not signed in, not invited, or out of
  // drafts for today -- and every one of those is a sentence the server wrote
  // for a person to read. Unwrapped it reaches the top-level catch and prints
  // as a stack trace, which is the same information dressed as a crash.
  let sessionId;
  try {
    // Explicit, and shared with the web. Omitting it is not "no preference" --
    // an absent pod means the ORIGINAL bots, which exists so pre-pod drafts
    // still replay, and it silently made every CLI draft the odd one out.
    sessionId = await convex.mutation(api.draft.start, { setCode, format, pod: DEFAULT_POD });
  } catch (e) {
    p.log.error(humanError(e));
    return;
  }

  await runDraft(convex, sessionId, setCode, format);
}

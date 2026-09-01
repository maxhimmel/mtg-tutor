import * as p from "@clack/prompts";
import pc from "picocolors";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";

// Writing down what was answered, from a terminal.
//
// The CLI's quiz and its misses drill both ask about a pick already made, and
// both used to end at the reveal -- the score was printed and forgotten, on
// both sides. The web is now recording those answers, and a CLI that did not
// would make the progression readout a measurement of which client somebody
// happened to use that evening. This is not a lesser client; see the note on
// `pickAnswers` in schema.ts for what the rows are for.
//
// AWAITED HERE, WHERE THE WEB DOES NOT AWAIT. A browser is mid-animation and
// has a screen to keep responsive; a terminal is already blocked on the next
// prompt, and one round trip between a card being chosen and the reveal
// printing is not a wait anybody can feel. It buys the honest failure below.
//
// A rejection is PRINTED rather than captured, because there is no PostHog in
// this process and never has been -- the same gap the drill events have. A dim
// line is the loudest channel available and the person is looking at it.

export async function recordAnswer(
  convex: ConvexHttpClient,
  answer: {
    sessionId: Id<"draftSessions">;
    pickIndex: number;
    asked: "review" | "misses";
    answered: string;
    rawBestName: string;
    contextBestName: string;
    gap: number;
    attemptId: string;
  },
): Promise<void> {
  try {
    await convex.mutation(api.pickAnswers.record, answer);
  } catch (error) {
    // Never rethrown. Losing a row costs a measurement; losing the run costs
    // the person the thing they sat down to do.
    p.log.warn(pc.dim(`Could not record that answer: ${String(error)}`));
  }
}

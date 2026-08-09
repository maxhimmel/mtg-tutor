import * as p from "@clack/prompts";
import pc from "picocolors";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { convexClient } from "../../core/auth/session.js";
import { env } from "../../core/env.js";
import { pct } from "../../core/ui/format.js";
import { humanError } from "../../core/ui/humanError.js";

// Daring a friend to your packs, from the terminal.
//
// Issuing and accepting, and deliberately not the comparison. The diff is two
// card faces over the whole shelf they came off, and a terminal cannot draw
// that -- so this prints the link and stops rather than shipping a worse version
// of the one screen the feature is for.
//
// The asymmetry is a standing one and worth stating: the CLI is not a lesser
// client. What keeps it honest is that everything both clients need lives in
// `packages/core` -- the comparison itself is `draft/diff.ts`, pure and shared,
// so a terminal reader is a rendering job rather than a reimplementation.

/** A challenge link, or the path plus where to put it. */
export function linkFor(challengeId: string): string {
  const path = `/challenge/${challengeId}`;
  return env.APP_URL ? `${env.APP_URL}${path}` : `${path} (on the web app)`;
}

/**
 * The id out of whatever somebody pasted.
 *
 * They were sent a URL, so a URL is what they will paste -- and possibly with
 * `/diff` on the end, or a trailing slash, because that is what was in their
 * clipboard. Taking the last meaningful segment costs nothing and saves the
 * only interaction this command has from failing on the obvious input.
 *
 * Returns null for anything that cannot be an id, so the caller can say so in a
 * sentence. Without this the argument validator rejects it first and the CLI
 * prints a `v.id("challenges")` dump at somebody who mistyped a link.
 */
export function idFromLink(input: string): string | null {
  const segment = input
    .trim()
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((s) => s && s !== "challenge" && s !== "diff")
    .pop();

  return segment && /^[a-z0-9]{20,64}$/.test(segment) ? segment : null;
}

/**
 * `mtg-tutor challenge [sessionId]` -- issue one.
 *
 * With no id, picks from your finished drafts. A challenge is an offer of a
 * particular deal, so it can only come from a draft that has one.
 */
export async function run(argv: string[]): Promise<void> {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const convex = await convexClient();

  let sessionId = positional[0] as Id<"draftSessions"> | undefined;

  if (!sessionId) {
    const drafts = await convex.query(api.review.list, {});
    if (drafts.length === 0) {
      p.outro("No finished drafts to challenge anyone with. Run one first: mtg-tutor draft <set>");
      return;
    }
    const chosen = await p.select({
      message: "Which packs should they draft?",
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

  // The backend can learn no name, so if the link is to say who it is from,
  // the sender has to say. Optional, and empty is a real answer.
  const from = await p.text({
    message: "Who is it from?",
    placeholder: "your name — enter to skip",
    defaultValue: "",
  });
  if (p.isCancel(from)) {
    p.cancel("Nothing sent.");
    return;
  }

  let challengeId: string;
  try {
    challengeId = await convex.mutation(api.challenges.create, {
      sessionId,
      fromName: String(from).trim() || undefined,
    });
  } catch (e) {
    p.log.error(humanError(e));
    return;
  }

  p.log.success("Challenge ready.");
  p.note(linkFor(challengeId), "Send this to somebody");
  p.outro(
    pc.dim("They draft your packs in a pod of their own. You'll be told when they finish."),
  );
}

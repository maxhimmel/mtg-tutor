import * as p from "@clack/prompts";
import pc from "picocolors";
import { isCorrectGuess, isDecisionPick, REVIEW } from "@mtg-tutor/core";
import type { Card, ReviewVerdict, StoredDraft, StoredPick } from "@mtg-tutor/core";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../../core/ui/format.js";
import { pickCard } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";
import { humanError } from "../../core/ui/humanError.js";

// quiz: guess each decision pick, then reveal. passive: reveal each pick in
// sequence, no guessing. breakdown: resolve everything up front and print the
// whole diagnostic at once (bookends + per-pick answers), no stepping.
export type ReviewMode = "quiz" | "passive" | "breakdown";

interface ReviewOpts {
  mode: ReviewMode;
}

export async function runReview(
  convex: ConvexHttpClient,
  draft: StoredDraft,
  opts: ReviewOpts,
) {
  p.intro(pc.bgCyan(pc.black(` Review: ${draft.setCode.toUpperCase()} — ${draft.createdAt.slice(0, 10)} `)));

  const sessionId = draft.id as Id<"draftSessions">;
  const finalPool = draft.picks.map((pk) => pk.picked);

  if (opts.mode === "breakdown") {
    await runBreakdown(convex, sessionId, draft, finalPool);
    return;
  }

  await showFrame(convex, sessionId, "open");

  const poolBefore: Card[] = [];
  let decisions = 0;
  let correct = 0;

  for (const pick of draft.picks) {
    const decision = isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards);

    // Trivial/forced picks flash by; only decision picks get a reveal (and, in
    // quiz mode, a guess prompt first).
    if (!decision) {
      renderTrivial(pick);
      poolBefore.push(pick.picked);
      continue;
    }

    let guess: Card | null = null;
    if (opts.mode === "quiz") {
      const header = `Pack ${pick.packNo} · Pick ${pick.pickNo} — which was the better pick?`;
      guess = await pickCard(pick.pack, header);
      if (!guess) {
        p.cancel("Review abandoned.");
        return;
      }
    }

    const verdict = await resolveVerdictInteractive(convex, sessionId, pick);
    const contextBest = verdict?.contextBestName ?? pick.bestName;

    let ok: boolean | null = null;
    if (guess) {
      decisions++;
      ok = isCorrectGuess(guess.name, pick.bestName, contextBest);
      if (ok) correct++;
    }
    renderReveal(pick, verdict, contextBest, guess, ok);

    poolBefore.push(pick.picked);
  }

  await showFrame(convex, sessionId, "close");

  if (decisions > 0) {
    p.note(
      `You identified the better pick on ${pc.bold(`${correct}/${decisions}`)} decision picks ` +
        `(${((correct / decisions) * 100).toFixed(0)}%).`,
      "Session score",
    );
  }
  p.outro(pc.green("Review complete. Keep sharpening those reads."));
}

// Batch "just give me the answers" mode: resolve every decision pick's verdict up
// front (concurrently), then print the whole diagnostic in one pass.
async function runBreakdown(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  draft: StoredDraft,
  finalPool: Card[],
) {
  await showFrame(convex, sessionId, "open");

  const decisionIdx = draft.picks
    .map((pk, i) => ({ pk, i }))
    .filter(({ pk }) => isDecisionPick(pk.pack.length, REVIEW.decisionPickMinCards));

  const verdicts = new Map<number, ReviewVerdict | undefined>();
  const spin = spinner();
  spin.start(`Analyzing ${decisionIdx.length} decision picks`);
  let done = 0;
  await mapLimit(decisionIdx, 5, async ({ pk, i }) => {
    verdicts.set(i, await fetchVerdict(convex, sessionId, pk));
    spin.message(`Analyzing decision picks (${++done}/${decisionIdx.length})`);
  });
  spin.stop(`Analyzed ${decisionIdx.length} decision picks`);

  draft.picks.forEach((pick, i) => {
    if (!isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards)) {
      renderTrivial(pick);
      return;
    }
    const verdict = verdicts.get(i);
    renderReveal(pick, verdict, verdict?.contextBestName ?? pick.bestName, null, null);
  });

  await showFrame(convex, sessionId, "close");
  p.outro(pc.green("Breakdown complete."));
}

// Resolve a limited number of async tasks at a time so a full draft's worth of
// verdicts doesn't fire dozens of concurrent API calls.
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// Why the coach stopped answering, once it stops for a reason worth reading.
// Per process, which is per `mtg-tutor review` run.
let refused: string | null = null;

// The verdict already frozen on the session wins; otherwise the backend action
// asks the model once and stores it. Returns undefined when the deployment has
// no model key, when the call fails, or when the answer named a card that was
// not in the pack and the backend refused it -- callers show the data-only
// reveal for all three.
async function fetchVerdict(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  pick: StoredPick,
): Promise<ReviewVerdict | undefined> {
  if (pick.verdict) return pick.verdict;
  if (refused) return undefined;
  try {
    return (await convex.action(api.review.verdict, { sessionId, pickIndex: pick.pickIndex })) ?? undefined;
  } catch (e) {
    // The action returns null when the coach simply had nothing to say, so a
    // throw is a refusal -- not signed in, not your draft, or out of reviews.
    // Recorded once and then honoured: asking the remaining sixteen picks only
    // buys sixteen more copies of the same answer.
    refused = humanError(e);
    p.log.warn(refused);
    return undefined;
  }
}

// Interactive wrapper: shows a per-pick spinner around fetchVerdict.
async function resolveVerdictInteractive(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  pick: StoredPick,
): Promise<ReviewVerdict | undefined> {
  if (pick.verdict) return pick.verdict;
  const spin = spinner();
  spin.start("Coach is reviewing the pick");
  const verdict = await fetchVerdict(convex, sessionId, pick);
  // Silent once a refusal has been printed: the reason is already on screen and
  // "unavailable" under it just restates it, once per remaining pick.
  spin.stop(verdict || refused ? "" : pc.yellow("AI verdict unavailable — showing data only"));
  return verdict;
}

function optionsPanel(pick: StoredPick, contextBest: string): string {
  return [...pick.pack]
    .sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0))
    .slice(0, 6)
    .map((c) => {
      const marks = [
        c.name === pick.picked.name ? pc.cyan("← you took") : "",
        c.name === pick.bestName ? pc.yellow("raw-best") : "",
        c.name === contextBest ? pc.green("context-best") : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `  ${c.name} ${pc.dim(`GIH ${pct(c.gihWinRate)}`)}${marks ? "  " + marks : ""}`;
    })
    .join("\n");
}

function renderReveal(
  pick: StoredPick,
  verdict: ReviewVerdict | undefined,
  contextBest: string,
  guess: Card | null,
  ok: boolean | null,
) {
  const head =
    ok == null
      ? pc.dim(`P${pick.packNo}P${pick.pickNo}`)
      : ok
        ? pc.green(`✓ P${pick.packNo}P${pick.pickNo} — nice read`)
        : pc.red(`✗ P${pick.packNo}P${pick.pickNo}`);

  const lines: string[] = [];
  if (guess) lines.push(`You guessed: ${pc.bold(guess.name)}`);
  lines.push(optionsPanel(pick, contextBest));
  if (verdict) {
    lines.push("");
    lines.push(pc.bold("Divergence: ") + verdict.divergenceLesson);
    lines.push(pc.bold("Coach: ") + verdict.narrative);
  } else if (contextBest !== pick.bestName) {
    lines.push("");
    lines.push(pc.dim(`Context-best: ${contextBest}`));
  }
  p.note(lines.join("\n"), head);
}

function renderTrivial(pick: StoredPick) {
  p.log.message(
    pc.dim(`P${pick.packNo}P${pick.pickNo}: took ${pick.picked.name} (${pct(pick.picked.gihWinRate)}) · forced pick`),
  );
}

async function showFrame(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  phase: "open" | "close",
) {
  const spin = spinner();
  spin.start(phase === "open" ? "Coach is sizing up the draft" : "Coach is writing the recap");
  try {
    const text = await convex.action(api.review.frame, { sessionId, phase });
    spin.stop("");
    if (text) p.note(text, phase === "open" ? "Draft overview" : "Signal-reading recap");
  } catch (e) {
    spin.stop(pc.yellow(`Frame unavailable (${humanError(e)})`));
  }
}

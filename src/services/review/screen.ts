import * as p from "@clack/prompts";
import pc from "picocolors";
import type { Card } from "../../core/model/card.js";
import type { ReviewVerdict, StoredDraft, StoredPick } from "../../core/model/review.js";
import { isCorrectGuess, isDecisionPick } from "../../core/scoring/score.js";
import { REVIEW, ANTHROPIC } from "../../core/config.js";
import { pct } from "../../core/ui/format.js";
import { pickCard } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";
import { buildDraftFrame, buildReviewContext } from "../../core/tutor/reviewPrompt.js";
import { draftFrame, reviewPick } from "../../core/tutor/reviewTutor.js";
import { saveVerdict } from "../../core/db/db.js";

// quiz: guess each decision pick, then reveal. passive: reveal each pick in
// sequence, no guessing. report: resolve everything up front and print the whole
// diagnostic at once (bookends + per-pick answers), no stepping.
export type ReviewMode = "quiz" | "passive" | "report";

interface ReviewOpts {
  mode: ReviewMode;
}

export async function runReview(
  draft: StoredDraft,
  colorPairWinRates: Map<string, number>,
  opts: ReviewOpts,
) {
  p.intro(pc.bgCyan(pc.black(` Review: draft #${draft.id} — ${draft.setCode.toUpperCase()} `)));

  const finalPool = draft.picks.map((pk) => pk.picked);

  if (opts.mode === "report") {
    await runReport(draft, finalPool, colorPairWinRates);
    return;
  }

  await showFrame("open", finalPool, colorPairWinRates);

  const poolBefore: Card[] = [];
  let decisions = 0;
  let correct = 0;

  for (const pick of draft.picks) {
    const decision = isDecisionPick(pick.pack, REVIEW.decisionPickMinCards);

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

    const verdict = await resolveVerdictInteractive(pick, poolBefore);
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

  await showFrame("close", finalPool, colorPairWinRates);

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
async function runReport(draft: StoredDraft, finalPool: Card[], colorPairWinRates: Map<string, number>) {
  await showFrame("open", finalPool, colorPairWinRates);

  // Each pick's context is the pool as it stood BEFORE that pick.
  const poolBefore = draft.picks.map((_, i) => draft.picks.slice(0, i).map((pk) => pk.picked));
  const decisionIdx = draft.picks
    .map((pk, i) => ({ pk, i }))
    .filter(({ pk }) => isDecisionPick(pk.pack, REVIEW.decisionPickMinCards));

  const verdicts = new Map<number, ReviewVerdict | undefined>();
  if (ANTHROPIC.enabled) {
    const spin = spinner();
    spin.start(`Analyzing ${decisionIdx.length} decision picks`);
    let done = 0;
    await mapLimit(decisionIdx, 5, async ({ pk, i }) => {
      verdicts.set(i, await fetchVerdict(pk, poolBefore[i]));
      spin.message(`Analyzing decision picks (${++done}/${decisionIdx.length})`);
    });
    spin.stop(`Analyzed ${decisionIdx.length} decision picks`);
  }

  draft.picks.forEach((pick, i) => {
    if (!isDecisionPick(pick.pack, REVIEW.decisionPickMinCards)) {
      renderTrivial(pick);
      return;
    }
    const verdict = verdicts.get(i);
    renderReveal(pick, verdict, verdict?.contextBestName ?? pick.bestName, null, null);
  });

  await showFrame("close", finalPool, colorPairWinRates);
  p.outro(pc.green("Report complete."));
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

// Cached verdict wins; otherwise ask the AI once and freeze it. No UI — callers
// own the spinner. Returns undefined if AI is disabled or the call fails.
async function fetchVerdict(pick: StoredPick, poolBefore: Card[]): Promise<ReviewVerdict | undefined> {
  if (pick.verdict) return pick.verdict;
  if (!ANTHROPIC.enabled) return undefined;
  try {
    const verdict = await reviewPick(buildReviewContext(pick, poolBefore));
    saveVerdict(pick.id, verdict);
    return verdict;
  } catch {
    return undefined;
  }
}

// Interactive wrapper: shows a per-pick spinner around fetchVerdict.
async function resolveVerdictInteractive(pick: StoredPick, poolBefore: Card[]): Promise<ReviewVerdict | undefined> {
  if (pick.verdict || !ANTHROPIC.enabled) return pick.verdict;
  const spin = spinner();
  spin.start("Coach is reviewing the pick");
  const verdict = await fetchVerdict(pick, poolBefore);
  spin.stop(verdict ? "" : pc.yellow("AI verdict unavailable — showing data only"));
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
  phase: "open" | "close",
  pool: Card[],
  colorPairWinRates: Map<string, number>,
) {
  if (!ANTHROPIC.enabled) return;
  const spin = spinner();
  spin.start(phase === "open" ? "Coach is sizing up the draft" : "Coach is writing the recap");
  try {
    const text = await draftFrame(buildDraftFrame(phase, pool, colorPairWinRates));
    spin.stop("");
    if (text) p.note(text, phase === "open" ? "Draft overview" : "Signal-reading recap");
  } catch (e) {
    spin.stop(pc.yellow(`Frame unavailable (${e instanceof Error ? e.message : String(e)})`));
  }
}

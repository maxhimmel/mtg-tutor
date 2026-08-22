"use client";

import { useMemo, type ReactNode } from "react";
import { loadPrinciples, splitCitations, type ExplainLine, type Principle } from "@mtg-tutor/core";
import { AiResponse } from "../../components/AiResponse";
import type { Anchor } from "../../components/AiResponse";
import { PrincipleBadges } from "../../components/PrincipleBadge";

const PRINCIPLES = loadPrinciples();

/**
 * Who is talking in the coach panel, and why it is not the model.
 *
 * WHY THIS IS A UNION AND NOT A COUPLE OF BOOLEANS
 *
 * The board had `skipped` and `coachSpent`, and everything else fell through to
 * the deterministic explanation under a heading that said "Coach". Five states,
 * three of them titled the same, two of them saying nothing at all:
 *
 *   a model answered      "Coach"                                   prose
 *   the pack was forced   "Coach — skipped, this pick was forced"    numbers
 *   the coach is spent    "Coach"            a warning line, then   numbers
 *   no model key          "Coach"                                   numbers
 *   something broke       "Coach"                                   numbers
 *
 * So the panel never read as DISABLED. It read as a coach that had got worse,
 * which is the more damaging of the two, and it is what issue #4B is about.
 *
 * The fix is that the title names the speaker. There is no state in which the
 * app's own arithmetic wears the coach's name, and every state that is not the
 * model says in one line why and — where the server knows — when it is back.
 *
 * None of this was a data gap. `coach_unavailable.reason` has separated
 * `declined` / `quota` / `unconfigured` / `error` since it was written. The
 * instrument was built and the screen was never told.
 */
export type CoachVoice =
  | { kind: "model"; detail?: undefined }
  /** The player turned it off. Not a failure and it must not apologise. */
  | { kind: "off"; detail?: undefined }
  /** The pack is down to its last few cards, so the pick was not a decision. */
  | { kind: "forced"; detail?: undefined }
  /** Out of coaching for today. `detail` is the server's own sentence. */
  | { kind: "spent"; detail?: string }
  /** The deployment has no model key. A dev fact, said plainly. */
  | { kind: "unconfigured"; detail?: undefined }
  | { kind: "error"; detail?: undefined };

/**
 * The title and the line under it, per speaker.
 *
 * "Reading the numbers" for every non-model state, because that is literally
 * what `explainPick` does and it is the honest name for a readout built out of
 * win rates. The subtitle carries the WHY, which is the part that differs.
 */
const SPEAKER: Record<CoachVoice["kind"], { title: string; why: string | null }> = {
  model: { title: "Coach", why: null },
  off: {
    title: "Reading the numbers",
    why: "The coach is off. Turn it back on beside the pack.",
  },
  forced: {
    title: "Reading the numbers",
    why: "This pick was forced — there was nothing here to coach.",
  },
  // Overridden by the server's sentence, which knows when it comes back.
  spent: { title: "Reading the numbers", why: "You are out of coaching for today." },
  unconfigured: {
    title: "Reading the numbers",
    why: "This deployment has no model key, so there is no coach to ask.",
  },
  error: {
    title: "Reading the numbers",
    why: "The coach did not answer. Your picks are still being graded.",
  },
};

/**
 * The coach panel, whoever is speaking.
 *
 * The AI rating strip only appears when a model actually wrote the answer.
 * Passing the deterministic readout through `AiResponse` — which the old board
 * did — files a thumbs-down about arithmetic against `llmCall`'s `coach` area,
 * so a complaint about a fallback lands on a model call that never happened.
 * The fallback impersonating the coach reached the feedback table too.
 */
export function CoachPanel({
  voice,
  prose,
  numbers: lines,
  anchor,
  render,
  footer,
}: {
  voice: CoachVoice;
  prose: string;
  numbers: ExplainLine[];
  anchor: Anchor;
  /** The board's card-linking renderer, which only it can build. */
  render: (text: string) => ReactNode;
  /** The "coach this pick anyway" button, when there is one. */
  footer?: ReactNode;
}) {
  const speaker = SPEAKER[voice.kind];
  const why = voice.detail ?? speaker.why;

  // BOTH speakers cite the corpus, so both are split here.
  //
  // The coach cites because it is told to; `explainPick` cites because it names
  // the principle the tiebreak acted on. While the fallback was stringified into
  // the same variable as the coach's prose, one `splitCitations` on the board
  // covered both by accident. Drawing them separately means owning it, and
  // getting it wrong ships "[DECK-08]" to the player as literal text.
  const spoken = useMemo(() => splitCitations(prose, PRINCIPLES), [prose]);
  const readout = useMemo(() => {
    const split = lines.map((l) => ({ line: l, cited: splitCitations(l.text, PRINCIPLES) }));
    const seen = new Map<string, Principle>();
    for (const s of split) for (const p of s.cited.principles) seen.set(p.id, p);
    return {
      lines: split.map(({ line, cited }) => ({ ...line, text: cited.prose })),
      principles: [...seen.values()],
    };
  }, [lines]);

  if (voice.kind === "model") {
    return (
      <AiResponse
        surface="coach"
        title={speaker.title}
        // `quote` is the contract that makes a complaint about the coach
        // actionable at all: this prose streams out of an httpAction and is
        // written down nowhere, so the copy here is the only one that exists.
        quote={prose || undefined}
        ready={Boolean(prose)}
        anchor={anchor}
      >
        <div className="min-h-[3.2rem] whitespace-pre-wrap leading-relaxed">
          {prose ? render(spoken.prose) : <span className="text-base-content/60">thinking…</span>}
        </div>
        <PrincipleBadges principles={spoken.principles} />
        {footer}
      </AiResponse>
    );
  }

  return (
    <div className="border-t border-base-300 pt-3">
      <div className="eyebrow mb-1.5">{speaker.title}</div>
      {why && <p className="mb-2 text-xs leading-relaxed text-base-content/55">{why}</p>}
      <div className="min-h-[3.2rem]">
        <Numbers lines={readout.lines} render={render} />
      </div>
      <PrincipleBadges principles={readout.principles} />
      {footer}
    </div>
  );
}

/**
 * The deterministic explanation, drawn as what it is.
 *
 * It was joined with newlines into `whitespace-pre-wrap` and typeset as a
 * paragraph, with "✅" and "⚠️" standing in for the structure a browser can
 * actually draw. That is most of issue #4A: the complaint reads as "the writing
 * is ugly", and the cause is that a small table of findings was being set as
 * prose. Core now says what each line is FOR (`ExplainTone`) and this decides
 * what that looks like -- the same split that lets the terminal client keep its
 * glyphs.
 *
 * `render` rather than plain text because the lines name cards, and the board is
 * the only thing that can make a name hoverable. Same `CardText` the coach's
 * prose goes through, so a card is a card wherever the sentence came from.
 */
function Numbers({
  lines,
  render,
}: {
  lines: ExplainLine[];
  render: (text: string) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => (
        <div
          key={i}
          className={
            line.tone === "headline"
              ? "text-sm font-medium leading-relaxed"
              : line.tone === "caution"
                ? "flex gap-1.5 text-sm leading-relaxed text-warning"
                : "flex gap-1.5 text-sm leading-relaxed text-base-content/70"
          }
        >
          {line.tone !== "headline" && (
            <span aria-hidden className="select-none text-base-content/30">
              —
            </span>
          )}
          <span>{render(line.text)}</span>
        </div>
      ))}
    </div>
  );
}

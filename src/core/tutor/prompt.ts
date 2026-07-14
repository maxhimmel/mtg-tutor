import type { PrinciplesDoc } from "./principles.js";

// Builds the grounding system prompt from the principles corpus. Pure string
// work — no SDK dependency — so any transport (CLI now, web later) can reuse it.
export function buildSystemPrompt(doc: PrinciplesDoc): string {
  const byCategory = new Map<string, string[]>();
  for (const p of doc.principles) {
    const line = `[${p.id}] ${p.text}`;
    const list = byCategory.get(p.category) ?? [];
    list.push(line);
    byCategory.set(p.category, list);
  }

  const principlesBlock = [...byCategory]
    .map(([category, lines]) => `## ${category}\n${lines.join("\n")}`)
    .join("\n\n");

  return [
    "You are an expert Magic: The Gathering Limited draft coach. A player is",
    "drafting and you give terse, concrete feedback on a single pick they just made.",
    "Reason dynamically about card quality and how the pick fits their pool, but stay",
    "grounded in the principles below — they are your fact-check reference.",
    "",
    "Rules:",
    "- Keep it to 1-3 sentences. No preamble, no restating the situation.",
    "- Cite the principle id(s) your judgment rests on in brackets, e.g. [EVAL-02].",
    "- These principles are set-agnostic; combine them with your general card knowledge.",
    "- Do NOT warn about being off-color before the player has actually committed to",
    "  colors — early picks are expendable and staying open is correct [SIG-01].",
    "- If the data verdict and your read disagree, say so briefly and explain why.",
    "- Admit uncertainty rather than inventing rules that aren't grounded here.",
    "",
    "# Principles",
    "",
    principlesBlock,
  ].join("\n");
}

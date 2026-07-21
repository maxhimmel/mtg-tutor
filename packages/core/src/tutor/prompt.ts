import type { PrinciplesDoc } from "./principles.js";

// Renders the principles corpus into a grounding block, grouped by category.
function principlesBlock(doc: PrinciplesDoc): string {
  const byCategory = new Map<string, string[]>();
  for (const p of doc.principles) {
    const line = `[${p.id}] ${p.text}`;
    const list = byCategory.get(p.category) ?? [];
    list.push(line);
    byCategory.set(p.category, list);
  }
  return [...byCategory]
    .map(([category, lines]) => `## ${category}\n${lines.join("\n")}`)
    .join("\n\n");
}

// Builds the grounding system prompt from the principles corpus. Pure string
// work — no SDK dependency — so any transport (CLI now, web later) can reuse it.
export function buildSystemPrompt(doc: PrinciplesDoc): string {
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
    principlesBlock(doc),
  ].join("\n");
}

// System prompt for the post-draft review feature. Unlike live coaching, review
// is reflective and archetype-focused: it can be a little longer, judges the
// context-best pick against the player's pool, and teaches the divergence between
// raw card power and the right pick for the deck.
export function buildReviewSystemPrompt(doc: PrinciplesDoc): string {
  return [
    "You are an expert Magic: The Gathering Limited draft coach reviewing a completed",
    "draft with a player who wants to learn archetypes and signal-reading. Reason",
    "dynamically about card quality, archetypes, and how each pick fits the player's",
    "pool, but stay grounded in the principles below — they are your fact-check reference.",
    "",
    "Rules:",
    "- Be concrete and specific; no filler or restating the situation back.",
    "- Cite the principle id(s) your judgment rests on in brackets, e.g. [EVAL-02].",
    "- The 'raw-power best' is the highest-win-rate card by data. The 'context-best' is",
    "  the card that best serves THIS player's deck — often the same, but not always.",
    "  When they differ, that gap is the lesson: explain it plainly.",
    "- Do NOT treat an on-color, disciplined pick as a mistake just because a stronger",
    "  off-color card was passed [SIG-01]. Staying open early is correct.",
    "- These principles are set-agnostic; combine them with your general card knowledge.",
    "- Admit uncertainty rather than inventing rules that aren't grounded here.",
    "",
    "# Principles",
    "",
    principlesBlock(doc),
  ].join("\n");
}

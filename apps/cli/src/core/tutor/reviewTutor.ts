import { getClient } from "../anthropic/client.js";
import { ANTHROPIC } from "../config.js";
import { loadPrinciples } from "./principles.js";
import { buildReviewSystemPrompt } from "./prompt.js";
import type { ReviewVerdict } from "../model/review.js";

// The review "brain". Shares the client + principles corpus with the live coach
// but frames the draft reflectively and returns a STRUCTURED verdict (via forced
// tool use) so grading stays deterministic and the verdict can be cached.

let systemPrompt: string | undefined;
function system(): string {
  if (!systemPrompt) systemPrompt = buildReviewSystemPrompt(loadPrinciples());
  return systemPrompt;
}

const cachedSystem = () => [
  { type: "text" as const, text: system(), cache_control: { type: "ephemeral" as const } },
];

const VERDICT_TOOL = {
  name: "record_verdict",
  description: "Record the coaching verdict for this pick.",
  input_schema: {
    type: "object" as const,
    properties: {
      contextBestName: {
        type: "string",
        description:
          "Exact name of the card that was the best pick given the player's pool and signals (the context-best). May equal the raw-power best.",
      },
      divergenceLesson: {
        type: "string",
        description:
          "1-2 sentences: why the context-best and raw-power best agree or differ, and what that teaches.",
      },
      narrative: {
        type: "string",
        description: "2-4 sentences coaching the pick, citing principle ids in brackets.",
      },
    },
    required: ["contextBestName", "divergenceLesson", "narrative"],
  },
};

export async function reviewPick(userContent: string): Promise<ReviewVerdict> {
  const res = await getClient().messages.create({
    model: ANTHROPIC.model,
    // Headroom so the tool-input JSON isn't truncated mid-object (which used to
    // surface as "verdict was missing required fields").
    max_tokens: 1024,
    system: cachedSystem(),
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: VERDICT_TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Review model did not return a structured verdict.");
  }
  const v = (block.input ?? {}) as Partial<ReviewVerdict>;

  // The context-best card name is the one field we can't invent — without it
  // there's no verdict. The prose fields are gracefully defaulted if a long
  // narrative got clipped, so a near-complete verdict still teaches something.
  if (!v.contextBestName) {
    throw new Error("Review verdict was missing the context-best card.");
  }
  return {
    contextBestName: v.contextBestName,
    divergenceLesson: v.divergenceLesson || "—",
    narrative: v.narrative || "(no coaching returned)",
  };
}

// The archetype bookends (opening read / closing recap) — plain prose.
export async function draftFrame(userContent: string): Promise<string> {
  const res = await getClient().messages.create({
    model: ANTHROPIC.model,
    max_tokens: 500,
    system: cachedSystem(),
    messages: [{ role: "user", content: userContent }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

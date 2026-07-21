import { getClient } from "../anthropic/client.js";
import { ANTHROPIC } from "../config.js";
import { loadPrinciples } from "./principles.js";
import { buildSystemPrompt } from "./prompt.js";

// The reusable "grounded tutor" brain. Feature-agnostic: hand it a user message,
// get a stream of text back. The chat/quiz features (later) call the same thing.

let systemPrompt: string | undefined;
function system(): string {
  if (!systemPrompt) systemPrompt = buildSystemPrompt(loadPrinciples());
  return systemPrompt;
}

// Thinking is disabled: the coaching is 1-3 sentences and latency-sensitive
// (up to 45 calls per draft), so the whole token budget should go to the answer.
// Flip to { type: "adaptive" } (and raise maxTokens) for deeper reasoning.
export async function* streamGroundedReply(
  userContent: string,
): AsyncGenerator<string> {
  const stream = getClient().messages.stream({
    model: ANTHROPIC.model,
    max_tokens: ANTHROPIC.maxTokens,
    thinking: { type: "disabled" },
    output_config: { effort: ANTHROPIC.effort },
    // The principles corpus is identical across every pick, so cache it: only
    // the first call in a draft pays to write it, the rest read it cheaply.
    system: [{ type: "text", text: system(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

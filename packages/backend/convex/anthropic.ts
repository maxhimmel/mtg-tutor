// Raw fetch rather than @anthropic-ai/sdk: the SDK reaches for node:fs in its
// credential loader, which the V8 runtime cannot provide. See http.ts, which
// does the same thing for the streaming path.

const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

export class CoachUnavailableError extends Error {}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new CoachUnavailableError(
      "This deployment has no ANTHROPIC_API_KEY, so AI coaching is unavailable.",
    );
  }
  return key;
}

interface MessagesRequest {
  system: string;
  userContent: string;
  maxTokens: number;
  tool?: { name: string; description: string; input_schema: Record<string, unknown> };
}

async function messages(req: MessagesRequest): Promise<unknown[]> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: req.maxTokens,
      // The principles corpus is identical on every call, so cache it: only the
      // first call pays to write it.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.userContent }],
      ...(req.tool
        ? { tools: [req.tool], tool_choice: { type: "tool", name: req.tool.name } }
        : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as { content?: unknown[] };
  return body.content ?? [];
}

export async function text(req: Omit<MessagesRequest, "tool">): Promise<string> {
  const content = await messages(req);
  return content
    .filter((b): b is { type: "text"; text: string } => (b as { type?: string }).type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Forced tool use, so the shape is the model's output rather than parsed prose. */
export async function toolInput(
  req: MessagesRequest & { tool: NonNullable<MessagesRequest["tool"]> },
): Promise<Record<string, unknown>> {
  const content = await messages(req);
  const block = content.find((b) => (b as { type?: string }).type === "tool_use") as
    | { input?: Record<string, unknown> }
    | undefined;

  if (!block) throw new Error("The model did not return a structured verdict.");
  return block.input ?? {};
}

// The provider seam. Everything that knows which model is answering lives here;
// callers pass a prompt and get text, an object, or a stream back.
//
// Raw fetch was the right call while Anthropic was the only provider -- the
// official SDK statically imports node:fs, which the V8 runtime cannot supply.
// The AI SDK reaches for node builtins only through a guarded
// `process.getBuiltinModule` lookup, so it bundles and runs here (verified
// against the dev deployment, including that the prompt cache still hits).

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  Output,
  generateText,
  streamText,
  type JSONValue,
  type LanguageModel,
  type SystemModelMessage,
} from "ai";
import type { z } from "zod";

export class CoachUnavailableError extends Error {}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

// Provider options are namespaced by provider name, so tuning() and resolve()
// have to agree on this string.
const COMPATIBLE_NAME = "local";

function isAnthropic(): boolean {
  // Anthropic stays the default so an unconfigured production deployment keeps
  // behaving exactly as it did before this file existed.
  return (process.env.LLM_PROVIDER ?? "anthropic") === "anthropic";
}

function resolve(): LanguageModel {
  if (!isAnthropic()) {
    const baseURL = process.env.LLM_BASE_URL;
    if (!baseURL) {
      throw new CoachUnavailableError(
        "LLM_PROVIDER is openai-compatible but LLM_BASE_URL is not set.",
      );
    }
    const provider = createOpenAICompatible({
      name: COMPATIBLE_NAME,
      baseURL,
      // Local runtimes (Ollama, llama.cpp) accept anything here; hosted
      // gateways do not, so it is passed through when present.
      apiKey: process.env.LLM_API_KEY,
      // Without this the provider falls back to `response_format: json_object`,
      // the legacy JSON mode -- which Groq rejects outright unless the prompt
      // happens to contain the word "json", and which no endpoint validates
      // against the schema. Proper json_schema is the default because Groq,
      // OpenRouter, vLLM and recent Ollama all support it; set
      // LLM_JSON_SCHEMA=false for an endpoint that does not.
      supportsStructuredOutputs: process.env.LLM_JSON_SCHEMA !== "false",
    });
    return provider(process.env.LLM_MODEL ?? "");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CoachUnavailableError(
      "This deployment has no ANTHROPIC_API_KEY, so AI coaching is unavailable.",
    );
  }
  return createAnthropic({ apiKey })(
    process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
  );
}

interface Request {
  system: string;
  userContent: string;
  maxTokens: number;
  /**
   * Coaching fires up to 45 times in one draft, so the budget should go to the
   * answer rather than to thinking. This matters more than it looks on a
   * reasoning model: gpt-oss on Groq spent an entire 64-token budget thinking
   * and returned an empty string.
   */
  fast?: boolean;
}

/**
 * The prompt corpus is byte-identical on every call, so it is worth caching:
 * only the first call of a draft pays to write it.
 *
 * Passed as an object rather than a bare string deliberately -- the provider
 * reads `cacheControl` off the system message's own providerOptions, so
 * `instructions: someString` would still work and silently stop caching.
 */
function instructions(system: string): SystemModelMessage {
  return {
    role: "system",
    content: system,
    ...(isAnthropic()
      ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
      : {}),
  };
}

// Annotated because the openai-compatible branch keys off a const rather than a
// literal, which otherwise widens to an index signature that admits undefined.
function tuning(fast?: boolean): Record<string, Record<string, JSONValue>> | undefined {
  if (!fast) return undefined;
  return isAnthropic()
    ? { anthropic: { thinking: { type: "disabled" as const }, effort: "low" as const } }
    : // The openai-compatible analogue. Ignored by endpoints that don't reason,
      // which is why it is safe to send unconditionally on this branch.
      { [COMPATIBLE_NAME]: { reasoningEffort: "low" } };
}

function common(req: Request) {
  return {
    model: resolve(),
    instructions: instructions(req.system),
    messages: [{ role: "user" as const, content: req.userContent }],
    maxOutputTokens: req.maxTokens,
    providerOptions: tuning(req.fast),
  };
}

export async function text(req: Request): Promise<string> {
  const { text: out } = await generateText(common(req));
  return out.trim();
}

/**
 * Schema-constrained output. This replaced forced tool use, which small local
 * models handle badly -- the AI SDK falls back to JSON mode for models that
 * cannot do tool-shaped structured output.
 */
export async function object<T>(req: Request & { schema: z.ZodType<T> }): Promise<T> {
  const { output } = await generateText({
    ...common(req),
    output: Output.object({ schema: req.schema }),
  });
  return output;
}

/**
 * Plain UTF-8 text, not SSE and not the AI SDK's own stream protocol: both the
 * browser and the CLI read this body directly with a TextDecoder, so anything
 * framed would render as visible garbage rather than fail loudly.
 */
export function stream(req: Request): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let failure: unknown;

  const { textStream } = streamText({
    ...common(req),
    // streamText suppresses errors instead of throwing, so a failure has to be
    // caught here or it becomes a silently truncated answer.
    onError: ({ error }) => {
      failure = error;
    },
  });

  // Drained with an explicit pump in start() rather than pull(). With pull(),
  // the response body reached the client but the stream never terminated and
  // the connection hung open; pumping to completion here closes it reliably.
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) controller.enqueue(encoder.encode(chunk));
      } catch (e) {
        failure ??= e;
      }
      // Surfaced inline rather than as a status code: the response has already
      // begun by the time this is known, and both callers treat a truncated
      // body as "partial coaching already shown" rather than as an error.
      if (failure !== undefined) {
        const message = failure instanceof Error ? failure.message : String(failure);
        controller.enqueue(encoder.encode(`\n[coaching interrupted: ${message}]`));
      }
      controller.close();
    },
  });
}

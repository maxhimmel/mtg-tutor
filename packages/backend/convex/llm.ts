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
  generateObject,
  generateText,
  streamText,
  type LanguageModel,
  type SystemModelMessage,
} from "ai";
import type { z } from "zod";

export class CoachUnavailableError extends Error {}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

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
      name: "local",
      baseURL,
      // Local runtimes (Ollama, llama.cpp) accept anything here; hosted
      // gateways do not, so it is passed through when present.
      apiKey: process.env.LLM_API_KEY,
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
   * Coaching fires up to 45 times in one draft, so the budget goes to the
   * answer rather than to thinking. Anthropic-only; the openai-compatible path
   * never sends it, because a local runtime would reject the unknown fields.
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

function tuning(fast?: boolean) {
  if (!isAnthropic() || !fast) return undefined;
  return { anthropic: { thinking: { type: "disabled" as const }, effort: "low" as const } };
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
  const { object: out } = await generateObject({ ...common(req), schema: req.schema });
  return out;
}

/**
 * Plain UTF-8 text, not SSE and not the AI SDK's own stream protocol: both the
 * browser and the CLI read this body directly with a TextDecoder.
 */
export function stream(req: Request): ReadableStream<Uint8Array> {
  const { textStream } = streamText(common(req));
  return textStream.pipeThrough(new TextEncoderStream());
}

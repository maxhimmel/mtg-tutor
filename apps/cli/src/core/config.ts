import { env } from "./env.js";

// Runtime config for the CLI process. Anything that reads the environment or
// configures I/O lives here; pure domain constants live in @mtg-tutor/core.

export const HTTP = {
  userAgent:
    "mtg-tutor/0.1 (draft-trainer; https://github.com/local/mtg-tutor) contact:local",
  scryfallDelayMs: 90,
};

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Claude-powered pick coaching. `enabled` gates the feature so a draft still
// runs (with deterministic feedback) when no API key is present.
export const ANTHROPIC = {
  model: env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  maxTokens: 400, // short, snappy per-pick coaching
  effort: "low" as const, // output_config.effort — fast per pick; tunable
  enabled: !!env.ANTHROPIC_API_KEY,
};

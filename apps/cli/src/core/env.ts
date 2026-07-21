import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// The single boundary that touches the raw environment. Everything else imports
// typed values from here and never reads process.env directly.

try {
  process.loadEnvFile();
} catch {
  // no .env file — that's fine
}

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

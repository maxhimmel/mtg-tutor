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
    // The Convex deployment this CLI drives. Point it at your dev deployment:
    // pointing it at production writes production data and spends the
    // production Anthropic key on every test run.
    CONVEX_URL: z.string().url(),
    // Only needed when the HTTP-action origin cannot be derived from CONVEX_URL
    // by swapping the host -- a local deployment serves them on a second port of
    // the same loopback address, with no .convex.cloud to replace.
    CONVEX_SITE_URL: z.string().url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Lets `pnpm build` and the tests run without a deployment configured.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});

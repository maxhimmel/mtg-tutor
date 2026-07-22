import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The single boundary that touches the raw environment, mirroring
// apps/cli/src/core/env.ts. Everything else imports typed values from here and
// never reads process.env directly.
//
// Most of these are read by @workos-inc/authkit-nextjs, not by our code, so
// nothing in this repo reveals that they are required and nothing fails at the
// point one goes missing -- an absent NEXT_PUBLIC_WORKOS_REDIRECT_URI took the
// production deploy down with a 500 on every route. Declaring them here turns
// that into a build failure that names the variable.
//
// next.config.ts imports this module so validation runs at the start of every
// build, not lazily on whichever request happens to touch a variable first.
export const env = createEnv({
  server: {
    WORKOS_CLIENT_ID: z.string().min(1),
    WORKOS_API_KEY: z.string().min(1),
    // AuthKit encrypts its session cookie with this and requires 32+ chars.
    WORKOS_COOKIE_PASSWORD: z.string().min(32),
  },
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().url(),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.string().url(),
    // Optional: derived from NEXT_PUBLIC_CONVEX_URL when absent. See lib/convexSite.ts.
    NEXT_PUBLIC_CONVEX_SITE_URL: z.string().url().optional(),
  },
  // Each value must be a literal process.env.X member access. Next inlines
  // client variables by matching that exact syntax, so spreading process.env or
  // building this object dynamically silently yields undefined in the browser.
  runtimeEnv: {
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  },
  emptyStringAsUndefined: true,
  // Escape hatch for builds that legitimately have no backend -- a fresh clone
  // checking types, or a container image built before secrets are injected.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});

import { env } from "./env.js";

// Runtime config for the CLI process. Anything that reads the environment or
// configures I/O lives here; pure domain constants live in @mtg-tutor/core.
//
// Small, now that the CLI fetches nothing and holds no API key: Scryfall and
// 17Lands are the deployment's job, and so is Anthropic.

// HTTP actions (the coach stream) live on the .convex.site host; queries and
// mutations on .convex.cloud. Same deployment, different origin -- derived so
// there is no second variable to drift.
export const CONVEX_SITE_URL = env.CONVEX_URL.replace(
  /\.convex\.cloud(\/|$)/,
  ".convex.site$1",
);

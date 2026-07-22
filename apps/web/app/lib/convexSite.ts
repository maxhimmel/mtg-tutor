import { env } from "../env";

// HTTP actions (the coach stream) live on the .convex.site host, queries and
// mutations on .convex.cloud -- same deployment, different origin.
//
// Only NEXT_PUBLIC_CONVEX_URL is set for us at build time, by
// `convex deploy --cmd-url-env-var-name`. Deriving the site host from it rather
// than asking for a second variable removes the failure where a hand-set
// NEXT_PUBLIC_CONVEX_SITE_URL still points at the dev deployment after a
// production build -- which would fail as a 404 on someone else's session
// rather than as anything that looks like misconfiguration.
export const convexSiteUrl =
  env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  env.NEXT_PUBLIC_CONVEX_URL.replace(/\.convex\.cloud(\/|$)/, ".convex.site$1");

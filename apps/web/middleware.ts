import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// The landing page and the two reference pages are readable without an
// identity; everything that touches a draft session is not. Gating at the edge
// means an unauthenticated visitor gets bounced to WorkOS instead of watching
// the board fail to load.
//
// A new reference page must be listed here or it 307s to sign-in, which is a
// silent failure -- the page renders fine in isolation and only the route is
// wrong.
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/principles",
      "/glossary",
      "/sign-in",
      "/sign-up",
      "/callback",
      // Scratch surface, dev only -- the route itself 404s in production. Listed
      // here because the alternative failure is the silent one this comment
      // warns about: it would 307 to WorkOS and look like the page was broken.
      // Goes when the pick track is settled.
      "/track-lab",
    ],
  },
});

// `mv3` is the analytics proxy declared in next.config.ts, and it has to be
// exempt here or AuthKit 307s every captured event to sign-in. That failure is
// silent in the worst way: the SDK's own assets under /mv3/static are matched by
// the file-extension clause below and keep loading, so PostHog reports itself
// connected while not one event arrives.
export const config = {
  matcher: [
    "/((?!_next|mv3|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
};

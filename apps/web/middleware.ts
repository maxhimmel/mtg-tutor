import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// The landing page and the two reference pages are readable without an
// identity; everything that touches a draft session is not. Gating at the edge
// means an unauthenticated visitor gets bounced to WorkOS instead of watching
// the board fail to load.
//
// A new reference page must be listed here or it 307s to sign-in, which is a
// silent failure -- the page renders fine in isolation and only the route is
// wrong.
//
// `eagerAuth` attaches the access token to the initial document response, where
// AuthKit's token store reads it before anything renders. Without it the first
// thing every page load does is fetch that token over a server action, and a
// single failed fetch used to sign the tab out for good (see app/providers.tsx)
// -- so this removes the commonest way into that state, and takes a round trip
// off every page load on the way. The cost is that the token spends up to 30
// seconds in a cookie script can read, rather than only in memory; script on
// this origin could already lift it out of the Convex client.
export default authkitMiddleware({
  eagerAuth: true,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/principles",
      "/glossary",
      "/sign-in",
      "/sign-up",
      "/callback",
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

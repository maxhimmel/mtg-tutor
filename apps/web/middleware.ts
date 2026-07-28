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
    ],
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
};

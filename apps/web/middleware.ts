import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// The landing page lists sets without needing an identity; everything that
// touches a draft session does. Gating at the edge means an unauthenticated
// visitor gets bounced to WorkOS instead of watching the board fail to load.
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/sign-in", "/sign-up", "/callback"],
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
};

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Side-effect import: validates the environment at the start of every build
// rather than lazily, on whichever request first touches a variable.
import "./app/env";

const here = fileURLToPath(new URL(".", import.meta.url));

// What makes a file a page, and the whole of how a dev-only screen is kept out
// of production.
//
// `page.dev.tsx` is a page when `next dev` compiles the app and is not a page at
// all when `next build` does -- so the route does not 404 in production, it does
// not EXIST: never matched, never compiled, never bundled, and nothing it
// imports is either. That is the property worth having. The playground reads
// `sets.get`, the whole-pool query the app is told never to call, and a runtime
// `if (production) notFound()` would still have shipped that call to every
// visitor and left one edit away from being reachable.
//
// `next build` forces NODE_ENV=production and `next dev` sets development, so
// this is decided by which command ran, not by anything anyone remembers to
// configure -- a preview deploy is a build too, and gets the same answer as
// production.
//
// The convention for the next one: name it `page.dev.tsx` and it is dev-only.
// `app/dev/devOnly.test.ts` is the tripwire for naming it anything else.
const DEV_ONLY_PAGES = process.env.NODE_ENV === "development" ? ["dev.tsx"] : [];

const nextConfig: NextConfig = {
  pageExtensions: ["tsx", "ts", "jsx", "js", ...DEV_ONLY_PAGES],

  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@mtg-tutor/core", "@mtg-tutor/backend"],

  // Tracing defaults to the project directory, and under pnpm every dependency
  // is a symlink into the repo-root .pnpm store -- 652 of the 653 files in
  // next-server.js.nft.json resolve outside apps/web.
  outputFileTracingRoot: path.join(here, "../.."),

  // PostHog, served from our own origin so a content blocker sees a first-party
  // request instead of a known analytics domain. The path is deliberately not
  // /analytics or /posthog, both of which the blocklists match on.
  //
  // The catch-all has to come last -- rewrites are evaluated in order, and it
  // would otherwise swallow the two asset routes above it. And middleware.ts
  // has to exempt this path, or AuthKit bounces every event to sign-in; that
  // failure is invisible, because the SDK's own assets have a file extension
  // and load fine while nothing sends.
  async rewrites() {
    return [
      {
        source: "/mv3/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      { source: "/mv3/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/mv3/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },

  // `/drills` was the route for the whole life of the feature, and the nav
  // called it Practice the whole time. The route is Practice now too, and this
  // is what the old URL costs: three lines, forever, because the people this
  // app was built for are a handful of friends and at least one of them has the
  // misses drill bookmarked.
  //
  // Permanent, not temporary. The old path is not coming back, and a 307 asks
  // every browser and every crawler to keep trying it.
  async redirects() {
    return [{ source: "/drills/:path*", destination: "/practice/:path*", permanent: true }];
  },

  // PostHog's ingestion endpoints end in a slash (/e/, /s/). Without this Next
  // redirects them to the slashless form and every capture is lost.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

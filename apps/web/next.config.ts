import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Side-effect import: validates the environment at the start of every build
// rather than lazily, on whichever request first touches a variable.
import "./app/env";

const here = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
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

  // PostHog's ingestion endpoints end in a slash (/e/, /s/). Without this Next
  // redirects them to the slashless form and every capture is lost.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;

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
};

export default nextConfig;

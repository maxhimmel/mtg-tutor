import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Order matters and these are side-effect imports: the backend's .env.local has
// to be folded in before validation runs, or a local build fails on variables
// that are sitting right there in packages/backend/.env.local.
import "./loadBackendEnv";
import "./app/env";

const here = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@mtg-tutor/core", "@mtg-tutor/backend"],

  // Tracing defaults to the project directory, and under pnpm every dependency
  // is a symlink into the repo-root .pnpm store -- 652 of the 653 files in
  // next-server.js.nft.json resolve outside apps/web. Without this the
  // serverless bundle can be assembled without the code it needs.
  outputFileTracingRoot: path.join(here, "../.."),
};

export default nextConfig;

// `convex codegen` requires a configured deployment. On a fresh clone (or in CI
// without Convex credentials) that isn't an error worth failing the whole
// monorepo build over -- skip with a clear message instead.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const envLocal = fileURLToPath(new URL("../.env.local", import.meta.url));

if (!process.env.CONVEX_DEPLOYMENT && !existsSync(envLocal)) {
  console.log(
    "convex: no deployment configured -- skipping codegen.\n" +
      "        Run `pnpm --filter @mtg-tutor/backend dev` once to link a project.",
  );
  process.exit(0);
}

const result = spawnSync("convex", ["codegen", "--typecheck", "disable"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);

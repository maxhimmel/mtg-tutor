// Runs `convex dev` alongside the .env.convex watcher as one foreground process,
// so Ctrl-C takes both down. A bare `watch-env.mjs & convex dev` leaves the
// watcher orphaned, still pushing to the deployment after you think dev stopped.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localBin = join(pkgRoot, "node_modules", ".bin", "convex");
const CONVEX = existsSync(localBin) ? localBin : "convex";

const children = [
  spawn(CONVEX, ["dev"], { cwd: pkgRoot, stdio: "inherit" }),
  spawn(process.execPath, [join(pkgRoot, "scripts", "watch-env.mjs")], {
    cwd: pkgRoot,
    stdio: "inherit",
  }),
];

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) if (c.exitCode === null) c.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// If either half dies, take the other with it rather than leaving a half-running
// dev environment that looks healthy.
for (const c of children) {
  c.on("exit", (code, signal) => {
    shutdown("SIGTERM");
    if (!process.exitCode) process.exitCode = signal ? 1 : (code ?? 0);
  });
}

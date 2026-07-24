// Watches .env.convex and pushes it to the dev deployment on save, so changing
// a model or key is just an edit.
//
// Always targets dev: there is no --prod path here on purpose. Auto-pushing to
// production on file save would be a genuinely bad idea.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(pkgRoot, ".env.convex");
const DEBOUNCE_MS = 400;

// Editors save atomically (write temp, rename), which can drop a watch bound to
// the file itself -- so watch the directory and filter by name.
const WATCH_DIR = pkgRoot;
const WATCH_NAME = ".env.convex";

// `convex` is on PATH when invoked through a pnpm script, but not when this file
// is run directly with node.
const localBin = join(pkgRoot, "node_modules", ".bin", "convex");
const CONVEX = existsSync(localBin) ? localBin : "convex";

const hash = () => {
  try {
    return createHash("sha256").update(readFileSync(FILE)).digest("hex");
  } catch {
    return null;
  }
};

// Seeded so startup is never a surprise write: the deployment is only ever
// mutated by a save you make while this is running. Run `pnpm env:push` if you
// edited the file while it was stopped.
let lastHash = hash();
let timer;
let pushing = false;
let queued = false;

if (!existsSync(FILE)) {
  console.log("[env] no .env.convex yet -- run `pnpm env:pull` to create it.");
}
console.log("[env] watching .env.convex -> dev deployment (on save)");

function push() {
  if (pushing) {
    queued = true;
    return;
  }
  pushing = true;

  const child = spawn(CONVEX, ["env", "set", "--force", "--from-file", FILE], {
    cwd: pkgRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));

  child.on("close", (code) => {
    pushing = false;
    const summary = out.trim().split("\n").filter(Boolean).pop() ?? "";
    // Convex reports "n updated, m unchanged"; surfacing its line verbatim beats
    // inventing a status that could disagree with what actually happened.
    console.log(code === 0 ? `[env] ${summary}` : `[env] push failed:\n${out.trim()}`);
    if (queued) {
      queued = false;
      push();
    }
  });
}

watch(WATCH_DIR, (_event, filename) => {
  if (filename !== WATCH_NAME) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const next = hash();
    // A rename fires two events, and some editors touch the file without
    // changing it. Only a real content change is worth a network round trip.
    if (next === null || next === lastHash) return;
    lastHash = next;
    push();
  }, DEBOUNCE_MS);
});

// Switches which provider the dev deployment coaches with.
//
//   pnpm llm            -- show what is active
//   pnpm llm groq       -- switch to the openai-compatible endpoint
//   pnpm llm anthropic  -- switch back
//   pnpm llm toggle     -- flip to the other one
//
// Writes .env.convex and pushes the single variable, because the file is only
// the local mirror -- the deployment is what actually answers. Dev only, for the
// same reason watch-env.mjs is: nothing here should be able to repoint
// production at a dev endpoint.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(pkgRoot, ".env.convex");
const KEY = "LLM_PROVIDER";

const ANTHROPIC = "anthropic";
const COMPATIBLE = "openai-compatible";

const ALIASES = new Map([
  [ANTHROPIC, ANTHROPIC],
  ["claude", ANTHROPIC],
  [COMPATIBLE, COMPATIBLE],
  ["groq", COMPATIBLE],
  ["grok", COMPATIBLE],
  ["openai", COMPATIBLE],
  ["compat", COMPATIBLE],
  ["local", COMPATIBLE],
]);

const localBin = join(pkgRoot, "node_modules", ".bin", "convex");
const CONVEX = existsSync(localBin) ? localBin : "convex";

if (!existsSync(FILE)) {
  console.error(`No .env.convex -- run \`pnpm env:pull\` in ${pkgRoot} first.`);
  process.exit(1);
}

const lines = readFileSync(FILE, "utf8").split("\n");

const valueOf = (key) => {
  // Last active assignment wins, matching how dotenv-style files are read.
  let found;
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) found = m[1].trim();
  }
  return found;
};

// Unset means Anthropic: llm.ts defaults that way so an unconfigured deployment
// keeps working.
const current = valueOf(KEY) ?? ANTHROPIC;

function describe(provider) {
  const model =
    provider === ANTHROPIC
      ? (valueOf("ANTHROPIC_MODEL") ?? "claude-sonnet-5 (default)")
      : (valueOf("LLM_MODEL") ?? "(LLM_MODEL unset)");
  const where = provider === ANTHROPIC ? "" : ` via ${valueOf("LLM_BASE_URL") ?? "(LLM_BASE_URL unset)"}`;
  return `${provider} -- ${model}${where}`;
}

const arg = process.argv[2]?.toLowerCase();

if (!arg) {
  console.log(`${KEY}: ${describe(current)}`);
  console.log(`\nSwitch with: pnpm llm ${current === ANTHROPIC ? "groq" : "anthropic"}`);
  process.exit(0);
}

const target =
  arg === "toggle" ? (current === ANTHROPIC ? COMPATIBLE : ANTHROPIC) : ALIASES.get(arg);

if (!target) {
  console.error(`Unknown provider "${arg}". Try: anthropic, groq, or toggle.`);
  process.exit(1);
}

if (target === COMPATIBLE && !valueOf("LLM_BASE_URL")) {
  console.error("LLM_BASE_URL is not set in .env.convex, so the coach would fail on every call.");
  process.exit(1);
}

// Rewrite in place so the surrounding file -- comments, ordering, keys this
// script knows nothing about -- survives untouched.
let replaced = false;
const next = lines
  .map((line) => {
    // Commented-out assignments are dropped: they were how this used to be
    // toggled, and leaving one behind makes the file lie about what is active.
    if (new RegExp(`^\\s*#\\s*${KEY}\\s*=`).test(line)) return null;
    if (!new RegExp(`^\\s*${KEY}\\s*=`).test(line)) return line;
    replaced = true;
    return `${KEY}=${target}`;
  })
  .filter((line) => line !== null);

if (!replaced) next.push(`${KEY}=${target}`);

writeFileSync(FILE, next.join("\n"));

// Pushed explicitly rather than left to the watcher, which only runs while
// `pnpm dev:web` does.
const push = spawnSync(CONVEX, ["env", "set", KEY, target], {
  cwd: pkgRoot,
  encoding: "utf8",
});

if (push.status !== 0) {
  console.error(`Wrote .env.convex, but pushing to the dev deployment failed:`);
  console.error((push.stderr || push.stdout || "").trim());
  process.exit(1);
}

console.log(`${KEY}: ${describe(target)}`);
console.log("Pushed to the dev deployment.");

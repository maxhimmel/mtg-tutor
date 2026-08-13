// Switches which provider the dev deployment coaches with.
//
//   pnpm llm             -- show what is active
//   pnpm llm groq        -- switch to the openai-compatible endpoint
//   pnpm llm claude-cli  -- switch to the local Claude Code bridge
//   pnpm llm anthropic   -- switch back
//   pnpm llm toggle      -- flip between anthropic and whatever else is set up
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
const CLI = "claude-cli";

// Mirrors llm.ts's own defaults, so `pnpm llm` describes what the deployment
// will actually do rather than what the file happens to say.
const DEFAULT_CLI_URL = "http://127.0.0.1:8787/v1";
const DEFAULT_CLI_MODEL = "sonnet";

const ALIASES = new Map([
  [ANTHROPIC, ANTHROPIC],
  // "claude" is the API rather than the CLI: the thing you reach for when you
  // want production's answer, which is what spending a key buys.
  ["claude", ANTHROPIC],
  [COMPATIBLE, COMPATIBLE],
  ["groq", COMPATIBLE],
  ["grok", COMPATIBLE],
  ["openai", COMPATIBLE],
  ["compat", COMPATIBLE],
  ["local", COMPATIBLE],
  [CLI, CLI],
  ["cli", CLI],
  ["bridge", CLI],
  ["claude-code", CLI],
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
  if (provider === ANTHROPIC) {
    return `${provider} -- ${valueOf("ANTHROPIC_MODEL") ?? "claude-sonnet-5 (default)"}`;
  }
  if (provider === CLI) {
    const model = valueOf("CLAUDE_BRIDGE_MODEL") ?? `${DEFAULT_CLI_MODEL} (default)`;
    return `${provider} -- ${model} via ${valueOf("CLAUDE_BRIDGE_URL") ?? `${DEFAULT_CLI_URL} (default)`}`;
  }
  const model = valueOf("LLM_MODEL") ?? "(LLM_MODEL unset)";
  return `${provider} -- ${model} via ${valueOf("LLM_BASE_URL") ?? "(LLM_BASE_URL unset)"}`;
}

// Switching to a bridge nobody started is the one mistake this script can catch
// cheaply: the symptom is otherwise a coach that fails once per pick, which
// reads as a broken deployment rather than an unstarted terminal.
async function bridgeIsUp() {
  const base = valueOf("CLAUDE_BRIDGE_URL") ?? DEFAULT_CLI_URL;
  try {
    const res = await fetch(new URL("/", base), { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

const arg = process.argv[2]?.toLowerCase();

if (!arg) {
  console.log(`${KEY}: ${describe(current)}`);
  console.log(
    `\nSwitch with: pnpm llm ${[ANTHROPIC, COMPATIBLE, CLI].filter((p) => p !== current).map((p) => (p === COMPATIBLE ? "groq" : p)).join(" | ")}`,
  );
  process.exit(0);
}

// Toggle predates the third provider and keeps meaning "away from the one that
// spends money, and back again". Reaching the bridge is an explicit ask.
const target =
  arg === "toggle" ? (current === ANTHROPIC ? COMPATIBLE : ANTHROPIC) : ALIASES.get(arg);

if (!target) {
  console.error(`Unknown provider "${arg}". Try: anthropic, groq, claude-cli, or toggle.`);
  process.exit(1);
}

if (target === COMPATIBLE && !valueOf("LLM_BASE_URL")) {
  console.error("LLM_BASE_URL is not set in .env.convex, so the coach would fail on every call.");
  process.exit(1);
}

// A warning rather than a refusal: starting the bridge after switching to it is
// a perfectly ordinary order to do things in.
const bridgeDown = target === CLI && !(await bridgeIsUp());

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
if (bridgeDown) {
  console.log("\nNothing is listening there yet -- start it with: pnpm claude-bridge");
}

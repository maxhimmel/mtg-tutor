// Guards the core invariant of this package: it must stay free of I/O and of
// runtime dependencies, so it can run unchanged in Node, in Convex's V8
// runtime, and in the browser. Any non-relative import is a violation --
// including `node:*` builtins. Test files may import vitest.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

// Matches `... from "spec"` and bare `import "spec"`.
//
// No newline inside the quotes, which an import specifier cannot contain and
// ordinary prose can. Without that, a comment saying somebody was
// indistinguishable from "one thing" and "another" -- wrapped across a line, as
// comments are -- reads as an import of everything between the quotes, and the
// guard fails on English. A guard with false positives is one people start
// ignoring, which costs more than the thing it watches for.
const FROM_RE = /\bfrom\s+["']([^"'\n]+)["']/g;
const BARE_RE = /\bimport\s+["']([^"'\n]+)["']/g;

const violations: string[] = [];

for (const file of walk(SRC)) {
  const isTest = file.endsWith(".test.ts");
  const source = readFileSync(file, "utf8");

  for (const re of [FROM_RE, BARE_RE]) {
    for (const [, spec] of source.matchAll(re)) {
      if (spec.startsWith(".")) continue;
      if (isTest && spec === "vitest") continue;
      violations.push(`  ${relative(SRC, file)} imports "${spec}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    `@mtg-tutor/core must stay pure, but found ${violations.length} external import(s):\n${violations.join("\n")}`,
  );
  process.exit(1);
}

console.log("@mtg-tutor/core is pure: no node builtins, no runtime dependencies.");

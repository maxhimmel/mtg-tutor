import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The tripwire for the one mechanism keeping dev-only screens out of production.
//
// `next.config.ts` counts `page.dev.tsx` as a page only while NODE_ENV is
// development, so a build never sees this directory's routes. Both halves of
// that are quiet when broken: a dev page named `page.tsx` ships, and a
// `pageExtensions` list that stopped asking about NODE_ENV ships all of them.
// Neither shows up in dev, where everything works either way -- the first
// evidence would be the route answering in production.

const DEV_DIR = join(import.meta.dirname, ".");
const CONFIG = join(import.meta.dirname, "..", "..", "next.config.ts");

// What Next routes on. A dev-only one of these has to carry `.dev` before its
// extension; anything else here is a plain module and Next ignores it.
const ROUTABLE = /^(page|route|layout|template|default|loading|error|not-found)\.(tsx?|jsx?)$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name))
      : [join(dir, entry.name).slice(DEV_DIR.length + 1)],
  );
}

describe("dev-only routes", () => {
  it("names every routable file so a production build cannot see it", () => {
    const shipped = filesUnder(DEV_DIR).filter((file) => ROUTABLE.test(file.split("/").pop()!));

    expect(
      shipped,
      "a routable file under app/dev without the .dev marker is compiled into the " +
        "production build and served: rename it page.dev.tsx",
    ).toEqual([]);
  });

  it("adds the .dev extension in development only", () => {
    const config = readFileSync(CONFIG, "utf8");

    // Read off the source rather than by importing the config, which validates
    // the whole environment on import and would need a populated .env to run.
    expect(config).toMatch(
      /const DEV_ONLY_PAGES =\s*process\.env\.NODE_ENV === "development" \? \["dev\.tsx"\] : \[\];/,
    );
    expect(config).toMatch(/pageExtensions: \[[^\]]*\.\.\.DEV_ONLY_PAGES\]/);
  });
});

import { defineConfig, devices } from "@playwright/test";

// The browser half of the chart rules. `graphics-review` reads a diff and can
// tell you a Reference carries no label; it cannot tell you a chart overflows
// its container or that text lands at 2:1, because nothing rendered. This does
// the half that needs a browser, and the factory gates on it.
//
// It runs against `next dev`, not a build, and that is not a preference:
// `/dev` is a page only when NODE_ENV is development -- see `pageExtensions` in
// next.config.ts. `next build` does not compile the route at all, so there is
// no production URL to point this at.
export default defineConfig({
  testDir: "./tests/browser",

  // Serial. The specimens are a single gallery and three viewports of the same
  // page in parallel buys nothing but a flakier dev server.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // Next's first compile of /dev pulls the whole workspace through
  // transpilePackages, and the default 30s is a coin flip on a cold server --
  // which shows up as a timeout wearing the name of whichever check ran first.
  timeout: 90_000,

  reporter: [
    ["list"],
    // What @mgreten/browser-test-evidence ingests. Repo-root and gitignored --
    // it is an artifact of a run, not a file anyone edits.
    ["json", { outputFile: "../../.checks/playwright-report.json" }],
  ],

  use: {
    baseURL: "http://127.0.0.1:3000",
    // The failure this suite exists to catch is visual, so a failure that
    // cannot be looked at is half a failure.
    screenshot: "only-on-failure",
  },

  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000/dev",
    // A dev server already up is the common local case and booting a second
    // one just loses the port.
    reuseExistingServer: true,
    // Next's first compile of this route is slow and pulls in the whole
    // workspace through transpilePackages.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "chromium",
      // Required by @mgreten/browser-test-evidence, which reads project
      // metadata as run provenance and rejects the import when these are
      // absent. The viewports are set per test rather than per project, so
      // `viewportProfile` names the sweep rather than one size.
      metadata: {
        browserEngine: "chromium",
        viewportProfile: "phone-tablet-desktop",
        viewport: "375x900,768x1000,1280x1000",
      },
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

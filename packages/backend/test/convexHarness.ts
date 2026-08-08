import { convexTest } from "convex-test";
import schema from "../convex/schema.js";

// convex-test finds the deployment's functions with `import.meta.glob`, which
// is a Vite transform and therefore only exists in a file Vite compiled. Called
// from inside convex-test's own bundle in node_modules it is undefined, so the
// glob has to be evaluated HERE and handed over -- and here rather than in each
// test, because the path is relative to the file that writes it and would be
// silently wrong the first time a test moved into a subdirectory.
//
// Every authorization test for a cross-user read goes through this, so a
// mistake in it would make all of them pass for the wrong reason.
const modules = import.meta.glob("../convex/**/*.ts");

// Analytics off, which is what an empty token means and what a dev deployment
// sets. Not cosmetic: the PostHog component is not registered in the harness, so
// every capture schedules a function that cannot resolve and logs a page of
// stack trace beside a passing test. Left on, the next real failure would be
// buried in it -- and a suite nobody can read the output of stops being read.
//
// It also keeps the tests from depending on whatever happens to be in the shell.
process.env.POSTHOG_PROJECT_TOKEN = "";

export function harness() {
  return convexTest(schema, modules);
}

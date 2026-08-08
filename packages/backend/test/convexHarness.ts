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

export function harness() {
  return convexTest(schema, modules);
}

import { configDefaults, defineConfig } from "vitest/config";

// vitest and Playwright both claim `*.spec.ts`, and vitest gets there first.
//
// The browser specs under `tests/browser/` import from `@playwright/test`,
// which has no vitest runtime -- so vitest collected all four, failed to load
// them, and reported "4 test files failed, 117 tests passed": zero failing
// tests and a red suite, which reads like a flake rather than a config gap.
//
// It went unnoticed for several commits because `pnpm check-charts` and
// `pnpm typecheck` were the loop, and neither runs vitest. The browser suite
// has its own entry point (`pnpm check-charts`) and its own config
// (`playwright.config.ts`); this is the other half of that split saying so.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/browser/**"],
  },
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The three chart rules that need a rendered page to check. Everything else in
// the charting standard is either a type-level rule Plot already enforces, or a
// judgement call `graphics-review` makes from the diff.
//
// The subject is /dev, because that gallery is already every component with
// real numbers at the widths the app gives them -- which is exactly the fixture
// this would otherwise have to build.
//
// WHY NOT A PAGE-LEVEL SCROLL CHECK. The obvious check -- documentElement
// scrolls sideways -- false-positives on /dev by design: the gallery
// deliberately holds fixed-width bays ("263px -- what a 375px phone leaves") to
// show what a narrow container does. So the check is per chart against its own
// container, which is the rule as actually written: a chart that will not fit
// says so instead of overflowing.

const VIEWPORTS = [
  // The width the audit found three charts broken at, and the one that matters.
  { name: "phone", width: 375, height: 900 },
  { name: "tablet", width: 768, height: 1000 },
  { name: "desktop", width: 1280, height: 1000 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`/dev at ${viewport.width}px (${viewport.name})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dev", { waitUntil: "networkidle" });
      // Plot measures its parent with useParentSize, so a chart read before
      // layout settles reports a width it will not keep.
      await page.waitForSelector('svg[role="img"]', { timeout: 30_000 });
    });

    // A gallery that rendered nothing passes every check below, because
    // `[].filter(...)` is `[]`. This repo's own rule is that a feature has to
    // fail loudly rather than silently no-op, and a green chart suite over
    // zero charts is exactly that failure.
    test("the gallery actually rendered charts to check", async ({ page }) => {
      const count = await page.locator('svg[role="img"]').count();
      expect(count).toBeGreaterThan(0);
    });

    test("no chart is wider than the container it was measured for", async ({ page }) => {
      const charts = await page.locator('svg[role="img"]').count();
      expect(charts, "no charts found — the check would pass vacuously").toBeGreaterThan(0);

      const overflowing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('svg[role="img"]'))
          .map((svg) => {
            const parent = svg.parentElement;
            const svgWidth = svg.getBoundingClientRect().width;
            const parentWidth = parent ? parent.getBoundingClientRect().width : 0;
            return {
              chart: (svg.getAttribute("aria-label") ?? "").slice(0, 70),
              svgWidth: Math.round(svgWidth),
              parentWidth: Math.round(parentWidth),
              // Sub-pixel layout rounding is not an overflow.
              over: Math.round(svgWidth - parentWidth),
            };
          })
          .filter((r) => r.over > 1),
      );
      expect(overflowing).toEqual([]);
    });

    test("every chart states its scale in its accessible name", async ({ page }) => {
      // `label` is required by PlotProps, so this cannot catch a missing one --
      // it catches the empty string and the whitespace-only string, which the
      // type accepts and a reader cannot use.
      const charts = await page.locator('svg[role="img"]').count();
      expect(charts, "no charts found — the check would pass vacuously").toBeGreaterThan(0);

      const unnamed = await page.evaluate(() =>
        Array.from(document.querySelectorAll('svg[role="img"]'))
          .map((svg, index) => ({
            index,
            label: (svg.getAttribute("aria-label") ?? "").trim(),
          }))
          .filter((chart) => chart.label.length === 0),
      );
      expect(unnamed).toEqual([]);
    });

    test("text meets contrast against the ground it sits on", async ({ page }) => {
      // The audit's finding was `/25` and `/30` text landing near 2:1 against a
      // 19%-lightness ground -- which is a contrast ratio, and therefore
      // arithmetic rather than opinion. This is the one check here that is a
      // standard rather than a house rule.
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();

      const violations = results.violations.flatMap((violation) =>
        violation.nodes.map((node) => ({
          rule: violation.id,
          impact: node.impact,
          target: node.target.join(" "),
          detail: node.failureSummary?.split("\n").slice(0, 3).join(" ").slice(0, 200),
        })),
      );
      expect(violations).toEqual([]);
    });
  });
}

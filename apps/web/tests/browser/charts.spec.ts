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

// Fifteen of the twenty specimens only render once a card is on the stage. The
// first version of this suite went to a bare /dev, rendered five of them, and
// reported green -- including over `glossary-figures`, which was visibly broken
// the whole time. A check that silently measures a quarter of its subject is
// the failure this repo has a rule against, so the staged URL is not a
// convenience here, it is the fix.
const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

// Specimens that CANNOT render without the staged card. Asserting these are
// visible is how the suite proves it is looking at the whole gallery -- if
// staging ever breaks, this fails loudly instead of quietly shrinking.
const REQUIRES_STAGED_CARD = [
  "Glossary figures",
  "Score breakdown at every width",
  "How you draft",
];

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
      // Not `networkidle`: Next's dev server holds an HMR websocket open, so
      // the network never goes idle and the hook times out at ~30s on a slow
      // compile. It cost one run a false "chart is wider than its container"
      // that was really a timeout. The charts appearing is the real readiness
      // signal, and Plot measures its parent with useParentSize, so a chart
      // read before layout settles reports a width it will not keep.
      await page.goto(STAGED, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('svg[role="img"]', { timeout: 60_000 });

      // Coverage, asserted rather than assumed. These mount only after the
      // stage resolves its card, so waiting on them is both the readiness
      // signal and the proof that the gallery is whole.
      for (const heading of REQUIRES_STAGED_CARD) {
        // `.first()`: a specimen Panel wraps a component that carries its own
        // Panel of the same name, so "How you draft" legitimately matches
        // seven headings. Presence is the assertion here, not uniqueness.
        await expect(
          page.getByRole("heading", { name: heading, exact: true }).first(),
          `"${heading}" did not render — the card did not stage, so this run covers a fraction of the gallery`,
        ).toBeVisible({ timeout: 30_000 });
      }
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

    test("text meets contrast against the ground it sits on", async ({ page }, testInfo) => {
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

      // The full list goes in an attachment, never in the assertion message.
      // 185 failures inline produced a 105,030-character message, and
      // @mgreten/browser-test-evidence rejects an import whose error text is
      // over 10,000 -- so a verbose failure here is a failure that cannot be
      // recorded as evidence, which is worse than a terse one.
      if (violations.length > 0) {
        await testInfo.attach("color-contrast-violations.json", {
          body: JSON.stringify(violations, null, 2),
          contentType: "application/json",
        });
      }

      // Assert on the distinct colour/size combinations rather than the
      // elements. One `text-base-content/45` decision produces hundreds of
      // failing nodes and exactly one thing to fix.
      const combinations = new Map<string, number>();
      for (const violation of violations) {
        const measured = violation.detail?.match(
          /contrast of ([\d.]+) \(foreground color: (#\w+), background color: (#\w+), font size: ([^,)]+)/,
        );
        const key = measured
          ? `${measured[1]}:1 — ${measured[2]} on ${measured[3]} at ${measured[4].trim()}`
          : (violation.detail ?? "unparsed").slice(0, 80);
        combinations.set(key, (combinations.get(key) ?? 0) + 1);
      }
      const distinct = [...combinations.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([combination, elements]) => `${combination} (${elements} elements)`);

      expect(distinct, `${violations.length} elements below 4.5:1`).toEqual([]);
    });
  });
}

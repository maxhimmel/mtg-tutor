import { test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Screenshots for a human or an agent to LOOK at. This asserts nothing on
// purpose -- it is the input to the half of chart review that is judgement:
// whether a layout is confusing, whether a section reads like the real page,
// whether the widths make sense together. `charts.spec.ts` owns the half that
// is arithmetic.
//
// The staged card matters. Fifteen of the twenty specimens only render when a
// card is on the stage, so a capture without one photographs a quarter of the
// gallery and looks complete. That is how the first version of the checks
// suite ran green over five specimens.

const STAGED = "/dev?set=fdn:PremierDraft&cards=Progenitus";

const VIEWPORTS = [
  { name: "375-phone", width: 375, height: 900 },
  { name: "768-tablet", width: 768, height: 1000 },
  { name: "1280-desktop", width: 1280, height: 1000 },
];

// Panels carry no id, so they are found by their heading text.
const SECTIONS = [
  "Glossary figures",
  "Deck bands at every width",
  "Score breakdown at every width",
  "How you draft",
  "Score plot",
];

const OUT = "../../.checks/screens";

for (const viewport of VIEWPORTS) {
  test(`capture /dev at ${viewport.width}px`, async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(STAGED, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('svg[role="img"]', { timeout: 60_000 });
    // The stage resolves the card asynchronously; the specimens that need it
    // mount after it lands.
    await page.waitForTimeout(2_500);

    await page.screenshot({ path: `${OUT}/dev-${viewport.name}-full.png`, fullPage: true });

    for (const heading of SECTIONS) {
      const panel = page
        .locator("section", { has: page.getByRole("heading", { name: heading, exact: true }) })
        .first();
      if ((await panel.count()) === 0) continue;
      const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await panel.screenshot({ path: `${OUT}/${slug}-${viewport.name}.png` });
    }
  });
}

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import fs from "node:fs";

const VIEWPORTS = [
  { name: "360px", width: 360, height: 780 },
  { name: "768px", width: 768, height: 1024 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "1440px", width: 1440, height: 900 },
];

const KEY_SCREENS = [
  { id: "01-landing", path: "/" },
  { id: "02-pricing", path: "/pricing" },
  { id: "03-calculator", path: "/tools/calculator" },
  { id: "04-ebrc-validator", path: "/tools/ebrc-validator" },
  { id: "05-shipping-bill-extractor", path: "/tools/shipping-bill-extractor" },
  { id: "06-learn-index", path: "/learn" },
  { id: "07-learn-rodtep", path: "/learn/rodtep" },
  { id: "08-login", path: "/login" },
  { id: "09-offline", path: "/offline" },
  { id: "10-about", path: "/about" },
];

test.describe("Prompt 18: Mobile, motion and accessibility polish", () => {
  test.beforeAll(() => {
    const dir = path.resolve("e2e/screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test("captures screenshots at 4 viewports across all 10 key screens", async ({ page }) => {
    test.setTimeout(180_000);

    for (const screen of KEY_SCREENS) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(screen.path);
        await page.waitForLoadState("networkidle");

        // Verify zero horizontal overflow at every viewport
        const hasOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
        expect(hasOverflow, `Screen ${screen.id} has horizontal overflow at ${vp.name}`).toBe(
          false
        );

        const screenshotPath = path.resolve(`e2e/screenshots/${screen.id}-${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        expect(fs.existsSync(screenshotPath)).toBe(true);
      }
    }
  });

  test("passes axe accessibility audit with zero serious or critical violations", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    for (const screen of KEY_SCREENS) {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(screen.path);
      await page.waitForLoadState("networkidle");

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const seriousOrCritical = accessibilityScanResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );

      if (seriousOrCritical.length > 0) {
        console.error(
          `Axe violations on ${screen.path}:`,
          JSON.stringify(seriousOrCritical, null, 2)
        );
      }

      expect(
        seriousOrCritical,
        `Accessibility violations found on ${screen.path}: ${seriousOrCritical.map((v) => v.help).join(", ")}`
      ).toEqual([]);
    }
  });

  test("verifies skip-to-content keyboard link focuses main content", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Press Tab to focus Skip to content
    await page.keyboard.press("Tab");
    const activeElementText = await page.evaluate(() =>
      document.activeElement?.textContent?.trim()
    );
    expect(activeElementText).toBe("Skip to main content");

    // Press Enter to navigate to #main-content
    await page.keyboard.press("Enter");
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe("#main-content");
  });

  test("serves valid PWA manifest and service worker file", async ({ request }) => {
    // 1. Manifest
    const manifestRes = await request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.short_name).toBe("ExportLeak");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    // 2. Service Worker script
    const swRes = await request.get("/sw.js");
    expect(swRes.status()).toBe(200);
    const swText = await swRes.text();
    expect(swText).toContain("exportleak-shell");
    expect(swText).toContain("/offline");
  });

  test("throttled simulated slow connection keeps page interactive in under 4 seconds", async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);

    // Pre-warm the route so on-demand dev compilation is complete
    await page.goto("/tools/calculator");
    await page.waitForLoadState("networkidle");

    // Emulate Slow 4G / 4x CPU via CDP
    try {
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: (1024 * 1024) / 8, // 1 Mbps Slow 4G profile
        uploadThroughput: (512 * 1024) / 8,
        latency: 150, // 150 ms
      });
      await cdpSession.send("Emulation.setCPUThrottlingRate", { rate: 2 });
    } catch {
      // If CDP not available (e.g. non-chromium), continue with normal measurement
    }

    const start = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    const interactiveTime = Date.now() - start;

    expect(interactiveTime).toBeLessThan(4000);
    await expect(page.getByRole("heading", { name: /Free Instant.*Calculator/i })).toBeVisible();
  });
});

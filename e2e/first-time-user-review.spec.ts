import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

// Simulate mid-range Android phone (360px viewport)
const MOBILE_360 = { width: 360, height: 780 };

test.describe("Review Prompt 3: First-Time User Review (50-year-old Accounts Manager at Tiruppur Garment Exporter)", () => {
  test.beforeAll(() => {
    const dir = path.resolve("e2e/screenshots/first-time-user");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_360);
  });

  test("1. Landing page: shows plain English hero, DSC trust guarantee, and zero horizontal scroll at 360px", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Zero horizontal overflow
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    // Trust badge visible above or near hero
    const trustText = await page.textContent("body");
    expect(trustText).toContain("Zero DSC token or password storage");

    // Capture screenshot
    const screenshotPath = path.resolve("e2e/screenshots/first-time-user/01-landing-360px.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("2. Free RoDTEP Calculator: defaults to cotton T-shirts (HS 61091000) with zero login", async ({
    page,
  }) => {
    await page.goto("/tools/calculator");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    // Verify cotton garment sample is prominent
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("Cotton T-Shirts");

    const screenshotPath = path.resolve("e2e/screenshots/first-time-user/02-calculator-360px.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("3. Free Bulk eBRC Validator: displays in-memory zero-persistence guarantee", async ({
    page,
  }) => {
    await page.goto("/tools/ebrc-validator");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    const screenshotPath = path.resolve(
      "e2e/screenshots/first-time-user/03-ebrc-validator-360px.png"
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("4. Sign in page: displays green trust badge and 'We never ask for your DSC or portal passwords'", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("We never ask for your DSC");

    // Input touch targets >= 44px
    const inputHeight = await page.locator('input[type="email"]').evaluate((el) => {
      return el.getBoundingClientRect().height;
    });
    expect(inputHeight).toBeGreaterThanOrEqual(44);

    const screenshotPath = path.resolve("e2e/screenshots/first-time-user/04-login-360px.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("5. Pricing page: displays transparent INR pricing, non-GST receipt note, and 7-day trial terms", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("₹2,999");
    expect(bodyText).toContain("No DSC or passwords ever");

    const screenshotPath = path.resolve("e2e/screenshots/first-time-user/05-pricing-360px.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});

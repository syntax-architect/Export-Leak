import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Prompt 8: Incentive calculation engine, scroll importer, breakdown & scrips", () => {
  test("imports admin rate CSV, recalculates SB expectations, previews/commits customs scroll, inspects formula breakdown, and tracks scrips cleanly on 360px & 1280px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const email = `incentives-e2e-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Tiruppur Knit Exports");
    await page.getByLabel("IEC Code (optional now)").fill("AAACT7788K");
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Upload real clean Shipping Bill fixture (7458210: HS 62052000 & 62046200, USD @ 84.25)
    await page.goto("/app/documents");
    const sb1Path = path.resolve(
      process.cwd(),
      "fixtures",
      "shipping-bills",
      "sb-01-icegate-garment.pdf"
    );
    await page.getByTestId("document-file-input").setInputFiles([sb1Path]);
    await expect(page.getByTestId("batch-parse-summary")).toContainText("1 parsed", {
      timeout: 30_000,
    });

    // Elevate same test user session to platform admin (non-production PGlite adapter only)
    const adminElevate = await page.evaluate(async (userEmail) => {
      const res = await fetch("/api/auth/test-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, isPlatformAdmin: true }),
      });
      return res.ok;
    }, email);
    expect(adminElevate).toBe(true);

    // Navigate to /app/incentives on mobile 360px
    await page.goto("/app/incentives");
    await expect(page.getByRole("heading", { name: /Incentives & e-Scrips/i })).toBeVisible();

    const mobileOverflowBefore = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflowBefore).toBe(false);

    // 1. Admin Rate CSV import (synthetic test CSV covering 62052000 & 62046200)
    await page.getByRole("tab", { name: /Rate Table/i }).click();
    const rateCsvContent = [
      "scheme,hs_code,rate_bps,cap_per_unit,uqc,effective_from,effective_to,source_note",
      "rodtep,62052000,200,20.00,PCS,2026-01-01,,SYNTHETIC E2E CAP RATE",
      "rodtep,62046200,150,,PCS,2026-01-01,,SYNTHETIC E2E UNCAPPED",
      "drawback,62052000,100,,PCS,2026-01-01,,SYNTHETIC E2E DBK",
      "drawback,62046200,100,,PCS,2026-01-01,,SYNTHETIC E2E DBK",
    ].join("\n");
    await page.getByTestId("rate-file-input").setInputFiles({
      name: "e2e-synthetic-rates.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(rateCsvContent, "utf8"),
    });

    await expect(page.getByText(/Dry-run: 4 valid, 0 rejected/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Import 4 rate row/i }).click();
    await expect(page.getByText(/Rate Table \(4\)/i)).toBeVisible({ timeout: 15_000 });

    // 2. Recalculate SB expectations
    await page.getByRole("tab", { name: /Comparison/i }).click();
    await page.getByRole("button", { name: /Recalculate/i }).click();
    await expect(page.getByText("7458210").first()).toBeVisible({ timeout: 15_000 });

    // 3. Upload Customs Scroll CSV (rodtep partial credit -> short, drawback untouched -> missing)
    await page.getByRole("tab", { name: /Scroll Import/i }).click();
    const scrollCsvContent = [
      "sb_number,scheme,credited_amount,credited_on,scroll_number",
      "7458210,rodtep,20000.00,2026-11-01,SCR-E2E-1",
    ].join("\n");
    await page.getByTestId("scroll-file-input").setInputFiles({
      name: "e2e-scroll.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(scrollCsvContent, "utf8"),
    });
    await expect(page.getByText(/Dry-run preview: 1 valid row\(s\), 0 error\(s\)/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Commit 1 credit row/i }).click();

    // Back on Comparison tab automatically: verify "short" and "missing" statuses
    await expect(page.getByText("Short").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Missing").first()).toBeVisible();

    // Zero horizontal overflow on 360px
    const mobileOverflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflowAfter).toBe(false);

    // 4. Switch to Desktop 1280px & open "How we calculated this" breakdown sheet
    await page.setViewportSize({ width: 1280, height: 800 });
    await page
      .getByRole("button", { name: /How calculated/i })
      .first()
      .click();
    await expect(page.getByText(/How we calculated this/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/half_up_per_item_integer_sum/i)).toBeVisible();
    await expect(page.getByText(/HS 62052000/i)).toBeVisible();
    await page.keyboard.press("Escape");

    // 5. Record an e-Scrip & check Next-to-Expire
    await page.getByRole("tab", { name: /e-Scrips/i }).click();
    await page.getByPlaceholder(/Scrip number/i).fill("SCRP-E2E-01");
    await page.getByPlaceholder(/Face value INR/i).fill("20000.00");
    await page.getByLabel("Optional manual expiry date").fill("2027-06-30");
    await page.getByRole("button", { name: /Save e-Scrip/i }).click();
    await expect(page.getByText("SCRP-E2E-01").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Next to Expire")).toBeVisible();

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    await context.close();
  });
});

import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Prompt 7: IRM import preview, matching review, manual allocation & unmatch", () => {
  test("imports IRM spreadsheet with column mapping preview, manually links same-currency payment, unmatches, and renders cleanly on 360px & 1280px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // 1. Mobile 360px flow
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await mobileContext.newPage();

    const suffix = Math.floor(1000 + Math.random() * 9000);
    const iecCode = `ACL${suffix}01M`;
    const email = `irm-e2e-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Ludhiana Knitwear Exports");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Upload a real clean Shipping Bill fixture so there is an open USD Shipping Bill
    await page.goto("/app/documents");
    const sb1Path = path.resolve(
      process.cwd(),
      "fixtures",
      "shipping-bills",
      "sb-01-icegate-garment.pdf"
    );
    const fileInput = page.getByTestId("document-file-input");
    await expect(fileInput).toBeEnabled({ timeout: 20_000 });
    await fileInput.setInputFiles([sb1Path]);
    await expect(page.getByTestId("batch-parse-summary")).toContainText("1 parsed", {
      timeout: 30_000,
    });

    // Navigate to IRM & Matching
    await page.goto("/app/matches");
    await expect(
      page.getByRole("heading", { name: /(Bank Payment \(IRM\) Matching|IRM Import & Matching)/i })
    ).toBeVisible();

    const mobileOverflowBefore = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflowBefore).toBe(false);

    // Upload IRM Excel fixture and inspect Column Mapping Preview before commit
    const irmXlsxPath = path.resolve(
      process.cwd(),
      "fixtures",
      "irm",
      "irm-dgft-edpms-sample.xlsx"
    );
    await page.getByTestId("irm-file-input").setInputFiles(irmXlsxPath);

    await expect(page.getByTestId("irm-mapping-preview")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("irm-mapping-preview")).toContainText("Header row 3");
    await expect(page.getByTestId("irm-mapping-preview")).toContainText("6 valid");

    // Confirm import
    await page.getByTestId("confirm-irm-import-button").click();
    await expect(page.getByTestId("irm-commit-summary")).toContainText("6 new IRM(s)", {
      timeout: 20_000,
    });

    // Verify Rule 4 notice for locked EUR IRMs is visible because our SB is USD
    await expect(page.getByTestId("review-matches-section")).toContainText("EUR");

    // Link a same-currency open USD IRM manually
    const manualLinkBtn = page.getByTestId("manual-link-IRM-HDFC-26001");
    await expect(manualLinkBtn).toBeVisible({ timeout: 15_000 });
    await manualLinkBtn.click();

    await expect(page.getByTestId("confirmed-match-7458210-IRM-HDFC-26001")).toBeVisible({
      timeout: 15_000,
    });

    // Zero horizontal overflow after full data rendered
    const mobileOverflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflowAfter).toBe(false);

    // Switch viewport to 1280px desktop and verify split Review Matches + Unmatch
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("sb-match-list")).toBeVisible();
    await expect(page.getByTestId("candidate-payments-pane")).toBeVisible();

    await page.getByTestId("unmatch-7458210-IRM-HDFC-26001").click();
    await expect(page.getByTestId("confirmed-match-7458210-IRM-HDFC-26001")).toHaveCount(0, {
      timeout: 15_000,
    });

    await mobileContext.close();
  });
});

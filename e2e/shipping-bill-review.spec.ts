import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Prompt 6: Shipping Bill parser, batch summary & mobile/desktop review", () => {
  test("parses uploaded PDFs, shows batch summary, supports mobile Show source sheet and desktop Enter/Confirm all", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const email = `sb-review-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Coimbatore Valves Pvt Ltd");
    await page.getByLabel("IEC Code (optional now)").fill("AAACC6543E");
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Navigate to Documents and upload 1 clean PDF + 1 uncertain edge-case PDF
    await page.goto("/app/documents");
    await expect(page.getByTestId("document-file-input")).toBeEnabled({ timeout: 20_000 });
    const sb1Path = path.resolve(
      process.cwd(),
      "fixtures",
      "shipping-bills",
      "sb-01-icegate-garment.pdf"
    );
    const sb12Path = path.resolve(
      process.cwd(),
      "fixtures",
      "shipping-bills",
      "sb-12-uncertain-edge.pdf"
    );

    await page.getByTestId("document-file-input").setInputFiles([sb1Path, sb12Path]);

    // Batch summary banner should report "1 parsed, 1 need review, 0 failed"
    await expect(page.getByTestId("batch-parse-summary")).toContainText("1 parsed", {
      timeout: 30000,
    });
    await expect(page.getByTestId("batch-parse-summary")).toContainText("1 need review", {
      timeout: 30000,
    });

    // Click "Review next" CTA on mobile 360px
    await page.getByRole("link", { name: /Review next/i }).click();
    await page.waitForURL("**/app/shipping-bills/*/review");

    // Verify no horizontal overflow at 360px
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // Calculation gate badge should read "Held until reviewed"
    await expect(page.getByTestId("sb-calc-locked-badge")).toBeVisible();

    // Open mobile "Show source" bottom sheet
    await page.getByTestId("mobile-show-source-btn").click();
    await expect(page.getByText("Source Document Context")).toBeVisible();
    await page.keyboard.press("Escape");

    // Resize to desktop split view (1280px) and verify left source pane is visible
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("desktop-source-pane")).toBeVisible();

    // Switch to all fields so we can fix buyerName, item HS code (8 digits), and item FOB sum
    await page.getByTestId("uncertain-first-toggle").click();

    const buyerInput = page.getByLabel("Buyer / Consignee Name");
    await buyerInput.fill("RHEIN VALVES GMBH");
    await buyerInput.press("Enter");

    const hsInput = page.getByLabel("Item 1 HS Code (8 digits)");
    await hsInput.fill("84819090");

    const itemFobInput = page.getByLabel("FOB (USD)", { exact: true }).first();
    await itemFobInput.fill("6500.00");

    await page.getByTestId("confirm-all-btn").first().click();

    await expect(page.getByTestId("sb-calc-eligible-badge")).toBeVisible();
    await expect(page.getByTestId("corrections-history-card")).toBeVisible();

    // Reload and confirm verified state persists
    await page.reload();
    await expect(page.getByTestId("sb-calc-eligible-badge")).toBeVisible();
    await expect(page.getByTestId("corrections-history-card")).toBeVisible();

    await context.close();
  });
});

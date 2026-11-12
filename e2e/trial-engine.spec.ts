import { expect, test } from "@playwright/test";

test.describe("Prompt 12: 7-day no-card trial banner & Choose a plan flow", () => {
  test("auto-starts trial on first real upload, shows Pro trial countdown banner with Choose a plan CTA across screens on 360px & 1280px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const suffix = String(Date.now()).slice(-4);
    const email = `trial-e2e-${suffix}@example.invalid`;
    const iecCode = `AAACM${suffix}R`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Madurai Cotton Exports");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Free org does not display the Pro trial countdown banner before its first real upload
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("trial-pro-banner")).toHaveCount(0);

    // Upload a valid real PDF on /app/documents -> triggers card-free 7-day Pro Trial
    await page.goto("/app/documents");
    const fileInput = page.getByTestId("document-file-input");
    await expect(fileInput).toBeEnabled({ timeout: 20_000 });
    await fileInput.setInputFiles({
      name: "trial-start-sb.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"),
    });
    await expect(
      page.getByTestId("documents-list-card").getByText("trial-start-sb.pdf")
    ).toBeVisible({ timeout: 20_000 });

    // Refresh / navigate back to /app -> workspace shell renders countdown banner with Choose a plan button
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("trial-pro-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("trial-countdown-text")).toContainText("Pro trial: 7 days left");
    await expect(page.getByTestId("trial-choose-plan-btn")).toBeVisible();

    const overflowMobileBanner = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowMobileBanner).toBe(false);

    // Click primary Choose a plan button -> lands on /app/billing cleanly on 360px & 1280px
    await page.getByTestId("trial-choose-plan-btn").click();
    await expect(page).toHaveURL(/\/app\/billing/, { timeout: 15_000 });
    await expect(page.getByTestId("billing-overview-root")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("plan-card-exporter_monthly")).toContainText("₹999");

    const overflowBillingMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowBillingMobile).toBe(false);

    await page.setViewportSize({ width: 1280, height: 800 });
    const overflowBillingDesktop = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowBillingDesktop).toBe(false);

    await context.close();
  });
});

import { expect, test } from "@playwright/test";

test.describe("Prompt 15: Billing UI, pricing page, legal pages & data export", () => {
  test("renders /pricing without overflow on 360px, toggles annual/monthly with discount, and collapses comparison into accordions", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // 1. Mobile 360px viewport test
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Check no horizontal overflow
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow).toBe(false);

    // Initial state: Monthly billing
    await expect(page.getByText("Monthly billing")).toBeVisible();
    await expect(page.getByText("₹999")).toBeVisible();
    await expect(page.getByText("₹2,999")).toBeVisible();

    // Toggle Annual billing
    await page.getByRole("button", { name: /Annual billing/i }).click();

    // Verify annual prices updated with discount
    await expect(page.getByText("Save ~17%")).toBeVisible();
    await expect(page.getByText("₹9,990")).toBeVisible();
    await expect(page.getByText("₹29,990")).toBeVisible();

    // Verify mobile accordion opens
    const categoryButton = page
      .locator(".md\\:hidden")
      .getByRole("button", { name: /Capacity & Limits/i });
    if (await categoryButton.isVisible()) {
      await categoryButton.click();
      await expect(page.locator(".md\\:hidden").getByText("IEC Profiles managed")).toBeVisible();
    }

    // Verify FAQ accordion works
    const dscFaq = page.getByRole("button", { name: /Do you need my Digital Signature/i });
    await expect(dscFaq).toBeVisible();
    await dscFaq.click();
    await expect(page.getByText(/Under our strict Master Security Rules/i)).toBeVisible();

    // 2. Desktop 1280px viewport test
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    // Verify comparison table table-header exists on desktop
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Exporter" })).toBeVisible();
  });

  test("renders all public legal and trust pages without lorem ipsum placeholders", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 780 });

    const pagesToCheck = [
      { url: "/terms", title: "Terms of Service" },
      { url: "/privacy", title: "Privacy Policy" },
      { url: "/refund", title: "Refund & Cancellation Policy" },
      { url: "/contact", title: "We're here to help Indian exporters" },
      { url: "/about", title: "Built to stop money leaking" },
    ];

    for (const item of pagesToCheck) {
      await page.goto(item.url);
      await page.waitForLoadState("networkidle");

      // Verify no horizontal overflow on mobile
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflow).toBe(false);

      // Verify page title / heading
      await expect(page.getByRole("heading", { name: new RegExp(item.title, "i") })).toBeVisible();

      // Verify no lorem ipsum text anywhere on page
      const pageText = await page.innerText("body");
      expect(pageText.toLowerCase()).not.toContain("lorem ipsum");

      // Verify footer is rendered
      await expect(
        page.locator("footer").getByText("ExportLeak Solutions Private Limited")
      ).toBeVisible();
    }
  });

  test("allows a lapsed / Free user to access /app/billing and click Export my data", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 780 });

    const suffix = String(Date.now()).slice(-4);
    const email = `lapsed-export-${suffix}@example.invalid`;

    // 1. Sign up on Free plan
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Lapsed Export Co");
    await page.getByLabel("IEC Code (optional now)").fill(`EXP${suffix}01P`);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // 2. Go to /app/billing
    await page.goto("/app/billing");
    await page.waitForLoadState("networkidle");

    // Verify no horizontal overflow on mobile
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // Verify Free tier status badge
    await expect(page.getByText(/Free tier|Starter/i).first()).toBeVisible();

    // Verify "Export my data" button is present and clickable
    const exportBtn = page.getByTestId("export-all-data-btn");
    await expect(exportBtn).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("exportleak-data-");
  });
});

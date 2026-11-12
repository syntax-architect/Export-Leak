import { expect, test } from "@playwright/test";

test.describe("Prompt 9: Leakage dashboard, deadlines, saved views, alerts, consultant home, timeline & exports", () => {
  test("filters via tappable Stat cards, saves/applies views, inspects SB timeline, resolves alert, downloads PDF & Excel, and handles Consultant multi-IEC on 360px & 1280px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // 1. Mobile 360px viewport: create CA Firm (Consultant) workspace + Demo data -> explore Leakage Dashboard
    const mobileContext = await browser.newContext({
      viewport: { width: 360, height: 780 },
      acceptDownloads: true,
    });
    const page = await mobileContext.newPage();

    const email = `dash-e2e-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByTestId("role-card-exim_consultant").click();
    await page.getByLabel("Firm / Organization name").fill("Kaveri Trade Advisors");
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-step2-submit").click();
    await page.getByTestId("try-sample-data-btn").click();
    await expect(page.getByTestId("onboarding-first-result")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("finish-onboarding-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    const tourDismiss = page.getByTestId("tour-dismiss-btn");
    if (await tourDismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tourDismiss.click();
    }

    // Verify 360px mobile layout has zero horizontal overflow
    await expect(page.getByTestId("dashboard-summary-root")).toBeVisible();
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow).toBe(false);

    // Mobile cards visible on 360px
    await expect(page.getByTestId("shipments-mobile-cards")).toBeVisible();

    // Tap "At risk (deadline in under 60 days)" stat card to filter
    await page.getByRole("button", { name: /At risk \(deadline in under 60 days\)/i }).click();
    await expect(page.getByText(/Shipments & incentives \(1\)/i)).toBeVisible();

    // Save this filtered view and verify persistence across reload
    await page.getByTestId("toggle-save-view-btn").click();
    await page.getByTestId("save-view-name-input").fill("At Risk Monitor");
    await page.getByTestId("confirm-save-view-btn").click();
    await expect(page.getByTestId("saved-views-bar")).toContainText("At Risk Monitor");

    await page.reload();
    await expect(page.getByTestId("saved-views-bar")).toContainText("At Risk Monitor");
    await page.getByRole("button", { name: "At Risk Monitor", exact: true }).click();
    await expect(page.getByText(/Shipments & incentives \(1\)/i)).toBeVisible();

    // Download PDF report and Excel report
    const [pdfDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-report-pdf").click(),
    ]);
    expect(pdfDownload.suggestedFilename()).toContain(".pdf");

    const [xlsxDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-report-xlsx").click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toContain(".xlsx");

    // Open a shipment detail page via "Timeline" link on mobile card
    await page
      .getByRole("link", { name: /Timeline/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/shipping-bills\/.+/, { timeout: 20_000 });
    await expect(page.getByTestId("what-to-do-next-box")).toBeVisible();
    await expect(page.getByTestId("shipment-lifecycle-timeline")).toBeVisible();
    await expect(page.getByTestId("timeline-stage-filed")).toBeVisible();
    await expect(page.getByTestId("timeline-stage-ebrc_ready")).toBeVisible();

    const detailMobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(detailMobileOverflow).toBe(false);

    // Go back to /app and switch to desktop 1280px view to check Consultant Home + Alerts Centre Resolve
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await expect(page.getByTestId("consultant-home-card")).toBeVisible();
    await expect(page.getByTestId("alerts-centre-card")).toBeVisible();

    const firstResolveBtn = page.getByRole("button", { name: "Resolve" }).first();
    await expect(firstResolveBtn).toBeVisible();
    await firstResolveBtn.click();
    await expect(page.getByText(/Alert resolved/i)).toBeVisible({ timeout: 15_000 });

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    await mobileContext.close();
  });
});

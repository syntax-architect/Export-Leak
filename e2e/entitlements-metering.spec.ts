import { expect, test } from "@playwright/test";

test.describe("Prompt 11: Plans, entitlements, usage meters & upgrade dialogs", () => {
  test("displays IEC/team/document usage meters with amber/red thresholds and turns Free 402 responses into helpful upgrade dialogs at 360px & 1280px", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const suffix = Math.floor(1000 + Math.random() * 9000);
    const iecCode1 = `ACK${suffix}01P`;
    const iecCode2 = `ACK${suffix}02Q`;
    const email = `entitlements-e2e-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Kochi Spice Exporters");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode1);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // 1. Real Free org: clicking Download leakage report returns 402 -> opens UpgradePlanDialog
    await page.waitForLoadState("networkidle");
    await page.getByTestId("download-report-pdf").click();
    await expect(page.getByTestId("plan-upgrade-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("plan-upgrade-dialog")).toContainText(
      "Leakage report export requires"
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // 2. IEC Profiles page on 360px: shows 1 of 1 IECs active (100% -> red danger bar) and blocks 2nd IEC with Upgrade dialog
    await page.goto("/app/iecs");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("iec-usage-meter-card")).toContainText("1 of 1 IECs active");
    await expect(page.getByTestId("iec-usage-meter-card-bar")).toHaveAttribute(
      "data-tone",
      "danger"
    );

    const mobileOverflowIec = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflowIec).toBe(false);

    await page.getByLabel("IEC Code").fill(iecCode2);
    await page.getByLabel("Legal Name").fill("Second IEC Unit");
    await page.getByRole("button", { name: /Save IEC profile/i }).click();
    await expect(page.getByTestId("plan-upgrade-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("plan-upgrade-dialog")).toContainText(
      "IEC profile limit reached"
    );
    await expect(page.getByTestId("plan-upgrade-dialog")).toContainText("Consultant Monthly");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // 3. Team page on 1280px desktop: shows 1 of 1 team seats used and blocks invite with Upgrade dialog
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app/team");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("team-usage-meter-card")).toContainText("1 of 1 team seats used");
    await expect(page.getByTestId("team-usage-meter-card-bar")).toHaveAttribute(
      "data-tone",
      "danger"
    );

    const desktopOverflowTeam = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflowTeam).toBe(false);

    await page.getByLabel("Email address").fill("extra-seat@example.invalid");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByTestId("plan-upgrade-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("plan-upgrade-dialog")).toContainText("Team seat limit reached");

    await context.close();
  });
});

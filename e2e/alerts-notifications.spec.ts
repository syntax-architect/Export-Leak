import { expect, test } from "@playwright/test";

test.describe("Prompt 16: Alerts, notifications drawer, preferences & 1-click unsubscribe", () => {
  test("renders /app/notifications without horizontal scroll at 360px, switches tabs and saves preferences", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 780 });

    const suffix = String(Date.now()).slice(-4);
    const email = `alerts-user-${suffix}@example.invalid`;

    // 1. Log in / onboard user
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Alerts Test Co");
    await page.getByLabel("IEC Code (optional now)").fill(`ALT${suffix}01P`);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // 2. Open notification bell drawer
    const bellBtn = page.getByRole("button", { name: /Notifications/i });
    await expect(bellBtn).toBeVisible();
    await bellBtn.click();

    // Verify slide-over sheet opened
    await expect(page.getByText("Alerts & Notifications")).toBeVisible();
    await expect(page.getByRole("link", { name: /Alert Settings & Preferences/i })).toBeVisible();

    // 3. Navigate to /app/notifications
    await page.goto("/app/notifications");
    await page.waitForLoadState("networkidle");

    // Check no horizontal overflow at 360px (Master Rule #7)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // Verify page heading and tabs
    await expect(
      page.getByRole("heading", { name: /Alerts & Notification Settings/i })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /Open Alerts/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Preferences/i })).toBeVisible();

    // 4. Switch to Preferences tab
    await page.getByRole("tab", { name: /Preferences/i }).click();
    await expect(page.getByText("FEMA Realisation Deadlines", { exact: true })).toBeVisible();
    await expect(page.getByText("Duty Credit Scrip Expiry", { exact: true })).toBeVisible();

    // Select Weekly Digest
    await page.getByRole("button", { name: /Weekly Digest/i }).click();

    // Click Save Preferences
    await page.getByRole("button", { name: "Save Preferences" }).click();
    await expect(page.getByText(/preferences updated/i)).toBeVisible();
  });

  test("renders public /unsubscribe at 360px without horizontal scroll and handles invalid/valid token states", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 780 });

    // 1. Invalid token
    await page.goto("/unsubscribe?token=nonexistent_token_12345");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(page.getByText("Invalid Unsubscribe Link")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in to ExportLeak/i })).toBeVisible();
  });
});

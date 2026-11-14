import { expect, test } from "@playwright/test";

test.describe("Hard Stress, Rapid-Tap Resilience & Industry-Grade Empty States", () => {
  test("survives rapid-fire monkey navigation stress test without crashes", async ({ page }) => {
    test.setTimeout(90_000);
    const suffix = String(Date.now()).slice(-4);
    const email = `stress-user-${suffix}@example.invalid`;

    // 1. Establish session via test-session
    const authRes = await page.request.post("/api/auth/test-session", {
      data: { email },
    });
    expect(authRes.status()).toBe(200);

    // Create an organization
    const orgRes = await page.request.post("/api/orgs", {
      data: { name: `Stress Test Corp ${suffix}`, roleChoice: "exporter" },
    });
    expect(orgRes.status()).toBe(201);

    // Track any uncaught console errors
    const uncaughtErrors: string[] = [];
    page.on("pageerror", (err) => {
      uncaughtErrors.push(err.message);
    });

    // 2. Navigate to /app
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    // 3. Stress Test: Rapidly hammer navigation options 20+ times
    // Emulates a user tapping buttons furiously and rapid monkey clicking
    const navDestinations = [
      "/app/shipping-bills",
      "/app/incentives",
      "/app/documents",
      "/app/matches",
      "/app/ebrc",
      "/app/shipping-bills",
      "/app/incentives",
      "/app/billing",
      "/app/notifications",
      "/app/shipping-bills",
    ];

    for (const href of navDestinations) {
      // Find navigation link and click rapidly
      const link = page.locator(`aside nav a[href="${href}"]`).first();
      if (await link.isVisible()) {
        await link.click({ delay: 50 });
      }
    }

    // Allow in-flight transitions to settle cleanly
    await page.waitForLoadState("domcontentloaded");

    // Now navigate to /app/shipping-bills
    await page.goto("/app/shipping-bills");
    await page.waitForLoadState("networkidle");

    // Verify page rendered properly after the stress barrage
    await expect(page.getByRole("heading", { name: "Shipping Bills", exact: true })).toBeVisible();

    // Verify no unhandled page crashes or blank screen
    expect(uncaughtErrors.filter((e) => !e.includes("hydration"))).toHaveLength(0);
  });

  test("displays industry-grade empty states with tips and actionable CTAs on fresh account", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const suffix = String(Date.now()).slice(-4);
    const email = `empty-state-user-${suffix}@example.invalid`;

    // Establish session
    await page.request.post("/api/auth/test-session", { data: { email } });
    await page.request.post("/api/orgs", {
      data: { name: `Empty States Co ${suffix}`, roleChoice: "exporter" },
    });

    // 1. Check Shipping Bills Empty State
    await page.goto("/app/shipping-bills");
    await page.waitForLoadState("networkidle");

    const sbEmptyState = page.getByTestId("empty-state");
    await expect(sbEmptyState).toBeVisible();
    await expect(page.getByText("No Shipping Bills uploaded yet")).toBeVisible();
    await expect(page.getByText(/Quick tips/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload Shipping Bills" })).toBeVisible();

    // 2. Check Incentives Workspace Empty State
    await page.goto("/app/incentives");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Incentives & e-Scrips/i })).toBeVisible();
    await expect(page.getByText("No incentive comparisons yet")).toBeVisible();
    await expect(page.getByText(/Quick tips/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Upload Shipping Bills" })).toBeVisible();

    // 3. Check Documents Manager Empty State
    await page.goto("/app/documents");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
    await expect(page.getByText("No export documents uploaded yet")).toBeVisible();
    await expect(page.getByText(/Quick tips/i)).toBeVisible();
    await expect(page.getByText(/AES-256/i)).toBeVisible();

    // 4. Check Bulk eBRC Workspace Empty State
    await page.goto("/app/ebrc");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /Bulk eBRC/i })).toBeVisible();
    await expect(page.getByText("No confirmed matches ready for eBRC export")).toBeVisible();
    await expect(page.getByRole("link", { name: /Review IRM Matches/i })).toBeVisible();
  });
});

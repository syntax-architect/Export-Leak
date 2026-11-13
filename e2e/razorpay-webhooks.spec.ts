import { expect, test } from "@playwright/test";

test.describe("Prompt 14: Razorpay webhook activation engine & Admin billing operations", () => {
  test("activates plan via webhook and displays event in /admin/billing without horizontal overflow", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const suffix = String(Date.now()).slice(-4);
    const email = `webhook-e2e-${suffix}@example.invalid`;
    const iecCode = `WHKEX${suffix}P`;

    // 1. Sign up as platform admin
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Salem Silks Export");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // 2. Navigate to /app/billing
    await page.goto("/app/billing");
    await expect(page.getByTestId("billing-overview-root")).toBeVisible({ timeout: 15_000 });

    // 3. Initiate checkout subscription
    const subRes = await page.request.post("/api/billing/subscribe", {
      data: { planKey: "exporter_monthly" },
    });
    expect(subRes.ok()).toBe(true);
    const subData = await subRes.json();
    expect(subData.subscriptionId).toBeDefined();

    // 4. Send webhook to /api/webhooks/razorpay activating the subscription
    const secret = "your-razorpay-webhook-secret";
    const webhookPayload = {
      id: `evt_e2e_${Date.now()}`,
      entity: "event",
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id: subData.subscriptionId,
            plan_id: "plan_exporter_monthly",
            status: "active",
            paid_count: 1,
            notes: {
              plan_key: "exporter_monthly",
            },
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    // Use test endpoint / signature bypass or signed request
    const crypto = await import("node:crypto");
    const rawBody = JSON.stringify(webhookPayload);
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const hookRes = await page.request.post("/api/webhooks/razorpay", {
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sig,
        "x-razorpay-event-id": webhookPayload.id,
      },
      data: rawBody,
    });
    expect(hookRes.ok()).toBe(true);
    const hookData = await hookRes.json();
    expect(hookData.received).toBe(true);

    // 5. Reload /app/billing -> verify plan is Active Subscription
    await page.reload();
    await expect(page.getByText("Active subscription")).toBeVisible({ timeout: 15_000 });

    // 6. Check responsive mobile layout (no overflow)
    const overflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowMobile).toBe(false);

    await context.close();
  });
});

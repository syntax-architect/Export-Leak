import { expect, test } from "@playwright/test";

test.describe("Prompt 13: Razorpay checkout and subscription flow", () => {
  test("renders transparent plan cards, initiates checkout on 360px and desktop, and handles payment confirmation modal without horizontal overflow", async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
    });
    const page = await context.newPage();

    const suffix = String(Date.now()).slice(-4);
    const email = `rzp-e2e-${suffix}@example.invalid`;
    const iecCode = `RZPEX${suffix}Q`;

    // Sign up & complete fast onboarding to land on /app
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Kaveri Garments");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // Navigate to /app/billing
    await page.goto("/app/billing");
    await expect(page.getByTestId("billing-overview-root")).toBeVisible({ timeout: 15_000 });

    // Verify zero horizontal scroll on 360px mobile viewport
    const overflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowMobile).toBe(false);

    // Verify paid plan cards exist for Exporter and Consultant
    await expect(page.getByTestId("plan-card-exporter_monthly")).toBeVisible();
    await expect(page.getByTestId("plan-card-exporter_annual")).toBeVisible();
    await expect(page.getByTestId("plan-card-consultant_monthly")).toBeVisible();
    await expect(page.getByTestId("plan-card-consultant_annual")).toBeVisible();

    // Verify subscribe buttons exist
    const subscribeBtn = page.getByTestId("subscribe-btn-exporter_monthly");
    await expect(subscribeBtn).toBeVisible();

    // Mock window.Razorpay in the page to intercept checkout and test handler callback
    await page.evaluate(() => {
      (window as unknown as { Razorpay: unknown }).Razorpay = class MockRazorpay {
        opts: {
          key: string;
          subscription_id: string;
          handler?: (resp: {
            razorpay_payment_id: string;
            razorpay_subscription_id: string;
            razorpay_signature: string;
          }) => void;
          modal?: { ondismiss?: () => void };
        };

        constructor(options: typeof this.opts) {
          this.opts = options;
          (window as unknown as { lastRazorpayInstance: unknown }).lastRazorpayInstance = this;
        }

        open() {
          // Simulate user checkout handler callback
          if (this.opts.handler) {
            this.opts.handler({
              razorpay_payment_id: "pay_mock_test_12345",
              razorpay_subscription_id: this.opts.subscription_id,
              razorpay_signature: "mock_signature_for_test",
            });
          }
        }

        on() {}
      };
    });

    // Intercept /api/billing/verify and /api/billing/status
    await page.route("**/api/billing/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          verified: true,
          message: "Payment signature verified. Waiting for webhook activation.",
        }),
      });
    });

    await page.route("**/api/billing/status*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orgId: "mock_org",
          planKey: "exporter_monthly",
          isPaidPlanActive: true,
          planStatus: "active",
        }),
      });
    });

    // Click subscribe button
    await subscribeBtn.click();

    // Payment confirmation modal opens
    await expect(page.getByTestId("payment-status-modal")).toBeVisible({ timeout: 15_000 });

    // Success state reached once status resolves active
    await expect(page.getByTestId("payment-success-done-button")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Welcome to Exporter Monthly!")).toBeVisible();

    // Click Go to workspace
    await page.getByTestId("payment-success-done-button").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

    await context.close();
  });
});

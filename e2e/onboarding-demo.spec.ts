import { expect, test } from "@playwright/test";

test.describe("Guided onboarding, demo workspace, product tour, and mobile 360px", () => {
  test("reaches populated dashboard via Try with sample data in 3 taps, deletes demo in 1 click, and replays tour", async ({
    browser,
  }) => {
    const email = `wizard-${Date.now()}@example.invalid`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Who are you?" })).toBeVisible();

    // Tap 1: Enter company name & Continue -> Step 2
    await page.getByLabel("Company / Exporter name").fill("Madurai Knitwear Exports");
    await page.getByTestId("wizard-step1-submit").click();
    await expect(page.getByRole("heading", { name: "What do you want to check?" })).toBeVisible();

    // Tap 2: Continue -> Step 3
    await page.getByTestId("wizard-step2-submit").click();
    await expect(page.getByRole("heading", { name: "Add your files" })).toBeVisible();

    // Tap 3: Try with sample data -> Step 4 populated leakage dashboard
    await page.getByTestId("try-sample-data-btn").click();
    await expect(page.getByTestId("onboarding-first-result")).toBeVisible();
    await expect(page.getByTestId("demo-workspace-banner")).toBeVisible();
    await expect(page.getByTestId("data-table-desktop").getByText("DEMO-849201")).toBeVisible();

    // Trust dialog accessible from wizard footer
    await page.getByTestId("trust-panel-trigger").click();
    await expect(
      page.getByRole("heading", { name: "How ExportLeak protects your trade data" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();

    // Finish onboarding -> /app dashboard + automatic 5-step product tour + checklist
    await page.getByTestId("finish-onboarding-btn").click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByTestId("onboarding-checklist")).toBeVisible();
    await expect(page.getByTestId("product-tour-popover")).toBeVisible();
    await expect(page.getByText("Tour 1 of 5")).toBeVisible();

    // Walk through 5 coachmarks & complete tour
    await page.getByTestId("tour-next-btn").click();
    await expect(page.getByText("Tour 2 of 5")).toBeVisible();
    await page.getByTestId("tour-next-btn").click();
    await expect(page.getByText("Tour 3 of 5")).toBeVisible();
    await page.getByTestId("tour-next-btn").click();
    await expect(page.getByText("Tour 4 of 5")).toBeVisible();
    await page.getByTestId("tour-next-btn").click();
    await expect(page.getByText("Tour 5 of 5")).toBeVisible();
    await page.getByTestId("tour-next-btn").click();
    await expect(page.getByTestId("product-tour-popover")).toHaveCount(0);

    // Replay tour from Help menu
    await page.getByTestId("help-menu-trigger").click();
    await page.getByTestId("help-replay-tour-btn").click();
    await expect(page.getByTestId("product-tour-popover")).toBeVisible();
    await page.getByTestId("tour-dismiss-btn").click();

    // One-click delete demo data removes DEMO banner and DEMO rows cleanly
    await page.getByTestId("delete-demo-data-btn").click();
    await expect(page.getByTestId("demo-workspace-banner")).toHaveCount(0);
    await expect(page.getByText("No shipments yet")).toBeVisible();

    await context.close();
  });

  test("works on 360px screen with keyboard and resumes at the same step after closing browser", async ({
    browser,
  }) => {
    const email = `resume-${Date.now()}@example.invalid`;
    const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
    const page = await context.newPage();

    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/);

    // Verify zero horizontal overflow at 360px on Step 1
    const overflowStep1 = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflowStep1).toBeLessThanOrEqual(0);

    // Complete Step 1 using keyboard submit
    await page.getByLabel("Company / Exporter name").fill("Coimbatore Spices Co");
    await page.getByTestId("wizard-step1-submit").focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "What do you want to check?" })).toBeVisible();

    // Advance cleanly with keyboard to Step 3 and stop mid-wizard
    await page.getByTestId("wizard-step2-submit").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Add your files" })).toBeVisible();

    const overflowStep3 = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflowStep3).toBeLessThanOrEqual(0);

    // Save browser storage state, close page/context, open fresh browser context -> resumes at Step 3
    const storageState = await context.storageState();
    await context.close();

    const resumedContext = await browser.newContext({
      viewport: { width: 360, height: 780 },
      storageState,
    });
    const resumedPage = await resumedContext.newPage();
    await resumedPage.goto("/onboarding");

    await expect(resumedPage.getByRole("heading", { name: "Add your files" })).toBeVisible();
    await expect(resumedPage.getByText("Step 3 of 4")).toBeVisible();

    await resumedContext.close();
  });
});

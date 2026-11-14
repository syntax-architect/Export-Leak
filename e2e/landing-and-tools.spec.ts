import { expect, test } from "@playwright/test";

test.describe("Prompt 17: Landing page, free tools, SEO & share loop", () => {
  test("renders landing page at 360px without horizontal scroll and verifies demo loop, trust and FAQ", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 1. Check no horizontal overflow at 360px (Master Rule #7)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // 2. Verify Hero title and CTA
    await expect(
      page.getByRole("heading", { name: /Find the export incentive money you are missing/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Check my shipments free" }).first()).toBeVisible();

    // 3. Verify Product Demo Loop and switch tabs
    await expect(page.getByText("Interactive Product Tour")).toBeVisible();
    const detectTab = page.getByRole("button", { name: "2. Detect Leaks" });
    await expect(detectTab).toBeVisible();
    await detectTab.click();
    await expect(page.getByText(/Automated Reconciliation & Money Leak Detected/i)).toBeVisible();

    // 4. Verify 3-step workflow
    await expect(page.getByRole("heading", { name: "Upload Documents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Auto-Reconcile & Spot Leaks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Generate DGFT Bulk eBRC" })).toBeVisible();

    // 5. Verify FAQ Accordion opens on tap
    const firstFaqQuestion = page.getByText(/Do you need my DGFT or ICEGATE password/i);
    await expect(firstFaqQuestion).toBeVisible();
    await firstFaqQuestion.click();
    await expect(
      page.getByText(/We never ask for, accept, or store your Digital Signature Certificate/i)
    ).toBeVisible();

    // 6. Verify Founder note
    await expect(page.getByText(/A Note from the Founder/i)).toBeVisible();
  });

  test("runs public RoDTEP calculator tool at 360px without signup and displays formula", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto("/tools/calculator");
    await page.waitForLoadState("networkidle");

    // No overflow at 360px
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    // Verify heading
    await expect(
      page.getByRole("heading", { name: /Free Instant RoDTEP & Drawback Calculator/i })
    ).toBeVisible();

    // Fill HS Code and FOB
    await page.getByLabel(/8-Digit ITC-HS Code/i).fill("61091000");
    await page.getByLabel(/FOB Value in INR/i).fill("500000");

    // Click Calculate
    await page.getByRole("button", { name: /Calculate Expected Incentives/i }).click();

    // Verify calculation output appears
    await expect(page.getByText(/Total Expected Export Incentive/i)).toBeVisible();
    await expect(page.getByText(/Calculation Formula:/i).first()).toBeVisible();
    await expect(page.getByText(/Official Notification Schedule:/i)).toBeVisible();
  });

  test("renders free Bulk eBRC Excel validator and displays memory-only guarantee", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto("/tools/ebrc-validator");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(
      page.getByRole("heading", { name: /Free DGFT Bulk eBRC Excel Validator/i })
    ).toBeVisible();
    await expect(page.getByText(/Processed 100% in memory · Never stored/i)).toBeVisible();
    await expect(page.getByText(/Drop your Bulk eBRC Excel here/i)).toBeVisible();
  });

  test("renders /learn glossary index and programmatic term page with JSON-LD", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 780 });

    // 1. Visit /learn
    await page.goto("/learn");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(
      page.getByRole("heading", {
        name: /The Exporter's Guide to Incentives, Banking & DGFT Compliance/i,
      })
    ).toBeVisible();

    // 2. Click through to RoDTEP term page
    await page
      .getByRole("link", { name: /Read guide/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/learn\/rodtep/);

    // 3. Verify term details
    await expect(
      page.getByRole("heading", { name: /RoDTEP: Remission of Duties and Taxes/i })
    ).toBeVisible();
    await expect(page.getByText(/How RoDTEP Works in Indian Export Trade/i)).toBeVisible();
    await expect(
      page.getByText(/Costly Mistakes Indian Exporters Make with RoDTEP/i)
    ).toBeVisible();

    // 4. Verify JSON-LD script is present in page
    const jsonLdScript = page.locator("#glossary-term-jsonld");
    await expect(jsonLdScript).toBeAttached();
    const jsonLdContent = await jsonLdScript.textContent();
    expect(jsonLdContent).toContain('"@type":"DefinedTerm"');
    expect(jsonLdContent).toContain('"name":"RoDTEP"');
  });

  test("renders shared CA summary report page or invalid/expired state banner", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 780 });

    // Non-existent token should show unavailable notice cleanly
    await page.goto("/share/non-existent-token-12345");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);

    await expect(page.getByRole("heading", { name: /Shared Report Unavailable/i })).toBeVisible();
    await expect(
      page.getByText(/This shared reconciliation link has expired, was revoked/i)
    ).toBeVisible();
  });
});

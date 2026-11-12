import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Prompt 10: Bulk eBRC Excel validator, plan gate, and DGFT .xlsx export", () => {
  test("blocks Free generate with 402, auto-starts Trial on upload, validates inline at 360px, confirms and downloads .xlsx at 1280px", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      acceptDownloads: true,
    });
    const page = await context.newPage();

    const email = `ebrc-e2e-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await page.getByLabel("Company / Exporter name").fill("Tiruppur Knit Exports");
    await page.getByLabel("IEC Code (optional now)").fill("AAACT5678N");
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });

    // 1. Verify Free plan gating on /app/ebrc and 402 from POST generate API
    await page.goto("/app/ebrc");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("ebrc-workspace-root")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("ebrc-free-gate-banner")).toBeVisible();
    await expect(page.getByTestId("ebrc-template-version")).toContainText(
      "DGFT-BULK-EBRC-REF-2026.1"
    );
    await expect(page.getByTestId("ebrc-quarterly-banner")).toBeVisible();

    const freeApiCheck = await page.evaluate(async () => {
      const orgsRes = await fetch("/api/orgs");
      const orgsData = (await orgsRes.json()) as {
        organizations?: Array<{ orgId: string }>;
      };
      const orgId = orgsData.organizations?.[0]?.orgId;
      if (!orgId) {
        return { status: 0, errorCode: "NO_ORG" };
      }
      const res = await fetch(`/api/orgs/${orgId}/ebrc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          rows: [
            {
              serialNumber: 1,
              iecBranchSlNo: "0",
              ifscCode: "HDFC0000240",
              adCode: "0510002",
              irmNumber: "IRM-FREE-01",
              irmDate: "10/10/2026",
              irmCurrency: "USD",
              purposeCode: "P0102",
              amountInFcc: "1000.00",
              portCode: "INNSA1",
              shippingBillNumber: "7458210",
              shippingBillDate: "01/10/2026",
            },
          ],
        }),
      });
      const json = (await res.json()) as { error?: { code?: string } };
      return { status: res.status, errorCode: json.error?.code ?? null };
    });
    expect(freeApiCheck.status).toBe(402);
    expect(freeApiCheck.errorCode).toBe("PLAN_LIMIT_EXCEEDED");

    // 2. Upload real Shipping Bill PDF (auto-starts 7-day Pro Trial)
    await page.goto("/app/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
    const sb1Path = path.resolve(
      process.cwd(),
      "fixtures",
      "shipping-bills",
      "sb-01-icegate-garment.pdf"
    );
    await page.getByTestId("document-file-input").setInputFiles([sb1Path]);
    await expect(page.getByTestId("batch-parse-summary")).toContainText("1 parsed", {
      timeout: 30_000,
    });

    // 3. Import IRM workbook and confirm a USD match
    await page.goto("/app/matches");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /IRM Import & Matching/i })).toBeVisible();
    const irmXlsxPath = path.resolve(
      process.cwd(),
      "fixtures",
      "irm",
      "irm-dgft-edpms-sample.xlsx"
    );
    await page.getByTestId("irm-file-input").setInputFiles(irmXlsxPath);
    await expect(page.getByTestId("irm-mapping-preview")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("confirm-irm-import-button").click();
    await expect(page.getByTestId("irm-commit-summary")).toContainText("6 new IRM(s)", {
      timeout: 20_000,
    });

    const manualLinkBtn = page.getByTestId("manual-link-IRM-HDFC-26001");
    await expect(manualLinkBtn).toBeVisible({ timeout: 15_000 });
    await manualLinkBtn.click();
    await expect(page.getByTestId("confirmed-match-7458210-IRM-HDFC-26001")).toBeVisible({
      timeout: 15_000,
    });

    // 4. Open /app/ebrc on 360px mobile viewport, fix missing IFSC/AD inline, and validate
    await page.goto("/app/ebrc");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("ebrc-preview-cards")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("ebrc-free-gate-banner")).toHaveCount(0);

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow).toBe(false);

    const mobileCards = page.getByTestId("ebrc-preview-cards");
    await mobileCards.getByLabel("IFSC Code").first().fill("HDFC0000240");
    await mobileCards.getByLabel("AD Code").first().fill("0510002");
    await mobileCards.getByLabel("Purpose Code").first().fill("P0102");

    await page.getByTestId("ebrc-validate-btn").click();
    await expect(page.getByTestId("ebrc-validation-passed-banner")).toBeVisible({
      timeout: 15_000,
    });

    // 5. Switch to 1280px desktop viewport, confirm disclaimer, and download .xlsx
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("ebrc-preview-table")).toBeVisible();

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    await page.getByTestId("ebrc-generate-btn").click();
    await expect(page.getByTestId("ebrc-confirm-dialog")).toBeVisible();
    await expect(page.getByTestId("ebrc-confirm-dialog")).toContainText(
      "Review this file before uploading it on the DGFT portal. You submit it yourself."
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("ebrc-confirm-download-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^dgft-bulk-ebrc-.*\.xlsx$/);

    await context.close();
  });
});

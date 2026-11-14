import { expect, test } from "@playwright/test";

test.describe("Prompt 5: Document upload, duplicate SHA-256, magic bytes, and 50-file mobile batch", () => {
  test("rejects renamed .exe, blocks duplicate PDFs with Already uploaded, filters, and handles 50 PDFs on throttled mobile without freezing UI", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const suffix = String(Date.now()).slice(-4);
    const email = `docs-p5-${suffix}@example.invalid`;
    const iecCode = `ACS${suffix}01E`;
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    // Sign in and create org + IEC via Step 1
    await page.goto("/login");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send magic link" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Company / Exporter name").fill("Surat Silk Exports");
    await page.getByLabel("IEC Code (optional now)").fill(iecCode);
    await page.getByTestId("wizard-step1-submit").click();
    await page.getByTestId("wizard-skip-all-btn").click();
    await expect(page).toHaveURL(/\/app/);

    await page.goto("/app/documents");
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();

    // Zero horizontal overflow on 375px mobile
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 1. Renamed .exe with .pdf extension is rejected immediately
    await page.getByTestId("document-file-input").setInputFiles({
      name: "malware-disguised.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
    });

    await expect(
      page.getByTestId("upload-queue-list").getByText(/Executable Windows binary/i)
    ).toBeVisible();
    await expect(
      page.getByTestId("documents-list-card").getByText("malware-disguised.pdf")
    ).toHaveCount(0);

    // 2. Upload a Customs Scroll PDF (starts 7-day Pro trial with 50 SB allowance)
    await page.getByLabel("Select Document Type").click();
    await page.getByRole("option", { name: /Customs Scroll/i }).click();

    const samplePdf = Buffer.from("%PDF-1.4\n%RoDTEP Customs Scroll 500001\n%%EOF\n");
    await page.getByTestId("document-file-input").setInputFiles({
      name: "customs-scroll-500001.pdf",
      mimeType: "application/pdf",
      buffer: samplePdf,
    });

    await expect(
      page.getByTestId("documents-list-card").getByText("customs-scroll-500001.pdf")
    ).toBeVisible();

    // 3. Uploading the exact same PDF again shows "Already uploaded" and creates no second row
    await page.getByTestId("document-file-input").setInputFiles({
      name: "customs-scroll-duplicate.pdf",
      mimeType: "application/pdf",
      buffer: samplePdf,
    });

    await expect(
      page.getByTestId("upload-queue-list").getByText("Already uploaded", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByTestId("documents-list-card").getByText("customs-scroll-duplicate.pdf")
    ).toHaveCount(0);

    // 4. Switch to Shipping Bill (PDF), throttle network via CDP, and upload 50 PDFs in one batch without freezing UI
    await page.getByLabel("Select Document Type").click();
    await page.getByRole("option", { name: /Shipping Bill/i }).click();

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: 500 * 1024,
      uploadThroughput: 256 * 1024,
      latency: 40,
    });

    const fiftyFiles = Array.from({ length: 50 }, (_, i) => ({
      name: `batch-sb-${String(i + 1).padStart(2, "0")}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.4\n%Batch Shipping Bill #${i + 1}\n%%EOF\n`),
    }));

    await page.getByTestId("document-file-input").setInputFiles(fiftyFiles);

    // While batch is actively running, verify UI remains responsive to user input (not frozen)
    const searchInput = page.getByLabel("Search filename");
    await searchInput.fill("batch-sb-50");
    await expect(searchInput).toHaveValue("batch-sb-50");

    // Wait for filtered 50th file to finish uploading and appear in persisted list
    await expect(page.getByTestId("documents-list-card").getByText("batch-sb-50.pdf")).toBeVisible({
      timeout: 90000,
    });

    // Clear search and verify total document count (1 scroll + 50 batch SBs = 51) & 50/50 usage meter
    await searchInput.fill("");
    await expect(page.getByText("Uploaded files (51)")).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByTestId("usage-meter-card").getByText("50 of 50 SBs this month")
    ).toBeVisible();

    await context.close();
  });
});

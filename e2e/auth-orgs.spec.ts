import { expect, test } from "@playwright/test";

test.describe("Auth, organizations, onboarding, and viewer isolation", () => {
  test("sign up, create exporter org, land on onboarding, and enforce viewer read-only + 403 cross-org API", async ({
    browser,
  }) => {
    const uniqueSuffix = Date.now();
    const ownerEmail = `owner-${uniqueSuffix}@example.invalid`;
    const viewerEmail = `viewer-${uniqueSuffix}@example.invalid`;
    const outsiderEmail = `outsider-${uniqueSuffix}@example.invalid`;

    // 1. Unauthenticated access to /app redirects to /login
    const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/app");
    await expect(ownerPage).toHaveURL(/\/login/);
    await expect(
      ownerPage.getByText("We never ask for your DSC or portal passwords.")
    ).toBeVisible();

    // 2. Owner signs up and creates exporter organization -> lands on onboarding
    await ownerPage.getByLabel("Work email").fill(ownerEmail);
    await ownerPage.getByRole("button", { name: "Send magic link" }).click();

    await expect(ownerPage).toHaveURL(/\/onboarding/);
    await ownerPage.getByTestId("role-card-exporter").click();
    await ownerPage.getByLabel("Company / Exporter name").fill("Kaveri Garments Test Pvt Ltd");
    await ownerPage.getByTestId("wizard-step1-submit").click();

    await expect(
      ownerPage.getByRole("heading", { name: "What do you want to check?" })
    ).toBeVisible();

    // 3. Owner skips rest of wizard to workspace, adds an IEC, uploads a doc, and invites viewer
    await ownerPage.getByTestId("wizard-skip-all-btn").click();
    await expect(ownerPage).toHaveURL(/\/app/);

    await ownerPage.goto("/app/iecs");
    await ownerPage.getByLabel("IEC Code").fill("AAACH1234K");
    await ownerPage.getByLabel("Legal Name").fill("Kaveri Garments Test Pvt Ltd");
    await ownerPage.getByRole("button", { name: "Save IEC profile" }).click();
    await expect(
      ownerPage.getByTestId("data-table-mobile").getByText("AAACH1234K", { exact: true })
    ).toBeVisible();

    await ownerPage.goto("/app/documents");
    await ownerPage.getByTestId("document-file-input").setInputFiles({
      name: "sb-test-001.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"),
    });
    await expect(
      ownerPage.getByTestId("documents-list-card").getByText("sb-test-001.pdf")
    ).toBeVisible();

    await ownerPage.goto("/app/team");
    await ownerPage.getByLabel("Email address").fill(viewerEmail);
    await ownerPage.getByRole("button", { name: "Send invite" }).click();
    await expect(ownerPage.getByTestId("latest-invite-link")).toBeVisible();
    const inviteUrl = await ownerPage
      .getByTestId("latest-invite-link")
      .locator("p")
      .nth(1)
      .innerText();

    const orgsData = (await ownerPage.evaluate(async () => {
      const r = await fetch("/api/orgs");
      return r.json();
    })) as { organizations: Array<{ orgId: string }> };
    const org1Id = orgsData.organizations[0]!.orgId;

    // 4. Second user signs in, accepts invite as viewer, cannot upload or delete
    const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`/login?next=${encodeURIComponent(new URL(inviteUrl).pathname)}`);
    await viewerPage.getByLabel("Work email").fill(viewerEmail);
    await viewerPage.getByRole("button", { name: "Send magic link" }).click();

    await expect(viewerPage).toHaveURL(/\/invite\//);
    await viewerPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(viewerPage).toHaveURL(/\/app/);

    await viewerPage.goto("/app/documents");
    await expect(
      viewerPage.getByTestId("documents-list-card").getByText("sb-test-001.pdf")
    ).toBeVisible();
    await expect(viewerPage.getByTestId("viewer-readonly-notice")).toBeVisible();
    await expect(viewerPage.getByTestId("choose-files-btn")).toHaveCount(0);
    await expect(viewerPage.getByRole("button", { name: /Delete/i })).toHaveCount(0);

    // Server enforcement check: viewer API POST returns 403
    const viewerPostStatus = await viewerPage.evaluate(async (orgId) => {
      const iecsRes = await fetch(`/api/orgs/${orgId}/iecs`);
      const { iecs } = (await iecsRes.json()) as { iecs: Array<{ id: string }> };
      const res = await fetch(`/api/orgs/${orgId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iecId: iecs[0]!.id,
          kind: "shipping_bill",
          originalName: "forged.pdf",
        }),
      });
      return res.status;
    }, org1Id);
    expect(viewerPostStatus).toBe(403);

    // 5. Outsider user calling Org 1 API gets 403
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto("/login");
    await outsiderPage.getByLabel("Work email").fill(outsiderEmail);
    await outsiderPage.getByRole("button", { name: "Send magic link" }).click();
    await expect(outsiderPage).toHaveURL(/\/onboarding/);

    const outsiderStatus = await outsiderPage.evaluate(async (orgId) => {
      const res = await fetch(`/api/orgs/${orgId}/iecs`);
      return res.status;
    }, org1Id);
    expect(outsiderStatus).toBe(403);

    await ownerContext.close();
    await viewerContext.close();
    await outsiderContext.close();
  });
});

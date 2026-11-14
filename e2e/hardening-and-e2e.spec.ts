import { expect, test } from "@playwright/test";

test.describe("Prompt 19: Security, privacy, observability & launch hardening", () => {
  test("verifies /api/health endpoint reports database connectivity and system status", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.app.name).toBe("ExportLeak");
    expect(body.checks.database.status).toBe("connected");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  test("verifies strict security headers are applied to responses", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);

    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("renders 'How We Handle Your Documents' privacy page without horizontal scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/privacy/documents");
    await page.waitForLoadState("networkidle");

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasOverflow).toBe(false);

    await expect(
      page.getByRole("heading", { name: /How We Handle Your Documents & Financial Data/i })
    ).toBeVisible();
    await expect(page.getByText(/Zero Government Password \/ DSC Storage/i)).toBeVisible();
    await expect(page.getByText(/AES-256 Encryption & Strict RLS/i)).toBeVisible();
    await expect(page.getByText(/Ephemeral AI Parsing & No Training/i)).toBeVisible();
    await expect(page.getByText(/Complete Deletion & 30-Day Purge/i)).toBeVisible();
  });

  test("enforces strict confirmation and owner role for account deletion", async ({ request }) => {
    // 1. Sign in as test user
    const authRes = await request.post("/api/auth/test-session", {
      data: { email: "owner-deletion-test@example.com" },
    });
    expect(authRes.status()).toBe(200);

    // 2. Create organization
    const orgRes = await request.post("/api/orgs", {
      data: { name: "Deletion Test Corp", roleChoice: "exporter" },
    });
    expect(orgRes.status()).toBe(201);
    const orgData = await orgRes.json();
    const orgId = orgData.organization.orgId;

    // 3. Attempt deletion with missing or wrong confirmation text -> 400
    const failRes = await request.post(`/api/orgs/${orgId}/delete-account`, {
      data: { confirmationText: "wrong phrase" },
    });
    expect(failRes.status()).toBe(400);

    // 4. Confirm deletion with exact phrase -> 200
    const successRes = await request.post(`/api/orgs/${orgId}/delete-account`, {
      data: {
        confirmationText: "DELETE MY ACCOUNT",
        reason: "Completed export audit project",
      },
    });
    expect(successRes.status()).toBe(200);
    const successBody = await successRes.json();
    expect(successBody.success).toBe(true);
    expect(successBody.purgeScheduledFor).toBeDefined();
  });

  test("renders admin observability dashboard with MRR and cost guardrails for platform admin", async ({
    page,
  }) => {
    // Sign in as platform admin via page.request so browser context receives the session cookie
    const authRes = await page.request.post("/api/auth/test-session", {
      data: { email: "admin-metrics-e2e@example.com", isPlatformAdmin: true },
    });
    expect(authRes.status()).toBe(200);

    await page.goto("/admin/observability");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /Platform Observability & Financial Metrics/i })
    ).toBeVisible();
    await expect(page.getByText(/Monthly Recurring Revenue/i)).toBeVisible();
    await expect(page.getByText(/Paid Subscriptions/i)).toBeVisible();
    await expect(page.getByText(/Monthly Infrastructure Cost Guardrails/i)).toBeVisible();
    await expect(page.getByText(/AI Parse Spend Cap/i)).toBeVisible();
  });
});

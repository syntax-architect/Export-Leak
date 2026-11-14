import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as forceLoginRoute } from "@/app/api/auth/force-login/route";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/auth/org-access";
import { TEST_SESSION_COOKIE, verifyTestSession } from "@/lib/auth/pglite-adapter";

describe("Force Login Feature (Dev / Demo Bypass)", () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("successfully force logins as default demo exporter with active demo org and iec cookies", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/force-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await forceLoginRoute(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe("demo-exporter@example.invalid");
    expect(data.activeOrgId).toBe("20000000-0000-4000-8000-000000000001");
    expect(data.redirectTo).toBe("/app");

    // Check cookies set on the response
    const sessionCookie = response.cookies.get(TEST_SESSION_COOKIE)?.value;
    expect(sessionCookie).toBeDefined();

    const verified = verifyTestSession(sessionCookie);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe("demo-exporter@example.invalid");

    const orgCookie = response.cookies.get(ACTIVE_ORG_COOKIE)?.value;
    expect(orgCookie).toBe("20000000-0000-4000-8000-000000000001");

    const iecCookie = response.cookies.get(ACTIVE_IEC_COOKIE)?.value;
    expect(iecCookie).toBe("40000000-0000-4000-8000-000000000001");
  });

  it("force logins with a custom user email and links them to workspace", async () => {
    const customEmail = "tester-custom@example.invalid";
    const request = new NextRequest("http://localhost:3000/api/auth/force-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: customEmail, nextPath: "/app/shipping-bills" }),
    });

    const response = await forceLoginRoute(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe(customEmail);
    expect(data.activeOrgId).toBeDefined();
    expect(data.redirectTo).toBe("/app/shipping-bills");

    const sessionCookie = response.cookies.get(TEST_SESSION_COOKIE)?.value;
    const verified = verifyTestSession(sessionCookie);
    expect(verified?.email).toBe(customEmail);
  });

  it("handles fresh account mode by redirecting to /onboarding without active org", async () => {
    const freshEmail = "fresh-onboarding@example.invalid";
    const request = new NextRequest("http://localhost:3000/api/auth/force-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: freshEmail, freshAccount: true }),
    });

    const response = await forceLoginRoute(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/onboarding");
  });

  it("blocks force login requests in production environment with 403", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const request = new NextRequest("http://localhost:3000/api/auth/force-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await forceLoginRoute(request);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.error.code).toBe("FORBIDDEN");

    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  });
});

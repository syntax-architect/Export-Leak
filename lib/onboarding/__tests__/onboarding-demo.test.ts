import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockState = {
  user: null as { id: string; email: string } | null,
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("@/lib/auth/org-access", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/org-access")>("@/lib/auth/org-access");
  return {
    ...actual,
    getAuthenticatedUser: async () => mockState.user,
    requireOrgAccess: async (
      orgId: string,
      minRole: "viewer" | "member" | "admin" | "owner" = "viewer"
    ) => {
      return actual.assertOrgMembershipAccess({
        user: mockState.user,
        orgId,
        minRole,
        findMembership: async (userId, validOrgId) => {
          const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
          return asPgliteUser(userId, async (tx) => {
            const res = await tx.query<{ role: "viewer" | "member" | "admin" | "owner" }>(
              `select role from public.memberships where user_id = $1 and org_id = $2`,
              [userId, validOrgId]
            );
            return res.rows[0]?.role ?? null;
          });
        },
      });
    },
  };
});

import { GET as getDashboardRoute } from "@/app/api/orgs/[orgId]/dashboard/route";
import {
  DELETE as deleteDemoRoute,
  POST as createDemoRoute,
} from "@/app/api/orgs/[orgId]/demo/route";
import { POST as createDocumentRoute } from "@/app/api/orgs/[orgId]/documents/route";
import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { POST as createInviteRoute } from "@/app/api/orgs/[orgId]/invites/route";
import { POST as acceptInviteRoute } from "@/app/api/invites/accept/route";
import {
  GET as getOnboardingRoute,
  PATCH as patchOnboardingRoute,
} from "@/app/api/onboarding/route";
import { POST as stepOneRoute } from "@/app/api/onboarding/step1/route";
import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { startTrial } from "@/lib/billing/trial";

describe("Guided onboarding, demo workspace, trial trigger, and events", () => {
  beforeAll(() => {
    vi.stubEnv("EXPORTLEAK_E2E_ADAPTER", "pglite");
  });

  afterAll(async () => {
    await resetPgliteDb();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    mockState.user = null;
  });

  it("persists step 1 org + auto-IEC, step 2 prefs, demo workspace create/delete, and funnel events", async () => {
    const user = await ensurePgliteUser("onboard-owner@example.invalid");
    mockState.user = user;

    // Step 1 with company name and IEC code auto-creates org + IEC
    const step1Res = await stepOneRoute(
      new NextRequest("http://localhost/api/onboarding/step1", {
        method: "POST",
        body: JSON.stringify({
          roleChoice: "exporter",
          name: "Tiruppur Cottons Pvt Ltd",
          iecCode: "AAACT9988K",
          gstin: "33AAACT9988K1Z5",
        }),
      })
    );
    expect(step1Res.status).toBe(201);
    const step1Json = (await step1Res.json()) as {
      organization: { orgId: string };
      profile: { currentStep: number };
    };
    expect(step1Json.profile.currentStep).toBe(2);

    // Step 2 stores selectable preferences and resumes at Step 3
    const patchRes = await patchOnboardingRoute(
      new NextRequest("http://localhost/api/onboarding", {
        method: "PATCH",
        body: JSON.stringify({
          currentStep: 3,
          preferences: { checkRodtep: true, checkDeadlines: false, checkEbrc: true },
          eventType: "step_completed",
          eventStep: 2,
        }),
      })
    );
    expect(patchRes.status).toBe(200);

    const resumed = await getOnboardingRoute();
    const resumedJson = (await resumed.json()) as {
      profile: {
        currentStep: number;
        preferences: { checkRodtep: boolean; checkDeadlines: boolean; checkEbrc: boolean };
      };
    };
    expect(resumedJson.profile.currentStep).toBe(3);
    expect(resumedJson.profile.preferences).toEqual({
      checkRodtep: true,
      checkDeadlines: false,
      checkEbrc: true,
    });

    // Step 3: create demo workspace (sanitised synthetic data)
    const demoRes = await createDemoRoute(
      new NextRequest(`http://localhost/api/orgs/${step1Json.organization.orgId}/demo`, {
        method: "POST",
      }),
      { params: Promise.resolve({ orgId: step1Json.organization.orgId }) }
    );
    expect(demoRes.status).toBe(201);
    const demoJson = (await demoRes.json()) as {
      iecId: string;
      summary: {
        hasDemoData: boolean;
        unclaimedIncentivePaise: number;
        expiringScripsPaise: number;
        openAlertsCount: number;
        shipments: Array<{ sbNumber: string; isDemo: boolean }>;
      };
    };

    expect(demoJson.summary.hasDemoData).toBe(true);
    expect(demoJson.summary.unclaimedIncentivePaise).toBeGreaterThan(0);
    expect(demoJson.summary.expiringScripsPaise).toBeGreaterThan(0);
    expect(demoJson.summary.openAlertsCount).toBeGreaterThan(0);
    expect(demoJson.summary.shipments.every((s) => s.isDemo)).toBe(true);

    // Creating demo data does NOT consume the user's real 7-day Pro trial
    const db = await getPgliteDb();
    const orgPlanBeforeUpload = await db.query<{ plan_key: string }>(
      `select plan_key from public.organizations where id = $1`,
      [step1Json.organization.orgId]
    );
    expect(orgPlanBeforeUpload.rows[0]?.plan_key).toBe("free");

    // Uploading a real file against their real IEC DOES start 7-day Pro trial automatically
    const iecList = await db.query<{ id: string }>(
      `select id from public.iec_profiles where org_id = $1 and is_demo = false`,
      [step1Json.organization.orgId]
    );
    const uploadRes = await createDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${step1Json.organization.orgId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          iecId: iecList.rows[0]!.id,
          kind: "shipping_bill",
          originalName: "real-sb-001.pdf",
        }),
      }),
      { params: Promise.resolve({ orgId: step1Json.organization.orgId }) }
    );
    expect(uploadRes.status).toBe(201);
    const uploadJson = (await uploadRes.json()) as { trialStarted: boolean };
    expect(uploadJson.trialStarted).toBe(true);

    // 1-click delete demo data removes DEMO IEC & rows without touching real IEC
    const delDemoRes = await deleteDemoRoute(
      new NextRequest(`http://localhost/api/orgs/${step1Json.organization.orgId}/demo`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId: step1Json.organization.orgId }) }
    );
    expect(delDemoRes.status).toBe(200);
    const delDemoJson = (await delDemoRes.json()) as { deletedCount: number };
    expect(delDemoJson.deletedCount).toBe(1);

    const dashAfterDelete = await getDashboardRoute(
      new NextRequest(`http://localhost/api/orgs/${step1Json.organization.orgId}/dashboard`),
      { params: Promise.resolve({ orgId: step1Json.organization.orgId }) }
    );
    const dashAfterJson = (await dashAfterDelete.json()) as {
      summary: { hasDemoData: boolean; shipments: unknown[] };
    };
    expect(dashAfterJson.summary.hasDemoData).toBe(false);
    expect(dashAfterJson.summary.shipments).toHaveLength(0);

    // Funnel events recorded in onboarding_events
    const eventsRes = await db.query<{ event_type: string }>(
      `select event_type from public.onboarding_events where user_id = $1`,
      [user.id]
    );
    const eventTypes = eventsRes.rows.map((r) => r.event_type);
    expect(eventTypes).toContain("step_completed");
    expect(eventTypes).toContain("demo_created");
    expect(eventTypes).toContain("demo_deleted");
  }, 20_000);

  it("blocks repeat trial for same IEC code across orgs and enforces 403 for outsiders/viewers on demo routes", async () => {
    const owner1 = await ensurePgliteUser("trial-owner1@example.invalid");
    const owner2 = await ensurePgliteUser("trial-owner2@example.invalid");
    const viewer = await ensurePgliteUser("demo-viewer@example.invalid");

    // Org 1 uses IEC AAACT1111Z and starts trial
    mockState.user = owner1;
    const s1 = await stepOneRoute(
      new NextRequest("http://localhost/api/onboarding/step1", {
        method: "POST",
        body: JSON.stringify({
          roleChoice: "exporter",
          name: "First Co",
          iecCode: "AAACT1111Z",
        }),
      })
    );
    const { organization: org1 } = (await s1.json()) as { organization: { orgId: string } };
    const firstTrial = await startTrial(org1.orgId, owner1.id);
    expect(firstTrial.started).toBe(true);

    // Invite viewer to Org 1
    const inviteRes = await createInviteRoute(
      new NextRequest(`http://localhost/api/orgs/${org1.orgId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: viewer.email, role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: org1.orgId }) }
    );
    const { inviteUrl } = (await inviteRes.json()) as { inviteUrl: string };
    const token = inviteUrl.split("/invite/")[1]!;

    mockState.user = viewer;
    await acceptInviteRoute(
      new NextRequest("http://localhost/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
    );

    // Viewer cannot create or delete demo workspace (403)
    const viewerDemoCreate = await createDemoRoute(
      new NextRequest(`http://localhost/api/orgs/${org1.orgId}/demo`, { method: "POST" }),
      { params: Promise.resolve({ orgId: org1.orgId }) }
    );
    expect(viewerDemoCreate.status).toBe(403);

    // Outsider cannot read dashboard or mutate demo workspace (403)
    mockState.user = owner2;
    const outsiderDash = await getDashboardRoute(
      new NextRequest(`http://localhost/api/orgs/${org1.orgId}/dashboard`),
      { params: Promise.resolve({ orgId: org1.orgId }) }
    );
    expect(outsiderDash.status).toBe(403);

    // Org 2 with same IEC AAACT1111Z cannot start a second trial
    const s2 = await stepOneRoute(
      new NextRequest("http://localhost/api/onboarding/step1", {
        method: "POST",
        body: JSON.stringify({ roleChoice: "exporter", name: "Second Co" }),
      })
    );
    const { organization: org2 } = (await s2.json()) as { organization: { orgId: string } };
    await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${org2.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACT1111Z", legalName: "Second Co" }),
      }),
      { params: Promise.resolve({ orgId: org2.orgId }) }
    );

    const repeatTrial = await startTrial(org2.orgId, owner2.id);
    expect(repeatTrial.started).toBe(false);
    expect(repeatTrial.reason).toContain("already used");
  }, 20_000);
});

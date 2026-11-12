import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockState = {
  user: null as { id: string; email: string; isPlatformAdmin?: boolean } | null,
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
    requirePlatformAdmin: async () => actual.assertPlatformAdminAccess(mockState.user),
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

import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { assertOrgMembershipAccess } from "@/lib/auth/org-access";
import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { createIecSchema } from "@/lib/validation/auth";
import { POST as createOrgRoute } from "@/app/api/orgs/route";
import { POST as setActiveOrgRoute } from "@/app/api/orgs/active/route";
import { GET as listIecsRoute, POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { GET as listMembersRoute } from "@/app/api/orgs/[orgId]/members/route";
import { DELETE as deleteMemberRoute } from "@/app/api/orgs/[orgId]/members/[memberId]/route";
import { POST as createInviteRoute } from "@/app/api/orgs/[orgId]/invites/route";
import { POST as acceptInviteRoute } from "@/app/api/invites/accept/route";
import {
  GET as listDocumentsRoute,
  POST as createDocumentRoute,
} from "@/app/api/orgs/[orgId]/documents/route";
import { DELETE as deleteDocumentRoute } from "@/app/api/orgs/[orgId]/documents/[docId]/route";
import { POST as irmImportRoute } from "@/app/api/orgs/[orgId]/irm/import/route";
import {
  GET as getMatchesRoute,
  POST as postMatchesRoute,
} from "@/app/api/orgs/[orgId]/matches/route";
import { DELETE as deleteMatchRoute } from "@/app/api/orgs/[orgId]/matches/[matchId]/route";
import {
  GET as getIncentivesRoute,
  POST as recalcIncentivesRoute,
} from "@/app/api/orgs/[orgId]/incentives/route";
import { POST as scrollImportRoute } from "@/app/api/orgs/[orgId]/incentives/scroll/route";
import { POST as createScripRoute } from "@/app/api/orgs/[orgId]/scrips/route";
import {
  PATCH as patchScripRoute,
  DELETE as deleteScripRoute,
} from "@/app/api/orgs/[orgId]/scrips/[scripId]/route";
import {
  POST as adminRatesPostRoute,
  PATCH as adminRatesPatchRoute,
} from "@/app/api/admin/incentive-rates/route";
import { PUT as adminCompliancePutRoute } from "@/app/api/admin/compliance-rules/route";
import { GET as getDashboardRoute } from "@/app/api/orgs/[orgId]/dashboard/route";
import {
  GET as getSavedViewsRoute,
  POST as postSavedViewRoute,
  DELETE as deleteSavedViewRoute,
} from "@/app/api/orgs/[orgId]/dashboard/saved-views/route";
import { PATCH as patchAlertRoute } from "@/app/api/orgs/[orgId]/alerts/[alertId]/route";
import { GET as downloadLeakageReportRoute } from "@/app/api/orgs/[orgId]/reports/leakage/route";
import { GET as authCallbackRoute } from "@/app/auth/callback/route";

describe("Auth, org access, API 403 isolation, and edge cases", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  beforeEach(async () => {
    await resetPgliteDb();
    mockState.user = null;
  });

  afterAll(async () => {
    await resetPgliteDb();
    delete process.env.EXPORTLEAK_E2E_ADAPTER;
  });

  it("enforces role hierarchy and 401/403 in assertOrgMembershipAccess", async () => {
    await expect(
      assertOrgMembershipAccess({
        user: null,
        orgId: "20000000-0000-4000-8000-000000000001",
        minRole: "viewer",
        findMembership: async () => "owner",
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(
      assertOrgMembershipAccess({
        user: { id: "u1", email: "u1@example.com" },
        orgId: "20000000-0000-4000-8000-000000000001",
        minRole: "viewer",
        findMembership: async () => null,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      assertOrgMembershipAccess({
        user: { id: "u1", email: "u1@example.com" },
        orgId: "20000000-0000-4000-8000-000000000001",
        minRole: "member",
        findMembership: async () => "viewer",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validates IEC code as exactly 10 alphanumeric characters", () => {
    expect(
      createIecSchema.parse({ iecCode: "ab12345678", legalName: "Test Exports", gstin: "" }).iecCode
    ).toBe("AB12345678");
    expect(() =>
      createIecSchema.parse({ iecCode: "SHORT123", legalName: "Test Exports" })
    ).toThrow();
    expect(() =>
      createIecSchema.parse({ iecCode: "AB12-45678", legalName: "Test Exports" })
    ).toThrow();
  });

  it("returns 403 when calling ANY org API route with another organization's id", async () => {
    const userA = await ensurePgliteUser("owner-a@example.invalid");
    const userB = await ensurePgliteUser("owner-b@example.invalid");

    // User A creates Org A
    mockState.user = userA;
    const orgARes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ roleChoice: "exporter", name: "Alpha Exports" }),
      })
    );
    expect(orgARes.status).toBe(201);
    const { organization: orgA } = (await orgARes.json()) as {
      organization: { orgId: string };
    };

    // User B creates Org B
    mockState.user = userB;
    const orgBRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ roleChoice: "exim_consultant", name: "Beta Advisors" }),
      })
    );
    expect(orgBRes.status).toBe(201);
    const { organization: orgB } = (await orgBRes.json()) as {
      organization: { orgId: string };
    };

    // User B tries calling every Org A route -> all MUST return 403
    const iecList = await listIecsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/iecs`),
      {
        params: Promise.resolve({ orgId: orgA.orgId }),
      }
    );
    expect(iecList.status).toBe(403);

    const iecCreate = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACH1234K", legalName: "Alpha" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(iecCreate.status).toBe(403);

    const membersList = await listMembersRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/members`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(membersList.status).toBe(403);

    const inviteCreate = await createInviteRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: "x@example.invalid", role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(inviteCreate.status).toBe(403);

    const docsList = await listDocumentsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(docsList.status).toBe(403);

    const docCreate = await createDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          iecId: "40000000-0000-4000-8000-000000000001",
          kind: "shipping_bill",
          originalName: "sb.pdf",
        }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(docCreate.status).toBe(403);

    const docDelete = await deleteDocumentRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/documents/60000000-0000-4000-8000-000000000001`,
        { method: "DELETE" }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          docId: "60000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(docDelete.status).toBe(403);

    const memberDelete = await deleteMemberRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/members/30000000-0000-4000-8000-000000000001`,
        { method: "DELETE" }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          memberId: "30000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(memberDelete.status).toBe(403);

    const switchActive = await setActiveOrgRoute(
      new NextRequest("http://localhost/api/orgs/active", {
        method: "POST",
        body: JSON.stringify({ orgId: orgA.orgId }),
      })
    );
    expect(switchActive.status).toBe(403);

    const irmImport = await irmImportRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/irm/import`, {
        method: "POST",
        body: JSON.stringify({
          action: "preview",
          docId: "60000000-0000-4000-8000-000000000001",
        }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(irmImport.status).toBe(403);

    const matchesGet = await getMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/matches`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(matchesGet.status).toBe(403);

    const matchesPost = await postMatchesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/matches`, {
        method: "POST",
        body: JSON.stringify({ action: "auto_match" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(matchesPost.status).toBe(403);

    const matchDelete = await deleteMatchRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/matches/70000000-0000-4000-8000-000000000001`,
        { method: "DELETE" }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          matchId: "70000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(matchDelete.status).toBe(403);

    // Prompt 8 org routes must reject cross-org access with 403
    const incentivesGet = await getIncentivesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/incentives`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(incentivesGet.status).toBe(403);

    const incentivesRecalc = await recalcIncentivesRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/incentives`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(incentivesRecalc.status).toBe(403);

    const scrollPost = await scrollImportRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/incentives/scroll`, {
        method: "POST",
        body: JSON.stringify({
          action: "commit",
          iecId: "40000000-0000-4000-8000-000000000001",
          rows: [],
        }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(scrollPost.status).toBe(403);

    const scripPost = await createScripRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/scrips`, {
        method: "POST",
        body: JSON.stringify({
          iecId: "40000000-0000-4000-8000-000000000001",
          scripNumber: "SCR-403",
          scheme: "rodtep",
          faceAmountInr: "100.00",
          generatedOn: "2026-05-01",
        }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(scripPost.status).toBe(403);

    const scripPatch = await patchScripRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/scrips/80000000-0000-4000-8000-000000000001`,
        { method: "PATCH", body: JSON.stringify({ status: "utilised" }) }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          scripId: "80000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(scripPatch.status).toBe(403);

    const scripDelete = await deleteScripRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/scrips/80000000-0000-4000-8000-000000000001`,
        { method: "DELETE" }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          scripId: "80000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(scripDelete.status).toBe(403);

    // Non-admin user MUST get 403 on admin rate & compliance endpoints
    const nonAdminRatesPost = await adminRatesPostRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "commit", rows: [] }),
      })
    );
    expect(nonAdminRatesPost.status).toBe(403);

    const nonAdminRatesPatch = await adminRatesPatchRoute(
      new NextRequest("http://localhost/api/admin/incentive-rates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          months: 12,
          sourceNote: "Not allowed",
          effectiveFrom: "2026-01-01",
        }),
      })
    );
    expect(nonAdminRatesPatch.status).toBe(403);

    // Prompt 9 org routes & compliance admin route must reject cross-org / non-admin access with 403
    const dashGet = await getDashboardRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/dashboard?view=full`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(dashGet.status).toBe(403);

    const reportGet = await downloadLeakageReportRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/reports/leakage?format=pdf`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(reportGet.status).toBe(403);

    const alertPatch = await patchAlertRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/alerts/90000000-0000-4000-8000-000000000001`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resolve" }),
        }
      ),
      {
        params: Promise.resolve({
          orgId: orgA.orgId,
          alertId: "90000000-0000-4000-8000-000000000001",
        }),
      }
    );
    expect(alertPatch.status).toBe(403);

    const savedViewsGet = await getSavedViewsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/dashboard/saved-views`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(savedViewsGet.status).toBe(403);

    const savedViewPost = await postSavedViewRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/dashboard/saved-views`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Cross org view", filters: {} }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(savedViewPost.status).toBe(403);

    const savedViewDelete = await deleteSavedViewRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/dashboard/saved-views?viewId=90000000-0000-4000-8000-000000000001`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(savedViewDelete.status).toBe(403);

    const nonAdminCompliancePut = await adminCompliancePutRoute(
      new NextRequest("http://localhost/api/admin/compliance-rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "realisation_months",
          months: 12,
          confirmed: true,
          effectiveFrom: "2026-10-01",
        }),
      })
    );
    expect(nonAdminCompliancePut.status).toBe(403);

    // Ensure User B still has access to Org B
    const orgBIecs = await listIecsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgB.orgId}/iecs`),
      { params: Promise.resolve({ orgId: orgB.orgId }) }
    );
    expect(orgBIecs.status).toBe(200);
  }, 20_000);

  it("handles existing-account invite into two orgs, viewer upload/delete block, and last-owner guard", async () => {
    const ownerA = await ensurePgliteUser("owner1@example.invalid");
    const existingUserB = await ensurePgliteUser("existing2@example.invalid");

    // Existing User B already owns Org B
    mockState.user = existingUserB;
    const orgBRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ roleChoice: "exporter", name: "Existing Co" }),
      })
    );
    const { organization: orgB } = (await orgBRes.json()) as { organization: { orgId: string } };

    // Owner A creates Org A, adds IEC and document, invites Existing User B as viewer
    mockState.user = ownerA;
    const orgARes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ roleChoice: "ca_firm", name: "CA Partners" }),
      })
    );
    const { organization: orgA } = (await orgARes.json()) as { organization: { orgId: string } };

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACH9876M", legalName: "Client One" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };

    const docRes = await createDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents`, {
        method: "POST",
        body: JSON.stringify({ iecId: iec.id, kind: "shipping_bill", originalName: "sb-1.pdf" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(docRes.status).toBe(201);
    const { document: doc } = (await docRes.json()) as { document: { id: string } };

    const inviteRes = await createInviteRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: existingUserB.email, role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(inviteRes.status).toBe(201);
    const { invitePath } = (await inviteRes.json()) as { invitePath: string };
    const token = invitePath.split("/").pop()!;

    // Last owner cannot leave Org A
    const db = await getPgliteDb();
    const ownerMemberRes = await db.query<{ id: string }>(
      `select id from public.memberships where org_id = $1 and user_id = $2`,
      [orgA.orgId, ownerA.id]
    );
    const removeLastOwner = await deleteMemberRoute(
      new NextRequest(
        `http://localhost/api/orgs/${orgA.orgId}/members/${ownerMemberRes.rows[0]!.id}`,
        {
          method: "DELETE",
        }
      ),
      { params: Promise.resolve({ orgId: orgA.orgId, memberId: ownerMemberRes.rows[0]!.id }) }
    );
    expect(removeLastOwner.status).toBe(400);

    // Existing User B accepts invite -> now belongs to TWO organizations
    mockState.user = existingUserB;
    const acceptRes = await acceptInviteRoute(
      new NextRequest("http://localhost/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      })
    );
    expect(acceptRes.status).toBe(200);

    const membershipsCount = await db.query<{ count: string }>(
      `select count(*)::text as count from public.memberships where user_id = $1`,
      [existingUserB.id]
    );
    expect(Number(membershipsCount.rows[0]?.count)).toBe(2);

    // Viewer can read Org A documents, CANNOT upload or delete in Org A
    const viewerRead = await listDocumentsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents`),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(viewerRead.status).toBe(200);

    const viewerUpload = await createDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents`, {
        method: "POST",
        body: JSON.stringify({ iecId: iec.id, kind: "shipping_bill", originalName: "blocked.pdf" }),
      }),
      { params: Promise.resolve({ orgId: orgA.orgId }) }
    );
    expect(viewerUpload.status).toBe(403);

    const viewerDelete = await deleteDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${orgA.orgId}/documents/${doc.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId: orgA.orgId, docId: doc.id }) }
    );
    expect(viewerDelete.status).toBe(403);

    // Still owns Org B cleanly
    const orgBIecs = await listIecsRoute(
      new NextRequest(`http://localhost/api/orgs/${orgB.orgId}/iecs`),
      { params: Promise.resolve({ orgId: orgB.orgId }) }
    );
    expect(orgBIecs.status).toBe(200);
  }, 20_000);

  it("redirects expired magic link callbacks cleanly to /login?error=expired_link", async () => {
    const res = await authCallbackRoute(
      new NextRequest(
        "http://localhost:3000/auth/callback?error=access_denied&error_code=otp_expired"
      )
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=expired_link");
  });
});

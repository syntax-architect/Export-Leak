import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANS, type PlanKey } from "@/config/plans";
import { PlanLimitError } from "@/lib/auth/errors";

const mockAuthState = {
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
    getAuthenticatedUser: async () => mockAuthState.user,
    requireOrgAccess: async (
      orgId: string,
      minRole: "viewer" | "member" | "admin" | "owner" = "viewer"
    ) =>
      actual.assertOrgMembershipAccess({
        user: mockAuthState.user,
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
      }),
  };
});

import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { createOrganization } from "@/lib/auth/repository";
import {
  assertCan,
  getCurrentKolkataPeriodStart,
  getEntitlements,
  getOrgUsageSnapshot,
  resolveEffectivePlanState,
} from "@/lib/billing/entitlements";
import { softDeleteDocument } from "@/lib/auth/repository";
import { GET as listIecsRoute, POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { POST as createInviteRoute } from "@/app/api/orgs/[orgId]/invites/route";
import { POST as ebrcRoute } from "@/app/api/orgs/[orgId]/ebrc/route";
import { GET as leakageReportRoute } from "@/app/api/orgs/[orgId]/reports/leakage/route";
import { GET as usageRoute } from "@/app/api/orgs/[orgId]/usage/route";
import { POST as uploadUrlRoute } from "@/app/api/orgs/[orgId]/documents/upload-url/route";
import { commitUploadedDocument } from "@/lib/documents/repository";
import { writeLocalStorageObject } from "@/lib/documents/storage";

const ALL_PLAN_KEYS: readonly PlanKey[] = [
  "free",
  "trial_pro",
  "exporter_monthly",
  "exporter_annual",
  "consultant_monthly",
  "consultant_annual",
];

describe("Prompt 11: Plans, entitlements, state resolution, boundaries & HTTP 402 enforcement", () => {
  beforeAll(() => {
    process.env.EXPORTLEAK_E2E_ADAPTER = "pglite";
  });

  beforeEach(async () => {
    await resetPgliteDb();
  });

  it("computes Asia/Kolkata monthly period boundaries accurately across IST midnight", () => {
    // 2026-10-31 18:29:59 UTC == 2026-10-31 23:59:59 IST
    expect(getCurrentKolkataPeriodStart(new Date("2026-10-31T18:29:59.000Z"))).toBe("2026-10-01");
    // 2026-10-31 18:30:01 UTC == 2026-11-01 00:00:01 IST
    expect(getCurrentKolkataPeriodStart(new Date("2026-10-31T18:30:01.000Z"))).toBe("2026-11-01");
  });

  it("resolves active subscription, active trial, 3-day grace period, and free fallback states", () => {
    const now = new Date("2026-11-12T10:00:00.000Z");

    const activeTrial = resolveEffectivePlanState({
      planKey: "trial_pro",
      planStatus: "active",
      trialEndsAt: "2026-11-15T10:00:00.000Z",
      now,
    });
    expect(activeTrial.billingState).toBe("active_trial");
    expect(activeTrial.plan.key).toBe("trial_pro");

    const expiredTrial = resolveEffectivePlanState({
      planKey: "trial_pro",
      planStatus: "active",
      trialEndsAt: "2026-11-11T10:00:00.000Z",
      now,
    });
    expect(expiredTrial.billingState).toBe("free_fallback");
    expect(expiredTrial.plan.key).toBe("free");

    const inGrace = resolveEffectivePlanState({
      planKey: "exporter_monthly",
      planStatus: "past_due",
      trialEndsAt: null,
      subUpdatedAt: "2026-11-11T10:00:00.000Z",
      now,
    });
    expect(inGrace.billingState).toBe("grace_period");
    expect(inGrace.plan.key).toBe("exporter_monthly");

    const pastGrace = resolveEffectivePlanState({
      planKey: "exporter_monthly",
      planStatus: "past_due",
      trialEndsAt: null,
      subUpdatedAt: "2026-11-08T09:59:00.000Z",
      now,
    });
    expect(pastGrace.billingState).toBe("free_fallback");
    expect(pastGrace.plan.key).toBe("free");

    const cancelAtCycleEndFuture = resolveEffectivePlanState({
      planKey: "consultant_annual",
      planStatus: "cancelled",
      trialEndsAt: null,
      subCancelAtCycleEnd: true,
      subCurrentEnd: "2026-12-01T00:00:00.000Z",
      now,
    });
    expect(cancelAtCycleEndFuture.billingState).toBe("active_subscription");
    expect(cancelAtCycleEndFuture.plan.key).toBe("consultant_annual");

    const haltedFallback = resolveEffectivePlanState({
      planKey: "consultant_monthly",
      planStatus: "halted",
      trialEndsAt: null,
      now,
    });
    expect(haltedFallback.billingState).toBe("free_fallback");
    expect(haltedFallback.plan.key).toBe("free");
  });

  it("tests boundary (limit - 1, limit, limit + 1) for every gated action across all 6 plans", async () => {
    const db = await getPgliteDb();
    const user = await ensurePgliteUser("boundaries@example.invalid");
    mockAuthState.user = user;

    const org = await createOrganization({
      user,
      name: "Boundary Exports Pvt Ltd",
      type: "consultant",
    });

    const periodStart = getCurrentKolkataPeriodStart();

    for (const planKey of ALL_PLAN_KEYS) {
      const cfg = PLANS[planKey];
      const futureIso = new Date(Date.now() + 7 * 86400_000).toISOString();
      const pastIso = new Date(Date.now() - 2 * 86400_000).toISOString();

      await db.query(
        `update public.organizations
         set plan_key = $2,
             plan_status = 'active',
             trial_ends_at = $3
         where id = $1`,
        [org.orgId, planKey, planKey === "trial_pro" ? futureIso : pastIso]
      );

      // Clean counters, iecs, invites, keeping only owner membership
      await db.query(`delete from public.usage_counters where org_id = $1`, [org.orgId]);
      await db.query(`delete from public.iec_profiles where org_id = $1`, [org.orgId]);
      await db.query(`delete from public.org_invites where org_id = $1`, [org.orgId]);
      await db.query(`delete from public.memberships where org_id = $1 and user_id <> $2`, [
        org.orgId,
        user.id,
      ]);

      const resolved = await getEntitlements(org.orgId, user.id);
      expect(resolved.planKey).toBe(planKey);

      // 1. shippingBillsPerMonth boundary: (limit - 1, limit, limit + 1)
      const sbLimit = cfg.entitlements.shippingBillsPerMonth;
      await expect(
        assertCan(org.orgId, "upload", sbLimit - 1, { userId: user.id, allowAutoTrial: false })
      ).resolves.toBeDefined();
      await expect(
        assertCan(org.orgId, "upload", sbLimit, { userId: user.id, allowAutoTrial: false })
      ).resolves.toBeDefined();
      await expect(
        assertCan(org.orgId, "upload", sbLimit + 1, { userId: user.id, allowAutoTrial: false })
      ).rejects.toThrowError(PlanLimitError);

      await db.query(
        `insert into public.usage_counters (org_id, period_start, shipping_bills_used)
         values ($1, $2, $3)`,
        [org.orgId, periodStart, sbLimit]
      );
      await expect(
        assertCan(org.orgId, "upload", 1, { userId: user.id, allowAutoTrial: false })
      ).rejects.toThrowError(PlanLimitError);

      // 2. maxIecs boundary: (limit - 1, limit, limit + 1)
      const iecLimit = cfg.entitlements.maxIecs;
      if (iecLimit > 1) {
        await expect(
          assertCan(org.orgId, "add_iec", iecLimit - 1, { userId: user.id })
        ).resolves.toBeDefined();
      }
      await expect(
        assertCan(org.orgId, "add_iec", iecLimit, { userId: user.id })
      ).resolves.toBeDefined();
      await expect(
        assertCan(org.orgId, "add_iec", iecLimit + 1, { userId: user.id })
      ).rejects.toThrowError(PlanLimitError);

      // 3. teamSeats boundary (owner takes 1 seat already): remaining = teamSeats - 1
      const seatLimit = cfg.entitlements.teamSeats;
      const remainingSeats = seatLimit - 1;
      if (remainingSeats >= 1) {
        await expect(
          assertCan(org.orgId, "invite_seat", remainingSeats - 1, { userId: user.id })
        ).resolves.toBeDefined();
        await expect(
          assertCan(org.orgId, "invite_seat", remainingSeats, { userId: user.id })
        ).resolves.toBeDefined();
      }
      await expect(
        assertCan(org.orgId, "invite_seat", remainingSeats + 1, { userId: user.id })
      ).rejects.toThrowError(PlanLimitError);

      // 4. Boolean feature entitlements (canGenerateEbrc, canExportReports)
      if (cfg.entitlements.canGenerateEbrc) {
        await expect(
          assertCan(org.orgId, "generate_ebrc", 1, { userId: user.id })
        ).resolves.toBeDefined();
      } else {
        await expect(
          assertCan(org.orgId, "generate_ebrc", 1, { userId: user.id })
        ).rejects.toThrowError(PlanLimitError);
      }

      if (cfg.entitlements.canExportReports) {
        await expect(
          assertCan(org.orgId, "export_report", 1, { userId: user.id })
        ).resolves.toBeDefined();
      } else {
        await expect(
          assertCan(org.orgId, "export_report", 1, { userId: user.id })
        ).rejects.toThrowError(PlanLimitError);
      }
    }
  });

  it("returns 402 with machine-readable PLAN_LIMIT_EXCEEDED on every gated API when Free, increments usage_counters transactionally and never decrements on delete, and keeps 12 IECs readable after Consultant -> Exporter downgrade", async () => {
    const db = await getPgliteDb();
    const owner = await ensurePgliteUser("gated-owner@example.invalid");
    mockAuthState.user = owner;

    const org = await createOrganization({
      user: owner,
      name: "Downgrade & Metering Co",
      type: "consultant",
    });

    // Upgrade initially to Consultant to seed 12 IECs cleanly
    await db.query(
      `update public.organizations set plan_key = 'consultant_monthly', plan_status = 'active' where id = $1`,
      [org.orgId]
    );

    const createdIecIds: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const code = `AAACD${String(1000 + i)}K`;
      const res = await createIecRoute(
        new NextRequest(`http://localhost/api/orgs/${org.orgId}/iecs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iecCode: code, legalName: `Client Export ${i}` }),
        }),
        { params: Promise.resolve({ orgId: org.orgId }) }
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { iec: { id: string } };
      createdIecIds.push(body.iec.id);
    }

    // Downgrade from Consultant to Exporter Monthly (maxIecs = 1)
    await db.query(
      `update public.organizations set plan_key = 'exporter_monthly', plan_status = 'active' where id = $1`,
      [org.orgId]
    );

    // All 12 existing IECs MUST remain readable via API
    const read12Res = await listIecsRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/iecs`),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(read12Res.status).toBe(200);
    const read12Body = (await read12Res.json()) as { iecs: Array<{ id: string }> };
    expect(read12Body.iecs).toHaveLength(12);

    // Adding a 13th IEC is blocked with 402
    const add13Res = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/iecs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iecCode: "AAACD9999K", legalName: "Blocked Client 13" }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(add13Res.status).toBe(402);
    const add13Body = (await add13Res.json()) as {
      error: { code: string; details: { limitKey: string; currentUsage: number; limit: number } };
    };
    expect(add13Body.error.code).toBe("PLAN_LIMIT_EXCEEDED");
    expect(add13Body.error.details.limitKey).toBe("maxIecs");
    expect(add13Body.error.details.currentUsage).toBe(12);
    expect(add13Body.error.details.limit).toBe(1);

    // Commit a shipping bill document transactionally -> increments usage_counters, and deleting never decrements it
    const pdfBytes = Buffer.from("%PDF-1.4\n%Sample bill\n%%EOF\n");
    const docId = crypto.randomUUID();
    const storagePath = `${org.orgId}/${createdIecIds[0]!}/${docId}.pdf`;
    await writeLocalStorageObject(storagePath, pdfBytes);
    const commitRes = await commitUploadedDocument({
      orgId: org.orgId,
      docId,
      iecId: createdIecIds[0]!,
      kind: "shipping_bill",
      originalName: "sb-transactional.pdf",
      sha256: crypto.createHash("sha256").update(pdfBytes).digest("hex"),
      storagePath,
      fileSizeBytes: pdfBytes.length,
      mimeType: "application/pdf",
    });
    expect(commitRes.duplicate).toBe(false);

    const afterUploadUsage = await getOrgUsageSnapshot(org.orgId, owner.id);
    expect(afterUploadUsage.shippingBillsUsed).toBe(1);

    await softDeleteDocument({ orgId: org.orgId, docId });
    const afterDeleteUsage = await getOrgUsageSnapshot(org.orgId, owner.id);
    expect(afterDeleteUsage.shippingBillsUsed).toBe(1);

    // Now switch org to Free (with past trial) and verify EVERY gated API returns 402 PLAN_LIMIT_EXCEEDED
    await db.query(
      `update public.organizations
       set plan_key = 'free', plan_status = 'active', trial_ends_at = now() - interval '3 days'
       where id = $1`,
      [org.orgId]
    );

    const usageHttp = await usageRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/usage`),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(usageHttp.status).toBe(200);
    const usageJson = (await usageHttp.json()) as { planKey: string; iecsUsed: number };
    expect(usageJson.planKey).toBe("free");
    expect(usageJson.iecsUsed).toBe(12);

    // Invite 2nd seat on Free (teamSeats = 1) -> 402
    const inviteRes = await createInviteRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "teammate@example.invalid", role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(inviteRes.status).toBe(402);
    expect(((await inviteRes.json()) as { error: { code: string } }).error.code).toBe(
      "PLAN_LIMIT_EXCEEDED"
    );

    // Export Leakage report on real Free org -> 402
    const reportRes = await leakageReportRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/reports/leakage?format=pdf`),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(reportRes.status).toBe(402);
    expect(((await reportRes.json()) as { error: { code: string } }).error.code).toBe(
      "PLAN_LIMIT_EXCEEDED"
    );

    // Generate Bulk eBRC on Free org -> 402
    const ebrcRes = await ebrcRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/ebrc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", rows: [] }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(ebrcRes.status).toBe(402);
    expect(((await ebrcRes.json()) as { error: { code: string } }).error.code).toBe(
      "PLAN_LIMIT_EXCEEDED"
    );

    // Upload batch exceeding remaining Free allowance (used = 1, free = 5, request 5 -> 6 > 5) -> 402
    const headerBase64 = Buffer.from("%PDF-1.4\n1 0 obj\n").toString("base64");
    const uploadLimitRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${org.orgId}/documents/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: Array.from({ length: 5 }, (_, idx) => ({
            iecId: createdIecIds[0],
            kind: "shipping_bill",
            originalName: `sb-over-${idx}.pdf`,
            sha256: crypto.createHash("sha256").update(`sb-over-${idx}`).digest("hex"),
            fileSizeBytes: 128,
            mimeType: "application/pdf",
            headerBase64,
          })),
        }),
      }),
      { params: Promise.resolve({ orgId: org.orgId }) }
    );
    expect(uploadLimitRes.status).toBe(402);
    expect(((await uploadLimitRes.json()) as { error: { code: string } }).error.code).toBe(
      "PLAN_LIMIT_EXCEEDED"
    );
  });
});

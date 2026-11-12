import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensurePgliteUser, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { PUT as directUploadRoute } from "@/app/api/orgs/[orgId]/documents/direct-upload/route";
import { POST as parsePendingRoute } from "@/app/api/orgs/[orgId]/documents/parse-pending/route";
import { POST as commitDocumentsRoute } from "@/app/api/orgs/[orgId]/documents/route";
import { POST as uploadUrlRoute } from "@/app/api/orgs/[orgId]/documents/upload-url/route";
import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { PATCH as settingsRoute } from "@/app/api/orgs/[orgId]/settings/route";
import { GET as listShippingBillsRoute } from "@/app/api/orgs/[orgId]/shipping-bills/route";
import {
  GET as getShippingBillRoute,
  PATCH as patchShippingBillRoute,
} from "@/app/api/orgs/[orgId]/shipping-bills/[sbId]/route";
import { POST as createOrgRoute } from "@/app/api/orgs/route";
import { encodeHeaderBase64 } from "@/lib/documents/file-security";
import type { ShippingBillReviewDetail } from "@/lib/documents/parse-repository";

const mockState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
}));

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

vi.mock("@/lib/supabase/config", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/supabase/config")>("@/lib/supabase/config");
  return {
    ...actual,
    isPgliteTestAdapterEnabled: () => true,
  };
});

async function uploadFixturePdf(params: {
  orgId: string;
  iecId: string;
  filename: string;
  bytes: Buffer;
}): Promise<string> {
  const sha256 = crypto.createHash("sha256").update(params.bytes).digest("hex");
  const headerBase64 = encodeHeaderBase64(new Uint8Array(params.bytes.subarray(0, 512)));

  const prepRes = await uploadUrlRoute(
    new NextRequest(`http://localhost/api/orgs/${params.orgId}/documents/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            iecId: params.iecId,
            kind: "shipping_bill",
            originalName: params.filename,
            sha256,
            fileSizeBytes: params.bytes.length,
            mimeType: "application/pdf",
            headerBase64,
          },
        ],
      }),
    }),
    { params: Promise.resolve({ orgId: params.orgId }) }
  );
  expect(prepRes.status).toBe(200);
  const { results } = (await prepRes.json()) as {
    results: Array<{ docId: string; storagePath: string; signedUrl: string }>;
  };
  const item = results[0]!;

  const putRes = await directUploadRoute(
    new NextRequest(`http://localhost${item.signedUrl}`, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(params.bytes),
    }),
    { params: Promise.resolve({ orgId: params.orgId }) }
  );
  expect(putRes.status).toBe(200);

  const commitRes = await commitDocumentsRoute(
    new NextRequest(`http://localhost/api/orgs/${params.orgId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        docId: item.docId,
        iecId: params.iecId,
        kind: "shipping_bill",
        originalName: params.filename,
        sha256,
        storagePath: item.storagePath,
        fileSizeBytes: params.bytes.length,
        mimeType: "application/pdf",
      }),
    }),
    { params: Promise.resolve({ orgId: params.orgId }) }
  );
  expect(commitRes.status).toBe(201);
  return item.docId;
}

describe("Prompt 6 Shipping Bill Parse & Review API Integration", () => {
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
    await fs.rm(path.resolve(process.cwd(), ".tmp-storage"), { recursive: true, force: true });
  });

  it("parses fixtures, holds low-confidence bills from calculation, saves corrections, and enforces org isolation", async () => {
    const owner = await ensurePgliteUser("p6-owner@example.com");
    const outsider = await ensurePgliteUser("p6-outsider@example.com");
    mockState.user = owner;

    const orgRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Tiruppur Knits Pvt Ltd", roleChoice: "exporter" }),
      })
    );
    const { organization } = (await orgRes.json()) as { organization: { orgId: string } };

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACT1234K", legalName: "Tiruppur Knits Pvt Ltd" }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };

    // Disable AI fallback on org settings
    const settingsRes = await settingsRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ aiParsingEnabled: false }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(settingsRes.status).toBe(200);
    expect(await settingsRes.json()).toEqual({ aiParsingEnabled: false });

    const cleanBytes = await fs.readFile(
      path.resolve(process.cwd(), "fixtures", "shipping-bills", "sb-01-icegate-garment.pdf")
    );
    const uncertainBytes = await fs.readFile(
      path.resolve(process.cwd(), "fixtures", "shipping-bills", "sb-12-uncertain-edge.pdf")
    );

    await uploadFixturePdf({
      orgId: organization.orgId,
      iecId: iec.id,
      filename: "sb-01-icegate-garment.pdf",
      bytes: cleanBytes,
    });
    await uploadFixturePdf({
      orgId: organization.orgId,
      iecId: iec.id,
      filename: "sb-12-uncertain-edge.pdf",
      bytes: uncertainBytes,
    });

    // Trigger batch parsing
    const parseRes = await parsePendingRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/parse-pending`, {
        method: "POST",
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(parseRes.status).toBe(200);
    const parseBody = (await parseRes.json()) as {
      processedCount: number;
      summary: { parsedCount: number; needsReviewCount: number; failedCount: number };
    };
    expect(parseBody.processedCount).toBe(2);
    expect(parseBody.summary.parsedCount).toBe(1);
    expect(parseBody.summary.needsReviewCount).toBe(1);

    // List shipping bills and verify low-confidence gate
    const listRes = await listShippingBillsRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/shipping-bills`),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      shippingBills: Array<{
        id: string;
        sbNumber: string;
        status: string;
        calculationEligible: boolean;
      }>;
    };
    expect(listBody.shippingBills).toHaveLength(2);
    const cleanBill = listBody.shippingBills.find((b) => b.sbNumber === "7458210");
    const edgeBill = listBody.shippingBills.find((b) => b.sbNumber === "4100998");
    expect(cleanBill?.calculationEligible).toBe(true);
    expect(edgeBill?.status).toBe("needs_review");
    expect(edgeBill?.calculationEligible).toBe(false);

    // Fetch review details for uncertain bill
    const detailRes = await getShippingBillRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/shipping-bills/${edgeBill!.id}`
      ),
      { params: Promise.resolve({ orgId: organization.orgId, sbId: edgeBill!.id }) }
    );
    expect(detailRes.status).toBe(200);
    const { shippingBill } = (await detailRes.json()) as {
      shippingBill: ShippingBillReviewDetail;
    };
    expect(shippingBill.sourceTextPages.length).toBeGreaterThan(0);
    expect(shippingBill.needsReviewFields).toContain("buyerName");

    // Cross-org access from outsider returns 403 on every new route
    mockState.user = outsider;
    const crossList = await listShippingBillsRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/shipping-bills`),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const crossDetail = await getShippingBillRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/shipping-bills/${edgeBill!.id}`
      ),
      { params: Promise.resolve({ orgId: organization.orgId, sbId: edgeBill!.id }) }
    );
    const crossPatch = await patchShippingBillRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/shipping-bills/${edgeBill!.id}`,
        { method: "PATCH", body: JSON.stringify({}) }
      ),
      { params: Promise.resolve({ orgId: organization.orgId, sbId: edgeBill!.id }) }
    );
    const crossSettings = await settingsRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ aiParsingEnabled: true }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(crossList.status).toBe(403);
    expect(crossDetail.status).toBe(403);
    expect(crossPatch.status).toBe(403);
    expect(crossSettings.status).toBe(403);

    // Owner corrects buyerName, 8-digit HS code, item FOB, and clicks Confirm All
    mockState.user = owner;
    const confirmRes = await patchShippingBillRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/shipping-bills/${edgeBill!.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            sbNumber: "4100998",
            sbDate: "2026-11-01",
            portCode: "INBOM4",
            leoDate: null,
            invoiceNo: "EDGE/26/009",
            buyerName: "RHEIN VALVES GMBH",
            currency: "USD",
            fobAmount: "6500.00",
            exchangeRate: "84.10",
            schemesClaimed: ["rodtep"],
            items: [
              {
                id: shippingBill.items[0]?.id,
                hsCode: "84819090",
                description: "VALVE PART SHORT HS",
                quantity: "200",
                uqc: "NOS",
                fobAmount: "6500.00",
              },
            ],
            confirmAll: true,
          }),
        }
      ),
      { params: Promise.resolve({ orgId: organization.orgId, sbId: edgeBill!.id }) }
    );
    expect(confirmRes.status).toBe(200);
    const confirmedBody = (await confirmRes.json()) as {
      shippingBill: ShippingBillReviewDetail;
    };
    expect(confirmedBody.shippingBill.calculationEligible).toBe(true);
    expect(confirmedBody.shippingBill.status).toBe("parsed");
    expect(confirmedBody.shippingBill.corrections.length).toBeGreaterThanOrEqual(3);
  }, 45_000);
});

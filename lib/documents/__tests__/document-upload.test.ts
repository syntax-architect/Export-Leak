import crypto from "node:crypto";
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

import { ensurePgliteUser, getPgliteDb, resetPgliteDb } from "@/lib/auth/pglite-adapter";
import { encodeHeaderBase64, validateMagicBytes } from "@/lib/documents/file-security";
import { purgeExpiredDeletedDocuments } from "@/lib/documents/repository";
import { POST as createOrgRoute } from "@/app/api/orgs/route";
import { POST as createIecRoute } from "@/app/api/orgs/[orgId]/iecs/route";
import { POST as uploadUrlRoute } from "@/app/api/orgs/[orgId]/documents/upload-url/route";
import { PUT as directUploadRoute } from "@/app/api/orgs/[orgId]/documents/direct-upload/route";
import {
  GET as listDocumentsRoute,
  POST as commitDocumentRoute,
} from "@/app/api/orgs/[orgId]/documents/route";
import {
  DELETE as deleteDocumentRoute,
  PATCH as patchDocumentRoute,
} from "@/app/api/orgs/[orgId]/documents/[docId]/route";
import { GET as downloadDocumentRoute } from "@/app/api/orgs/[orgId]/documents/[docId]/download/route";

describe("Prompt 5: Document upload, magic-byte safety, duplicate SHA-256, limits, and purge", () => {
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

  it("validates magic bytes strictly and rejects renamed executables", () => {
    const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    const fakePdfExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ header
    const validXlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const validXls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const validCsv = Buffer.from("irm_no,amount,currency\nIRM001,1000,USD\n", "utf8");

    expect(validateMagicBytes(new Uint8Array(validPdf), "pdf").valid).toBe(true);
    expect(validateMagicBytes(new Uint8Array(fakePdfExe), "pdf").valid).toBe(false);
    expect(validateMagicBytes(new Uint8Array(validXlsx), "xlsx").valid).toBe(true);
    expect(validateMagicBytes(new Uint8Array(validXls), "xls").valid).toBe(true);
    expect(validateMagicBytes(new Uint8Array(validCsv), "csv").valid).toBe(true);
    expect(validateMagicBytes(new Uint8Array(fakePdfExe), "csv").valid).toBe(false);
  });

  it("completes signed upload, deduplicates by SHA-256, blocks tampered commits, downloads safely, and purges 30d+ soft deletes", async () => {
    const owner = await ensurePgliteUser("owner-p5@example.com");
    const outsider = await ensurePgliteUser("outsider-p5@example.com");
    mockState.user = owner;

    const orgRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Chennai Leather Co", roleChoice: "exporter" }),
      })
    );
    const { organization } = (await orgRes.json()) as { organization: { orgId: string } };

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACC5678L", legalName: "Chennai Leather Co" }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };

    // 1. Renamed .exe with .pdf extension is rejected on upload-url
    const exeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const exeSha = crypto.createHash("sha256").update(exeBytes).digest("hex");
    const badPrepRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              iecId: iec.id,
              kind: "shipping_bill",
              originalName: "invoice-virus.pdf",
              sha256: exeSha,
              fileSizeBytes: exeBytes.length,
              mimeType: "application/pdf",
              headerBase64: encodeHeaderBase64(new Uint8Array(exeBytes)),
            },
          ],
        }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(badPrepRes.status).toBe(400);

    // 2. Valid PDF upload end-to-end
    const pdfBytes = Buffer.from("%PDF-1.4\n%Valid Shipping Bill 991234\n%%EOF\n");
    const pdfSha = crypto.createHash("sha256").update(pdfBytes).digest("hex");

    const prepRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              iecId: iec.id,
              kind: "shipping_bill",
              originalName: "sb-991234.pdf",
              sha256: pdfSha,
              fileSizeBytes: pdfBytes.length,
              mimeType: "application/pdf",
              headerBase64: encodeHeaderBase64(new Uint8Array(pdfBytes)),
            },
          ],
        }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(prepRes.status).toBe(200);
    const prepBody = (await prepRes.json()) as {
      results: Array<{
        status: string;
        docId: string;
        storagePath: string;
        signedUrl: string;
      }>;
    };
    const item = prepBody.results[0]!;
    expect(item.status).toBe("ready");

    // PUT bytes to local signed URL
    const putRes = await directUploadRoute(
      new NextRequest(`http://localhost${item.signedUrl}`, {
        method: "PUT",
        body: pdfBytes,
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(putRes.status).toBe(200);

    // Commit uploaded document
    const commitRes = await commitDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          docId: item.docId,
          iecId: iec.id,
          kind: "shipping_bill",
          originalName: "sb-991234.pdf",
          sha256: pdfSha,
          storagePath: item.storagePath,
          fileSizeBytes: pdfBytes.length,
          mimeType: "application/pdf",
        }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(commitRes.status).toBe(201);

    // 3. Uploading exact same SHA-256 again reports duplicate ("Already uploaded") and creates no 2nd row
    const dupPrepRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              iecId: iec.id,
              kind: "shipping_bill",
              originalName: "sb-991234-copy.pdf",
              sha256: pdfSha,
              fileSizeBytes: pdfBytes.length,
              mimeType: "application/pdf",
              headerBase64: encodeHeaderBase64(new Uint8Array(pdfBytes)),
            },
          ],
        }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const dupBody = (await dupPrepRes.json()) as {
      results: Array<{ status: string; message?: string }>;
    };
    expect(dupBody.results[0]?.status).toBe("duplicate");
    expect(dupBody.results[0]?.message).toBe("Already uploaded");

    // 4. Download original enforces attachment headers & blocks outsider
    const dlRes = await downloadDocumentRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/documents/${item.docId}/download`
      ),
      { params: Promise.resolve({ orgId: organization.orgId, docId: item.docId }) }
    );
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("content-disposition")).toContain("attachment");
    expect(dlRes.headers.get("x-content-type-options")).toBe("nosniff");

    mockState.user = outsider;
    const outsiderDl = await downloadDocumentRoute(
      new NextRequest(
        `http://localhost/api/orgs/${organization.orgId}/documents/${item.docId}/download`
      ),
      { params: Promise.resolve({ orgId: organization.orgId, docId: item.docId }) }
    );
    expect(outsiderDl.status).toBe(403);

    // 5. Retry failed document works & soft-delete + 30-day purge works
    mockState.user = owner;
    const db = await getPgliteDb();
    await db.query(`update public.documents set parse_status = 'failed' where id = $1`, [
      item.docId,
    ]);
    const retryRes = await patchDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/${item.docId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "retry" }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId, docId: item.docId }) }
    );
    expect(retryRes.status).toBe(200);

    const listAfterRetry = await listDocumentsRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents?q=991234`),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const listed = (await listAfterRetry.json()) as {
      documents: Array<{ id: string; parseStatus: string }>;
    };
    expect(listed.documents).toHaveLength(1);
    expect(listed.documents[0]?.parseStatus).toBe("queued");

    // Soft-delete -> at day 29 not purged; at day 31 purged permanently
    const delRes = await deleteDocumentRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/${item.docId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ orgId: organization.orgId, docId: item.docId }) }
    );
    expect(delRes.status).toBe(200);

    const day29 = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
    const purgeDay29 = await purgeExpiredDeletedDocuments(day29);
    expect(purgeDay29.purgedCount).toBe(0);

    const day31 = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const purgeDay31 = await purgeExpiredDeletedDocuments(day31);
    expect(purgeDay31.purgedCount).toBe(1);
    expect(purgeDay31.purgedIds).toContain(item.docId);
  }, 15000);

  it("enforces monthly shipping bill plan limit on server with 402 and rejects > 50 files per batch", async () => {
    const owner = await ensurePgliteUser("limit-owner@example.com");
    mockState.user = owner;

    const orgRes = await createOrgRoute(
      new NextRequest("http://localhost/api/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Morbi Tiles Exports", roleChoice: "exporter" }),
      })
    );
    const { organization } = (await orgRes.json()) as { organization: { orgId: string } };

    const iecRes = await createIecRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/iecs`, {
        method: "POST",
        body: JSON.stringify({ iecCode: "AAACM1111M", legalName: "Morbi Tiles Exports" }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    const { iec } = (await iecRes.json()) as { iec: { id: string } };

    // Simulate org already used its trial and hit 5/5 monthly Free limit
    const db = await getPgliteDb();
    await db.query(
      `update public.organizations
       set plan_key = 'free', trial_ends_at = now() - interval '2 days'
       where id = $1`,
      [organization.orgId]
    );
    const pdfBytes = Buffer.from("%PDF-1.4\n%Sample 6th bill\n%%EOF\n");
    const pdfSha = crypto.createHash("sha256").update(pdfBytes).digest("hex");

    // 6th bill batch should fail with 402 PlanLimitError
    const batch6 = Array.from({ length: 6 }, (_, i) => ({
      iecId: iec.id,
      kind: "shipping_bill" as const,
      originalName: `sb-${i}.pdf`,
      sha256: crypto.createHash("sha256").update(`%PDF-1.4-${i}`).digest("hex"),
      fileSizeBytes: 100,
      mimeType: "application/pdf",
      headerBase64: encodeHeaderBase64(new Uint8Array(pdfBytes)),
    }));

    const limitRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({ files: batch6 }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(limitRes.status).toBe(402);
    const limitBody = (await limitRes.json()) as { error: { code: string } };
    expect(limitBody.error.code).toBe("PLAN_LIMIT_EXCEEDED");

    // Batch > 50 files rejected with 400
    const batch51 = Array.from({ length: 51 }, (_, i) => ({
      iecId: iec.id,
      kind: "shipping_bill" as const,
      originalName: `sb-many-${i}.pdf`,
      sha256: pdfSha,
      fileSizeBytes: 100,
      mimeType: "application/pdf",
      headerBase64: encodeHeaderBase64(new Uint8Array(pdfBytes)),
    }));

    const tooManyRes = await uploadUrlRoute(
      new NextRequest(`http://localhost/api/orgs/${organization.orgId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({ files: batch51 }),
      }),
      { params: Promise.resolve({ orgId: organization.orgId }) }
    );
    expect(tooManyRes.status).toBe(400);
  }, 15000);
});

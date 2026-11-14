import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/auth/errors";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/auth/org-access";
import { isForceLoginAllowed } from "@/lib/supabase/config";

const forceLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((v) => v.toLowerCase())
    .optional(),
  targetRole: z.enum(["owner", "admin", "member", "viewer"]).optional(),
  asAdmin: z.boolean().optional(),
  freshAccount: z.boolean().optional(),
  nextPath: z.string().optional(),
});

async function ensureSeedDataLoaded() {
  const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
  const db = await getPgliteDb();
  const orgCheck = await db.query<{ count: string }>(
    `select count(*)::text as count from public.organizations`
  );
  if (Number(orgCheck.rows[0]?.count ?? 0) === 0) {
    const seedPath = path.resolve(process.cwd(), "supabase/seed.sql");
    if (fs.existsSync(seedPath)) {
      const seedSql = fs.readFileSync(seedPath, "utf8");
      await db.exec(seedSql);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isForceLoginAllowed()) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Force login is only available in development environments.",
        },
      },
      { status: 403 }
    );
  }

  try {
    let bodyData = {};
    try {
      bodyData = await request.json();
    } catch {
      // Empty or invalid body is accepted; defaults will be used
    }
    const parsed = forceLoginSchema.parse(bodyData);

    const { getPgliteDb, ensurePgliteUser, signTestSession, TEST_SESSION_COOKIE } =
      await import("@/lib/auth/pglite-adapter");

    await ensureSeedDataLoaded();

    const normalizedEmail = (parsed.email ?? "demo-exporter@example.invalid").toLowerCase();
    let user: { id: string; email: string; isPlatformAdmin: boolean };

    if (normalizedEmail === "demo-exporter@example.invalid") {
      user = {
        id: "10000000-0000-4000-8000-000000000001",
        email: normalizedEmail,
        isPlatformAdmin: Boolean(parsed.asAdmin),
      };
    } else if (normalizedEmail === "demo-consultant@example.invalid") {
      user = {
        id: "10000000-0000-4000-8000-000000000002",
        email: normalizedEmail,
        isPlatformAdmin: Boolean(parsed.asAdmin),
      };
    } else {
      const baseUser = await ensurePgliteUser(normalizedEmail);
      user = {
        ...baseUser,
        isPlatformAdmin: Boolean(parsed.asAdmin),
      };

      if (!parsed.freshAccount) {
        // Ensure user belongs to the demo organization so they can access the full workspace
        const db = await getPgliteDb();
        const existingMembership = await db.query<{ id: string }>(
          `select id from public.memberships where user_id = $1 limit 1`,
          [user.id]
        );

        if (!existingMembership.rows[0]) {
          await db.query(
            `insert into public.memberships (id, user_id, org_id, role)
             values ($1, $2, '20000000-0000-4000-8000-000000000001', $3)
             on conflict (user_id, org_id) do nothing`,
            [crypto.randomUUID(), user.id, parsed.targetRole ?? "owner"]
          );
        }
      }
    }

    const db = await getPgliteDb();
    const membershipRes = await db.query<{ org_id: string }>(
      `select org_id from public.memberships where user_id = $1 order by created_at asc limit 1`,
      [user.id]
    );
    const activeOrgId = membershipRes.rows[0]?.org_id ?? null;

    let activeIecId: string | null = null;
    if (activeOrgId) {
      const iecRes = await db.query<{ id: string }>(
        `select id from public.iec_profiles where org_id = $1 order by created_at asc limit 1`,
        [activeOrgId]
      );
      activeIecId = iecRes.rows[0]?.id ?? null;
    }

    const signedCookie = signTestSession(user);

    let redirectTo = parsed.nextPath || "/app";
    if (!activeOrgId && !parsed.nextPath?.startsWith("/invite/")) {
      redirectTo = "/onboarding";
    }

    const response = NextResponse.json({
      ok: true,
      user,
      activeOrgId,
      activeIecId,
      redirectTo,
    });

    response.cookies.set(TEST_SESSION_COOKIE, signedCookie, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    if (activeOrgId) {
      response.cookies.set(ACTIVE_ORG_COOKIE, activeOrgId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    } else {
      response.cookies.delete(ACTIVE_ORG_COOKIE);
    }

    if (activeIecId) {
      response.cookies.set(ACTIVE_IEC_COOKIE, activeIecId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    } else {
      response.cookies.delete(ACTIVE_IEC_COOKIE);
    }

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

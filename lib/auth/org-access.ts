import { cookies } from "next/headers";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import type { MembershipRole } from "@/lib/database.types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "exportleak_org_id";
export const ACTIVE_IEC_COOKIE = "exportleak_iec_id";

export const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  isPlatformAdmin?: boolean;
}

export interface OrgAccessContext {
  user: AuthenticatedUser;
  orgId: string;
  role: MembershipRole;
}

export function hasMinRole(actual: MembershipRole, required: MembershipRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

const uuidSchema = z.string().uuid();

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isPgliteTestAdapterEnabled()) {
    const cookieStore = await cookies();
    const { TEST_SESSION_COOKIE, verifyTestSession } = await import("@/lib/auth/pglite-adapter");
    const session = verifyTestSession(cookieStore.get(TEST_SESSION_COOKIE)?.value);
    if (!session) return null;
    return {
      id: session.id,
      email: session.email,
      isPlatformAdmin: session.isPlatformAdmin,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
  return {
    id: user.id,
    email: user.email ?? null,
    isPlatformAdmin: appMetadata?.is_platform_admin === true,
  };
}

export function assertPlatformAdminAccess(user: AuthenticatedUser | null): AuthenticatedUser {
  if (!user) {
    throw new UnauthorizedError();
  }
  if (!user.isPlatformAdmin) {
    throw new ForbiddenError("Platform admin privileges are required.");
  }
  return user;
}

export async function requirePlatformAdmin(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  return assertPlatformAdminAccess(user);
}

export async function assertOrgMembershipAccess(params: {
  user: AuthenticatedUser | null;
  orgId: string;
  minRole: MembershipRole;
  findMembership: (userId: string, orgId: string) => Promise<MembershipRole | null>;
}): Promise<OrgAccessContext> {
  if (!params.user) {
    throw new UnauthorizedError();
  }

  const parsedOrgId = uuidSchema.safeParse(params.orgId);
  if (!parsedOrgId.success) {
    throw new ForbiddenError("Organization access denied.");
  }

  const role = await params.findMembership(params.user.id, parsedOrgId.data);
  if (!role) {
    throw new ForbiddenError("You do not belong to this organization.");
  }

  if (!hasMinRole(role, params.minRole)) {
    throw new ForbiddenError(`Requires at least ${params.minRole} role.`);
  }

  return {
    user: params.user,
    orgId: parsedOrgId.data,
    role,
  };
}

/**
 * Server helper required by every route handler and server action operating on org data.
 * Throws UnauthorizedError (401) if unauthenticated or ForbiddenError (403) if user
 * is not a member of orgId or lacks minRole.
 */
export async function requireOrgAccess(
  orgId: string,
  minRole: MembershipRole = "viewer"
): Promise<OrgAccessContext> {
  const user = await getAuthenticatedUser();

  return assertOrgMembershipAccess({
    user,
    orgId,
    minRole,
    findMembership: async (userId, validOrgId) => {
      if (isPgliteTestAdapterEnabled()) {
        const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
        return asPgliteUser(userId, async (tx) => {
          const res = await tx.query<{ role: MembershipRole }>(
            `select role from public.memberships where user_id = $1 and org_id = $2`,
            [userId, validOrgId]
          );
          return res.rows[0]?.role ?? null;
        });
      }

      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", validOrgId)
        .maybeSingle();

      if (error || !data) return null;
      return data.role;
    },
  });
}

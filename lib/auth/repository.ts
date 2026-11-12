import crypto from "node:crypto";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";
import { hasMinRole, requireOrgAccess, type AuthenticatedUser } from "@/lib/auth/org-access";
import { assertCan, getCurrentKolkataPeriodStart } from "@/lib/billing/entitlements";
import { startTrial } from "@/lib/billing/trial";
import type {
  DocumentKind,
  InviteRole,
  MembershipRole,
  OrganizationType,
} from "@/lib/database.types";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface UserOrganizationSummary {
  orgId: string;
  name: string;
  type: OrganizationType;
  role: MembershipRole;
  planKey: string;
  planStatus: string;
  trialEndsAt?: string | null;
}

export interface IecWithAlertCount {
  id: string;
  orgId: string;
  iecCode: string;
  legalName: string;
  gstin: string | null;
  adBankName: string | null;
  defaultCurrency: string;
  isDemo: boolean;
  openAlertsCount: number;
}

export interface OrgMemberItem {
  id: string;
  userId: string;
  email: string | null;
  role: MembershipRole;
  createdAt: string;
}

export interface OrgInviteItem {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
}

export interface DocumentRecordItem {
  id: string;
  iecId: string;
  kind: DocumentKind;
  originalName: string;
  parseStatus: string;
  createdAt: string;
  trialStarted?: boolean;
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function listUserOrganizations(userId: string): Promise<UserOrganizationSummary[]> {
  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(userId, async (tx) => {
      const res = await tx.query<{
        org_id: string;
        name: string;
        type: OrganizationType;
        role: MembershipRole;
        plan_key: string;
        plan_status: string;
        trial_ends_at: string | null;
      }>(
        `select o.id as org_id, o.name, o.type, m.role, o.plan_key, o.plan_status, o.trial_ends_at::text
         from public.memberships m
         join public.organizations o on o.id = m.org_id
         where m.user_id = $1
         order by o.created_at asc`,
        [userId]
      );
      return res.rows.map((r) => ({
        orgId: r.org_id,
        name: r.name,
        type: r.type,
        role: r.role,
        planKey: r.plan_key,
        planStatus: r.plan_status,
        trialEndsAt: r.trial_ends_at,
      }));
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations!inner(id, name, type, plan_key, plan_status, trial_ends_at)")
    .eq("user_id", userId);

  if (error || !data) return [];

  return data.map((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return {
      orgId: org?.id ?? "",
      name: org?.name ?? "",
      type: (org?.type ?? "exporter") as OrganizationType,
      role: row.role,
      planKey: org?.plan_key ?? "free",
      planStatus: org?.plan_status ?? "active",
      trialEndsAt: org?.trial_ends_at ?? null,
    };
  });
}

export async function createOrganization(params: {
  user: AuthenticatedUser;
  name: string;
  type: OrganizationType;
}): Promise<UserOrganizationSummary> {
  const orgId = crypto.randomUUID();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(params.user.id, async (tx) => {
      // Insert without RETURNING first so trg_organizations_owner_membership
      // creates the owner row before RLS evaluates organizations_select.
      await tx.query(
        `insert into public.organizations (id, name, type)
         values ($1, $2, $3)`,
        [orgId, params.name, params.type]
      );

      const orgRes = await tx.query<{
        id: string;
        name: string;
        type: OrganizationType;
        plan_key: string;
        plan_status: string;
      }>(
        `select id, name, type, plan_key, plan_status
         from public.organizations
         where id = $1`,
        [orgId]
      );
      const org = orgRes.rows[0];
      if (!org) throw new Error("Failed to create organization.");

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'organizations', $1, $3::jsonb)`,
        [org.id, params.user.id, JSON.stringify({ type: org.type, name: org.name })]
      );

      return {
        orgId: org.id,
        name: org.name,
        type: org.type,
        role: "owner",
        planKey: org.plan_key,
        planStatus: org.plan_status,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error: insertError } = await supabase
    .from("organizations")
    .insert({ id: orgId, name: params.name, type: params.type });

  if (insertError) {
    throw new ValidationError("Could not create organization.");
  }

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, type, plan_key, plan_status")
    .eq("id", orgId)
    .single();

  if (error || !org) {
    throw new ValidationError("Could not load newly created organization.");
  }

  await supabase.from("audit_log").insert({
    org_id: org.id,
    actor_id: params.user.id,
    action: "create",
    entity: "organizations",
    entity_id: org.id,
    diff: { type: org.type, name: org.name },
  });

  return {
    orgId: org.id,
    name: org.name,
    type: org.type,
    role: "owner",
    planKey: org.plan_key,
    planStatus: org.plan_status,
  };
}

export async function listIecProfilesWithAlerts(orgId: string): Promise<IecWithAlertCount[]> {
  const access = await requireOrgAccess(orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        org_id: string;
        iec_code: string;
        legal_name: string;
        gstin: string | null;
        ad_bank_name: string | null;
        default_currency: string;
        is_demo: boolean;
        open_alerts_count: number;
      }>(
        `select
           p.id,
           p.org_id,
           p.iec_code,
           p.legal_name,
           p.gstin,
           p.ad_bank_name,
           p.default_currency,
           p.is_demo,
           count(a.id)::int as open_alerts_count
         from public.iec_profiles p
         left join public.alerts a on a.iec_id = p.id and a.resolved_at is null
         where p.org_id = $1
         group by p.id
         order by p.created_at asc`,
        [access.orgId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        orgId: r.org_id,
        iecCode: r.iec_code,
        legalName: r.legal_name,
        gstin: r.gstin,
        adBankName: r.ad_bank_name,
        defaultCurrency: r.default_currency,
        isDemo: r.is_demo,
        openAlertsCount: Number(r.open_alerts_count ?? 0),
      }));
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: profiles, error } = await supabase
    .from("iec_profiles")
    .select("id, org_id, iec_code, legal_name, gstin, ad_bank_name, default_currency, is_demo")
    .eq("org_id", access.orgId)
    .order("created_at", { ascending: true });

  if (error || !profiles) return [];

  const iecIds = profiles.map((p) => p.id);
  const counts = new Map<string, number>();

  if (iecIds.length > 0) {
    const { data: openAlerts } = await supabase
      .from("alerts")
      .select("iec_id")
      .in("iec_id", iecIds)
      .is("resolved_at", null);

    for (const alert of openAlerts ?? []) {
      counts.set(alert.iec_id, (counts.get(alert.iec_id) ?? 0) + 1);
    }
  }

  return profiles.map((p) => ({
    id: p.id,
    orgId: p.org_id,
    iecCode: p.iec_code,
    legalName: p.legal_name,
    gstin: p.gstin,
    adBankName: p.ad_bank_name,
    defaultCurrency: p.default_currency,
    isDemo: p.is_demo,
    openAlertsCount: counts.get(p.id) ?? 0,
  }));
}

export async function createIecProfile(params: {
  orgId: string;
  iecCode: string;
  legalName: string;
  gstin: string | null;
  adBankName: string | null;
}): Promise<IecWithAlertCount> {
  const access = await requireOrgAccess(params.orgId, "member");
  await assertCan(access.orgId, "add_iec", 1, { userId: access.user.id });

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{ id: string }>(
        `select id from public.iec_profiles where org_id = $1 and iec_code = $2`,
        [access.orgId, params.iecCode]
      );
      if (existing.rows[0]) {
        throw new ConflictError(`IEC ${params.iecCode} is already added to this organization.`);
      }

      const res = await tx.query<{
        id: string;
        org_id: string;
        iec_code: string;
        legal_name: string;
        gstin: string | null;
        ad_bank_name: string | null;
        default_currency: string;
        is_demo: boolean;
      }>(
        `insert into public.iec_profiles (org_id, iec_code, legal_name, gstin, ad_bank_name)
         values ($1, $2, $3, $4, $5)
         returning id, org_id, iec_code, legal_name, gstin, ad_bank_name, default_currency, is_demo`,
        [access.orgId, params.iecCode, params.legalName, params.gstin, params.adBankName]
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to create IEC profile.");

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'iec_profiles', $3, $4::jsonb)`,
        [access.orgId, access.user.id, row.id, JSON.stringify({ iec_code: row.iec_code })]
      );

      return {
        id: row.id,
        orgId: row.org_id,
        iecCode: row.iec_code,
        legalName: row.legal_name,
        gstin: row.gstin,
        adBankName: row.ad_bank_name,
        defaultCurrency: row.default_currency,
        isDemo: row.is_demo,
        openAlertsCount: 0,
      };
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("iec_profiles")
    .insert({
      org_id: access.orgId,
      iec_code: params.iecCode,
      legal_name: params.legalName,
      gstin: params.gstin,
      ad_bank_name: params.adBankName,
    })
    .select("id, org_id, iec_code, legal_name, gstin, ad_bank_name, default_currency, is_demo")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new ConflictError(`IEC ${params.iecCode} is already added to this organization.`);
    }
    throw new ValidationError("Could not create IEC profile.");
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "create",
    entity: "iec_profiles",
    entity_id: data.id,
    diff: { iec_code: data.iec_code },
  });

  return {
    id: data.id,
    orgId: data.org_id,
    iecCode: data.iec_code,
    legalName: data.legal_name,
    gstin: data.gstin,
    adBankName: data.ad_bank_name,
    defaultCurrency: data.default_currency,
    isDemo: data.is_demo,
    openAlertsCount: 0,
  };
}

export async function listMembersAndInvites(orgId: string): Promise<{
  members: OrgMemberItem[];
  invites: OrgInviteItem[];
}> {
  const access = await requireOrgAccess(orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser, getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const members = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        user_id: string;
        role: MembershipRole;
        created_at: string;
      }>(
        `select id, user_id, role, created_at::text
         from public.memberships
         where org_id = $1
         order by created_at asc`,
        [access.orgId]
      );
      return res.rows;
    });

    const userIds = members.map((m) => m.user_id);
    const emailMap = new Map<string, string | null>();
    if (userIds.length > 0) {
      const usersRes = await db.query<{ id: string; email: string | null }>(
        `select id, email from auth.users where id = any($1::uuid[])`,
        [userIds]
      );
      for (const u of usersRes.rows) {
        emailMap.set(u.id, u.email);
      }
    }

    const invites = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        email: string;
        role: InviteRole;
        expires_at: string;
        created_at: string;
      }>(
        `select id, email, role, expires_at::text, created_at::text
         from public.org_invites
         where org_id = $1 and accepted_at is null and revoked_at is null
         order by created_at desc`,
        [access.orgId]
      );
      return res.rows;
    });

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        email: emailMap.get(m.user_id) ?? null,
        role: m.role,
        createdAt: m.created_at,
      })),
      invites: invites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expires_at,
        createdAt: inv.created_at,
      })),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: memberRows } = await supabase
    .from("memberships")
    .select("id, user_id, role, created_at")
    .eq("org_id", access.orgId)
    .order("created_at", { ascending: true });

  const { data: inviteRows } = await supabase
    .from("org_invites")
    .select("id, email, role, expires_at, created_at")
    .eq("org_id", access.orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const serviceClient = createSupabaseServiceRoleClient();
  const emailMap = new Map<string, string | null>();
  for (const m of memberRows ?? []) {
    const { data: authUser } = await serviceClient.auth.admin.getUserById(m.user_id);
    emailMap.set(m.user_id, authUser.user?.email ?? null);
  }

  return {
    members: (memberRows ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      email: emailMap.get(m.user_id) ?? null,
      role: m.role,
      createdAt: m.created_at,
    })),
    invites: (inviteRows ?? []).map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
    })),
  };
}

export async function createTeamInvite(params: {
  orgId: string;
  email: string;
  role: InviteRole;
}): Promise<{ invite: OrgInviteItem; rawToken: string }> {
  const access = await requireOrgAccess(params.orgId, "admin");
  await assertCan(access.orgId, "invite_seat", 1, { userId: access.user.id });
  const normalizedEmail = params.email.trim().toLowerCase();
  const rawToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const invite = await asPgliteUser(access.user.id, async (tx) => {
      const existing = await tx.query<{ id: string }>(
        `select id from public.org_invites
         where org_id = $1 and email = $2 and accepted_at is null and revoked_at is null`,
        [access.orgId, normalizedEmail]
      );
      if (existing.rows[0]) {
        throw new ConflictError(`An active invite already exists for ${normalizedEmail}.`);
      }

      const res = await tx.query<{
        id: string;
        email: string;
        role: InviteRole;
        expires_at: string;
        created_at: string;
      }>(
        `insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, $6)
         returning id, email, role, expires_at::text, created_at::text`,
        [access.orgId, normalizedEmail, params.role, tokenHash, access.user.id, expiresAt]
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to create invite.");

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'org_invites', $3, $4::jsonb)`,
        [access.orgId, access.user.id, row.id, JSON.stringify({ role: row.role })]
      );

      return {
        id: row.id,
        email: row.email,
        role: row.role,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    });

    return { invite, rawToken };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_invites")
    .insert({
      org_id: access.orgId,
      email: normalizedEmail,
      role: params.role,
      token_hash: tokenHash,
      invited_by: access.user.id,
      expires_at: expiresAt,
    })
    .select("id, email, role, expires_at, created_at")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new ConflictError(`An active invite already exists for ${normalizedEmail}.`);
    }
    throw new ValidationError("Could not create invite.");
  }

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "create",
    entity: "org_invites",
    entity_id: data.id,
    diff: { role: data.role },
  });

  return {
    invite: {
      id: data.id,
      email: data.email,
      role: data.role,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    },
    rawToken,
  };
}

export async function getInvitePreview(rawToken: string): Promise<{
  orgId: string;
  orgName: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  status: "valid" | "expired" | "accepted" | "revoked" | "not_found";
}> {
  const tokenHash = hashToken(rawToken);

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<{
      org_id: string;
      org_name: string;
      email: string;
      role: InviteRole;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      `select i.org_id, o.name as org_name, i.email, i.role, i.expires_at::text, i.accepted_at::text, i.revoked_at::text
       from public.org_invites i
       join public.organizations o on o.id = i.org_id
       where i.token_hash = $1`,
      [tokenHash]
    );
    const row = res.rows[0];
    if (!row) {
      return {
        orgId: "",
        orgName: "",
        email: "",
        role: "viewer",
        expiresAt: "",
        status: "not_found",
      };
    }

    const status = row.revoked_at
      ? "revoked"
      : row.accepted_at
        ? "accepted"
        : new Date(row.expires_at).getTime() <= Date.now()
          ? "expired"
          : "valid";

    return {
      orgId: row.org_id,
      orgName: row.org_name,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
      status,
    };
  }

  const service = createSupabaseServiceRoleClient();
  const { data } = await service
    .from("org_invites")
    .select("org_id, email, role, expires_at, accepted_at, revoked_at, organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!data) {
    return {
      orgId: "",
      orgName: "",
      email: "",
      role: "viewer",
      expiresAt: "",
      status: "not_found",
    };
  }

  const orgName =
    (Array.isArray(data.organizations) ? data.organizations[0]?.name : data.organizations?.name) ??
    "";
  const status = data.revoked_at
    ? "revoked"
    : data.accepted_at
      ? "accepted"
      : new Date(data.expires_at).getTime() <= Date.now()
        ? "expired"
        : "valid";

  return {
    orgId: data.org_id,
    orgName,
    email: data.email,
    role: data.role,
    expiresAt: data.expires_at,
    status,
  };
}

export async function acceptTeamInvite(params: {
  user: AuthenticatedUser;
  rawToken: string;
}): Promise<{ orgId: string; role: MembershipRole }> {
  const tokenHash = hashToken(params.rawToken);
  const userEmail = params.user.email?.trim().toLowerCase();
  if (!userEmail) {
    throw new ValidationError("Your account must have a verified email to accept an invitation.");
  }

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    return db.transaction(async (tx) => {
      const inviteRes = await tx.query<{
        id: string;
        org_id: string;
        email: string;
        role: InviteRole;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      }>(
        `select id, org_id, email, role, expires_at::text, accepted_at::text, revoked_at::text
         from public.org_invites
         where token_hash = $1`,
        [tokenHash]
      );
      const invite = inviteRes.rows[0];
      if (!invite) {
        throw new NotFoundError("Invitation not found.");
      }
      if (invite.revoked_at) {
        throw new ValidationError("This invitation has been revoked.");
      }
      if (invite.accepted_at) {
        throw new ConflictError("This invitation has already been accepted.");
      }
      if (new Date(invite.expires_at).getTime() <= Date.now()) {
        throw new ValidationError(
          "This invitation has expired. Ask an organization admin for a new link."
        );
      }
      if (invite.email.toLowerCase() !== userEmail) {
        throw new ForbiddenError(
          `This invitation was sent to ${invite.email}. Sign in with that email to accept.`
        );
      }

      const existingMembership = await tx.query<{ id: string; role: MembershipRole }>(
        `select id, role from public.memberships where user_id = $1 and org_id = $2`,
        [params.user.id, invite.org_id]
      );

      let finalRole: MembershipRole = invite.role;
      let membershipId = existingMembership.rows[0]?.id;

      if (existingMembership.rows[0]) {
        finalRole = existingMembership.rows[0].role;
      } else {
        const inserted = await tx.query<{ id: string }>(
          `insert into public.memberships (user_id, org_id, role)
           values ($1, $2, $3)
           returning id`,
          [params.user.id, invite.org_id, invite.role]
        );
        membershipId = inserted.rows[0]?.id;
      }

      await tx.query(
        `update public.org_invites
         set accepted_at = now(), accepted_by = $1
         where id = $2`,
        [params.user.id, invite.id]
      );

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'memberships', $3, $4::jsonb)`,
        [invite.org_id, params.user.id, membershipId ?? null, JSON.stringify({ role: finalRole })]
      );

      return { orgId: invite.org_id, role: finalRole };
    });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: invite } = await service
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite) throw new NotFoundError("Invitation not found.");
  if (invite.revoked_at) throw new ValidationError("This invitation has been revoked.");
  if (invite.accepted_at) throw new ConflictError("This invitation has already been accepted.");
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new ValidationError(
      "This invitation has expired. Ask an organization admin for a new link."
    );
  }
  if (invite.email.toLowerCase() !== userEmail) {
    throw new ForbiddenError(
      `This invitation was sent to ${invite.email}. Sign in with that email to accept.`
    );
  }

  const { data: existingMembership } = await service
    .from("memberships")
    .select("id, role")
    .eq("user_id", params.user.id)
    .eq("org_id", invite.org_id)
    .maybeSingle();

  let finalRole: MembershipRole = invite.role;
  let membershipId = existingMembership?.id ?? null;

  if (existingMembership) {
    finalRole = existingMembership.role;
  } else {
    const { data: inserted, error: insertError } = await service
      .from("memberships")
      .insert({ user_id: params.user.id, org_id: invite.org_id, role: invite.role })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new ValidationError("Could not accept invitation.");
    }
    membershipId = inserted.id;
  }

  await service
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: params.user.id })
    .eq("id", invite.id);

  await service.from("audit_log").insert({
    org_id: invite.org_id,
    actor_id: params.user.id,
    action: "create",
    entity: "memberships",
    entity_id: membershipId,
    diff: { role: finalRole },
  });

  return { orgId: invite.org_id, role: finalRole };
}

export async function removeMember(params: { orgId: string; memberId: string }): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser, getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    const target = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{ id: string; user_id: string; role: MembershipRole }>(
        `select id, user_id, role from public.memberships where id = $1 and org_id = $2`,
        [params.memberId, access.orgId]
      );
      return res.rows[0] ?? null;
    });

    if (!target) throw new NotFoundError("Member not found.");

    const isSelfLeave = target.user_id === access.user.id;
    if (!isSelfLeave && !hasMinRole(access.role, "owner")) {
      throw new ForbiddenError("Only an organization owner can remove other members.");
    }

    if (target.role === "owner") {
      const ownersRes = await db.query<{ count: string }>(
        `select count(*)::text as count from public.memberships where org_id = $1 and role = 'owner'`,
        [access.orgId]
      );
      if (Number(ownersRes.rows[0]?.count ?? 0) <= 1) {
        throw new ValidationError(
          "Cannot remove the last owner of an organization. Transfer ownership first."
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx.query(`delete from public.memberships where id = $1 and org_id = $2`, [
        target.id,
        access.orgId,
      ]);
      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'delete', 'memberships', $3, $4::jsonb)`,
        [access.orgId, access.user.id, target.id, JSON.stringify({ role: target.role })]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", params.memberId)
    .eq("org_id", access.orgId)
    .maybeSingle();

  if (!target) throw new NotFoundError("Member not found.");

  const isSelfLeave = target.user_id === access.user.id;
  if (!isSelfLeave && !hasMinRole(access.role, "owner")) {
    throw new ForbiddenError("Only an organization owner can remove other members.");
  }

  if (target.role === "owner") {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", access.orgId)
      .eq("role", "owner");

    if ((count ?? 0) <= 1) {
      throw new ValidationError(
        "Cannot remove the last owner of an organization. Transfer ownership first."
      );
    }
  }

  const service = createSupabaseServiceRoleClient();
  await service.from("memberships").delete().eq("id", target.id).eq("org_id", access.orgId);
  await service.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "delete",
    entity: "memberships",
    entity_id: target.id,
    diff: { role: target.role },
  });
}

export async function listDocumentsForOrg(orgId: string): Promise<DocumentRecordItem[]> {
  const access = await requireOrgAccess(orgId, "viewer");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    return asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        kind: DocumentKind;
        original_name: string;
        parse_status: string;
        created_at: string;
      }>(
        `select d.id, d.iec_id, d.kind, d.original_name, d.parse_status, d.created_at::text
         from public.documents d
         join public.iec_profiles p on p.id = d.iec_id
         where p.org_id = $1 and d.deleted_at is null
         order by d.created_at desc`,
        [access.orgId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        iecId: r.iec_id,
        kind: r.kind,
        originalName: r.original_name,
        parseStatus: r.parse_status,
        createdAt: r.created_at,
      }));
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("documents")
    .select("id, iec_id, kind, original_name, parse_status, created_at, iec_profiles!inner(org_id)")
    .eq("iec_profiles.org_id", access.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    iecId: r.iec_id,
    kind: r.kind,
    originalName: r.original_name,
    parseStatus: r.parse_status,
    createdAt: r.created_at,
  }));
}

export async function createDocumentRecord(params: {
  orgId: string;
  iecId: string;
  kind: DocumentKind;
  originalName: string;
}): Promise<DocumentRecordItem> {
  const access = await requireOrgAccess(params.orgId, "member");
  const docId = crypto.randomUUID();
  const sha256 = crypto
    .createHash("sha256")
    .update(`${docId}:${params.originalName}`)
    .digest("hex");
  const storagePath = `${access.orgId}/${params.iecId}/${docId}.pdf`;

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    const iecRow = await asPgliteUser(access.user.id, async (tx) => {
      const iecCheck = await tx.query<{ id: string; is_demo: boolean }>(
        `select id, is_demo from public.iec_profiles where id = $1 and org_id = $2`,
        [params.iecId, access.orgId]
      );
      return iecCheck.rows[0] ?? null;
    });

    if (!iecRow) {
      throw new ForbiddenError("IEC profile does not belong to this organization.");
    }

    if (params.kind === "shipping_bill" && !iecRow.is_demo) {
      await assertCan(access.orgId, "upload", 1, {
        userId: access.user.id,
        allowAutoTrial: true,
      });
    }

    const result = await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{
        id: string;
        iec_id: string;
        kind: DocumentKind;
        original_name: string;
        parse_status: string;
        created_at: string;
      }>(
        `insert into public.documents (id, iec_id, kind, storage_path, sha256, original_name, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, iec_id, kind, original_name, parse_status, created_at::text`,
        [docId, params.iecId, params.kind, storagePath, sha256, params.originalName, access.user.id]
      );
      const row = res.rows[0];
      if (!row) throw new Error("Failed to create document record.");

      if (params.kind === "shipping_bill" && !iecRow.is_demo) {
        const periodStart = getCurrentKolkataPeriodStart();
        await tx.query(
          `insert into public.usage_counters (org_id, period_start, shipping_bills_used)
           values ($1, $2, 1)
           on conflict (org_id, period_start) do update
             set shipping_bills_used = public.usage_counters.shipping_bills_used + 1,
                 updated_at = now()`,
          [access.orgId, periodStart]
        );
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'create', 'documents', $3, $4::jsonb)`,
        [access.orgId, access.user.id, row.id, JSON.stringify({ kind: row.kind })]
      );

      return {
        isDemo: iecRow.is_demo,
        record: {
          id: row.id,
          iecId: row.iec_id,
          kind: row.kind,
          originalName: row.original_name,
          parseStatus: row.parse_status,
          createdAt: row.created_at,
        },
      };
    });

    const trial = result.isDemo ? null : await startTrial(access.orgId, access.user.id);
    return {
      ...result.record,
      trialStarted: trial?.started ?? false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: iecCheck } = await supabase
    .from("iec_profiles")
    .select("id, is_demo")
    .eq("id", params.iecId)
    .eq("org_id", access.orgId)
    .maybeSingle();

  if (!iecCheck) {
    throw new ForbiddenError("IEC profile does not belong to this organization.");
  }

  if (params.kind === "shipping_bill" && !iecCheck.is_demo) {
    await assertCan(access.orgId, "upload", 1, {
      userId: access.user.id,
      allowAutoTrial: true,
    });
  }

  const periodStart = getCurrentKolkataPeriodStart();
  const { data: committedRows, error } = await supabase.rpc("commit_document_with_usage", {
    p_doc_id: docId,
    p_org_id: access.orgId,
    p_iec_id: params.iecId,
    p_kind: params.kind,
    p_storage_path: storagePath,
    p_sha256: sha256,
    p_original_name: params.originalName,
    p_file_size_bytes: 0,
    p_mime_type: "application/pdf",
    p_actor_id: access.user.id,
    p_period_start: periodStart,
    p_increment_usage: params.kind === "shipping_bill" && !iecCheck.is_demo,
  });

  const data = Array.isArray(committedRows) ? committedRows[0] : committedRows;
  if (error || !data) {
    throw new ValidationError("Could not create document record.");
  }

  const trial = iecCheck.is_demo ? null : await startTrial(access.orgId, access.user.id);

  return {
    id: data.id,
    iecId: data.iec_id,
    kind: data.kind,
    originalName: data.original_name,
    parseStatus: data.parse_status,
    createdAt: data.created_at,
    trialStarted: trial?.started ?? false,
  };
}

export async function softDeleteDocument(params: { orgId: string; docId: string }): Promise<void> {
  const access = await requireOrgAccess(params.orgId, "member");

  if (isPgliteTestAdapterEnabled()) {
    const { asPgliteUser } = await import("@/lib/auth/pglite-adapter");
    await asPgliteUser(access.user.id, async (tx) => {
      const res = await tx.query<{ id: string }>(
        `update public.documents d
         set deleted_at = now()
         from public.iec_profiles p
         where d.id = $1 and d.iec_id = p.id and p.org_id = $2 and d.deleted_at is null
         returning d.id`,
        [params.docId, access.orgId]
      );
      if (!res.rows[0]) {
        throw new NotFoundError("Document not found.");
      }

      await tx.query(
        `insert into public.audit_log (org_id, actor_id, action, entity, entity_id, diff)
         values ($1, $2, 'delete', 'documents', $3, '{}'::jsonb)`,
        [access.orgId, access.user.id, params.docId]
      );
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, iec_profiles!inner(org_id)")
    .eq("id", params.docId)
    .eq("iec_profiles.org_id", access.orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) {
    throw new NotFoundError("Document not found.");
  }

  await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.docId);

  await supabase.from("audit_log").insert({
    org_id: access.orgId,
    actor_id: access.user.id,
    action: "delete",
    entity: "documents",
    entity_id: params.docId,
    diff: {},
  });
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TeamManager } from "@/components/app/team-manager";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listMembersAndInvites, listUserOrganizations } from "@/lib/auth/repository";
import { getOrgUsageSnapshot } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/team");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const [{ members, invites }, usageSnapshot] = await Promise.all([
    listMembersAndInvites(activeOrg.orgId),
    getOrgUsageSnapshot(activeOrg.orgId, user.id),
  ]);

  return (
    <TeamManager
      orgId={activeOrg.orgId}
      currentUserId={user.id}
      currentRole={activeOrg.role}
      members={members}
      invites={invites}
      usageSnapshot={usageSnapshot}
    />
  );
}

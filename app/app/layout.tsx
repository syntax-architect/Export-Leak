import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";

export const dynamic = "force-dynamic";

export default async function AppWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/app");
  }

  const organizations = await listUserOrganizations(user.id);
  if (organizations.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === requestedOrgId) ?? organizations[0];

  if (!activeOrg) {
    redirect("/onboarding");
  }

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;
  const activeIecId = iecs.find((i) => i.id === requestedIecId)?.id ?? iecs[0]?.id ?? null;

  return (
    <WorkspaceShell
      userEmail={user.email}
      organizations={organizations}
      activeOrg={activeOrg}
      iecs={iecs}
      activeIecId={activeIecId}
    >
      {children}
    </WorkspaceShell>
  );
}

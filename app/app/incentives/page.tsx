import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IncentivesWorkspace } from "@/components/app/incentives-workspace";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { getIncentivesWorkspaceForOrg } from "@/lib/incentives/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Incentives & Scrips",
};

export default async function IncentivesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/incentives");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? undefined;
  const activeIecId = iecs.find((i) => i.id === requestedIecId)?.id ?? iecs[0]?.id;

  const initialWorkspace = await getIncentivesWorkspaceForOrg({
    orgId: activeOrg.orgId,
    iecId: activeIecId,
  });

  return (
    <IncentivesWorkspace
      orgId={activeOrg.orgId}
      userRole={activeOrg.role}
      iecs={iecs}
      initialWorkspace={initialWorkspace}
    />
  );
}

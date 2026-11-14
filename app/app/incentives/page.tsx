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

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? undefined;

  const [organizations] = await Promise.all([listUserOrganizations(user.id)]);
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const [iecs, initialWorkspace] = await Promise.all([
    listIecProfilesWithAlerts(activeOrg.orgId),
    getIncentivesWorkspaceForOrg({
      orgId: activeOrg.orgId,
      iecId: requestedIecId,
    }),
  ]);

  return (
    <IncentivesWorkspace
      orgId={activeOrg.orgId}
      userRole={activeOrg.role}
      iecs={iecs}
      initialWorkspace={initialWorkspace}
    />
  );
}

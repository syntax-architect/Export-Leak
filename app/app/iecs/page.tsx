import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IecManager } from "@/components/app/iec-manager";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "IEC Profiles",
};

export default async function IecsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/iecs");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);

  return (
    <IecManager
      orgId={activeOrg.orgId}
      orgType={activeOrg.type}
      role={activeOrg.role}
      initialIecs={iecs}
    />
  );
}

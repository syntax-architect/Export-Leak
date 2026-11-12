import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EbrcWorkspace } from "@/components/app/ebrc-workspace";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { getEbrcWorkspaceData } from "@/lib/ebrc/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bulk eBRC Export",
};

export default async function EbrcPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/ebrc");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;
  const activeIecId = iecs.find((i) => i.id === requestedIecId)?.id ?? null;

  const initialData = await getEbrcWorkspaceData({
    orgId: activeOrg.orgId,
    iecId: activeIecId,
  });

  return (
    <EbrcWorkspace orgId={activeOrg.orgId} userRole={activeOrg.role} initialData={initialData} />
  );
}

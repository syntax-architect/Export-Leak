import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IrmMatchingWorkspace } from "@/components/app/irm-matching-workspace";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { listDocumentsWithUsage } from "@/lib/documents/repository";
import { getReconciliationWorkspace } from "@/lib/matching/irm-repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "IRM & Matching",
};

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ docId?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/matches");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;
  const activeIecId = iecs.find((i) => i.id === requestedIecId)?.id ?? null;

  const [{ docId }, docsResult, workspace] = await Promise.all([
    searchParams,
    listDocumentsWithUsage(activeOrg.orgId, { kind: "irm_export" }),
    getReconciliationWorkspace({
      orgId: activeOrg.orgId,
      iecId: activeIecId,
    }),
  ]);

  return (
    <IrmMatchingWorkspace
      orgId={activeOrg.orgId}
      userRole={activeOrg.role}
      iecs={iecs}
      activeIecId={activeIecId}
      irmDocuments={docsResult.documents}
      initialDocId={docId ?? null}
      initialWorkspace={workspace}
    />
  );
}

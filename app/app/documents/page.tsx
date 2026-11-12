import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DocumentsManager } from "@/components/app/documents-manager";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import {
  getOrgAiParsingSetting,
  getOrgDocumentBatchSummary,
} from "@/lib/documents/parse-repository";
import { listDocumentsWithUsage } from "@/lib/documents/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/documents");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const [iecs, docData, batchSummary, orgSettings] = await Promise.all([
    listIecProfilesWithAlerts(activeOrg.orgId),
    listDocumentsWithUsage(activeOrg.orgId),
    getOrgDocumentBatchSummary(activeOrg.orgId),
    getOrgAiParsingSetting(activeOrg.orgId),
  ]);

  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value;
  const initialIecId =
    iecs.find((i) => i.id === requestedIecId && !i.isDemo)?.id ??
    iecs.find((i) => !i.isDemo)?.id ??
    iecs[0]?.id ??
    "";

  return (
    <DocumentsManager
      orgId={activeOrg.orgId}
      role={activeOrg.role}
      iecs={iecs}
      initialIecId={initialIecId}
      initialDocuments={docData.documents}
      initialUsage={docData.usage}
      initialBatchSummary={batchSummary}
      initialAiParsingEnabled={orgSettings.aiParsingEnabled}
    />
  );
}

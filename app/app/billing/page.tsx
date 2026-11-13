import { cookies } from "next/headers";
import { BillingOverview } from "@/components/billing/billing-overview";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listUserOrganizations } from "@/lib/auth/repository";
import { getOrgUsageSnapshot } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plans & Usage",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string; upgrade?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) return null;

  const [usage, params] = await Promise.all([
    getOrgUsageSnapshot(activeOrg.orgId, user.id),
    searchParams,
  ]);

  const highlightedPlanKey = params.highlight ?? params.upgrade ?? null;

  return (
    <BillingOverview
      orgName={activeOrg.name}
      usage={usage}
      highlightedPlanKey={highlightedPlanKey}
      userEmail={user.email}
    />
  );
}

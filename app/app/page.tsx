import { cookies } from "next/headers";
import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { DashboardClient } from "@/components/app/dashboard-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { getLeakageDashboardData } from "@/lib/dashboard/repository";
import { getDashboardSummary, getOrCreateOnboardingProfile } from "@/lib/onboarding/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace",
};

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) return null;

  const iecs = await listIecProfilesWithAlerts(activeOrg.orgId);
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;
  const activeIecId =
    iecs.find((i) => i.id === requestedIecId)?.id ??
    (activeOrg.type === "consultant" ? null : (iecs[0]?.id ?? null));

  const [summary, leakageData, onboarding, params] = await Promise.all([
    getDashboardSummary(activeOrg.orgId, activeIecId),
    getLeakageDashboardData(activeOrg.orgId, activeIecId),
    getOrCreateOnboardingProfile(user.id),
    searchParams,
  ]);

  const shouldStartTour =
    params.tour === "1" || Boolean(onboarding.completedAt && !onboarding.tourCompletedAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              {activeOrg.type === "exporter" ? "Exporter" : "Consultant / Firm"}
            </Badge>
            <Badge variant="neutral">Role: {activeOrg.role}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">{activeOrg.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/iecs">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span>{activeOrg.type === "consultant" ? "Client IECs" : "IEC Profile"}</span>
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/team">
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Team</span>
            </Link>
          </Button>
        </div>
      </section>

      <DashboardClient
        summary={summary}
        leakageData={leakageData}
        activeIecId={activeIecId}
        role={activeOrg.role}
        initialTourOpen={shouldStartTour}
      />

      {summary.openAlertsCount === 0 && iecs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm sm:pt-6">
            <span className="text-text-muted">
              Want to explore with realistic sample shipments before uploading your PDFs?
            </span>
            <Button asChild variant="secondary" size="sm">
              <Link href="/onboarding">Open onboarding wizard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

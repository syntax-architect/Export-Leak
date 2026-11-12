import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listIecProfilesWithAlerts, listUserOrganizations } from "@/lib/auth/repository";
import { getDashboardSummary, getOrCreateOnboardingProfile } from "@/lib/onboarding/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const [profile, organizations] = await Promise.all([
    getOrCreateOnboardingProfile(user.id),
    listUserOrganizations(user.id),
  ]);

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg =
    organizations.find((o) => o.orgId === profile.orgId) ??
    organizations.find((o) => o.orgId === requestedOrgId) ??
    organizations[0] ??
    null;

  // Ensure users who already created an org before entering the wizard resume at >= Step 2 if needed.
  const effectiveProfile =
    activeOrg && !profile.orgId
      ? { ...profile, orgId: activeOrg.orgId, currentStep: Math.max(2, profile.currentStep) }
      : !activeOrg && profile.currentStep > 1
        ? { ...profile, currentStep: 1 }
        : profile;

  const [iecs, summary] = activeOrg
    ? await Promise.all([
        listIecProfilesWithAlerts(activeOrg.orgId),
        getDashboardSummary(activeOrg.orgId),
      ])
    : [[], null];

  return (
    <OnboardingWizard
      initialProfile={effectiveProfile}
      initialOrg={activeOrg}
      initialIecs={iecs}
      initialSummary={summary}
    />
  );
}

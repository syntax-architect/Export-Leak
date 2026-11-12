import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ShippingBillReview } from "@/components/app/shipping-bill-review";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listUserOrganizations } from "@/lib/auth/repository";
import { getShippingBillForReview } from "@/lib/documents/parse-repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review Shipping Bill",
};

export default async function ShippingBillReviewPage({
  params,
}: {
  params: Promise<{ sbId: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/shipping-bills");

  const organizations = await listUserOrganizations(user.id);
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const { sbId } = await params;

  let bill;
  try {
    bill = await getShippingBillForReview({
      orgId: activeOrg.orgId,
      sbId,
    });
  } catch {
    notFound();
  }

  return <ShippingBillReview bill={bill} role={activeOrg.role} />;
}

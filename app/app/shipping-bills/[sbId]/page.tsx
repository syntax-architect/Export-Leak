import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ShippingBillDetail } from "@/components/app/shipping-bill-detail";
import { ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listUserOrganizations } from "@/lib/auth/repository";
import { getShipmentDetailForOrg } from "@/lib/dashboard/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shipping Bill Timeline",
};

export default async function ShippingBillDetailPage({
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

  let detail;
  try {
    detail = await getShipmentDetailForOrg(activeOrg.orgId, sbId);
  } catch {
    notFound();
  }

  return <ShippingBillDetail detail={detail} role={activeOrg.role} />;
}

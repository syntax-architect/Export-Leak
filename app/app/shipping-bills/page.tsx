import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShippingBillsList } from "@/components/app/shipping-bills-list";
import { ACTIVE_IEC_COOKIE, ACTIVE_ORG_COOKIE, getAuthenticatedUser } from "@/lib/auth/org-access";
import { listUserOrganizations } from "@/lib/auth/repository";
import { listShippingBillsForOrg } from "@/lib/documents/parse-repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shipping Bills",
};

export default async function ShippingBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login?next=/app/shipping-bills");

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const requestedIecId = cookieStore.get(ACTIVE_IEC_COOKIE)?.value ?? null;

  const [organizations] = await Promise.all([listUserOrganizations(user.id)]);
  const activeOrg = organizations.find((o) => o.orgId === activeOrgId) ?? organizations[0];
  if (!activeOrg) redirect("/onboarding");

  const [{ status }, data] = await Promise.all([
    searchParams,
    listShippingBillsForOrg({
      orgId: activeOrg.orgId,
      iecId: requestedIecId,
    }),
  ]);

  return (
    <ShippingBillsList
      initialRows={data.shippingBills}
      initialSummary={data.summary}
      initialFilter={status ?? "all"}
    />
  );
}

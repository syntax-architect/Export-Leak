import { AcceptInviteCard } from "@/components/auth/accept-invite-card";
import { getAuthenticatedUser } from "@/lib/auth/org-access";
import { getInvitePreview } from "@/lib/auth/repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team Invitation",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, user] = await Promise.all([getInvitePreview(token), getAuthenticatedUser()]);

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-bg px-4 py-10">
      <AcceptInviteCard
        token={token}
        orgName={preview.orgName}
        invitedEmail={preview.email}
        role={preview.role}
        status={preview.status}
        signedInEmail={user?.email ?? null}
      />
    </main>
  );
}

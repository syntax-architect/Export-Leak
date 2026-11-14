import type { Metadata } from "next";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { UnsubscribeView } from "@/components/notifications/unsubscribe-view";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Email Preferences & Unsubscribe | ${APP_CONFIG.name}`,
  description: `Manage your notification preferences or unsubscribe from ${APP_CONFIG.name} automated alerts with 1 click.`,
};

export default async function UnsubscribePage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <PublicHeader />
      <main className="flex-1 py-12 px-4 sm:px-6">
        <div className="mx-auto max-w-xl">
          <UnsubscribeView token={token} />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

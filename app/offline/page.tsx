import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff, Home, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfflineRetryButton } from "@/components/pwa/offline-retry-button";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Offline Mode | ${APP_CONFIG.name}`,
  description: "You are currently offline. Check your internet connection.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12 text-text"
    >
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border-subtle bg-surface p-6 sm:p-8 text-center shadow-[var(--shadow-md)] space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-soft text-warning">
          <WifiOff className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text">
            You&apos;re Currently Offline
          </h1>
          <p className="text-sm text-text-muted leading-relaxed">
            Your connection to the network was interrupted. Any unsaved export documents or matches
            will be preserved once you reconnect.
          </p>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/50 p-4 text-xs text-text-muted text-left space-y-2">
          <div className="flex items-center gap-2 font-semibold text-text">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <span>Zero Data Loss Protection</span>
          </div>
          <p>
            Files and pending reconciliation requests are kept in memory and will not be silently
            dropped.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <OfflineRetryButton />
          <Button asChild variant="secondary" className="flex-1 min-h-11">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              <span>Back Home</span>
            </Link>
          </Button>
        </div>

        <div className="border-t border-border-subtle pt-4 text-xs text-text-muted">
          Need urgent help? WhatsApp support:{" "}
          <a
            href={`https://wa.me/${APP_CONFIG.whatsappNumber.replace(/[^0-9]/g, "")}?text=Hi%20${encodeURIComponent(APP_CONFIG.name)}%20Support`}
            className="font-medium text-accent hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {APP_CONFIG.whatsappNumber}
          </a>
        </div>
      </div>
    </main>
  );
}

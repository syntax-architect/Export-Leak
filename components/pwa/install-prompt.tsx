"use client";

import * as React from "react";
import { Download, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Track visit count
    const visitKey = "exportleak_visit_count";
    const dismissedKey = "exportleak_pwa_dismissed";
    const currentVisits = parseInt(localStorage.getItem(visitKey) || "0", 10);
    const newVisits = currentVisits + 1;
    localStorage.setItem(visitKey, newVisits.toString());

    const isDismissed = localStorage.getItem(dismissedKey) === "true";

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Only show after the 2nd visit and if not previously dismissed
      if (newVisits >= 2 && !isDismissed) {
        setShowPrompt(true);
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setShowPrompt(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("exportleak_pwa_dismissed", "true");
    }
  }

  if (!showPrompt) return null;

  return (
    <aside
      aria-label="Install application banner"
      className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-lg)] sm:bottom-6 sm:left-auto sm:right-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text">Install {APP_CONFIG.name}</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Add to your home screen for quick, one-tap access to your export claims and eBRC tools.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleInstall}
              className="min-h-9 px-3 text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              <span>Install App</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="min-h-9 px-3 text-xs text-text-muted hover:text-text"
            >
              Maybe later
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-text-muted hover:text-text p-1 -mt-1 -mr-1 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss install banner"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

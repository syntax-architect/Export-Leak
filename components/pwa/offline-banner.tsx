"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

function getNetworkSnapshot(): boolean {
  return typeof navigator !== "undefined" ? !navigator.onLine : false;
}

function getServerNetworkSnapshot(): boolean {
  return false;
}

function subscribeToNetwork(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function OfflineBanner() {
  const isOffline = React.useSyncExternalStore(
    subscribeToNetwork,
    getNetworkSnapshot,
    getServerNetworkSnapshot
  );

  const [showReconnected, setShowReconnected] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const prevOfflineRef = React.useRef(isOffline);

  React.useEffect(() => {
    if (prevOfflineRef.current && !isOffline) {
      // Transitioned from offline to online
      setShowReconnected(true);
      const timer = window.setTimeout(() => setShowReconnected(false), 3500);
      return () => window.clearTimeout(timer);
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline]);

  const checkConnection = React.useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setShowReconnected(true);
        window.setTimeout(() => setShowReconnected(false), 3500);
      }
    } catch {
      // Remains offline
    } finally {
      setIsChecking(false);
    }
  }, []);

  if (!isOffline && !showReconnected) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-40 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium shadow-sm transition-all duration-200",
        isOffline
          ? "border-b border-warning/40 bg-warning-soft text-warning-soft-fg"
          : "border-b border-success/40 bg-success-soft text-success-soft-fg"
      )}
    >
      <div className="flex items-center gap-2">
        {isOffline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <strong>Offline mode:</strong> You are currently disconnected. Changes are preserved
              and will synchronize once connection is restored.
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <strong>Connection restored:</strong> Your workspace is synchronized and live.
            </span>
          </>
        )}
      </div>

      {isOffline && (
        <button
          type="button"
          onClick={checkConnection}
          disabled={isChecking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-warning/50 bg-surface px-2.5 py-1 text-xs font-semibold text-text shadow-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isChecking && "animate-spin")}
            aria-hidden="true"
          />
          <span>{isChecking ? "Checking..." : "Retry"}</span>
        </button>
      )}
    </aside>
  );
}

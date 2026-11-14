"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";

export function PwaRegistrar() {
  const { toast } = useToast();

  React.useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Listen for SW updates
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.onstatechange = () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                // New content available
                toast({
                  title: "Update Available",
                  description: "A new version of ExportLeak is available. Refresh to update.",
                  variant: "default",
                });
              }
            };
          };
        })
        .catch(() => {
          // Fail silently in development or unsupported environments
        });
    }

    // 2. Monitor Network Connectivity
    function handleOnline() {
      toast({
        title: "Connection Restored",
        description: "You are back online. Pending tasks and uploads will resume.",
        variant: "default",
      });
      window.dispatchEvent(new CustomEvent("exportleak:online"));
    }

    function handleOffline() {
      toast({
        title: "You are Offline",
        description: "Network connection lost. Your data will be saved safely.",
        variant: "warning",
      });
      window.dispatchEvent(new CustomEvent("exportleak:offline"));
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  return null;
}

"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { APP_CONFIG } from "@/config/app";

export function PwaRegistrar() {
  const { toast } = useToast();

  React.useEffect(() => {
    // In development mode, NEVER register service worker, and proactively unregister any
    // existing workers and wipe cache storage to prevent stale Turbopack chunk collisions and HMR rebuild loops.
    if (process.env.NODE_ENV !== "production") {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
        if ("caches" in window) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name);
            }
          });
        }
      }
      return;
    }

    // 1. Register Service Worker in production only
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
                  description: `A new version of ${APP_CONFIG.name} is available. Refresh to update.`,
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

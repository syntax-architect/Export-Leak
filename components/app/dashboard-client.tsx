"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProductTour } from "@/components/app/product-tour";
import { LeakageDashboardWorkspace } from "@/components/dashboard/leakage-dashboard-workspace";
import type { LeakageDashboardData } from "@/lib/dashboard/repository";
import type { MembershipRole } from "@/lib/database.types";
import type { DashboardSummary } from "@/lib/onboarding/repository";

export interface DashboardClientProps {
  summary: DashboardSummary;
  leakageData: LeakageDashboardData;
  activeIecId: string | null;
  role: MembershipRole;
  initialTourOpen: boolean;
}

export function DashboardClient({
  summary,
  leakageData,
  activeIecId,
  role,
  initialTourOpen,
}: DashboardClientProps) {
  const router = useRouter();
  const [tourOpen, setTourOpen] = React.useState(initialTourOpen);

  React.useEffect(() => {
    function handleReplayEvent() {
      setTourOpen(true);
      void fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayTour: true, eventType: "tour_started" }),
      });
    }

    window.addEventListener("exportleak:replay-tour", handleReplayEvent);
    return () => {
      window.removeEventListener("exportleak:replay-tour", handleReplayEvent);
    };
  }, []);

  async function handleCloseTour(completed: boolean) {
    setTourOpen(false);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markTourCompleted: true,
        eventType: completed ? "tour_completed" : "tour_dismissed",
      }),
    });
    router.refresh();
  }

  function handleReplayFromSummary() {
    setTourOpen(true);
    void fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replayTour: true, eventType: "tour_started" }),
    });
  }

  return (
    <>
      <LeakageDashboardWorkspace
        summary={summary}
        initialData={leakageData}
        activeIecId={activeIecId}
        role={role}
        onReplayTour={handleReplayFromSummary}
      />
      <ProductTour open={tourOpen} onClose={handleCloseTour} />
    </>
  );
}

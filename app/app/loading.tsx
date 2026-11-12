import { Card, CardContent } from "@/components/ui/card";

export default function AppDashboardLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-surface-muted" />
          <div className="h-3.5 w-72 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="h-10 w-44 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
              <div className="h-8 w-36 animate-pulse rounded bg-surface-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 w-full animate-pulse rounded bg-surface-muted/70" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

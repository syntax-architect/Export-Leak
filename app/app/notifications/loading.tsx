import { Card, CardContent } from "@/components/ui/card";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Alerts & Settings">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-muted/70" />
      </div>

      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
        <div className="h-8 w-24 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
        <div className="h-8 w-28 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
                  <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
                </div>
                <div className="h-3.5 w-72 animate-pulse rounded bg-surface-muted/60" />
              </div>
              <div className="h-8 w-24 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

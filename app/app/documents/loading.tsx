import { Card, CardContent } from "@/components/ui/card";

export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Documents">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-surface-muted/70" />
        </div>
      </div>

      {/* Upload Dropzone Skeleton */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-5 w-52 animate-pulse rounded bg-surface-muted" />
          <div className="h-3.5 w-80 animate-pulse rounded bg-surface-muted/60" />
          <div className="h-9 w-36 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
        </CardContent>
      </Card>

      {/* Document List Skeleton */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <div className="h-8 w-48 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-48 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-muted/60" />
              </div>
              <div className="h-6 w-24 animate-pulse rounded-full bg-surface-muted/70" />
              <div className="h-8 w-16 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

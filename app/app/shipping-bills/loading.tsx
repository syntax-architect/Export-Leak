import { Card, CardContent } from "@/components/ui/card";

export default function ShippingBillsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Shipping Bills">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-surface-muted/70" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="h-4 w-60 animate-pulse rounded bg-surface-muted" />
          <div className="flex gap-2">
            <div className="h-8 w-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="h-8 w-28 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
            <div className="h-8 w-24 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle p-4">
          <div className="h-4 w-36 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-surface-muted/60" />
              </div>
              <div className="hidden sm:block space-y-1.5 flex-1">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
                <div className="h-3 w-28 animate-pulse rounded bg-surface-muted/60" />
              </div>
              <div className="h-5 w-24 animate-pulse rounded bg-surface-muted" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-surface-muted/70" />
              <div className="h-8 w-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

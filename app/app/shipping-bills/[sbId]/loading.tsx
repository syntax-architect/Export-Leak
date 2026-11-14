import { Card, CardContent } from "@/components/ui/card";

export default function ShippingBillDetailLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Shipping Bill detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-muted/70" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
              <div className="h-6 w-36 animate-pulse rounded bg-surface-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted/60" />
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";

export default function ShippingBillReviewLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Shipping Bill review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-52 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-surface-muted/70" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="h-5 w-36 animate-pulse rounded bg-surface-muted" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted/60"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="h-5 w-36 animate-pulse rounded bg-surface-muted" />
            <div className="h-64 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted/50" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

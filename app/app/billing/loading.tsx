import { Card, CardContent } from "@/components/ui/card";

export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading Billing & Usage">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-surface-muted/70" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-5">
            <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
            <div className="h-4 w-60 animate-pulse rounded bg-surface-muted/60" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2">
              <div className="h-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted/70" />
              <div className="h-20 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted/70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="h-5 w-28 animate-pulse rounded bg-surface-muted" />
            <div className="h-10 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";

export default function MatchesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading IRM matching workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-surface-muted" />
          <div className="h-3.5 w-72 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-[var(--radius-sm)] bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
              <div className="h-7 w-20 animate-pulse rounded bg-surface-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded bg-surface-muted/70" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded bg-surface-muted/70" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

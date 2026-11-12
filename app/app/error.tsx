"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <CardTitle className="text-lg">Unable to load this workspace view</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted">
            {error?.message?.trim() || "Something went wrong while loading your export data."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => reset()} className="min-h-11">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Try again</span>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <Link href="/app">Back to overview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

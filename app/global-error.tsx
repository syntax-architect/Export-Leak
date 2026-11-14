"use client";

import * as React from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // In production, log to observability/monitoring
    console.error("Global application boundary caught error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-900 text-neutral-100 antialiased flex items-center justify-center p-4">
        <main
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 text-center shadow-2xl space-y-6"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-950/60 text-red-400 border border-red-800/50">
            <AlertOctagon className="h-7 w-7" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">System Encountered an Issue</h1>
            <p className="text-sm text-neutral-400 leading-relaxed">
              We experienced an unexpected application error while loading the root view. Your data
              and export files remain safe and protected.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reload Application</span>
            </button>
            <Link
              href="/"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
            >
              Home Page
            </Link>
          </div>

          {error?.digest ? (
            <p className="text-[11px] text-neutral-500">
              Reference code: <code className="font-mono text-neutral-400">{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

import Link from "next/link";
import { ArrowLeft, FileQuestion, Home, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `Page Not Found | ${APP_CONFIG.name}`,
  description: "The page you are looking for could not be found.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted text-text-muted">
        <FileQuestion className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>

      <span className="mt-4 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        404 — Not Found
      </span>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-text sm:text-3xl">
        Page could not be located
      </h1>

      <p className="mt-2 max-w-md text-sm text-text-muted leading-relaxed">
        The page you requested does not exist, has been archived, or you may need to switch to
        another organization or sign in.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="primary" className="min-h-11">
          <Link href="/app">
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Go to Workspace</span>
          </Link>
        </Button>

        <Button asChild variant="secondary" className="min-h-11">
          <Link href="/tools/calculator">
            <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Free EXIM Tools</span>
          </Link>
        </Button>

        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
        </Button>
      </div>

      <div className="mt-10 max-w-sm rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 text-left shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Popular destinations
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-text">
          <li>
            <Link href="/app/shipping-bills" className="hover:text-primary hover:underline">
              → Shipping Bills & Realisation Tracker
            </Link>
          </li>
          <li>
            <Link href="/app/matches" className="hover:text-primary hover:underline">
              → Bank IRM Reconciliation Workspace
            </Link>
          </li>
          <li>
            <Link href="/app/ebrc" className="hover:text-primary hover:underline">
              → DGFT Bulk eBRC Excel Generator
            </Link>
          </li>
          <li>
            <Link href="/pricing" className="hover:text-primary hover:underline">
              → Plans & Transparent Pricing
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}

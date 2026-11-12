import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  const showDevLinks = process.env.NODE_ENV === "development";

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12 sm:px-6">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold">{APP_CONFIG.name}</CardTitle>
          <CardDescription>{APP_CONFIG.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-text-muted">
            Built for Indian exporters and EXIM/DGFT consultants to reconcile Shipping Bills, bank
            Inward Remittance Messages (IRM), RoDTEP &amp; Duty Drawback incentives, realisation
            deadlines, and bulk eBRC exports.
          </p>
          <p className="text-xs font-medium text-text-muted">
            We never ask for, accept, or store DSC tokens or portal passwords.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild variant="primary">
              <Link href="/login">Get started free</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app">Open workspace</Link>
            </Button>
            {showDevLinks ? (
              <Button asChild variant="ghost">
                <Link href="/design">Design System (/design)</Link>
              </Button>
            ) : null}
          </div>
          <div className="border-t border-border-subtle pt-3 text-xs text-text-muted">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-text">
              Privacy Policy
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { TrustGuaranteesList } from "@/components/trust/trust-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to {APP_CONFIG.name}</span>
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-bold">Privacy Policy</CardTitle>
          <CardDescription>
            Plain-language privacy commitments for {APP_CONFIG.name} users in India.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm leading-relaxed text-text-muted">
          <TrustGuaranteesList />

          <section className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-text">1. What data we collect</h2>
            <p>
              We store your login email, organization details, IEC profile identifiers, uploaded
              Shipping Bill PDFs, IRM exports, customs incentive scrolls, and reconciliation audit
              logs. We never request or store DSC hardware tokens, ICEGATE passwords, DGFT
              passwords, or bank portal credentials.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-text">
              2. Document processing &amp; AI disclosure
            </h2>
            <p>
              Uploaded Shipping Bill PDFs are processed deterministically on our servers first using
              PDF text extraction and pattern/layout matching (without executing PDF JavaScript in a
              browser engine). When scanned PDFs or unusual layouts leave required fields uncertain,
              only the minimum text excerpt needed for those missing fields may be sent to an AI
              structured extraction provider under a strict per-document spend cap. You can disable
              AI fallback at any time per organization in Documents settings—when disabled, all
              uncertain fields go straight to your human review queue and zero text is sent to any
              AI provider.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-text">
              3. Data isolation &amp; India DPDP rights
            </h2>
            <p>
              Every organization&apos;s documents and shipment rows are stored in private storage
              and protected by Postgres Row Level Security. You may export or delete your uploaded
              data at any time or contact {APP_CONFIG.supportEmail} for assistance under
              India&apos;s Digital Personal Data Protection (DPDP) framework.
            </p>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}

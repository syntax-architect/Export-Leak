import * as React from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { TrustGuaranteesList } from "@/components/trust/trust-panel";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `Privacy Policy | ${APP_CONFIG.name}`,
  description:
    "Plain-language privacy commitments, AI processing disclosures, and India DPDP Act compliance for ExportLeak.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-text">Privacy Policy</h1>
              <CardDescription>
                Plain-language privacy commitments and Digital Personal Data Protection (DPDP) Act
                disclosures for {APP_CONFIG.name} users in India.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 text-sm leading-relaxed text-text-muted">
              <TrustGuaranteesList />

              <section className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-text">1. What Data We Collect</h2>
                <p>
                  We store your login email address, company name, Importer Exporter Code (IEC)
                  identifiers, GSTIN (if provided), uploaded Shipping Bill PDFs, Inward Remittance
                  Message (IRM) exports, customs incentive scrolls, and application audit logs.
                </p>
                <p>
                  <strong>What we never collect:</strong> We never request, accept, or store your
                  DSC hardware tokens, ICEGATE passwords, DGFT credentials, or banking portal login
                  details.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-text">
                  2. Document Processing &amp; AI Disclosure
                </h2>
                <p>
                  Uploaded Shipping Bill PDFs are processed deterministically on our secure servers
                  first using high-speed text extraction and regex pattern matching without
                  executing PDF JavaScript in a browser engine.
                </p>
                <p>
                  When scanned PDFs or unusual print layouts leave specific required fields
                  uncertain, only the minimal text excerpt necessary for those missing fields may be
                  processed via an AI structured extraction provider under a strict per-document
                  spend cap.
                </p>
                <p>
                  <strong>Opt-Out Control:</strong> You can completely disable the AI fallback pass
                  for your organization at any time in Documents Settings. When disabled, all
                  uncertain fields route directly to your human review queue, and zero document text
                  is sent to any AI provider.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-text">
                  3. India DPDP Act 2023 &amp; Data Subject Rights
                </h2>
                <p>
                  We respect all rights established under the Digital Personal Data Protection Act
                  (DPDP), 2023 of India, including:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    <strong>Right to Access:</strong> You can review all records stored about your
                    IEC and organization at any time.
                  </li>
                  <li>
                    <strong>Right to Correction:</strong> You can edit and correct parsed shipping
                    bills and matching records directly in the workspace.
                  </li>
                  <li>
                    <strong>Right to Portability &amp; Export:</strong> You can download all your
                    data in JSON format using the &ldquo;Export my data&rdquo; button, even after
                    plan cancellation.
                  </li>
                  <li>
                    <strong>Right to Erasure / Deletion:</strong> You can delete documents or
                    request complete account deletion by contacting {APP_CONFIG.supportEmail}.
                  </li>
                </ul>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-text">
                  4. Data Retention &amp; Soft-Delete Purge
                </h2>
                <p>
                  Deleted documents are soft-deleted immediately and permanently purged from server
                  storage after a 30-day recovery window. Active records are retained for as long as
                  your organization account remains open, ensuring you never lose historical
                  compliance records required under Indian customs audit rules.
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-text">
                  5. Contact Our Privacy Officer
                </h2>
                <p>
                  For any privacy inquiries or to exercise your DPDP rights, please write to us at{" "}
                  <a
                    href={`mailto:${APP_CONFIG.supportEmail}`}
                    className="font-medium text-text underline hover:text-accent"
                  >
                    {APP_CONFIG.supportEmail}
                  </a>
                  .
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

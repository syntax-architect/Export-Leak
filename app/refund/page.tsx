import * as React from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `Refund & Cancellation Policy | ${APP_CONFIG.name}`,
  description:
    "Plain-language, fair refund and cancellation policy for ExportLeak Indian exporter and consultant subscriptions.",
};

export default function RefundPolicyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main id="main-content" className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                <RefreshCw className="h-5 w-5" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-text">
                Refund &amp; Cancellation Policy
              </h1>
              <CardDescription>
                Fair, transparent commitments for Indian exporters. No dark patterns or hidden
                cancellation fees.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 text-sm leading-relaxed text-text-muted">
              {/* Highlight Banner */}
              <div className="rounded-[var(--radius-sm)] border border-success/30 bg-success-soft/30 p-4 text-text">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-success mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold text-text">
                      7-Day 100% Money-Back Guarantee on First Paid Charge
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      If you subscribe to an Exporter or Consultant plan and decide within 7
                      calendar days of your initial charge that {APP_CONFIG.name} does not meet your
                      needs, simply email us or ping us on WhatsApp for a full 100% refund.
                    </p>
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">
                  1. Card-Free 7-Day Trial First
                </h2>
                <p>
                  We believe in earning your trust before asking for your money. Every new
                  organization automatically receives a card-free 7-day Pro Trial upon uploading
                  their first document. No payment details, UPI Autopay mandate, or credit card are
                  ever collected for the trial.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">
                  2. Self-Serve 1-Click Cancellation
                </h2>
                <p>
                  You can cancel your subscription at any time directly from the in-app Billing page
                  (&ldquo;Cancel subscription&rdquo;). We do not require you to call us, send
                  certified letters, or navigate retention obstacle courses.
                </p>
                <p>When you cancel:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    Your subscription will not renew, and no future charges will be initiated
                    against your payment method or UPI mandate.
                  </li>
                  <li>
                    You will retain 100% access to all plan entitlements through the end of your
                    current prepaid billing period.
                  </li>
                  <li>
                    At the end of your prepaid period, your account moves gently to the Free tier.
                    All your uploaded PDFs, parsed Shipping Bills, matched IRMs, and export records
                    remain permanently readable.
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">
                  3. Refund Eligibility &amp; Windows
                </h2>
                <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border-subtle">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted border-b border-border-subtle text-text">
                      <tr>
                        <th className="px-3.5 py-2.5 font-semibold">Subscription Type</th>
                        <th className="px-3.5 py-2.5 font-semibold">Refund Window</th>
                        <th className="px-3.5 py-2.5 font-semibold">Policy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      <tr>
                        <td className="px-3.5 py-2.5 font-medium text-text">
                          Monthly (First Charge)
                        </td>
                        <td className="px-3.5 py-2.5">Within 7 calendar days</td>
                        <td className="px-3.5 py-2.5 text-success">
                          100% full refund upon request
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-medium text-text">
                          Annual (First Charge)
                        </td>
                        <td className="px-3.5 py-2.5">Within 14 calendar days</td>
                        <td className="px-3.5 py-2.5 text-success">
                          100% full refund upon request
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2.5 font-medium text-text">Subsequent Renewals</td>
                        <td className="px-3.5 py-2.5">After billing period starts</td>
                        <td className="px-3.5 py-2.5 text-text-muted">
                          Non-refundable once billing cycle begins; cancel anytime to prevent future
                          renewal
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">4. How to Request a Refund</h2>
                <p>
                  To request a refund within your eligible guarantee window, contact our team with
                  your registered email address and organization name:
                </p>
                <div className="rounded-[var(--radius-sm)] bg-surface-muted p-3 text-xs space-y-1">
                  <p>
                    <strong className="text-text">Email:</strong>{" "}
                    <a
                      href={`mailto:${APP_CONFIG.supportEmail}`}
                      className="underline hover:text-accent"
                    >
                      {APP_CONFIG.supportEmail}
                    </a>
                  </p>
                  <p>
                    <strong className="text-text">WhatsApp Helpline:</strong>{" "}
                    {APP_CONFIG.whatsappNumber}
                  </p>
                  <p>
                    <strong className="text-text">Subject line:</strong> Refund Request - [Your Org
                    Name]
                  </p>
                </div>
                <p className="text-xs">
                  Approved refunds are processed through Razorpay back to your original payment
                  method (bank account, UPI handle, or card) within 5 to 7 business days in
                  accordance with banking settlement guidelines.
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

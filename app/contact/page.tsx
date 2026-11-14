import * as React from "react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ContactForm } from "@/components/contact/contact-form";
import { Mail, MessageSquare, Clock, MapPin } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

export const metadata = {
  title: `Contact & Support | ${APP_CONFIG.name}`,
  description:
    "Get support for ExportLeak export incentive tracking, DGFT bulk eBRC, or billing inquiries via email and WhatsApp.",
};

export default function ContactPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main id="main-content" className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-text">
              We&apos;re here to help Indian exporters
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-text-muted">
              Have questions about RoDTEP discrepancies, bulk eBRC generation, or your subscription?
              Our EXIM support team is ready to assist you.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Direct Channels */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Direct Assistance</CardTitle>
                <CardDescription className="text-xs">
                  Reach out directly via our official channels.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text">Official Email Support</h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      For technical support, billing inquiries, or document feedback:
                    </p>
                    <a
                      href={`mailto:${APP_CONFIG.supportEmail}`}
                      className="mt-1 inline-block text-xs font-semibold text-accent underline hover:text-accent/80"
                    >
                      {APP_CONFIG.supportEmail}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-success-soft text-success">
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text">WhatsApp Helpline</h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      Fast response for urgent file parsing or eBRC deadline queries:
                    </p>
                    <p className="mt-1 text-xs font-semibold text-text">
                      {APP_CONFIG.whatsappNumber}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-text-muted">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text">Response Time SLA</h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      Monday to Saturday: 9:30 AM to 6:30 PM IST (Asia/Kolkata). We aim to respond
                      to all inquiries within 24 business hours.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-text-muted">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text">Registered Office Address</h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      ExportLeak Solutions Private Limited (incorporation in progress)
                      <br />
                      Anna Salai, Chennai, Tamil Nadu 600002, India
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Inquiry Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Send us a message</CardTitle>
                <CardDescription className="text-xs">
                  Fill in your details and our team will get back to you promptly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

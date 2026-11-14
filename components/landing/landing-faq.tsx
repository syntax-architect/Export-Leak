"use client";

import * as React from "react";
import { ChevronDown, HelpCircle, Shield, Lock, FileCheck2, CreditCard } from "lucide-react";
import { APP_CONFIG } from "@/config/app";

interface FaqItem {
  question: string;
  answer: string;
  icon?: React.ElementType;
}

const FAQS: FaqItem[] = [
  {
    question: "Do you need my DGFT or ICEGATE password, or my DSC token? Never.",
    answer: `No. We never ask for, accept, or store your Digital Signature Certificate (DSC) USB tokens, ICEGATE credentials, or DGFT portal passwords. You download your Shipping Bill PDFs and bank IRM spreadsheets directly from official portals yourself and upload them to ${APP_CONFIG.name}. Your government access remains 100% in your hands.`,
    icon: Lock,
  },
  {
    question: "How do I know my RoDTEP and Drawback calculations are accurate?",
    answer: `${APP_CONFIG.name} uses official effective-dated rate schedules published by DGFT (Appendix 4R notifications) and Central Board of Indirect Taxes and Customs (AIR Drawback). Calculations strictly implement both value-based percentages and per-unit caps (e.g. min(rate% × FOB, cap × quantity)) using integer minor unit math. We show you the exact formula and source notification on every single line item.`,
    icon: FileCheck2,
  },
  {
    question: "Will DGFT accept the generated bulk eBRC Excel file without format errors?",
    answer:
      "Yes. The bulk eBRC generator matches the exact column structure, worksheet naming, IFSC format, RBI purpose codes, port codes, and validation rules specified in DGFT's official guidelines. Our validator catches format errors, invalid AD codes, and currency mismatches before you upload to DGFT, ensuring zero rejections.",
    icon: Shield,
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes, absolutely. You can cancel your subscription with one click at any time from your Billing page. If you cancel, you will maintain full access until the end of your prepaid billing period, and your card or UPI Autopay mandate will never be charged again.",
    icon: CreditCard,
  },
  {
    question: "What happens to my data if I stop paying or my trial ends?",
    answer:
      "You keep permanent read access to all your past shipping bills, payment matches, and incentive calculations on the Free tier. You can also export all your data anytime as structured JSON and Excel. We never hold your compliance records hostage.",
    icon: HelpCircle,
  },
  {
    question: "How does the card-free 7-day Pro trial work?",
    answer:
      "When you sign up and upload your first shipping bill, the 7-day Pro trial activates automatically. You get full access to the Exporter plan features—including bulk eBRC Excel generation, automated alerts, and full reconciliation—without entering any credit card, debit card, or UPI details.",
  },
  {
    question: "Can an EXIM Consultant manage multiple client IECs in one account?",
    answer:
      "Yes. Our Consultant plan allows managing up to 25 client IECs with a shared monthly shipping bill quota, a client switcher dropdown in the top bar, and per-client notification preferences so each client receives only their own relevant alerts.",
  },
];

export function LandingFaq() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  function toggle(idx: number) {
    setOpenIndex((curr) => (curr === idx ? null : idx));
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {FAQS.map((faq, idx) => {
        const isOpen = openIndex === idx;
        const Icon = faq.icon;

        return (
          <div
            key={idx}
            className="rounded-[var(--radius-card)] border border-border-subtle bg-surface transition-colors"
          >
            <button
              type="button"
              onClick={() => toggle(idx)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between p-4 sm:p-5 text-left transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[var(--radius-card)]"
            >
              <div className="flex items-center gap-3 pr-4">
                {Icon ? <Icon className="h-4 w-4 text-accent shrink-0" /> : null}
                <span className="text-sm font-semibold text-text">{faq.question}</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-text-muted shrink-0 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-xs text-text-muted leading-relaxed border-t border-border-subtle pt-3 animate-in fade-in-50 duration-150">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

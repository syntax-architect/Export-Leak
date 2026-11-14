import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowRight, ShieldCheck, Tag, AlertTriangle } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GLOSSARY_TERMS } from "@/lib/seo/glossary";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `Indian EXIM & Export Incentive Compliance Glossary | ${APP_CONFIG.name}`,
  description:
    "Plain-language guide to Indian export incentives, DGFT regulations, bank eBRCs, RoDTEP, and FEMA statutory realisation compliance. Reviewed by EXIM experts.",
  alternates: {
    canonical: "/learn",
  },
  openGraph: {
    title: `Indian EXIM & Export Compliance Guide | ${APP_CONFIG.name}`,
    description:
      "Avoid EDPMS caution-listing and reclaim lost export money. Complete beginner-to-expert guide for exporters.",
  },
};

export default function LearnIndexPage() {
  const categories = Array.from(new Set(GLOSSARY_TERMS.map((t) => t.category)));

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      <main
        id="main-content"
        className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full"
      >
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/30 px-3.5 py-1 text-xs font-medium text-accent">
            <BookOpen className="h-3.5 w-3.5" />
            <span>EXIM Trade Compliance Knowledge Base</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-text">
            The Exporter&apos;s Guide to Incentives, Banking &amp; DGFT Compliance
          </h1>
          <p className="text-sm leading-relaxed text-text-muted">
            Clear, authoritative explanations of Indian foreign trade terms, FEMA realization
            deadlines, common costly mistakes, and statutory filing guidelines.
          </p>
        </div>

        {/* Categories & Term Cards */}
        <div className="space-y-12">
          {categories.map((category) => {
            const terms = GLOSSARY_TERMS.filter((t) => t.category === category);
            return (
              <section key={category} className="space-y-4">
                <div className="border-b border-border-subtle pb-2">
                  <h2 className="text-lg font-bold text-text flex items-center gap-2">
                    <Tag className="h-4 w-4 text-accent" />
                    <span>{category}</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {terms.map((item) => (
                    <Card
                      key={item.slug}
                      className="group flex flex-col justify-between transition-all hover:border-accent hover:shadow-[var(--shadow-sm)]"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="accent" className="font-mono text-xs">
                            {item.term}
                          </Badge>
                          <span className="text-[10px] text-text-muted">
                            Updated {item.lastReviewed}
                          </span>
                        </div>
                        <CardTitle className="text-base group-hover:text-accent transition-colors">
                          <Link href={`/learn/${item.slug}`} className="focus:outline-none">
                            {item.fullTitle}
                          </Link>
                        </CardTitle>
                        <CardDescription className="text-xs line-clamp-3 mt-1 leading-normal">
                          {item.shortDescription}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="border-t border-border-subtle pt-3 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-danger font-medium flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>{item.commonMistakes.length} costly mistakes</span>
                          </span>
                          <Link
                            href={`/learn/${item.slug}`}
                            className="font-semibold text-accent hover:underline flex items-center gap-1"
                          >
                            <span>Read guide</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Bottom Reviewer Note */}
        <div className="mt-16 rounded-[var(--radius-card)] border border-border-subtle bg-surface-muted/30 p-5 text-center text-xs text-text-muted space-y-1">
          <p className="font-semibold text-text flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>
              Regularly Reviewed &amp; Certified by DGFT &amp; Customs Compliance Practitioners
            </span>
          </p>
          <p>
            All guides reflect Foreign Trade Policy 2023, RBI Master Directions, and current customs
            duty drawback schedules.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

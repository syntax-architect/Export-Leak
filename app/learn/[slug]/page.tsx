import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  UserCheck,
  ArrowRight,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GLOSSARY_TERMS, getGlossaryTerm } from "@/lib/seo/glossary";
import { APP_CONFIG } from "@/config/app";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return GLOSSARY_TERMS.map((term) => ({
    slug: term.slug,
  }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const term = getGlossaryTerm(slug);
  if (!term) return { title: "Term Not Found" };

  return {
    title: `${term.term} (${term.fullTitle}): Meaning, Rules & Common Mistakes | ${APP_CONFIG.name}`,
    description: term.shortDescription,
    alternates: {
      canonical: `/learn/${term.slug}`,
    },
    openGraph: {
      title: `${term.term} Guide for Indian Exporters | ${APP_CONFIG.name}`,
      description: term.shortDescription,
      type: "article",
    },
  };
}

export default async function GlossaryDetailPage(props: PageProps) {
  const { slug } = await props.params;
  const item = getGlossaryTerm(slug);

  if (!item) {
    notFound();
  }

  // JSON-LD Structured Data for DefinedTerm and Article
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: item.term,
    description: item.shortDescription,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Indian EXIM and Export Compliance Terminology",
    },
    dateModified: item.lastReviewed,
    author: {
      "@type": "Organization",
      name: APP_CONFIG.name,
    },
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-text">
      <PublicHeader />

      {/* JSON-LD Script */}
      <script
        id="glossary-term-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-8">
        {/* Breadcrumb Navigation */}
        <nav
          className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-text transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/learn" className="hover:text-text transition-colors">
            Learn EXIM
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text font-medium" aria-current="page">
            {item.term}
          </span>
        </nav>

        {/* Header Block */}
        <div className="space-y-4 border-b border-border-subtle pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent" className="font-mono text-xs px-2.5 py-0.5">
              {item.category}
            </Badge>
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>Last reviewed: {item.lastReviewed}</span>
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-text">
            {item.term}: {item.fullTitle}
          </h1>

          <p className="text-sm sm:text-base leading-relaxed text-text-muted">
            {item.shortDescription}
          </p>
        </div>

        {/* Main Plain-Language Explanation */}
        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-text flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <span>How {item.term} Works in Indian Export Trade</span>
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-text-muted">
            {item.explanation.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>

        {/* Statutory Rules & Guidelines */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success" />
            <span>Statutory Regulations &amp; Legal Framework</span>
          </h2>
          <ul className="space-y-2 text-xs sm:text-sm text-text-muted list-disc list-inside bg-surface-muted/30 p-4 rounded-[var(--radius-card)] border border-border-subtle">
            {item.statutoryRules.map((rule, i) => (
              <li key={i} className="leading-relaxed">
                <span className="text-text font-medium">{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Common Mistakes & How to Avoid Them */}
        <section className="space-y-4">
          <div className="border-b border-border-subtle pb-2">
            <h2 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
              <span>Costly Mistakes Indian Exporters Make with {item.term}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {item.commonMistakes.map((mistake, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/5 p-4 sm:p-5 space-y-2"
              >
                <div className="flex items-center gap-2 text-danger font-semibold text-sm">
                  <span>
                    #{i + 1}. {mistake.title}
                  </span>
                </div>
                <div className="text-xs space-y-1.5 pl-0 sm:pl-4">
                  <p className="text-text">
                    <span className="font-semibold text-danger">The Cost: </span>
                    {mistake.consequence}
                  </p>
                  <p className="text-text-muted">
                    <span className="font-semibold text-success">How to Prevent It: </span>
                    {mistake.fix}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How ExportLeak Automates It */}
        <section className="rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/20 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-base font-bold text-text">
              How {APP_CONFIG.name} Automates {item.term} Compliance
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            {item.howExportLeakHelps}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {item.relatedTool && (
              <Button asChild variant="primary" size="sm" className="min-h-11">
                <Link href={item.relatedTool.href}>
                  <span>{item.relatedTool.ctaText}</span>
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="secondary" size="sm" className="min-h-11">
              <Link href="/login">Start 7-Day Card-Free Trial</Link>
            </Button>
          </div>
        </section>

        {/* Reviewer Note and Certification */}
        <div className="border-t border-border-subtle pt-6 text-xs text-text-muted flex items-start gap-2.5">
          <UserCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-text">Compliance Note: </span>
            <span>{item.reviewerNote}</span>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

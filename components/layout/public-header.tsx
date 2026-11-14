"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, Menu, X } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { Button } from "@/components/ui/button";

export function PublicHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-fg shadow-[var(--shadow-sm)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight text-text">{APP_CONFIG.name}</span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          <Link
            href="/tools/calculator"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Free Tools
          </Link>
          <Link
            href="/learn"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Learn EXIM
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Contact
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Sign in
          </Link>
          <Button asChild variant="primary" size="sm">
            <Link href="/login">Get started free</Link>
          </Button>
        </nav>

        {/* Mobile menu trigger */}
        <div className="flex items-center md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="min-h-11 min-w-11"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-border-subtle bg-surface px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile navigation">
            <Link
              href="/tools/calculator"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Free Tools (Calculator &amp; eBRC)
            </Link>
            <Link
              href="/learn"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Learn EXIM Glossary
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contact
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-text hover:text-accent py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign in
            </Link>
            <div className="pt-2">
              <Button asChild variant="primary" className="w-full">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  Get started free
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

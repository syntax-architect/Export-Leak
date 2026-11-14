"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app";

export function StickyMobileCta() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // Show after scrolling 150px down
    function handleScroll() {
      if (window.scrollY > 150) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 block md:hidden border-t border-border-subtle bg-surface/95 backdrop-blur px-4 py-3 shadow-[var(--shadow-lg)] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] animate-in slide-in-from-bottom-5 duration-200"
      role="complementary"
      aria-label="Mobile Call to Action"
    >
      <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-text">Try {APP_CONFIG.name} Free</span>
          <span className="text-[11px] text-text-muted flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-success shrink-0" />
            <span>7-day Pro trial · Zero DSC / Card</span>
          </span>
        </div>
        <Button asChild variant="primary" size="sm" className="min-h-11 px-4 text-xs font-semibold">
          <Link href="/login">
            <span>Check my shipments free</span>
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

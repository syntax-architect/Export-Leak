"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { APP_CONFIG } from "@/config/app";

export interface TrustGuaranteesProps {
  compact?: boolean;
}

export function TrustGuaranteesList() {
  return (
    <ul className="flex flex-col gap-3 text-sm text-text">
      <li className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-medium text-text">We never ask for DSC or passwords</p>
          <p className="text-xs text-text-muted">
            You download PDFs and CSV/Excel exports yourself and upload them. No portal scraping or
            token sharing ever.
          </p>
        </div>
      </li>
      <li className="flex items-start gap-2.5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-medium text-text">Your files are private to your organization</p>
          <p className="text-xs text-text-muted">
            Every table and storage bucket enforces Postgres Row Level Security scoped strictly to
            your organization&apos;s members.
          </p>
        </div>
      </li>
      <li className="flex items-start gap-2.5">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-medium text-text">Delete your data anytime</p>
          <p className="text-xs text-text-muted">
            Remove sample demo records in one click or delete uploaded files and exports whenever
            you choose.
          </p>
        </div>
      </li>
    </ul>
  );
}

export function TrustPanelTrigger({
  triggerLabel = "Trust & data safety",
}: {
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid="trust-panel-trigger">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>{triggerLabel}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How {APP_CONFIG.name} protects your trade data</DialogTitle>
          <DialogDescription>
            Built for Indian exporters and EXIM consultants with strict tenant isolation.
          </DialogDescription>
        </DialogHeader>
        <TrustGuaranteesList />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-text-muted">
          <span>Questions? Check our privacy commitments.</span>
          <Link href="/privacy" className="font-medium text-accent underline underline-offset-4">
            Read Privacy Policy
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TrustFooterBar() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4 text-xs text-text-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium text-text">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          We never ask for DSC or passwords
        </span>
        <span>Your files are private to your organization</span>
        <span>Delete your data anytime</span>
      </div>
      <div className="flex items-center gap-3">
        <TrustPanelTrigger triggerLabel="Security details" />
        <Link
          href="/privacy"
          className="min-h-11 inline-flex items-center font-medium text-accent underline underline-offset-4"
        >
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}

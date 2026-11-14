"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, XCircle, BellOff, BellRing, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app";

interface UnsubscribeViewProps {
  token: string | null;
}

export function UnsubscribeView({ token }: UnsubscribeViewProps) {
  const [loading, setLoading] = React.useState(Boolean(token));
  const [valid, setValid] = React.useState(false);
  const [unsubscribed, setUnsubscribed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let active = true;

    fetch(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { unsubscribed?: boolean } | null) => {
        if (!active) return;
        if (json) {
          setValid(true);
          setUnsubscribed(Boolean(json.unsubscribed));
        } else {
          setValid(false);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setValid(false);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleToggle(action: "unsubscribe" | "resubscribe") {
    if (!token) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/notifications/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const json = await res.json();
      if (res.ok) {
        setUnsubscribed(action === "unsubscribe");
        setFeedback(json.message);
      } else {
        setFeedback(json.error ?? "Failed to update notification status.");
      }
    } catch {
      setFeedback("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-text-muted">Verifying unsubscribe link...</p>
      </div>
    );
  }

  if (!token || !valid) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text">Invalid Unsubscribe Link</h1>
              <CardDescription>This notification link is invalid or has expired.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted leading-relaxed">
            If you wish to change your notification preferences, please sign in to your workspace or
            contact support at{" "}
            <a
              href={`mailto:${APP_CONFIG.supportEmail}`}
              className="text-accent underline font-medium"
            >
              {APP_CONFIG.supportEmail}
            </a>
            .
          </p>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/login">Sign in to {APP_CONFIG.name}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text">Notification Preferences</h1>
            <CardDescription>{APP_CONFIG.name} Automated Alerts</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {unsubscribed ? (
          <div className="rounded-[var(--radius-sm)] border border-warning/30 bg-warning/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-warning font-semibold text-sm">
              <BellOff className="h-4 w-4 shrink-0" />
              <span>You are unsubscribed</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              You will not receive deadline reminders, scrip expiry notices, or weekly compliance
              digests.
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              Note: You will still receive essential account &amp; billing receipts as required by
              law.
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-text font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span>Currently subscribed</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              You are currently set to receive FEMA realisation deadline notices, scrip expiry
              alerts, and weekly digests.
            </p>
          </div>
        )}

        {feedback ? (
          <p className="text-xs font-medium text-accent bg-accent-soft/30 p-2.5 rounded-[var(--radius-sm)]">
            {feedback}
          </p>
        ) : null}

        <div className="pt-2">
          {unsubscribed ? (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              disabled={submitting}
              onClick={() => handleToggle("resubscribe")}
            >
              <BellRing className="h-4 w-4 mr-2" />
              {submitting ? "Updating..." : "Re-subscribe to compliance alerts"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={submitting}
              onClick={() => handleToggle("unsubscribe")}
            >
              <BellOff className="h-4 w-4 mr-2" />
              {submitting ? "Unsubscribing..." : "Unsubscribe with 1 click"}
            </Button>
          )}
        </div>

        <div className="border-t border-border-subtle pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to {APP_CONFIG.name}</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

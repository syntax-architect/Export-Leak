"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AlertSeverity } from "@/lib/database.types";
import type { StoredAlertItem } from "@/lib/alerts/types";

interface AlertsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  activeIecId?: string | null;
  onAlertUpdated?: () => void;
}

export function AlertsDrawer({
  open,
  onOpenChange,
  orgId,
  activeIecId,
  onAlertUpdated,
}: AlertsDrawerProps) {
  const [alerts, setAlerts] = React.useState<StoredAlertItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [actingId, setActingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    const url = new URL(`/api/orgs/${orgId}/alerts`, window.location.origin);
    url.searchParams.set("status", "open");
    if (activeIecId) {
      url.searchParams.set("iecId", activeIecId);
    }
    if (severityFilter !== "all") {
      url.searchParams.set("severity", severityFilter);
    }

    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : { alerts: [] }))
      .then((json: { alerts?: StoredAlertItem[] }) => {
        if (active) {
          setAlerts(json.alerts ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, orgId, activeIecId, severityFilter]);

  async function handleAction(alertId: string, action: "resolve" | "snooze") {
    setActingId(alertId);
    try {
      const res = await fetch(`/api/orgs/${orgId}/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          snoozeDays: action === "snooze" ? 7 : undefined,
        }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        if (onAlertUpdated) onAlertUpdated();
      }
    } catch {
      // Fallback
    } finally {
      setActingId(null);
    }
  }

  function renderSeverityIcon(severity: AlertSeverity) {
    switch (severity) {
      case "critical":
        return <ShieldAlert className="h-4 w-4 text-danger shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-accent shrink-0" />;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="responsive" className="flex flex-col sm:max-w-md w-full">
        <SheetHeader className="pb-3 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-accent" />
              <SheetTitle>Alerts &amp; Notifications</SheetTitle>
            </div>
            <Badge variant={alerts.length > 0 ? "warning" : "neutral"}>{alerts.length} open</Badge>
          </div>
          <SheetDescription>
            Approaching deadlines, expiring scrips, and compliance actions.
          </SheetDescription>
        </SheetHeader>

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1.5 py-2 border-b border-border-subtle overflow-x-auto">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize cursor-pointer transition-colors ${
                severityFilter === s
                  ? "bg-primary text-primary-fg"
                  : "bg-surface-muted text-text-muted hover:text-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-text-muted">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto opacity-70" />
              <p className="text-sm font-semibold text-text">All caught up!</p>
              <p className="text-xs text-text-muted max-w-[240px] mx-auto">
                No open compliance alerts for the selected criteria.
              </p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {renderSeverityIcon(alert.severity)}
                    <span className="text-xs font-bold text-text truncate max-w-[200px]">
                      {alert.title}
                    </span>
                  </div>
                  <Badge
                    variant={
                      alert.severity === "critical"
                        ? "danger"
                        : alert.severity === "warning"
                          ? "warning"
                          : "accent"
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>

                <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                  {alert.message}
                </p>

                {alert.dueOn ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted font-medium">
                    <Clock className="h-3 w-3" />
                    <span>Due: {alert.dueOn}</span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle text-xs">
                  {alert.shippingBillId ? (
                    <Link
                      href={`/app/shipping-bills/${alert.shippingBillId}`}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-xs"
                    >
                      <span>Open bill</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : alert.kind.startsWith("scrip_") ? (
                    <Link
                      href="/app/incentives"
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-xs"
                    >
                      <span>View scrips</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={actingId === alert.id}
                      onClick={() => handleAction(alert.id, "snooze")}
                      className="text-xs text-text-muted hover:text-text px-2 py-1 rounded-[var(--radius-sm)] hover:bg-surface-muted cursor-pointer"
                    >
                      Snooze 7d
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actingId === alert.id}
                      onClick={() => handleAction(alert.id, "resolve")}
                      className="h-7 text-xs px-2.5"
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Link to Preferences */}
        <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <Link href="/app/notifications" className="inline-flex items-center gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" />
              <span>Alert Settings &amp; Preferences</span>
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            <Link href="/app/notifications">View All</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

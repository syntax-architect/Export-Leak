"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, ExternalLink, CheckCircle2, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { AlertSeverity } from "@/lib/database.types";
import type { StoredAlertItem } from "@/lib/alerts/types";

interface AlertsCentreProps {
  orgId: string;
  initialAlerts: StoredAlertItem[];
  iecs: { id: string; iecCode: string; legalName: string }[];
  isConsultant: boolean;
}

export function AlertsCentre({ orgId, initialAlerts, iecs, isConsultant }: AlertsCentreProps) {
  const [alerts, setAlerts] = React.useState<StoredAlertItem[]>(initialAlerts);
  const [selectedIec, setSelectedIec] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("open");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let active = true;
    const url = new URL(`/api/orgs/${orgId}/alerts`, window.location.origin);
    url.searchParams.set("status", statusFilter);
    if (selectedIec !== "all") {
      url.searchParams.set("iecId", selectedIec);
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
  }, [orgId, selectedIec, statusFilter, severityFilter]);

  async function reloadAlerts() {
    setLoading(true);
    try {
      const url = new URL(`/api/orgs/${orgId}/alerts`, window.location.origin);
      url.searchParams.set("status", statusFilter);
      if (selectedIec !== "all") {
        url.searchParams.set("iecId", selectedIec);
      }
      if (severityFilter !== "all") {
        url.searchParams.set("severity", severityFilter);
      }
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        setAlerts(json.alerts ?? []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }

  async function handleAlertAction(alertId: string, action: "resolve" | "snooze") {
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
        if (statusFilter === "open") {
          setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        } else {
          reloadAlerts();
        }
      }
    } catch {
      // Ignored
    } finally {
      setActingId(null);
    }
  }

  const filteredAlerts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return alerts;
    return alerts.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        (a.sbNumber && a.sbNumber.toLowerCase().includes(q)) ||
        (a.iecCode && a.iecCode.toLowerCase().includes(q))
    );
  }, [alerts, searchQuery]);

  function renderSeverityBadge(severity: AlertSeverity) {
    switch (severity) {
      case "critical":
        return <Badge variant="danger">Critical</Badge>;
      case "warning":
        return <Badge variant="warning">Warning</Badge>;
      default:
        return <Badge variant="accent">Info</Badge>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[var(--radius-card)] border border-border-subtle bg-surface p-3.5">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search alerts or SB #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          {/* Client IEC Selector (for Consultants) */}
          {isConsultant && iecs.length > 1 ? (
            <select
              aria-label="Filter by client IEC"
              value={selectedIec}
              onChange={(e) => setSelectedIec(e.target.value)}
              className="h-10 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <option value="all">All Clients ({iecs.length})</option>
              {iecs.map((iec) => (
                <option key={iec.id} value={iec.id}>
                  {iec.iecCode} - {iec.legalName}
                </option>
              ))}
            </select>
          ) : null}

          {/* Status Filter */}
          <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-subtle p-0.5 bg-surface-muted/50">
            {(["open", "snoozed", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] capitalize cursor-pointer transition-colors ${
                  statusFilter === s
                    ? "bg-surface text-text shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-text-muted ml-1" />
            {(["all", "critical", "warning", "info"] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-1 text-xs font-medium rounded capitalize cursor-pointer transition-colors ${
                  severityFilter === sev
                    ? "bg-primary text-primary-fg font-semibold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-text-muted font-medium sm:text-right">
          {filteredAlerts.length} {filteredAlerts.length === 1 ? "alert" : "alerts"}
        </div>
      </div>

      {/* Alerts View */}
      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Loading alerts...</div>
      ) : filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto opacity-70" />
            <h3 className="text-base font-bold text-text">No alerts found</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              {statusFilter === "open"
                ? "All shipments and compliance obligations are healthy. New deadline warnings and scrip expiry alerts will automatically appear here."
                : `No ${statusFilter} alerts found for the current filter.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table (>= 768px) */}
          <div className="hidden md:block overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-muted/50 text-xs font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Alert Title &amp; Details</th>
                  {isConsultant ? <th className="py-3 px-4">Client</th> : null}
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-surface-muted/30 transition-colors">
                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                      {renderSeverityBadge(alert.severity)}
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <p className="font-semibold text-text text-sm">{alert.title}</p>
                      <p className="text-xs text-text-muted mt-0.5 max-w-lg leading-relaxed">
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        {alert.shippingBillId ? (
                          <Link
                            href={`/app/shipping-bills/${alert.shippingBillId}`}
                            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                          >
                            <span>Open Shipping Bill #{alert.sbNumber ?? ""}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : alert.kind.startsWith("scrip_") ? (
                          <Link
                            href="/app/incentives"
                            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                          >
                            <span>Open Incentives</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    {isConsultant ? (
                      <td className="py-3.5 px-4 align-top text-xs text-text-muted whitespace-nowrap">
                        {alert.iecCode}
                      </td>
                    ) : null}
                    <td className="py-3.5 px-4 align-top text-xs text-text whitespace-nowrap">
                      {alert.dueOn ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-text-muted" />
                          <span>{alert.dueOn}</span>
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                      {statusFilter === "open" ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={actingId === alert.id}
                            onClick={() => handleAlertAction(alert.id, "snooze")}
                            className="h-8 text-xs"
                          >
                            Snooze 7d
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={actingId === alert.id}
                            onClick={() => handleAlertAction(alert.id, "resolve")}
                            className="h-8 text-xs"
                          >
                            Resolve
                          </Button>
                        </div>
                      ) : alert.resolvedAt ? (
                        <span className="text-xs text-text-muted font-medium">Resolved</span>
                      ) : alert.snoozedUntil ? (
                        <span className="text-xs text-warning font-medium">
                          Snoozed until {alert.snoozedUntil.slice(0, 10)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (< 768px, Master Rule #7) */}
          <div className="md:hidden space-y-3">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-[var(--radius-card)] border border-border-subtle bg-surface p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    {renderSeverityBadge(alert.severity)}
                    <h4 className="font-bold text-text text-sm pt-1">{alert.title}</h4>
                  </div>
                  {alert.dueOn ? (
                    <span className="text-[11px] font-semibold text-text-muted whitespace-nowrap">
                      Due: {alert.dueOn}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-text-muted leading-relaxed">{alert.message}</p>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-subtle text-xs">
                  {alert.shippingBillId ? (
                    <Link
                      href={`/app/shipping-bills/${alert.shippingBillId}`}
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-xs"
                    >
                      <span>View bill</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : alert.kind.startsWith("scrip_") ? (
                    <Link
                      href="/app/incentives"
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-xs"
                    >
                      <span>View scrips</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span />
                  )}

                  {statusFilter === "open" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={actingId === alert.id}
                        onClick={() => handleAlertAction(alert.id, "snooze")}
                        className="h-8 text-xs min-h-[44px]"
                      >
                        Snooze 7d
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={actingId === alert.id}
                        onClick={() => handleAlertAction(alert.id, "resolve")}
                        className="h-8 text-xs min-h-[44px]"
                      >
                        Resolve
                      </Button>
                    </div>
                  ) : alert.resolvedAt ? (
                    <span className="text-xs text-text-muted">Resolved</span>
                  ) : (
                    <span className="text-xs text-warning">Snoozed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

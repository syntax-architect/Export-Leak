"use client";

import * as React from "react";
import { Bell, Clock, Shield, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { NotificationPreferences, DigestFrequency } from "@/lib/alerts/types";

interface NotificationPreferencesFormProps {
  orgId: string;
  initialPreferences: NotificationPreferences;
  iecs: { id: string; iecCode: string; legalName: string }[];
  isConsultant: boolean;
  planAllowsEmail: boolean;
}

export function NotificationPreferencesForm({
  orgId,
  initialPreferences,
  iecs,
  isConsultant,
  planAllowsEmail,
}: NotificationPreferencesFormProps) {
  const [selectedIec, setSelectedIec] = React.useState<string>(initialPreferences.iecId ?? "");
  const [prefs, setPrefs] = React.useState<NotificationPreferences>(initialPreferences);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // When consultant switches client IEC, fetch that client's specific preferences
  async function handleIecChange(newIecId: string) {
    setSelectedIec(newIecId);
    setLoading(true);
    setFeedback(null);
    try {
      const url = new URL(`/api/orgs/${orgId}/notifications/preferences`, window.location.origin);
      if (newIecId) {
        url.searchParams.set("iecId", newIecId);
      }
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        setPrefs(json.preferences);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/notifications/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iecId: selectedIec || null,
          alertTypes: prefs.alertTypes,
          channels: prefs.channels,
          digestFrequency: prefs.digestFrequency,
          quietHoursEnabled: prefs.quietHours.enabled,
          quietHoursStart: prefs.quietHours.start,
          quietHoursEnd: prefs.quietHours.end,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setPrefs(json.preferences);
        setFeedback({
          type: "success",
          text: selectedIec
            ? "Notification preferences updated for this client."
            : "Default organization notification preferences updated.",
        });
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string"
            ? err.error
            : (err.error?.message ?? "Failed to save preferences.");
        setFeedback({ type: "error", text: msg });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error saving preferences." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      {/* Consultant Client Scope Selector */}
      {isConsultant && iecs.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent" />
              <CardTitle className="text-base">Client Preference Scope</CardTitle>
            </div>
            <CardDescription>
              Set global notification rules for all clients, or configure distinct rules per client
              IEC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label
                htmlFor="client-iec-select"
                className="text-xs font-semibold text-text sm:w-32"
              >
                Configure for:
              </label>
              <select
                id="client-iec-select"
                value={selectedIec}
                onChange={(e) => handleIecChange(e.target.value)}
                className="h-10 flex-1 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-1.5 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <option value="">All Clients (Organization Default)</option>
                {iecs.map((iec) => (
                  <option key={iec.id} value={iec.id}>
                    Client IEC {iec.iecCode} — {iec.legalName}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Unsubscribed Notice */}
      {prefs.unsubscribedAt ? (
        <div className="rounded-[var(--radius-card)] border border-warning/40 bg-warning/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-warning font-semibold text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Email alerts are currently unsubscribed</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            You previously unsubscribed via an email link. You will not receive compliance deadline
            or digest emails. Saving your preferences below will re-enable notifications.
          </p>
        </div>
      ) : null}

      {/* Alert Categories */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Alert Categories</CardTitle>
          </div>
          <CardDescription>
            Choose which types of export compliance events you want to be alerted about.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.alertTypes.realisation_deadlines}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  alertTypes: { ...prev.alertTypes, realisation_deadlines: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
            />
            <div>
              <p className="text-sm font-semibold text-text">FEMA Realisation Deadlines</p>
              <p className="text-xs text-text-muted">
                Threshold notices at 90, 60, 30, and 7 days before statutory realisation due date,
                plus overdue warnings.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.alertTypes.scrip_expiry}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  alertTypes: { ...prev.alertTypes, scrip_expiry: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
            />
            <div>
              <p className="text-sm font-semibold text-text">Duty Credit Scrip Expiry</p>
              <p className="text-xs text-text-muted">
                Warnings at 90, 30, and 7 days before RoDTEP or Duty Drawback scrips expire without
                utilisation.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.alertTypes.missing_payments}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  alertTypes: { ...prev.alertTypes, missing_payments: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
            />
            <div>
              <p className="text-sm font-semibold text-text">Missing Payment Remittance Links</p>
              <p className="text-xs text-text-muted">
                Alerts when shipping bills have been filed for over 30 days without any matched
                inward remittances.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.alertTypes.unclaimed_incentives}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  alertTypes: { ...prev.alertTypes, unclaimed_incentives: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
            />
            <div>
              <p className="text-sm font-semibold text-text">Unclaimed Export Incentives</p>
              <p className="text-xs text-text-muted">
                Notifies when calculated RoDTEP / Drawback exceeds credited customs scrolls
                (unclaimed money found).
              </p>
            </div>
          </label>

          <div className="flex items-start gap-3 opacity-80 pt-1 border-t border-border-subtle">
            <input
              type="checkbox"
              checked
              disabled
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent cursor-not-allowed"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">
                  Subscription &amp; Security Receipts
                </p>
                <Badge variant="neutral">Essential</Badge>
              </div>
              <p className="text-xs text-text-muted">
                Payment problem notices and printable payment receipts cannot be disabled for
                security.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Channels */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Delivery Channels</CardTitle>
          </div>
          <CardDescription>Where you want notifications delivered.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.channels.in_app}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  channels: { ...prev.channels, in_app: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
            />
            <div>
              <p className="text-sm font-semibold text-text">In-App Notification Bell</p>
              <p className="text-xs text-text-muted">
                Shows badge counter in top bar and slide-over panel with one-tap snooze and resolve
                actions.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.channels.email}
              disabled={!planAllowsEmail}
              onChange={(e) =>
                setPrefs((prev) => ({
                  ...prev,
                  channels: { ...prev.channels, email: e.target.checked },
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer disabled:opacity-50"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">Email Notifications (via Resend)</p>
                {!planAllowsEmail ? (
                  <Badge variant="warning">Exporter &amp; Consultant Plan</Badge>
                ) : null}
              </div>
              <p className="text-xs text-text-muted">
                Delivered to team member email addresses with a 1-click unsubscribe link in every
                email.
              </p>
            </div>
          </label>

          <div className="flex items-start gap-3 opacity-60">
            <input
              type="checkbox"
              checked={false}
              disabled
              className="mt-1 h-4 w-4 rounded border-border-subtle cursor-not-allowed"
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-text">WhatsApp Alerts</p>
                <Badge variant="neutral">Coming Soon (Templates Prepared)</Badge>
              </div>
              <p className="text-xs text-text-muted">
                WhatsApp Business API templates are configured in database. Direct delivery will
                unlock once WhatsApp Business rates are confirmed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Frequency & Quiet Hours */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Frequency &amp; Quiet Hours</CardTitle>
          </div>
          <CardDescription>
            Manage email delivery frequency and mute non-critical alerts during off-hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Frequency */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text block">
              Email Delivery Frequency
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {[
                { id: "realtime", label: "Realtime", desc: "Instant email per alert" },
                { id: "daily", label: "Daily Digest", desc: "Morning summary" },
                { id: "weekly", label: "Weekly Digest", desc: "Mondays at 9 AM" },
                { id: "none", label: "In-App Only", desc: "No alert emails" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setPrefs((prev) => ({
                      ...prev,
                      digestFrequency: opt.id as DigestFrequency,
                    }))
                  }
                  className={`p-3 text-left rounded-[var(--radius-sm)] border transition-all cursor-pointer ${
                    prefs.digestFrequency === opt.id
                      ? "border-accent bg-accent-soft/30 font-semibold"
                      : "border-border-subtle bg-surface hover:bg-surface-muted"
                  }`}
                >
                  <p className="text-xs font-bold text-text">{opt.label}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="pt-3 border-t border-border-subtle space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.quietHours.enabled}
                onChange={(e) =>
                  setPrefs((prev) => ({
                    ...prev,
                    quietHours: { ...prev.quietHours, enabled: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded border-border-subtle text-accent focus:ring-accent cursor-pointer"
              />
              <span className="text-sm font-semibold text-text">Enable Quiet Hours</span>
            </label>

            {prefs.quietHours.enabled ? (
              <div className="grid grid-cols-2 gap-4 pl-6 max-w-sm">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Mute From (IST)</label>
                  <input
                    type="time"
                    value={prefs.quietHours.start}
                    onChange={(e) =>
                      setPrefs((prev) => ({
                        ...prev,
                        quietHours: { ...prev.quietHours, start: e.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-xs text-text"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Mute Until (IST)</label>
                  <input
                    type="time"
                    value={prefs.quietHours.end}
                    onChange={(e) =>
                      setPrefs((prev) => ({
                        ...prev,
                        quietHours: { ...prev.quietHours, end: e.target.value },
                      }))
                    }
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-xs text-text"
                  />
                </div>
              </div>
            ) : null}
            <p className="text-[11px] text-text-muted pl-6">
              During quiet hours, non-critical alerts are queued until morning. Critical overdue
              notices are always sent.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Feedback & Submit */}
      {feedback ? (
        <div
          className={`p-3 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-success/10 text-success border border-success/30"
              : "bg-danger/10 text-danger border border-danger/30"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={saving || loading}
          className="min-h-[44px] px-6"
        >
          {saving ? "Saving Preferences..." : "Save Preferences"}
        </Button>
      </div>
    </form>
  );
}

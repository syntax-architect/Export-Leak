"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateText } from "@/components/ui/date-text";

export interface StoredPaymentEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  org_id: string | null;
  payload: unknown;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface BillingEventsManagerProps {
  initialEvents: StoredPaymentEvent[];
}

export function BillingEventsManager({ initialEvents }: BillingEventsManagerProps) {
  const [events, setEvents] = React.useState<StoredPaymentEvent[]>(initialEvents);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [reprocessingId, setReprocessingId] = React.useState<string | null>(null);
  const [selectedPayload, setSelectedPayload] = React.useState<unknown | null>(null);

  const fetchEvents = React.useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/billing/events?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = (await res.json()) as { events: StoredPaymentEvent[] };
        setEvents(data.events || []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents(searchTerm);
  };

  const handleReprocess = async (eventId: string) => {
    setReprocessingId(eventId);
    try {
      const res = await fetch("/api/admin/billing/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) {
        await fetchEvents(searchTerm);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Reprocessing failed: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Reprocessing error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReprocessingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-billing-manager">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            Razorpay Webhook Events &amp; Activation Engine
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Inspect incoming webhook signatures, audit processing logs, and trigger safe
            idempotency-guaranteed event reprocessing.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-subtle bg-surface-muted px-3 py-1 text-xs text-text-muted">
          <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
          <span>Secrets &amp; card tokens masked</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <Input
                placeholder="Search by subscription ID, event ID, or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 min-h-11"
                data-testid="admin-webhook-search-input"
              />
            </div>
            <Button type="submit" variant="secondary" className="min-h-11" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              <span>Search</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setSearchTerm("");
                fetchEvents("");
              }}
              disabled={isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              <span>Refresh</span>
            </Button>
          </form>
        </CardHeader>

        <CardContent>
          {events.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              No webhook events found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-text-muted font-medium">
                    <th className="py-2.5 pr-4">Event Type</th>
                    <th className="py-2.5 pr-4">Event ID</th>
                    <th className="py-2.5 pr-4">Org ID</th>
                    <th className="py-2.5 pr-4">Received</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {events.map((event) => {
                    const isProcessed = Boolean(event.processed_at);
                    const isFailed = Boolean(event.error);

                    return (
                      <tr key={event.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="py-3 pr-4 font-mono font-medium text-text">
                          {event.event_type}
                        </td>
                        <td className="py-3 pr-4 font-mono text-text-muted truncate max-w-[160px]">
                          {event.provider_event_id}
                        </td>
                        <td className="py-3 pr-4 font-mono text-text-muted truncate max-w-[120px]">
                          {event.org_id || "—"}
                        </td>
                        <td className="py-3 pr-4 text-text-muted whitespace-nowrap">
                          <DateText date={event.created_at} />
                        </td>
                        <td className="py-3 pr-4">
                          {isFailed ? (
                            <Badge variant="danger" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                          ) : isProcessed ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Processed
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-right space-x-2 whitespace-nowrap">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPayload(event.payload)}
                            data-testid={`view-payload-${event.provider_event_id}`}
                          >
                            <Code2 className="mr-1 h-3.5 w-3.5" />
                            Payload
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={reprocessingId === event.provider_event_id}
                            onClick={() => handleReprocess(event.provider_event_id)}
                            data-testid={`reprocess-btn-${event.provider_event_id}`}
                          >
                            {reprocessingId === event.provider_event_id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            )}
                            Reprocess
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payload viewer dialog */}
      <Dialog open={selectedPayload !== null} onOpenChange={() => setSelectedPayload(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-accent" />
              <span>Masked Webhook Payload</span>
            </DialogTitle>
            <DialogDescription>
              Personal data, secrets, and auth tokens are automatically masked for privacy and
              security.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex-1 overflow-auto rounded bg-surface-muted p-4 font-mono text-xs">
            <pre>{JSON.stringify(selectedPayload, null, 2)}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import type { AlertSeverity } from "@/lib/database.types";

export type AlertKind =
  | "realisation_deadline_90"
  | "realisation_deadline_60"
  | "realisation_deadline_30"
  | "realisation_deadline_7"
  | "realisation_overdue"
  | "scrip_expiry_90"
  | "scrip_expiry_30"
  | "scrip_expiry_7"
  | "scrip_expired"
  | "missing_payment"
  | "unclaimed_incentive"
  | "trial_reminder_day5"
  | "trial_expired"
  | "payment_problem";

export interface CandidateAlert {
  iecId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  shippingBillId?: string | null;
  dueOn?: string | null;
  entityType?: "shipping_bill" | "scrip" | "organization" | "subscription" | null;
  entityId?: string | null;
  threshold?: number | null;
  dedupKey: string;
}

export interface StoredAlertItem {
  id: string;
  iecId: string;
  iecCode?: string;
  legalName?: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  shippingBillId: string | null;
  sbNumber?: string | null;
  dueOn: string | null;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  sentChannels: string[];
  entityType?: string | null;
  entityId?: string | null;
  threshold?: number | null;
  dedupKey?: string | null;
  createdAt: string;
}

export interface AlertCategoryToggles {
  realisation_deadlines: boolean;
  scrip_expiry: boolean;
  missing_payments: boolean;
  unclaimed_incentives: boolean;
  billing: boolean;
}

export interface ChannelToggles {
  in_app: boolean;
  email: boolean;
  whatsapp: boolean;
}

export type DigestFrequency = "realtime" | "daily" | "weekly" | "none";

export interface NotificationPreferences {
  id: string;
  orgId: string;
  userId: string;
  iecId: string | null; // null for org default, or specific client IEC
  alertTypes: AlertCategoryToggles;
  channels: ChannelToggles;
  digestFrequency: DigestFrequency;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "08:00"
  };
  unsubscribedAt: string | null;
  unsubscribeToken: string;
}

export interface AlertGenerationResult {
  generatedCount: number;
  dedupedCount: number;
  autoResolvedCount: number;
  dispatchedEmails: number;
  dispatchedInApp: number;
  queuedDigests: number;
  alerts: CandidateAlert[];
}

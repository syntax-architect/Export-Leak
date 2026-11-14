import crypto from "node:crypto";
import { isPgliteTestAdapterEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type {
  AlertCategoryToggles,
  ChannelToggles,
  DigestFrequency,
  NotificationPreferences,
} from "@/lib/alerts/types";

export interface UpdatePreferencesInput {
  alertTypes?: Partial<AlertCategoryToggles>;
  channels?: Partial<ChannelToggles>;
  digestFrequency?: DigestFrequency;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

const DEFAULT_ALERT_TYPES: AlertCategoryToggles = {
  realisation_deadlines: true,
  scrip_expiry: true,
  missing_payments: true,
  unclaimed_incentives: true,
  billing: true,
};

const DEFAULT_CHANNELS: ChannelToggles = {
  in_app: true,
  email: true,
  whatsapp: false,
};

interface RawPreferencesRow {
  id: string;
  org_id: string;
  user_id: string;
  iec_id: string | null;
  alert_types: AlertCategoryToggles;
  channels: ChannelToggles;
  digest_frequency: DigestFrequency;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
}

function mapRowToPreferences(row: RawPreferencesRow): NotificationPreferences {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    iecId: row.iec_id,
    alertTypes: { ...DEFAULT_ALERT_TYPES, ...(row.alert_types || {}) },
    channels: { ...DEFAULT_CHANNELS, ...(row.channels || {}) },
    digestFrequency: row.digest_frequency ?? "realtime",
    quietHours: {
      enabled: Boolean(row.quiet_hours_enabled),
      start: row.quiet_hours_start || "22:00",
      end: row.quiet_hours_end || "08:00",
    },
    unsubscribedAt: row.unsubscribed_at,
    unsubscribeToken: row.unsubscribe_token,
  };
}

export async function getNotificationPreferences(
  orgId: string,
  userId: string,
  iecId?: string | null
): Promise<NotificationPreferences> {
  const targetIecId = iecId && iecId.trim() ? iecId.trim() : null;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    // 1. Try specific iec_id first if provided
    if (targetIecId) {
      const res = await db.query<RawPreferencesRow>(
        `select id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
                quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token
         from public.notification_preferences
         where org_id = $1 and user_id = $2 and iec_id = $3`,
        [orgId, userId, targetIecId]
      );
      if (res.rows[0]) {
        return mapRowToPreferences(res.rows[0]);
      }
    }

    // 2. Try org default (iec_id is null)
    const defRes = await db.query<RawPreferencesRow>(
      `select id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
              quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token
       from public.notification_preferences
       where org_id = $1 and user_id = $2 and iec_id is null`,
      [orgId, userId]
    );
    if (defRes.rows[0]) {
      return mapRowToPreferences(defRes.rows[0]);
    }

    // 3. Create default row if none exists
    const token = crypto.randomBytes(24).toString("hex");
    const insertRes = await db.query<RawPreferencesRow>(
      `insert into public.notification_preferences
         (org_id, user_id, iec_id, alert_types, channels, digest_frequency,
          quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribe_token)
       values ($1, $2, null, $3, $4, 'realtime', false, '22:00', '08:00', $5)
       returning id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
                 quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token`,
      [orgId, userId, JSON.stringify(DEFAULT_ALERT_TYPES), JSON.stringify(DEFAULT_CHANNELS), token]
    );
    const first = insertRes.rows[0];
    if (!first) throw new Error("Failed to insert default notification preferences");
    return mapRowToPreferences(first);
  }

  const supabase = await createSupabaseServerClient();

  if (targetIecId) {
    const { data: specific } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("iec_id", targetIecId)
      .maybeSingle();

    if (specific) {
      return mapRowToPreferences(specific as unknown as RawPreferencesRow);
    }
  }

  const { data: def } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("iec_id", null)
    .maybeSingle();

  if (def) {
    return mapRowToPreferences(def as unknown as RawPreferencesRow);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const { data: created, error } = await supabase
    .from("notification_preferences")
    .insert({
      org_id: orgId,
      user_id: userId,
      iec_id: null,
      alert_types: DEFAULT_ALERT_TYPES as unknown as Json,
      channels: DEFAULT_CHANNELS as unknown as Json,
      digest_frequency: "realtime",
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
      unsubscribe_token: token,
    })
    .select()
    .single();

  if (error || !created) {
    return {
      id: "fallback",
      orgId,
      userId,
      iecId: targetIecId,
      alertTypes: DEFAULT_ALERT_TYPES,
      channels: DEFAULT_CHANNELS,
      digestFrequency: "realtime",
      quietHours: { enabled: false, start: "22:00", end: "08:00" },
      unsubscribedAt: null,
      unsubscribeToken: token,
    };
  }

  return mapRowToPreferences(created as unknown as RawPreferencesRow);
}

export async function updateNotificationPreferences(
  orgId: string,
  userId: string,
  input: UpdatePreferencesInput,
  iecId?: string | null
): Promise<NotificationPreferences> {
  const targetIecId = iecId && iecId.trim() ? iecId.trim() : null;

  const current = await getNotificationPreferences(orgId, userId, targetIecId);
  const tokenForInsert =
    current.iecId === targetIecId
      ? current.unsubscribeToken
      : crypto.randomBytes(24).toString("hex");

  const updatedAlertTypes: AlertCategoryToggles = {
    ...current.alertTypes,
    ...(input.alertTypes || {}),
  };
  const updatedChannels: ChannelToggles = {
    ...current.channels,
    ...(input.channels || {}),
  };
  const updatedFrequency = input.digestFrequency ?? current.digestFrequency;
  const updatedQuietEnabled = input.quietHoursEnabled ?? current.quietHours.enabled;
  const updatedQuietStart = input.quietHoursStart ?? current.quietHours.start;
  const updatedQuietEnd = input.quietHoursEnd ?? current.quietHours.end;

  let savedRow: RawPreferencesRow;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();

    if (current.iecId === targetIecId) {
      // Row already exists - update it by primary key
      const res = await db.query<RawPreferencesRow>(
        `update public.notification_preferences
         set alert_types = $2,
             channels = $3,
             digest_frequency = $4,
             quiet_hours_enabled = $5,
             quiet_hours_start = $6,
             quiet_hours_end = $7,
             updated_at = now()
         where id = $1
         returning id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
                   quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token`,
        [
          current.id,
          JSON.stringify(updatedAlertTypes),
          JSON.stringify(updatedChannels),
          updatedFrequency,
          updatedQuietEnabled,
          updatedQuietStart,
          updatedQuietEnd,
        ]
      );

      const first = res.rows[0];
      if (!first) throw new Error("Failed to update notification preferences");
      savedRow = first;
    } else {
      // New client override row
      const res = await db.query<RawPreferencesRow>(
        `insert into public.notification_preferences
           (org_id, user_id, iec_id, alert_types, channels, digest_frequency,
            quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribe_token)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
                   quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token`,
        [
          orgId,
          userId,
          targetIecId,
          JSON.stringify(updatedAlertTypes),
          JSON.stringify(updatedChannels),
          updatedFrequency,
          updatedQuietEnabled,
          updatedQuietStart,
          updatedQuietEnd,
          tokenForInsert,
        ]
      );

      const first = res.rows[0];
      if (!first) throw new Error("Failed to insert client notification preferences");
      savedRow = first;
    }

    // Audit log
    await db.query(
      `insert into public.audit_log
         (org_id, actor_id, action, entity, entity_id, diff)
       values ($1, $2, 'notification_preferences_updated', 'notification_preferences', $3, $4)`,
      [
        orgId,
        userId,
        savedRow.id,
        JSON.stringify({
          iecId: targetIecId,
          alertTypes: updatedAlertTypes,
          channels: updatedChannels,
          digestFrequency: updatedFrequency,
        }),
      ]
    );
  } else {
    const supabase = await createSupabaseServerClient();
    if (current.iecId === targetIecId) {
      const { data, error } = await supabase
        .from("notification_preferences")
        .update({
          alert_types: updatedAlertTypes as unknown as Json,
          channels: updatedChannels as unknown as Json,
          digest_frequency: updatedFrequency,
          quiet_hours_enabled: updatedQuietEnabled,
          quiet_hours_start: updatedQuietStart,
          quiet_hours_end: updatedQuietEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Failed to update notification preferences: ${error?.message}`);
      }

      savedRow = data as unknown as RawPreferencesRow;
    } else {
      const { data, error } = await supabase
        .from("notification_preferences")
        .insert({
          org_id: orgId,
          user_id: userId,
          iec_id: targetIecId,
          alert_types: updatedAlertTypes as unknown as Json,
          channels: updatedChannels as unknown as Json,
          digest_frequency: updatedFrequency,
          quiet_hours_enabled: updatedQuietEnabled,
          quiet_hours_start: updatedQuietStart,
          quiet_hours_end: updatedQuietEnd,
          unsubscribe_token: tokenForInsert,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Failed to insert client notification preferences: ${error?.message}`);
      }

      savedRow = data as unknown as RawPreferencesRow;
    }

    // Audit log
    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_id: userId,
      action: "notification_preferences_updated",
      entity: "notification_preferences",
      entity_id: savedRow.id,
      diff: {
        iecId: targetIecId,
        alertTypes: updatedAlertTypes,
        channels: updatedChannels,
        digestFrequency: updatedFrequency,
      } as unknown as Json,
    });
  }

  return mapRowToPreferences(savedRow);
}

export async function getPreferenceByUnsubscribeToken(
  token: string
): Promise<NotificationPreferences | null> {
  if (!token || typeof token !== "string") return null;

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query<RawPreferencesRow>(
      `select id, org_id, user_id, iec_id, alert_types, channels, digest_frequency,
              quiet_hours_enabled, quiet_hours_start, quiet_hours_end, unsubscribed_at::text, unsubscribe_token
       from public.notification_preferences
       where unsubscribe_token = $1`,
      [token.trim()]
    );
    return res.rows[0] ? mapRowToPreferences(res.rows[0]) : null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("unsubscribe_token", token.trim())
    .maybeSingle();

  return data ? mapRowToPreferences(data as unknown as RawPreferencesRow) : null;
}

export async function unsubscribeByToken(
  token: string
): Promise<{ success: boolean; unsubscribedAt: string }> {
  const nowIso = new Date().toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query(
      `update public.notification_preferences
       set unsubscribed_at = $1, updated_at = $1
       where unsubscribe_token = $2
       returning id, org_id`,
      [nowIso, token.trim()]
    );
    return { success: res.rows.length > 0, unsubscribedAt: nowIso };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .update({ unsubscribed_at: nowIso, updated_at: nowIso })
    .eq("unsubscribe_token", token.trim())
    .select("id");

  return { success: !error && (data?.length ?? 0) > 0, unsubscribedAt: nowIso };
}

export async function resubscribeByToken(token: string): Promise<{ success: boolean }> {
  const nowIso = new Date().toISOString();

  if (isPgliteTestAdapterEnabled()) {
    const { getPgliteDb } = await import("@/lib/auth/pglite-adapter");
    const db = await getPgliteDb();
    const res = await db.query(
      `update public.notification_preferences
       set unsubscribed_at = null, updated_at = $1
       where unsubscribe_token = $2
       returning id`,
      [nowIso, token.trim()]
    );
    return { success: res.rows.length > 0 };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .update({ unsubscribed_at: null, updated_at: nowIso })
    .eq("unsubscribe_token", token.trim())
    .select("id");

  return { success: !error && (data?.length ?? 0) > 0 };
}

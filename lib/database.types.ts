export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrganizationType = "exporter" | "consultant";
export type MembershipRole = "owner" | "admin" | "member" | "viewer";
export type InviteRole = "admin" | "member" | "viewer";
export type DocumentKind = "shipping_bill" | "irm_export" | "scroll" | "other";
export type DocumentParseStatus = "queued" | "parsing" | "needs_review" | "done" | "failed";
export type ParseRunStrategy = "deterministic" | "ocr_deterministic" | "deterministic_plus_ai";
export type ParseRunStatus = "running" | "done" | "needs_review" | "failed";
export type ShippingBillStatus =
  | "queued"
  | "needs_review"
  | "parsed"
  | "pending"
  | "partially_matched"
  | "matched"
  | "ebrc_ready"
  | "closed";
export type MatchMethod = "auto" | "manual";
export type IncentiveScheme = "rodtep" | "drawback" | "rosctl";
export type ScripStatus = "active" | "utilised" | "transferred" | "expired";
export type AlertSeverity = "info" | "warning" | "critical";
export type OnboardingEventType =
  | "step_viewed"
  | "step_completed"
  | "step_skipped"
  | "wizard_completed"
  | "wizard_skipped"
  | "demo_created"
  | "demo_deleted"
  | "tour_started"
  | "tour_completed"
  | "tour_dismissed";
export type NotificationTemplateChannel = "email" | "whatsapp";
export type TrialNotificationKind = "trial_day_5" | "trial_day_7";
export type TrialNotificationChannel = "email" | "whatsapp_template";
export type TrialNotificationStatus = "queued" | "sent" | "failed" | "stored_template";
export type BillingEventType =
  "trial_started" | "trial_day_5_email" | "trial_expired" | "trial_converted" | "trial_extended";

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          type: OrganizationType;
          plan_key: string;
          plan_status: string;
          trial_ends_at: string | null;
          trial_started_at: string | null;
          trial_converted_at: string | null;
          razorpay_customer_id: string | null;
          ai_parsing_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: OrganizationType;
          plan_key?: string;
          plan_status?: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          trial_converted_at?: string | null;
          razorpay_customer_id?: string | null;
          ai_parsing_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: OrganizationType;
          plan_key?: string;
          plan_status?: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          trial_converted_at?: string | null;
          razorpay_customer_id?: string | null;
          ai_parsing_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: MembershipRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          role: MembershipRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          role?: MembershipRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      iec_profiles: {
        Row: {
          id: string;
          org_id: string;
          iec_code: string;
          legal_name: string;
          gstin: string | null;
          ad_bank_name: string | null;
          default_currency: string;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          iec_code: string;
          legal_name: string;
          gstin?: string | null;
          ad_bank_name?: string | null;
          default_currency?: string;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          iec_code?: string;
          legal_name?: string;
          gstin?: string | null;
          ad_bank_name?: string | null;
          default_currency?: string;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iec_profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          iec_id: string;
          kind: DocumentKind;
          storage_path: string;
          sha256: string;
          original_name: string;
          parse_status: DocumentParseStatus;
          file_size_bytes: number | null;
          mime_type: string | null;
          parse_error: string | null;
          ai_cost_paise: number;
          parse_attempts: number;
          next_retry_at: string | null;
          last_parsed_at: string | null;
          uploaded_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          kind: DocumentKind;
          storage_path: string;
          sha256: string;
          original_name: string;
          parse_status?: DocumentParseStatus;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          parse_error?: string | null;
          ai_cost_paise?: number;
          parse_attempts?: number;
          next_retry_at?: string | null;
          last_parsed_at?: string | null;
          uploaded_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          kind?: DocumentKind;
          storage_path?: string;
          sha256?: string;
          original_name?: string;
          parse_status?: DocumentParseStatus;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          parse_error?: string | null;
          ai_cost_paise?: number;
          parse_attempts?: number;
          next_retry_at?: string | null;
          last_parsed_at?: string | null;
          uploaded_by?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_bills: {
        Row: {
          id: string;
          iec_id: string;
          document_id: string | null;
          sb_number: string;
          sb_date: string;
          port_code: string;
          leo_date: string | null;
          invoice_no: string | null;
          buyer_name: string | null;
          currency: string;
          fob_minor: number;
          exchange_rate: string | null;
          schemes_claimed: string[];
          status: ShippingBillStatus;
          realisation_due_date: string | null;
          field_confidence: Json;
          source_text_pages: Json;
          needs_review_fields: string[];
          used_ocr_fallback: boolean;
          ai_cost_paise: number;
          confidence_confirmed_at: string | null;
          confidence_confirmed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          document_id?: string | null;
          sb_number: string;
          sb_date: string;
          port_code: string;
          leo_date?: string | null;
          invoice_no?: string | null;
          buyer_name?: string | null;
          currency: string;
          fob_minor: number;
          exchange_rate?: string | null;
          schemes_claimed?: string[];
          status?: ShippingBillStatus;
          realisation_due_date?: string | null;
          field_confidence?: Json;
          source_text_pages?: Json;
          needs_review_fields?: string[];
          used_ocr_fallback?: boolean;
          ai_cost_paise?: number;
          confidence_confirmed_at?: string | null;
          confidence_confirmed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          document_id?: string | null;
          sb_number?: string;
          sb_date?: string;
          port_code?: string;
          leo_date?: string | null;
          invoice_no?: string | null;
          buyer_name?: string | null;
          currency?: string;
          fob_minor?: number;
          exchange_rate?: string | null;
          schemes_claimed?: string[];
          status?: ShippingBillStatus;
          realisation_due_date?: string | null;
          field_confidence?: Json;
          source_text_pages?: Json;
          needs_review_fields?: string[];
          used_ocr_fallback?: boolean;
          ai_cost_paise?: number;
          confidence_confirmed_at?: string | null;
          confidence_confirmed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipping_bills_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipping_bills_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_bill_items: {
        Row: {
          id: string;
          shipping_bill_id: string;
          hs_code: string;
          description: string;
          quantity: string;
          uqc: string;
          fob_minor: number;
          field_confidence: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipping_bill_id: string;
          hs_code: string;
          description?: string;
          quantity?: string;
          uqc?: string;
          fob_minor: number;
          field_confidence?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipping_bill_id?: string;
          hs_code?: string;
          description?: string;
          quantity?: string;
          uqc?: string;
          fob_minor?: number;
          field_confidence?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipping_bill_items_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      remittances: {
        Row: {
          id: string;
          iec_id: string;
          source_document_id: string | null;
          irm_number: string;
          bank_name: string;
          remittance_date: string;
          currency: string;
          amount_minor: number;
          utilised_minor: number;
          remitter_name: string;
          invoice_reference: string;
          ad_code: string | null;
          raw: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          source_document_id?: string | null;
          irm_number: string;
          bank_name?: string;
          remittance_date: string;
          currency: string;
          amount_minor: number;
          utilised_minor?: number;
          remitter_name?: string;
          invoice_reference?: string;
          ad_code?: string | null;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          source_document_id?: string | null;
          irm_number?: string;
          bank_name?: string;
          remittance_date?: string;
          currency?: string;
          amount_minor?: number;
          utilised_minor?: number;
          remitter_name?: string;
          invoice_reference?: string;
          ad_code?: string | null;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "remittances_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sb_remittance_matches: {
        Row: {
          id: string;
          shipping_bill_id: string;
          remittance_id: string;
          matched_minor: number;
          method: MatchMethod;
          confidence: string;
          explanation: string;
          signal_breakdown: Json;
          confirmed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipping_bill_id: string;
          remittance_id: string;
          matched_minor: number;
          method: MatchMethod;
          confidence?: string;
          explanation?: string;
          signal_breakdown?: Json;
          confirmed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipping_bill_id?: string;
          remittance_id?: string;
          matched_minor?: number;
          method?: MatchMethod;
          confidence?: string;
          explanation?: string;
          signal_breakdown?: Json;
          confirmed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sb_remittance_matches_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sb_remittance_matches_remittance_id_fkey";
            columns: ["remittance_id"];
            isOneToOne: false;
            referencedRelation: "remittances";
            referencedColumns: ["id"];
          },
        ];
      };
      incentive_rates: {
        Row: {
          id: string;
          scheme: IncentiveScheme;
          hs_code: string;
          rate_bps: number;
          cap_per_unit_minor: number | null;
          uqc: string | null;
          effective_from: string;
          effective_to: string | null;
          source_note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scheme: IncentiveScheme;
          hs_code: string;
          rate_bps: number;
          cap_per_unit_minor?: number | null;
          uqc?: string | null;
          effective_from: string;
          effective_to?: string | null;
          source_note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scheme?: IncentiveScheme;
          hs_code?: string;
          rate_bps?: number;
          cap_per_unit_minor?: number | null;
          uqc?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          source_note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      incentive_expectations: {
        Row: {
          id: string;
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          expected_minor: number;
          rate_id: string | null;
          calc_detail: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          expected_minor: number;
          rate_id?: string | null;
          calc_detail?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipping_bill_id?: string;
          scheme?: IncentiveScheme;
          expected_minor?: number;
          rate_id?: string | null;
          calc_detail?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incentive_expectations_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incentive_expectations_rate_id_fkey";
            columns: ["rate_id"];
            isOneToOne: false;
            referencedRelation: "incentive_rates";
            referencedColumns: ["id"];
          },
        ];
      };
      incentive_credits: {
        Row: {
          id: string;
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          credited_minor: number;
          credited_on: string | null;
          source_document_id: string | null;
          scroll_number: string;
          raw: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shipping_bill_id: string;
          scheme: IncentiveScheme;
          credited_minor: number;
          credited_on?: string | null;
          source_document_id?: string | null;
          scroll_number?: string;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shipping_bill_id?: string;
          scheme?: IncentiveScheme;
          credited_minor?: number;
          credited_on?: string | null;
          source_document_id?: string | null;
          scroll_number?: string;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incentive_credits_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incentive_credits_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      scrips: {
        Row: {
          id: string;
          iec_id: string;
          scrip_number: string;
          scheme: IncentiveScheme;
          face_minor: number;
          generated_on: string;
          expires_on: string | null;
          expiry_source: "compliance_rule" | "manual" | "unconfirmed";
          notes: string;
          status: ScripStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          scrip_number: string;
          scheme: IncentiveScheme;
          face_minor: number;
          generated_on: string;
          expires_on?: string | null;
          expiry_source?: "compliance_rule" | "manual" | "unconfirmed";
          notes?: string;
          status?: ScripStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          scrip_number?: string;
          scheme?: IncentiveScheme;
          face_minor?: number;
          generated_on?: string;
          expires_on?: string | null;
          expiry_source?: "compliance_rule" | "manual" | "unconfirmed";
          notes?: string;
          status?: ScripStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scrips_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_rules: {
        Row: {
          id: string;
          key: string;
          value: Json;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: Json;
          effective_from: string;
          effective_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          effective_from?: string;
          effective_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          id: string;
          iec_id: string;
          kind: string;
          severity: AlertSeverity;
          shipping_bill_id: string | null;
          due_on: string | null;
          resolved_at: string | null;
          snoozed_until: string | null;
          title: string;
          message: string;
          sent_channels: string[];
          entity_type: string | null;
          entity_id: string | null;
          threshold: number | null;
          dedup_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          kind: string;
          severity: AlertSeverity;
          shipping_bill_id?: string | null;
          due_on?: string | null;
          resolved_at?: string | null;
          snoozed_until?: string | null;
          title?: string;
          message?: string;
          sent_channels?: string[];
          entity_type?: string | null;
          entity_id?: string | null;
          threshold?: number | null;
          dedup_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          kind?: string;
          severity?: AlertSeverity;
          shipping_bill_id?: string | null;
          due_on?: string | null;
          resolved_at?: string | null;
          snoozed_until?: string | null;
          title?: string;
          message?: string;
          sent_channels?: string[];
          entity_type?: string | null;
          entity_id?: string | null;
          threshold?: number | null;
          dedup_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          org_id: string;
          razorpay_subscription_id: string;
          plan_key: string;
          status: string;
          current_start: string | null;
          current_end: string | null;
          charge_at: string | null;
          paid_count: number;
          cancel_at_cycle_end: boolean;
          raw: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          razorpay_subscription_id: string;
          plan_key: string;
          status: string;
          current_start?: string | null;
          current_end?: string | null;
          charge_at?: string | null;
          paid_count?: number;
          cancel_at_cycle_end?: boolean;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          razorpay_subscription_id?: string;
          plan_key?: string;
          status?: string;
          current_start?: string | null;
          current_end?: string | null;
          charge_at?: string | null;
          paid_count?: number;
          cancel_at_cycle_end?: boolean;
          raw?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_events: {
        Row: {
          id: string;
          org_id: string | null;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Json;
          processed_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id?: string | null;
          provider?: string;
          provider_event_id: string;
          event_type: string;
          payload?: Json;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string | null;
          provider?: string;
          provider_event_id?: string;
          event_type?: string;
          payload?: Json;
          processed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          id: string;
          org_id: string;
          period_start: string;
          shipping_bills_used: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          period_start: string;
          shipping_bills_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          period_start?: string;
          shipping_bills_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          diff: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          diff?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          actor_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          diff?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invites: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: InviteRole;
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role: InviteRole;
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: InviteRole;
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_profiles: {
        Row: {
          id: string;
          user_id: string;
          org_id: string | null;
          current_step: number;
          completed_at: string | null;
          skipped_at: string | null;
          preferences: Json;
          tour_completed_at: string | null;
          checklist_dismissed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id?: string | null;
          current_step?: number;
          completed_at?: string | null;
          skipped_at?: string | null;
          preferences?: Json;
          tour_completed_at?: string | null;
          checklist_dismissed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string | null;
          current_step?: number;
          completed_at?: string | null;
          skipped_at?: string | null;
          preferences?: Json;
          tour_completed_at?: string | null;
          checklist_dismissed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_events: {
        Row: {
          id: string;
          user_id: string;
          org_id: string | null;
          event_type: OnboardingEventType;
          step_number: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id?: string | null;
          event_type: OnboardingEventType;
          step_number?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string | null;
          event_type?: OnboardingEventType;
          step_number?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_parse_runs: {
        Row: {
          id: string;
          document_id: string;
          attempt_no: number;
          strategy: ParseRunStrategy;
          ai_tokens: number;
          ai_cost_paise: number;
          status: ParseRunStatus;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          attempt_no: number;
          strategy: ParseRunStrategy;
          ai_tokens?: number;
          ai_cost_paise?: number;
          status: ParseRunStatus;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          attempt_no?: number;
          strategy?: ParseRunStrategy;
          ai_tokens?: number;
          ai_cost_paise?: number;
          status?: ParseRunStatus;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_parse_runs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_bill_corrections: {
        Row: {
          id: string;
          org_id: string;
          iec_id: string;
          shipping_bill_id: string;
          shipping_bill_item_id: string | null;
          document_id: string | null;
          field_name: string;
          old_value: string | null;
          new_value: string | null;
          old_confidence: string | null;
          source_snippet: string | null;
          page_number: number | null;
          corrected_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          iec_id: string;
          shipping_bill_id: string;
          shipping_bill_item_id?: string | null;
          document_id?: string | null;
          field_name: string;
          old_value?: string | null;
          new_value?: string | null;
          old_confidence?: string | null;
          source_snippet?: string | null;
          page_number?: number | null;
          corrected_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          iec_id?: string;
          shipping_bill_id?: string;
          shipping_bill_item_id?: string | null;
          document_id?: string | null;
          field_name?: string;
          old_value?: string | null;
          new_value?: string | null;
          old_confidence?: string | null;
          source_snippet?: string | null;
          page_number?: number | null;
          corrected_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipping_bill_corrections_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipping_bill_corrections_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      irm_import_batches: {
        Row: {
          id: string;
          org_id: string;
          iec_id: string;
          source_document_id: string | null;
          filename: string;
          total_rows: number;
          imported_count: number;
          updated_count: number;
          failed_count: number;
          auto_confirmed_count: number;
          review_needed_count: number;
          column_mapping: Json;
          failed_rows: Json;
          imported_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          iec_id: string;
          source_document_id?: string | null;
          filename?: string;
          total_rows?: number;
          imported_count?: number;
          updated_count?: number;
          failed_count?: number;
          auto_confirmed_count?: number;
          review_needed_count?: number;
          column_mapping?: Json;
          failed_rows?: Json;
          imported_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          iec_id?: string;
          source_document_id?: string | null;
          filename?: string;
          total_rows?: number;
          imported_count?: number;
          updated_count?: number;
          failed_count?: number;
          auto_confirmed_count?: number;
          review_needed_count?: number;
          column_mapping?: Json;
          failed_rows?: Json;
          imported_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "irm_import_batches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "irm_import_batches_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sb_remittance_rejections: {
        Row: {
          id: string;
          iec_id: string;
          shipping_bill_id: string;
          remittance_id: string;
          rejected_by: string | null;
          reason: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iec_id: string;
          shipping_bill_id: string;
          remittance_id: string;
          rejected_by?: string | null;
          reason?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iec_id?: string;
          shipping_bill_id?: string;
          remittance_id?: string;
          rejected_by?: string | null;
          reason?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sb_remittance_rejections_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sb_remittance_rejections_shipping_bill_id_fkey";
            columns: ["shipping_bill_id"];
            isOneToOne: false;
            referencedRelation: "shipping_bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sb_remittance_rejections_remittance_id_fkey";
            columns: ["remittance_id"];
            isOneToOne: false;
            referencedRelation: "remittances";
            referencedColumns: ["id"];
          },
        ];
      };
      dashboard_saved_views: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          name: string;
          filters: Json;
          sort_by: string;
          sort_dir: "asc" | "desc";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          name: string;
          filters?: Json;
          sort_by?: string;
          sort_dir?: "asc" | "desc";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          name?: string;
          filters?: Json;
          sort_by?: string;
          sort_dir?: "asc" | "desc";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dashboard_saved_views_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_templates: {
        Row: {
          id: string;
          key: string;
          channel: NotificationTemplateChannel;
          subject: string | null;
          body_template: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          channel: NotificationTemplateChannel;
          subject?: string | null;
          body_template: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          channel?: NotificationTemplateChannel;
          subject?: string | null;
          body_template?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trial_notifications: {
        Row: {
          id: string;
          org_id: string;
          recipient_user_id: string | null;
          recipient_email: string | null;
          kind: TrialNotificationKind;
          channel: TrialNotificationChannel;
          status: TrialNotificationStatus;
          subject: string | null;
          body_text: string;
          unclaimed_incentive_paise: number;
          upgrade_url: string;
          trial_ends_at: string | null;
          trial_window_key: string;
          provider_message_id: string | null;
          sent_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          recipient_user_id?: string | null;
          recipient_email?: string | null;
          kind: TrialNotificationKind;
          channel: TrialNotificationChannel;
          status: TrialNotificationStatus;
          subject?: string | null;
          body_text: string;
          unclaimed_incentive_paise?: number;
          upgrade_url: string;
          trial_ends_at?: string | null;
          trial_window_key: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          recipient_user_id?: string | null;
          recipient_email?: string | null;
          kind?: TrialNotificationKind;
          channel?: TrialNotificationChannel;
          status?: TrialNotificationStatus;
          subject?: string | null;
          body_text?: string;
          unclaimed_incentive_paise?: number;
          upgrade_url?: string;
          trial_ends_at?: string | null;
          trial_window_key?: string;
          provider_message_id?: string | null;
          sent_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trial_notifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          id: string;
          org_id: string;
          actor_id: string | null;
          event_type: BillingEventType;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_id?: string | null;
          event_type: BillingEventType;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          actor_id?: string | null;
          event_type?: BillingEventType;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          iec_id: string | null;
          alert_types: Json;
          channels: Json;
          digest_frequency: "realtime" | "daily" | "weekly" | "none";
          quiet_hours_enabled: boolean;
          quiet_hours_start: string;
          quiet_hours_end: string;
          unsubscribed_at: string | null;
          unsubscribe_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          iec_id?: string | null;
          alert_types?: Json;
          channels?: Json;
          digest_frequency?: "realtime" | "daily" | "weekly" | "none";
          quiet_hours_enabled?: boolean;
          quiet_hours_start?: string;
          quiet_hours_end?: string;
          unsubscribed_at?: string | null;
          unsubscribe_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          iec_id?: string | null;
          alert_types?: Json;
          channels?: Json;
          digest_frequency?: "realtime" | "daily" | "weekly" | "none";
          quiet_hours_enabled?: boolean;
          quiet_hours_start?: string;
          quiet_hours_end?: string;
          unsubscribed_at?: string | null;
          unsubscribe_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_preferences_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_dispatches: {
        Row: {
          id: string;
          org_id: string;
          alert_id: string | null;
          channel: "in_app" | "email" | "whatsapp";
          recipient: string;
          subject: string | null;
          body: string | null;
          status: "queued" | "sent" | "failed" | "skipped" | "unsubscribed";
          error: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          alert_id?: string | null;
          channel: "in_app" | "email" | "whatsapp";
          recipient: string;
          subject?: string | null;
          body?: string | null;
          status: "queued" | "sent" | "failed" | "skipped" | "unsubscribed";
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          alert_id?: string | null;
          channel?: "in_app" | "email" | "whatsapp";
          recipient?: string;
          subject?: string | null;
          body?: string | null;
          status?: "queued" | "sent" | "failed" | "skipped" | "unsubscribed";
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_dispatches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_dispatches_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "alerts";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_reports: {
        Row: {
          id: string;
          org_id: string;
          iec_id: string | null;
          token: string;
          title: string;
          totals: Json;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          iec_id?: string | null;
          token: string;
          title?: string;
          totals?: Json;
          expires_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          iec_id?: string | null;
          token?: string;
          title?: string;
          totals?: Json;
          expires_at?: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shared_reports_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_reports_iec_id_fkey";
            columns: ["iec_id"];
            isOneToOne: false;
            referencedRelation: "iec_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_is_org_member: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
      user_can_write_org: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
      user_is_org_admin: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
      iec_org_id: {
        Args: { target_iec_id: string };
        Returns: string;
      };
      sb_org_id: {
        Args: { target_sb_id: string };
        Returns: string;
      };
      remittance_org_id: {
        Args: { target_remittance_id: string };
        Returns: string;
      };
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      increment_shipping_bill_usage: {
        Args: { target_org_id: string; target_period_start: string; delta?: number };
        Returns: number;
      };
      commit_document_with_usage: {
        Args: {
          p_doc_id: string;
          p_org_id: string;
          p_iec_id: string;
          p_kind: string;
          p_storage_path: string;
          p_sha256: string;
          p_original_name: string;
          p_file_size_bytes: number;
          p_mime_type: string;
          p_actor_id: string;
          p_period_start: string;
          p_increment_usage: boolean;
        };
        Returns: Array<{
          id: string;
          iec_id: string;
          kind: DocumentKind;
          original_name: string;
          parse_status: DocumentParseStatus;
          file_size_bytes: number | null;
          mime_type: string | null;
          parse_error: string | null;
          sha256: string;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableName = keyof Database["public"]["Tables"];
export type TableRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> = Database["public"]["Tables"][T]["Update"];

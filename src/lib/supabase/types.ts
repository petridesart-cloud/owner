export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_profile_id: string | null;
          created_at: string;
          details: Json | null;
          id: number;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_profile_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor_profile_id?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          answer: string | null;
          cancelled_at: string | null;
          checked_in_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          credit_lot_id: string | null;
          free_cancel_until: string | null;
          hold_expires_at: string | null;
          id: string;
          late_refund_pending: boolean;
          note: string | null;
          paid_with: Database["public"]["Enums"]["paid_with"] | null;
          payment_id: string | null;
          profile_id: string;
          session_id: string;
          source: Database["public"]["Enums"]["booking_source"];
          status: Database["public"]["Enums"]["booking_status"];
        };
        ComputedFields: never;
        Insert: {
          answer?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          credit_lot_id?: string | null;
          free_cancel_until?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          late_refund_pending?: boolean;
          note?: string | null;
          paid_with?: Database["public"]["Enums"]["paid_with"] | null;
          payment_id?: string | null;
          profile_id: string;
          session_id: string;
          source?: Database["public"]["Enums"]["booking_source"];
          status: Database["public"]["Enums"]["booking_status"];
        };
        Update: {
          answer?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          credit_lot_id?: string | null;
          free_cancel_until?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          late_refund_pending?: boolean;
          note?: string | null;
          paid_with?: Database["public"]["Enums"]["paid_with"] | null;
          payment_id?: string | null;
          profile_id?: string;
          session_id?: string;
          source?: Database["public"]["Enums"]["booking_source"];
          status?: Database["public"]["Enums"]["booking_status"];
        };
        Relationships: [
          {
            foreignKeyName: "bookings_credit_lot_id_fkey";
            columns: ["credit_lot_id"];
            isOneToOne: false;
            referencedRelation: "credit_lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      class_sessions: {
        Row: {
          cancelled_reason: string | null;
          capacity: number;
          class_type_id: string;
          clients_only: boolean;
          created_at: string;
          description: string | null;
          ends_at: string;
          event_policy: string | null;
          id: string;
          location: string | null;
          price_cents: number | null;
          recap: string | null;
          signup_question: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["session_status"];
          template_id: string | null;
          title: string | null;
          title_font: string | null;
          what_to_bring: string | null;
        };
        ComputedFields: never;
        Insert: {
          cancelled_reason?: string | null;
          capacity: number;
          class_type_id: string;
          clients_only?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at: string;
          event_policy?: string | null;
          id?: string;
          location?: string | null;
          price_cents?: number | null;
          recap?: string | null;
          signup_question?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["session_status"];
          template_id?: string | null;
          title?: string | null;
          title_font?: string | null;
          what_to_bring?: string | null;
        };
        Update: {
          cancelled_reason?: string | null;
          capacity?: number;
          class_type_id?: string;
          clients_only?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at?: string;
          event_policy?: string | null;
          id?: string;
          location?: string | null;
          price_cents?: number | null;
          recap?: string | null;
          signup_question?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["session_status"];
          template_id?: string | null;
          title?: string | null;
          title_font?: string | null;
          what_to_bring?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_type_id_fkey";
            columns: ["class_type_id"];
            isOneToOne: false;
            referencedRelation: "class_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_sessions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "timetable_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      class_types: {
        Row: {
          active: boolean;
          archived_at: string | null;
          created_at: string;
          credit_cost: number;
          credit_kind: Database["public"]["Enums"]["credit_kind"] | null;
          default_capacity: number;
          default_duration_minutes: number;
          default_location: string | null;
          description: string | null;
          id: string;
          kind: Database["public"]["Enums"]["class_kind"];
          name: string;
          price_cents: number;
          private: boolean;
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          credit_cost?: number;
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null;
          default_capacity: number;
          default_duration_minutes?: number;
          default_location?: string | null;
          description?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["class_kind"];
          name: string;
          price_cents: number;
          private?: boolean;
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          credit_cost?: number;
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null;
          default_capacity?: number;
          default_duration_minutes?: number;
          default_location?: string | null;
          description?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["class_kind"];
          name?: string;
          price_cents?: number;
          private?: boolean;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      closures: {
        Row: {
          confirmed: boolean;
          created_at: string;
          ends_on: string;
          id: string;
          name: string;
          starts_on: string;
          suggested: boolean;
        };
        ComputedFields: never;
        Insert: {
          confirmed?: boolean;
          created_at?: string;
          ends_on: string;
          id?: string;
          name: string;
          starts_on: string;
          suggested?: boolean;
        };
        Update: {
          confirmed?: boolean;
          created_at?: string;
          ends_on?: string;
          id?: string;
          name?: string;
          starts_on?: string;
          suggested?: boolean;
        };
        Relationships: [];
      };
      compliance_items: {
        Row: {
          done: boolean;
          key: string;
          note: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          done?: boolean;
          key: string;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          done?: boolean;
          key?: string;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          created_at: string;
          doc_version_id: string | null;
          granted: boolean;
          id: number;
          profile_id: string;
          type: Database["public"]["Enums"]["consent_type"];
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doc_version_id?: string | null;
          granted: boolean;
          id?: never;
          profile_id: string;
          type: Database["public"]["Enums"]["consent_type"];
          version?: string | null;
        };
        Update: {
          created_at?: string;
          doc_version_id?: string | null;
          granted?: boolean;
          id?: never;
          profile_id?: string;
          type?: Database["public"]["Enums"]["consent_type"];
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_doc_version_id_fkey";
            columns: ["doc_version_id"];
            isOneToOne: false;
            referencedRelation: "policy_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_kinds: {
        Row: {
          created_at: string;
          description: string | null;
          key: string;
          label: string;
          sort: number;
          sub_label: string | null;
          tab: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          key: string;
          label: string;
          sort?: number;
          sub_label?: string | null;
          tab?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          key?: string;
          label?: string;
          sort?: number;
          sub_label?: string | null;
          tab?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credit_kinds_tab_fkey";
            columns: ["tab"];
            isOneToOne: false;
            referencedRelation: "package_tabs";
            referencedColumns: ["key"];
          },
        ];
      };
      credit_ledger: {
        Row: {
          actor_profile_id: string | null;
          booking_id: string | null;
          created_at: string;
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          delta: number;
          entry_type: Database["public"]["Enums"]["ledger_entry"];
          id: number;
          lot_id: string | null;
          note: string | null;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_profile_id?: string | null;
          booking_id?: string | null;
          created_at?: string;
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          delta: number;
          entry_type: Database["public"]["Enums"]["ledger_entry"];
          id?: never;
          lot_id?: string | null;
          note?: string | null;
          profile_id: string;
        };
        Update: {
          actor_profile_id?: string | null;
          booking_id?: string | null;
          created_at?: string;
          credit_kind?: Database["public"]["Enums"]["credit_kind"];
          delta?: number;
          entry_type?: Database["public"]["Enums"]["ledger_entry"];
          id?: never;
          lot_id?: string | null;
          note?: string | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "credit_lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_ledger_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_lots: {
        Row: {
          created_at: string;
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          expires_at: string | null;
          id: string;
          membership_id: string | null;
          note: string | null;
          payment_id: string | null;
          period_start: string | null;
          profile_id: string;
          remaining: number;
          started_at: string | null;
          total: number;
          validity_days: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          expires_at?: string | null;
          id?: string;
          membership_id?: string | null;
          note?: string | null;
          payment_id?: string | null;
          period_start?: string | null;
          profile_id: string;
          remaining: number;
          started_at?: string | null;
          total: number;
          validity_days?: number | null;
        };
        Update: {
          created_at?: string;
          credit_kind?: Database["public"]["Enums"]["credit_kind"];
          expires_at?: string | null;
          id?: string;
          membership_id?: string | null;
          note?: string | null;
          payment_id?: string | null;
          period_start?: string | null;
          profile_id?: string;
          remaining?: number;
          started_at?: string | null;
          total?: number;
          validity_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "credit_lots_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_lots_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_lots_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      discount_codes: {
        Row: {
          active: boolean;
          applies_to: string[];
          code: string;
          created_at: string;
          created_by: string | null;
          expires_on: string | null;
          id: string;
          kind: string;
          max_uses: number | null;
          note: string | null;
          profile_id: string | null;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          applies_to?: string[];
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          kind: string;
          max_uses?: number | null;
          note?: string | null;
          profile_id?: string | null;
          value: number;
        };
        Update: {
          active?: boolean;
          applies_to?: string[];
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_on?: string | null;
          id?: string;
          kind?: string;
          max_uses?: number | null;
          note?: string | null;
          profile_id?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "discount_codes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_codes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_access: {
        Row: {
          created_at: string;
          profile_id: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          profile_id: string;
          session_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_access_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_access_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      health_history: {
        Row: {
          bp_meds: boolean | null;
          clearance_needed: boolean;
          conditions: string[];
          created_at: string;
          details: string | null;
          id: string;
          medication: string | null;
          postpartum_months: number | null;
          pregnancy: string | null;
          pregnancy_weeks: number | null;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          bp_meds?: boolean | null;
          clearance_needed?: boolean;
          conditions?: string[];
          created_at?: string;
          details?: string | null;
          id?: string;
          medication?: string | null;
          postpartum_months?: number | null;
          pregnancy?: string | null;
          pregnancy_weeks?: number | null;
          profile_id: string;
        };
        Update: {
          bp_meds?: boolean | null;
          clearance_needed?: boolean;
          conditions?: string[];
          created_at?: string;
          details?: string | null;
          id?: string;
          medication?: string | null;
          postpartum_months?: number | null;
          pregnancy?: string | null;
          pregnancy_weeks?: number | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "health_history_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      health_notes: {
        Row: {
          bp_meds: boolean | null;
          clearance_needed: boolean;
          clearance_received_at: string | null;
          conditions: string[] | null;
          consent_at: string;
          details: string | null;
          injuries: string | null;
          medication: string | null;
          note: string | null;
          parq_yes: string[] | null;
          postpartum_months: number | null;
          pregnancy: string | null;
          pregnancy_weeks: number | null;
          profile_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bp_meds?: boolean | null;
          clearance_needed?: boolean;
          clearance_received_at?: string | null;
          conditions?: string[] | null;
          consent_at: string;
          details?: string | null;
          injuries?: string | null;
          medication?: string | null;
          note?: string | null;
          parq_yes?: string[] | null;
          postpartum_months?: number | null;
          pregnancy?: string | null;
          pregnancy_weeks?: number | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          bp_meds?: boolean | null;
          clearance_needed?: boolean;
          clearance_received_at?: string | null;
          conditions?: string[] | null;
          consent_at?: string;
          details?: string | null;
          injuries?: string | null;
          medication?: string | null;
          note?: string | null;
          parq_yes?: string[] | null;
          postpartum_months?: number | null;
          pregnancy?: string | null;
          pregnancy_weeks?: number | null;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "health_notes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lot_freezes: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          lot_id: string;
          reason: string | null;
          starts_on: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          lot_id: string;
          reason?: string | null;
          starts_on: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          lot_id?: string;
          reason?: string | null;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lot_freezes_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "credit_lots";
            referencedColumns: ["id"];
          },
        ];
      };
      media: {
        Row: {
          caption: string | null;
          created_at: string;
          id: string;
          path: string;
          slot: string;
          sort: number;
        };
        ComputedFields: never;
        Insert: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          path: string;
          slot: string;
          sort?: number;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          path?: string;
          slot?: string;
          sort?: number;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string;
          current_period_start: string;
          id: string;
          next_product_id: string | null;
          paused_at: string | null;
          product_id: string;
          profile_id: string;
          provider: string;
          provider_subscription_id: string | null;
          status: Database["public"]["Enums"]["membership_status"];
        };
        ComputedFields: never;
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end: string;
          current_period_start: string;
          id?: string;
          next_product_id?: string | null;
          paused_at?: string | null;
          product_id: string;
          profile_id: string;
          provider?: string;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          next_product_id?: string | null;
          paused_at?: string | null;
          product_id?: string;
          profile_id?: string;
          provider?: string;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["membership_status"];
        };
        Relationships: [
          {
            foreignKeyName: "memberships_next_product_id_fkey";
            columns: ["next_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          about_profile_id: string | null;
          attempts: number;
          body: string;
          booking_id: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          id: string;
          next_attempt_at: string | null;
          profile_id: string | null;
          provider_ref: string | null;
          recipient: string;
          session_id: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          subject: string | null;
          template: string;
          notification_stale: boolean | null;
        };
        ComputedFields: "notification_stale";
        Insert: {
          about_profile_id?: string | null;
          attempts?: number;
          body: string;
          booking_id?: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          next_attempt_at?: string | null;
          profile_id?: string | null;
          provider_ref?: string | null;
          recipient: string;
          session_id?: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          subject?: string | null;
          template: string;
        };
        Update: {
          about_profile_id?: string | null;
          attempts?: number;
          body?: string;
          booking_id?: string | null;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          next_attempt_at?: string | null;
          profile_id?: string | null;
          provider_ref?: string | null;
          recipient?: string;
          session_id?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          subject?: string | null;
          template?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_about_profile_id_fkey";
            columns: ["about_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      otp_requests: {
        Row: {
          created_at: string;
          email_hash: string;
          id: number;
          ip_hash: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_hash: string;
          id?: never;
          ip_hash?: string | null;
        };
        Update: {
          created_at?: string;
          email_hash?: string;
          id?: never;
          ip_hash?: string | null;
        };
        Relationships: [];
      };
      package_tabs: {
        Row: {
          created_at: string;
          key: string;
          label: string;
          note: string | null;
          sort: number;
          visible: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          key: string;
          label: string;
          note?: string | null;
          sort?: number;
          visible?: boolean;
        };
        Update: {
          created_at?: string;
          key?: string;
          label?: string;
          note?: string | null;
          sort?: number;
          visible?: boolean;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          accepted_terms_at: string | null;
          amount_cents: number;
          booking_id: string | null;
          created_at: string;
          currency: string;
          description: string;
          discount_code_id: string | null;
          discount_note: string | null;
          id: string;
          intended_method: string | null;
          membership_id: string | null;
          method: string | null;
          paid_at: string | null;
          product_id: string | null;
          profile_id: string | null;
          provider: string;
          provider_ref: string | null;
          purpose: string;
          status: Database["public"]["Enums"]["payment_status"];
          terms_version_id: string | null;
          vat_cents: number;
        };
        ComputedFields: never;
        Insert: {
          accepted_terms_at?: string | null;
          amount_cents: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          description: string;
          discount_code_id?: string | null;
          discount_note?: string | null;
          id?: string;
          intended_method?: string | null;
          membership_id?: string | null;
          method?: string | null;
          paid_at?: string | null;
          product_id?: string | null;
          profile_id?: string | null;
          provider: string;
          provider_ref?: string | null;
          purpose: string;
          status?: Database["public"]["Enums"]["payment_status"];
          terms_version_id?: string | null;
          vat_cents?: number;
        };
        Update: {
          accepted_terms_at?: string | null;
          amount_cents?: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string;
          discount_code_id?: string | null;
          discount_note?: string | null;
          id?: string;
          intended_method?: string | null;
          membership_id?: string | null;
          method?: string | null;
          paid_at?: string | null;
          product_id?: string | null;
          profile_id?: string | null;
          provider?: string;
          provider_ref?: string | null;
          purpose?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          terms_version_id?: string | null;
          vat_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_discount_code_id_fkey";
            columns: ["discount_code_id"];
            isOneToOne: false;
            referencedRelation: "discount_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_terms_version_id_fkey";
            columns: ["terms_version_id"];
            isOneToOne: false;
            referencedRelation: "policy_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      policy_versions: {
        Row: {
          body: string;
          created_at: string;
          doc: string;
          id: string;
          sha256: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          doc: string;
          id?: string;
          sha256: string;
          version: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          doc?: string;
          id?: string;
          sha256?: string;
          version?: number;
        };
        Relationships: [];
      };
      processed_webhooks: {
        Row: {
          created_at: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          active: boolean;
          archived_at: string | null;
          credit_kind: Database["public"]["Enums"]["credit_kind"] | null;
          credits: number;
          description: string | null;
          id: string;
          is_group: boolean;
          kind: Database["public"]["Enums"]["product_kind"];
          months: number | null;
          name: string;
          per_week: number | null;
          period_days: number | null;
          price_cents: number;
          sort_order: number;
          tag: string;
          validity_days: number | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          archived_at?: string | null;
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null;
          credits?: number;
          description?: string | null;
          id?: string;
          is_group?: boolean;
          kind: Database["public"]["Enums"]["product_kind"];
          months?: number | null;
          name: string;
          per_week?: number | null;
          period_days?: number | null;
          price_cents: number;
          sort_order?: number;
          tag?: string;
          validity_days?: number | null;
        };
        Update: {
          active?: boolean;
          archived_at?: string | null;
          credit_kind?: Database["public"]["Enums"]["credit_kind"] | null;
          credits?: number;
          description?: string | null;
          id?: string;
          is_group?: boolean;
          kind?: Database["public"]["Enums"]["product_kind"];
          months?: number | null;
          name?: string;
          per_week?: number | null;
          period_days?: number | null;
          price_cents?: number;
          sort_order?: number;
          tag?: string;
          validity_days?: number | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          admin_notes: string | null;
          can_view_health: boolean;
          created_at: string;
          date_of_birth: string | null;
          deleted_at: string | null;
          email: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          first_name: string | null;
          full_name: string | null;
          goal: string | null;
          health_expiry_warned_at: string | null;
          health_mode: string | null;
          id: string;
          inactive_warned_at: string | null;
          last_name: string | null;
          marketing_email: boolean;
          marketing_sms: boolean;
          onboarded_at: string | null;
          parq_completed_at: string | null;
          phone: string | null;
          photo_consent: string | null;
          reminder_emails: boolean;
          role: Database["public"]["Enums"]["user_role"];
          stripe_customer_id: string | null;
          student_verified_until: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_notes?: string | null;
          can_view_health?: boolean;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          goal?: string | null;
          health_expiry_warned_at?: string | null;
          health_mode?: string | null;
          id?: string;
          inactive_warned_at?: string | null;
          last_name?: string | null;
          marketing_email?: boolean;
          marketing_sms?: boolean;
          onboarded_at?: string | null;
          parq_completed_at?: string | null;
          phone?: string | null;
          photo_consent?: string | null;
          reminder_emails?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          stripe_customer_id?: string | null;
          student_verified_until?: string | null;
          user_id?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          can_view_health?: boolean;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          goal?: string | null;
          health_expiry_warned_at?: string | null;
          health_mode?: string | null;
          id?: string;
          inactive_warned_at?: string | null;
          last_name?: string | null;
          marketing_email?: boolean;
          marketing_sms?: boolean;
          onboarded_at?: string | null;
          parq_completed_at?: string | null;
          phone?: string | null;
          photo_consent?: string | null;
          reminder_emails?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          stripe_customer_id?: string | null;
          student_verified_until?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      rate_events: {
        Row: {
          created_at: string;
          id: number;
          key_hash: string;
          kind: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          key_hash: string;
          kind: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          key_hash?: string;
          kind?: string;
        };
        Relationships: [];
      };
      recurring_rules: {
        Row: {
          active: boolean;
          class_type_id: string;
          created_at: string;
          id: string;
          profile_id: string;
          start_time: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          class_type_id: string;
          created_at?: string;
          id?: string;
          profile_id: string;
          start_time: string;
          weekday: number;
        };
        Update: {
          active?: boolean;
          class_type_id?: string;
          created_at?: string;
          id?: string;
          profile_id?: string;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rules_class_type_id_fkey";
            columns: ["class_type_id"];
            isOneToOne: false;
            referencedRelation: "class_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rules_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      site_content: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      studio_settings: {
        Row: {
          address: string;
          alert_bookings: boolean;
          alert_cancellations: boolean;
          alert_details: boolean;
          alert_email: string | null;
          alert_requests: boolean;
          alert_signups: boolean;
          allow_pay_later: boolean;
          bank_account_name: string;
          bank_iban: string;
          booking_window_days: number;
          cancellation_cutoff_hours: number;
          contact_email: string;
          contact_phone: string;
          currency: string;
          expiry_reminder_days: number;
          hold_minutes: number;
          id: number;
          instagram_handle: string;
          intro_line: string;
          last_cron_tick_at: string | null;
          last_retention_at: string | null;
          last_tick_at: string | null;
          last_tick_error: string | null;
          last_tick_ok_at: string | null;
          legal_name: string;
          map_url: string;
          membership_period_mode: string;
          online_payments_enabled: boolean;
          policy_version: string;
          refund_late_cancel_if_filled: boolean;
          registration_number: string;
          reminder_offsets_minutes: number[];
          retention_audit_months: number | null;
          retention_auth_log_days: number | null;
          retention_codes_months: number | null;
          retention_consents_years: number | null;
          retention_event_extras_months: number | null;
          retention_health_months: number | null;
          retention_inactive_months: number | null;
          retention_messages_months: number | null;
          retention_notice_days: number;
          retention_payments_years: number | null;
          revolut_link: string;
          rollover_max: number;
          status_banner: string;
          student_discount_pct: number;
          studio_name: string;
          studio_sections: string[];
          timezone: string;
          trader_name: string;
          unpaid_request_expiry_hours: number;
          updated_at: string;
          vat_number: string;
          vat_rate: number;
          vat_registered: boolean;
          waitlist_close_minutes: number;
          waitlist_sms: boolean;
          waitlist_window_minutes: number;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          alert_bookings?: boolean;
          alert_cancellations?: boolean;
          alert_details?: boolean;
          alert_email?: string | null;
          alert_requests?: boolean;
          alert_signups?: boolean;
          allow_pay_later?: boolean;
          bank_account_name?: string;
          bank_iban?: string;
          booking_window_days?: number;
          cancellation_cutoff_hours?: number;
          contact_email?: string;
          contact_phone?: string;
          currency?: string;
          expiry_reminder_days?: number;
          hold_minutes?: number;
          id?: number;
          instagram_handle?: string;
          intro_line?: string;
          last_cron_tick_at?: string | null;
          last_retention_at?: string | null;
          last_tick_at?: string | null;
          last_tick_error?: string | null;
          last_tick_ok_at?: string | null;
          legal_name?: string;
          map_url?: string;
          membership_period_mode?: string;
          online_payments_enabled?: boolean;
          policy_version?: string;
          refund_late_cancel_if_filled?: boolean;
          registration_number?: string;
          reminder_offsets_minutes?: number[];
          retention_audit_months?: number | null;
          retention_auth_log_days?: number | null;
          retention_codes_months?: number | null;
          retention_consents_years?: number | null;
          retention_event_extras_months?: number | null;
          retention_health_months?: number | null;
          retention_inactive_months?: number | null;
          retention_messages_months?: number | null;
          retention_notice_days?: number;
          retention_payments_years?: number | null;
          revolut_link?: string;
          rollover_max?: number;
          status_banner?: string;
          student_discount_pct?: number;
          studio_name?: string;
          studio_sections?: string[];
          timezone?: string;
          trader_name?: string;
          unpaid_request_expiry_hours?: number;
          updated_at?: string;
          vat_number?: string;
          vat_rate?: number;
          vat_registered?: boolean;
          waitlist_close_minutes?: number;
          waitlist_sms?: boolean;
          waitlist_window_minutes?: number;
        };
        Update: {
          address?: string;
          alert_bookings?: boolean;
          alert_cancellations?: boolean;
          alert_details?: boolean;
          alert_email?: string | null;
          alert_requests?: boolean;
          alert_signups?: boolean;
          allow_pay_later?: boolean;
          bank_account_name?: string;
          bank_iban?: string;
          booking_window_days?: number;
          cancellation_cutoff_hours?: number;
          contact_email?: string;
          contact_phone?: string;
          currency?: string;
          expiry_reminder_days?: number;
          hold_minutes?: number;
          id?: number;
          instagram_handle?: string;
          intro_line?: string;
          last_cron_tick_at?: string | null;
          last_retention_at?: string | null;
          last_tick_at?: string | null;
          last_tick_error?: string | null;
          last_tick_ok_at?: string | null;
          legal_name?: string;
          map_url?: string;
          membership_period_mode?: string;
          online_payments_enabled?: boolean;
          policy_version?: string;
          refund_late_cancel_if_filled?: boolean;
          registration_number?: string;
          reminder_offsets_minutes?: number[];
          retention_audit_months?: number | null;
          retention_auth_log_days?: number | null;
          retention_codes_months?: number | null;
          retention_consents_years?: number | null;
          retention_event_extras_months?: number | null;
          retention_health_months?: number | null;
          retention_inactive_months?: number | null;
          retention_messages_months?: number | null;
          retention_notice_days?: number;
          retention_payments_years?: number | null;
          revolut_link?: string;
          rollover_max?: number;
          status_banner?: string;
          student_discount_pct?: number;
          studio_name?: string;
          studio_sections?: string[];
          timezone?: string;
          trader_name?: string;
          unpaid_request_expiry_hours?: number;
          updated_at?: string;
          vat_number?: string;
          vat_rate?: number;
          vat_registered?: boolean;
          waitlist_close_minutes?: number;
          waitlist_sms?: boolean;
          waitlist_window_minutes?: number;
        };
        Relationships: [];
      };
      team_invites: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          invited_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          invited_by?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          invited_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      template_slots: {
        Row: {
          capacity: number | null;
          class_type_id: string;
          duration_minutes: number | null;
          id: string;
          start_time: string;
          template_id: string;
          weekday: number;
        };
        ComputedFields: never;
        Insert: {
          capacity?: number | null;
          class_type_id: string;
          duration_minutes?: number | null;
          id?: string;
          start_time: string;
          template_id: string;
          weekday: number;
        };
        Update: {
          capacity?: number | null;
          class_type_id?: string;
          duration_minutes?: number | null;
          id?: string;
          start_time?: string;
          template_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_slots_class_type_id_fkey";
            columns: ["class_type_id"];
            isOneToOne: false;
            referencedRelation: "class_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_slots_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "timetable_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      timetable_templates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          repeats: boolean;
          valid_from: string;
          valid_to: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          repeats?: boolean;
          valid_from: string;
          valid_to: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          repeats?: boolean;
          valid_from?: string;
          valid_to?: string;
        };
        Relationships: [];
      };
      waitlist_entries: {
        Row: {
          created_at: string;
          id: string;
          offer_expires_at: string | null;
          offered_at: string | null;
          profile_id: string;
          session_id: string;
          status: Database["public"]["Enums"]["waitlist_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          profile_id: string;
          session_id: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
        };
        Update: {
          created_at?: string;
          id?: string;
          offer_expires_at?: string | null;
          offered_at?: string | null;
          profile_id?: string;
          session_id?: string;
          status?: Database["public"]["Enums"]["waitlist_status"];
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_credit_kind: { Args: { p_label: string }; Returns: string };
      admin_adjust_credits: {
        Args: {
          p_actor: string;
          p_days: number;
          p_delta: number;
          p_kind: Database["public"]["Enums"]["credit_kind"];
          p_profile: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_adjust_lot: {
        Args: {
          p_action: string;
          p_actor: string;
          p_credits: number;
          p_date: string;
          p_days: number;
          p_lot: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      apply_closure: { Args: { p_closure: string }; Returns: number };
      apply_late_fill_refund: { Args: { p_session: string }; Returns: string };
      auth_user_by_email: {
        Args: { p_email: string };
        Returns: {
          confirmed: boolean;
          has_password: boolean;
          id: string;
        }[];
      };
      book_session: {
        Args: {
          p_method?: string;
          p_mode: string;
          p_profile: string;
          p_session: string;
          p_source?: Database["public"]["Enums"]["booking_source"];
        };
        Returns: Json;
      };
      can_access_event: { Args: { p_profile: string; p_session: string }; Returns: boolean };
      can_view_health: { Args: Record<PropertyKey, never>; Returns: boolean };
      cancel_booking: {
        Args: { p_admin?: boolean; p_booking: string; p_profile: string; p_return_credit?: boolean };
        Returns: Json;
      };
      cancel_session: {
        Args: { p_reason: string; p_session: string };
        Returns: {
          booking_id: string;
          profile_id: string;
        }[];
      };
      cancel_sessions: {
        Args: { p_reason: string; p_sessions: string[] };
        Returns: {
          booking_id: string;
          profile_id: string;
          session_id: string;
        }[];
      };
      clear_health_data: { Args: { p_profile: string; p_version: string }; Returns: boolean };
      closed_days: { Args: { p_from: string; p_to: string }; Returns: number };
      compute_expiry: { Args: { p_start: string; p_validity: number }; Returns: string };
      confirm_closure: { Args: { p_closure: string }; Returns: Json };
      confirm_payment: { Args: { p_method?: string; p_payment: string; p_provider_ref?: string }; Returns: Json };
      credit_balance: {
        Args: { p_profile: string };
        Returns: {
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          next_expiry: string;
          remaining: number;
        }[];
      };
      due_reminders: {
        Args: { p_now?: string; p_offset: number };
        Returns: {
          booking_id: string;
          profile_id: string;
          session_id: string;
          starts_at: string;
        }[];
      };
      enforce_retention: { Args: { p_now?: string }; Returns: Json };
      erase_profile: { Args: { p_profile: string; p_rate_keys?: string[] }; Returns: Json };
      expire_credits: { Args: Record<PropertyKey, never>; Returns: number };
      expire_unpaid_requests: { Args: Record<PropertyKey, never>; Returns: string[] };
      extend_timetable: { Args: { p_days?: number }; Returns: number };
      generate_sessions: { Args: { p_template: string }; Returns: number };
      generate_sessions_range: { Args: { p_from: string; p_template: string; p_to: string }; Returns: number };
      grant_lot: {
        Args: {
          p_actor?: string;
          p_credits: number;
          p_entry?: Database["public"]["Enums"]["ledger_entry"];
          p_expires: string;
          p_kind: Database["public"]["Enums"]["credit_kind"];
          p_membership?: string;
          p_note: string;
          p_payment?: string;
          p_period_start?: string;
          p_profile: string;
          p_validity_days?: number;
        };
        Returns: string;
      };
      grant_membership_period: { Args: { p_membership: string; p_payment?: string; p_start: string }; Returns: string };
      health_consent_standing: { Args: { p_profile: string; p_version: string }; Returns: boolean };
      install_baseline: { Args: Record<PropertyKey, never>; Returns: undefined };
      install_catalogue: { Args: Record<PropertyKey, never>; Returns: undefined };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_closed_on: { Args: { p_at: string }; Returns: boolean };
      is_studio_client: { Args: { p_profile: string }; Returns: boolean };
      join_waitlist: { Args: { p_profile: string; p_session: string }; Returns: Json };
      leave_waitlist: {
        Args: { p_entry: string; p_profile: string };
        Returns: {
          entry_id: string;
          offer_expires_at: string;
          profile_id: string;
        }[];
      };
      lot_class_range: { Args: { p_lot: string }; Returns: Record<string, unknown> };
      lot_usable_for: {
        Args: {
          p_class: string;
          p_lot: Omit<
            Database["public"]["Tables"]["credit_lots"]["Row"],
            Database["public"]["Tables"]["credit_lots"]["ComputedFields"]
          >;
        };
        Returns: boolean;
      };
      low_credit_groups: {
        Args: Record<PropertyKey, never>;
        Returns: {
          credit_kind: string;
          lot_ids: string;
          profile_id: string;
        }[];
      };
      my_profile_id: { Args: Record<PropertyKey, never>; Returns: string };
      notification_reclaim: {
        Args: { p_body: string; p_key: string; p_subject: string };
        Returns: {
          attempts: number;
          id: string;
        }[];
      };
      notification_retry_claim: {
        Args: { p_id?: string; p_limit?: number };
        Returns: {
          about_profile_id: string | null;
          attempts: number;
          body: string;
          booking_id: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          id: string;
          next_attempt_at: string | null;
          profile_id: string | null;
          provider_ref: string | null;
          recipient: string;
          session_id: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          subject: string | null;
          template: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "notifications";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      notification_stale: {
        Args: {
          n: Omit<
            Database["public"]["Tables"]["notifications"]["Row"],
            Database["public"]["Tables"]["notifications"]["ComputedFields"]
          >;
        };
        Returns: boolean;
      };
      onboard_profile: {
        Args: {
          p_dob: string;
          p_docs: Json;
          p_email: string;
          p_first: string;
          p_full: string;
          p_last: string;
          p_marketing: boolean;
          p_phone: string;
          p_photo: string;
          p_profile: string;
          p_version: string;
        };
        Returns: undefined;
      };
      pause_membership: { Args: { p_membership: string }; Returns: undefined };
      period_end: { Args: { p_days: number; p_start: string }; Returns: string };
      phone_key: { Args: { p: string }; Returns: string };
      process_waitlist: {
        Args: { p_session: string };
        Returns: {
          entry_id: string;
          offer_expires_at: string;
          profile_id: string;
        }[];
      };
      rate_limited: {
        Args: { p_key: string; p_kind: string; p_max: number; p_window_minutes: number };
        Returns: boolean;
      };
      recalc_lot_expiry: { Args: { p_lot: string }; Returns: undefined };
      record_policy_version: { Args: { p_body: string; p_doc: string }; Returns: Json };
      replace_recurring_rules: { Args: { p_profile: string; p_slots: Json }; Returns: number };
      replace_timetable_from: { Args: { p_template: string }; Returns: number };
      reset_demo_data: { Args: Record<PropertyKey, never>; Returns: undefined };
      resume_membership: { Args: { p_membership: string }; Returns: string };
      return_credit: { Args: { p_booking: string; p_reason: string }; Returns: undefined };
      save_health_answers: {
        Args: { p_answers: Json; p_consent: boolean; p_mode: string; p_profile: string; p_version: string };
        Returns: Json;
      };
      save_timetable: { Args: { p_from: string; p_name: string; p_slots: Json }; Returns: number };
      seed_demo: { Args: Record<PropertyKey, never>; Returns: undefined };
      seed_demo_profiles: { Args: Record<PropertyKey, never>; Returns: undefined };
      session_availability: {
        Args: { p_from: string; p_to: string };
        Returns: {
          capacity: number;
          class_type_id: string;
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          description: string;
          ends_at: string;
          id: string;
          kind: Database["public"]["Enums"]["class_kind"];
          location: string;
          price_cents: number;
          spots_left: number;
          starts_at: string;
          status: Database["public"]["Enums"]["session_status"];
          title: string;
          type_name: string;
          type_slug: string;
          waitlist_count: number;
        }[];
      };
      settings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          address: string;
          alert_bookings: boolean;
          alert_cancellations: boolean;
          alert_details: boolean;
          alert_email: string | null;
          alert_requests: boolean;
          alert_signups: boolean;
          allow_pay_later: boolean;
          bank_account_name: string;
          bank_iban: string;
          booking_window_days: number;
          cancellation_cutoff_hours: number;
          contact_email: string;
          contact_phone: string;
          currency: string;
          expiry_reminder_days: number;
          hold_minutes: number;
          id: number;
          instagram_handle: string;
          intro_line: string;
          last_cron_tick_at: string | null;
          last_retention_at: string | null;
          last_tick_at: string | null;
          last_tick_error: string | null;
          last_tick_ok_at: string | null;
          legal_name: string;
          map_url: string;
          membership_period_mode: string;
          online_payments_enabled: boolean;
          policy_version: string;
          refund_late_cancel_if_filled: boolean;
          registration_number: string;
          reminder_offsets_minutes: number[];
          retention_audit_months: number | null;
          retention_auth_log_days: number | null;
          retention_codes_months: number | null;
          retention_consents_years: number | null;
          retention_event_extras_months: number | null;
          retention_health_months: number | null;
          retention_inactive_months: number | null;
          retention_messages_months: number | null;
          retention_notice_days: number;
          retention_payments_years: number | null;
          revolut_link: string;
          rollover_max: number;
          status_banner: string;
          student_discount_pct: number;
          studio_name: string;
          studio_sections: string[];
          timezone: string;
          trader_name: string;
          unpaid_request_expiry_hours: number;
          updated_at: string;
          vat_number: string;
          vat_rate: number;
          vat_registered: boolean;
          waitlist_close_minutes: number;
          waitlist_sms: boolean;
          waitlist_window_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "studio_settings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      spend_credits: {
        Args: {
          p_booking: string;
          p_cost: number;
          p_kind: Database["public"]["Enums"]["credit_kind"];
          p_profile: string;
          p_valid_at: string;
        };
        Returns: string;
      };
      spots_taken: { Args: { p_exclude_profile?: string; p_session: string }; Returns: number };
      stats_months: {
        Args: { p_year: number };
        Returns: {
          attended: number;
          booked: number;
          classes: number;
          mat_booked: number;
          mat_spots: number;
          month: number;
          new_clients: number;
          packs_sold: number;
          reformer_booked: number;
          reformer_spots: number;
          revenue_cents: number;
          spots: number;
        }[];
      };
      tick: {
        Args: Record<PropertyKey, never>;
        Returns: {
          entry_id: string;
          offer_expires_at: string;
          profile_id: string;
        }[];
      };
      tidy_package_name: { Args: { v: string }; Returns: string };
      trial_eligible: {
        Args: { p_kind: Database["public"]["Enums"]["credit_kind"]; p_profile: string };
        Returns: boolean;
      };
      update_session: { Args: { p_patch: Json; p_session: string }; Returns: Json };
      usable_credits: {
        Args: { p_class: string; p_kind: Database["public"]["Enums"]["credit_kind"]; p_profile: string };
        Returns: {
          latest_expiry: string;
          total: number;
          usable: number;
        }[];
      };
      withdraw_health_consent: { Args: { p_profile: string; p_version: string }; Returns: boolean };
    };
    Enums: {
      booking_source: "online" | "manual";
      booking_status:
        | "held"
        | "confirmed"
        | "cancelled"
        | "late_cancelled"
        | "studio_cancelled"
        | "expired"
        | "no_show";
      class_kind: "reformer" | "mat" | "event" | "other";
      consent_type:
        | "policy"
        | "terms"
        | "health_data"
        | "fitness_declaration"
        | "marketing_email"
        | "marketing_sms"
        | "photos"
        | "health_declaration_offline"
        | "waiver"
        | "studio_rules"
        | "payments_policy"
        | "early_start";
      credit_kind: "reformer" | "mat" | (string & {});
      ledger_entry:
        | "grant"
        | "booking_debit"
        | "cancel_refund"
        | "expiry"
        | "admin_adjustment"
        | "rollover"
        | "freeze_extension";
      membership_status: "active" | "paused" | "past_due" | "cancelled" | "expired";
      notification_channel: "email" | "sms";
      notification_status: "logged" | "sent" | "failed";
      paid_with: "payment" | "credit" | "manual" | "free" | "pay_at_studio";
      payment_status: "pending" | "paid" | "failed" | "refunded" | "needs_refund" | "cancelled";
      product_kind: "single" | "pack" | "membership";
      session_status: "scheduled" | "cancelled";
      user_role: "client" | "admin";
      waitlist_status: "waiting" | "offered" | "claimed" | "expired" | "left" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_source: ["online", "manual"],
      booking_status: ["held", "confirmed", "cancelled", "late_cancelled", "studio_cancelled", "expired", "no_show"],
      class_kind: ["reformer", "mat", "event", "other"],
      consent_type: [
        "policy",
        "terms",
        "health_data",
        "fitness_declaration",
        "marketing_email",
        "marketing_sms",
        "photos",
        "health_declaration_offline",
        "waiver",
        "studio_rules",
        "payments_policy",
        "early_start",
      ],
      credit_kind: [
        "reformer",
        "mat",
        "prenatal_mat",
        "prenatal_reformer",
        "private_mat",
        "private_reformer",
        "private_prenatal_mat",
        "private_prenatal_reformer",
        "pre_natal_ybng",
        "pre_natal_mw5oz5pb",
        "pre_natal_mw5ozkfx",
        "pre_natal_mw5ozsul",
        "pre_natal_mw5ppq7q",
      ],
      ledger_entry: [
        "grant",
        "booking_debit",
        "cancel_refund",
        "expiry",
        "admin_adjustment",
        "rollover",
        "freeze_extension",
      ],
      membership_status: ["active", "paused", "past_due", "cancelled", "expired"],
      notification_channel: ["email", "sms"],
      notification_status: ["logged", "sent", "failed"],
      paid_with: ["payment", "credit", "manual", "free", "pay_at_studio"],
      payment_status: ["pending", "paid", "failed", "refunded", "needs_refund", "cancelled"],
      product_kind: ["single", "pack", "membership"],
      session_status: ["scheduled", "cancelled"],
      user_role: ["client", "admin"],
      waitlist_status: ["waiting", "offered", "claimed", "expired", "left", "cancelled"],
    },
  },
} as const;

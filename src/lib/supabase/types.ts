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
      _app_migrations: {
        Row: {
          applied_at: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          applied_at?: string;
          name: string;
        };
        Update: {
          applied_at?: string;
          name?: string;
        };
        Relationships: [];
      };
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
          cancelled_at: string | null;
          checked_in_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          credit_lot_id: string | null;
          hold_expires_at: string | null;
          id: string;
          late_refund_pending: boolean;
          paid_with: Database["public"]["Enums"]["paid_with"] | null;
          payment_id: string | null;
          profile_id: string;
          session_id: string;
          source: Database["public"]["Enums"]["booking_source"];
          status: Database["public"]["Enums"]["booking_status"];
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          credit_lot_id?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          late_refund_pending?: boolean;
          paid_with?: Database["public"]["Enums"]["paid_with"] | null;
          payment_id?: string | null;
          profile_id: string;
          session_id: string;
          source?: Database["public"]["Enums"]["booking_source"];
          status: Database["public"]["Enums"]["booking_status"];
        };
        Update: {
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          credit_lot_id?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          late_refund_pending?: boolean;
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
          created_at: string;
          description: string | null;
          ends_at: string;
          id: string;
          location: string | null;
          price_cents: number | null;
          starts_at: string;
          status: Database["public"]["Enums"]["session_status"];
          template_id: string | null;
          title: string | null;
        };
        ComputedFields: never;
        Insert: {
          cancelled_reason?: string | null;
          capacity: number;
          class_type_id: string;
          created_at?: string;
          description?: string | null;
          ends_at: string;
          id?: string;
          location?: string | null;
          price_cents?: number | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["session_status"];
          template_id?: string | null;
          title?: string | null;
        };
        Update: {
          cancelled_reason?: string | null;
          capacity?: number;
          class_type_id?: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string;
          id?: string;
          location?: string | null;
          price_cents?: number | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["session_status"];
          template_id?: string | null;
          title?: string | null;
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
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
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
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
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
          granted: boolean;
          id: number;
          profile_id: string;
          type: Database["public"]["Enums"]["consent_type"];
          version: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          granted: boolean;
          id?: never;
          profile_id: string;
          type: Database["public"]["Enums"]["consent_type"];
          version?: string | null;
        };
        Update: {
          created_at?: string;
          granted?: boolean;
          id?: never;
          profile_id?: string;
          type?: Database["public"]["Enums"]["consent_type"];
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
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
      health_notes: {
        Row: {
          consent_at: string;
          injuries: string | null;
          medication: string | null;
          note: string | null;
          profile_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          consent_at: string;
          injuries?: string | null;
          medication?: string | null;
          note?: string | null;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          consent_at?: string;
          injuries?: string | null;
          medication?: string | null;
          note?: string | null;
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
          body: string;
          booking_id: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          dedupe_key: string | null;
          error: string | null;
          id: string;
          profile_id: string | null;
          provider_ref: string | null;
          recipient: string;
          session_id: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          subject: string | null;
          template: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          booking_id?: string | null;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
          profile_id?: string | null;
          provider_ref?: string | null;
          recipient: string;
          session_id?: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          subject?: string | null;
          template: string;
        };
        Update: {
          body?: string;
          booking_id?: string | null;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          dedupe_key?: string | null;
          error?: string | null;
          id?: string;
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
      payments: {
        Row: {
          amount_cents: number;
          booking_id: string | null;
          created_at: string;
          currency: string;
          description: string;
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
          vat_cents: number;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          description: string;
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
          vat_cents?: number;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string;
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
        ];
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
          created_at: string;
          date_of_birth: string | null;
          deleted_at: string | null;
          email: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          first_name: string | null;
          full_name: string | null;
          goal: string | null;
          id: string;
          last_name: string | null;
          marketing_email: boolean;
          marketing_sms: boolean;
          onboarded_at: string | null;
          phone: string | null;
          photo_consent: string | null;
          role: Database["public"]["Enums"]["user_role"];
          stripe_customer_id: string | null;
          student_verified_until: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          goal?: string | null;
          id?: string;
          last_name?: string | null;
          marketing_email?: boolean;
          marketing_sms?: boolean;
          onboarded_at?: string | null;
          phone?: string | null;
          photo_consent?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          stripe_customer_id?: string | null;
          student_verified_until?: string | null;
          user_id?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          goal?: string | null;
          id?: string;
          last_name?: string | null;
          marketing_email?: boolean;
          marketing_sms?: boolean;
          onboarded_at?: string | null;
          phone?: string | null;
          photo_consent?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          stripe_customer_id?: string | null;
          student_verified_until?: string | null;
          user_id?: string | null;
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
          last_tick_at: string | null;
          legal_name: string;
          map_url: string;
          membership_period_mode: string;
          online_payments_enabled: boolean;
          policy_version: string;
          refund_late_cancel_if_filled: boolean;
          registration_number: string;
          reminder_offsets_minutes: number[];
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
          waitlist_window_minutes: number;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
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
          last_tick_at?: string | null;
          legal_name?: string;
          map_url?: string;
          membership_period_mode?: string;
          online_payments_enabled?: boolean;
          policy_version?: string;
          refund_late_cancel_if_filled?: boolean;
          registration_number?: string;
          reminder_offsets_minutes?: number[];
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
          waitlist_window_minutes?: number;
        };
        Update: {
          address?: string;
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
          last_tick_at?: string | null;
          legal_name?: string;
          map_url?: string;
          membership_period_mode?: string;
          online_payments_enabled?: boolean;
          policy_version?: string;
          refund_late_cancel_if_filled?: boolean;
          registration_number?: string;
          reminder_offsets_minutes?: number[];
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
          waitlist_window_minutes?: number;
        };
        Relationships: [];
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
          valid_from: string;
          valid_to: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          valid_from: string;
          valid_to: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
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
      apply_closure: { Args: { p_closure: string }; Returns: number };
      apply_late_fill_refund: { Args: { p_session: string }; Returns: string };
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
      cancel_booking: { Args: { p_admin?: boolean; p_booking: string; p_profile: string }; Returns: Json };
      cancel_session: {
        Args: { p_reason: string; p_session: string };
        Returns: {
          booking_id: string;
          profile_id: string;
        }[];
      };
      closed_days: { Args: { p_from: string; p_to: string }; Returns: number };
      compute_expiry: { Args: { p_start: string; p_validity: number }; Returns: string };
      confirm_payment: { Args: { p_method?: string; p_payment: string; p_provider_ref?: string }; Returns: Json };
      credit_balance: {
        Args: { p_profile: string };
        Returns: {
          credit_kind: Database["public"]["Enums"]["credit_kind"];
          next_expiry: string;
          remaining: number;
        }[];
      };
      erase_profile: { Args: { p_profile: string }; Returns: string };
      expire_credits: { Args: Record<PropertyKey, never>; Returns: number };
      expire_unpaid_requests: { Args: Record<PropertyKey, never>; Returns: string[] };
      generate_sessions: { Args: { p_template: string }; Returns: number };
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
      install_catalogue: { Args: Record<PropertyKey, never>; Returns: undefined };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_closed_on: { Args: { p_at: string }; Returns: boolean };
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
      my_profile_id: { Args: Record<PropertyKey, never>; Returns: string };
      pause_membership: { Args: { p_membership: string }; Returns: undefined };
      period_end: { Args: { p_days: number; p_start: string }; Returns: string };
      process_waitlist: {
        Args: { p_session: string };
        Returns: {
          entry_id: string;
          offer_expires_at: string;
          profile_id: string;
        }[];
      };
      recalc_lot_expiry: { Args: { p_lot: string }; Returns: undefined };
      reset_demo_data: { Args: Record<PropertyKey, never>; Returns: undefined };
      resume_membership: { Args: { p_membership: string }; Returns: string };
      return_credit: { Args: { p_booking: string; p_reason: string }; Returns: undefined };
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
          last_tick_at: string | null;
          legal_name: string;
          map_url: string;
          membership_period_mode: string;
          online_payments_enabled: boolean;
          policy_version: string;
          refund_late_cancel_if_filled: boolean;
          registration_number: string;
          reminder_offsets_minutes: number[];
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
      tick: {
        Args: Record<PropertyKey, never>;
        Returns: {
          entry_id: string;
          offer_expires_at: string;
          profile_id: string;
        }[];
      };
      usable_credits: {
        Args: { p_class: string; p_kind: Database["public"]["Enums"]["credit_kind"]; p_profile: string };
        Returns: {
          latest_expiry: string;
          total: number;
          usable: number;
        }[];
      };
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
      class_kind: "reformer" | "mat" | "event";
      consent_type:
        | "policy"
        | "terms"
        | "health_data"
        | "fitness_declaration"
        | "marketing_email"
        | "marketing_sms"
        | "photos";
      credit_kind: "reformer" | "mat";
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
      class_kind: ["reformer", "mat", "event"],
      consent_type: [
        "policy",
        "terms",
        "health_data",
        "fitness_declaration",
        "marketing_email",
        "marketing_sms",
        "photos",
      ],
      credit_kind: ["reformer", "mat"],
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_guide_dismissals: {
        Row: {
          dismissed_at: string
          guide_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          guide_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          guide_key?: string
          user_id?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_tenant_id_announcement_id_fkey"
            columns: ["tenant_id", "announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_roles: Database["public"]["Enums"]["app_role"][]
          body: string
          created_at: string
          created_by: string
          id: string
          publish_at: string | null
          published_at: string | null
          send_push: boolean
          tenant_id: string
          title: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          audience_roles?: Database["public"]["Enums"]["app_role"][]
          body: string
          created_at?: string
          created_by: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          send_push?: boolean
          tenant_id: string
          title: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          audience_roles?: Database["public"]["Enums"]["app_role"][]
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          send_push?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_slots: {
        Row: {
          booked_count: number
          capacity: number
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          booked_count?: number
          capacity?: number
          created_at?: string
          ends_at: string
          id?: string
          starts_at: string
          status?: string
          tenant_id: string
        }
        Update: {
          booked_count?: number
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          starts_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          customer_visible: boolean
          deleted_at: string | null
          file_name: string
          id: string
          mime_type: string
          report_entry_id: string | null
          sha256: string
          size_bytes: number
          storage_bucket: string
          storage_path: string
          tenant_id: string
          uploaded_by: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          file_name: string
          id?: string
          mime_type: string
          report_entry_id?: string | null
          sha256: string
          size_bytes: number
          storage_bucket: string
          storage_path: string
          tenant_id: string
          uploaded_by: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          report_entry_id?: string | null
          sha256?: string
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_tenant_id_report_entry_id_fkey"
            columns: ["tenant_id", "report_entry_id"]
            isOneToOne: false
            referencedRelation: "report_entries"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "attachments_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_hash: string | null
          request_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_hash?: string | null
          request_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_hash?: string | null
          request_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      availability: {
        Row: {
          approved_at: string | null
          created_at: string
          dossier_source_id: string | null
          ends_at: string
          id: string
          kind: string
          note: string | null
          personnel_id: string
          starts_at: string
          tenant_id: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          dossier_source_id?: string | null
          ends_at: string
          id?: string
          kind: string
          note?: string | null
          personnel_id: string
          starts_at: string
          tenant_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          dossier_source_id?: string | null
          ends_at?: string
          id?: string
          kind?: string
          note?: string | null
          personnel_id?: string
          starts_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_dossier_source_id_fkey"
            columns: ["dossier_source_id"]
            isOneToOne: true
            referencedRelation: "personnel_dossier_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      booking_options: {
        Row: {
          created_at: string
          id: string
          slot_id: string
          tenant_id: string
          token_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_id: string
          tenant_id: string
          token_id: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_id?: string
          tenant_id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_options_tenant_id_slot_id_fkey"
            columns: ["tenant_id", "slot_id"]
            isOneToOne: false
            referencedRelation: "appointment_slots"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "booking_options_tenant_id_token_id_fkey"
            columns: ["tenant_id", "token_id"]
            isOneToOne: false
            referencedRelation: "external_action_tokens"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      certificates: {
        Row: {
          code: string
          created_at: string
          dossier_data: Json
          dossier_managed: boolean
          dossier_revision: number
          dossier_status: string
          expires_on: string | null
          id: string
          issued_on: string | null
          name: string
          personnel_id: string
          previous_id: string | null
          storage_path: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          name: string
          personnel_id: string
          previous_id?: string | null
          storage_path?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          name?: string
          personnel_id?: string
          previous_id?: string | null
          storage_path?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificates_dossier_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "certificates_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      commercial_attachments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          mime_type: string
          public_in_offer: boolean
          quote_id: string | null
          request_id: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          mime_type: string
          public_in_offer?: boolean
          quote_id?: string | null
          request_id?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          mime_type?: string
          public_in_offer?: boolean
          quote_id?: string | null
          request_id?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_attachments_tenant_id_quote_id_fkey"
            columns: ["tenant_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commercial_attachments_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      commercial_billing_periods: {
        Row: {
          confirmed_by: string
          created_at: string
          ends_before: string
          id: string
          invoice_id: string
          quote_id: string
          starts_on: string
          tenant_id: string
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          ends_before: string
          id?: string
          invoice_id: string
          quote_id: string
          starts_on: string
          tenant_id: string
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          ends_before?: string
          id?: string
          invoice_id?: string
          quote_id?: string
          starts_on?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_billing_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_billing_periods_tenant_id_invoice_id_fkey"
            columns: ["tenant_id", "invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commercial_billing_periods_tenant_id_quote_id_fkey"
            columns: ["tenant_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      commercial_events: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          details: Json
          id: string
          kind: string
          mail_snapshot: Json | null
          quote_id: string | null
          request_id: string | null
          tenant_id: string
          visibility: string
        }
        Insert: {
          actor_id?: string | null
          body?: string
          created_at?: string
          details?: Json
          id?: string
          kind: string
          mail_snapshot?: Json | null
          quote_id?: string | null
          request_id?: string | null
          tenant_id: string
          visibility?: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          mail_snapshot?: Json | null
          quote_id?: string | null
          request_id?: string | null
          tenant_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_events_tenant_id_quote_id_fkey"
            columns: ["tenant_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commercial_events_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_agreement_lines: {
        Row: {
          agreement_id: string
          duration_minutes: number | null
          extra_work: boolean
          frequency: string
          id: string
          limit_cents: number
          object_id: string
          price_basis: string
          price_cents: number
          quantity: number
          scope: string
          task_revision_id: string
          tenant_id: string
          time_window: string
          unit: string
          vat_basis_points: number | null
        }
        Insert: {
          agreement_id: string
          duration_minutes?: number | null
          extra_work?: boolean
          frequency?: string
          id?: string
          limit_cents: number
          object_id: string
          price_basis?: string
          price_cents: number
          quantity: number
          scope: string
          task_revision_id: string
          tenant_id: string
          time_window?: string
          unit?: string
          vat_basis_points?: number | null
        }
        Update: {
          agreement_id?: string
          duration_minutes?: number | null
          extra_work?: boolean
          frequency?: string
          id?: string
          limit_cents?: number
          object_id?: string
          price_basis?: string
          price_cents?: number
          quantity?: number
          scope?: string
          task_revision_id?: string
          tenant_id?: string
          time_window?: string
          unit?: string
          vat_basis_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_agreement_lines_tenant_id_agreement_id_fkey"
            columns: ["tenant_id", "agreement_id"]
            isOneToOne: false
            referencedRelation: "customer_agreements"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_agreement_lines_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_agreement_lines_tenant_id_task_revision_id_fkey"
            columns: ["tenant_id", "task_revision_id"]
            isOneToOne: false
            referencedRelation: "task_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_agreements: {
        Row: {
          accepted_by_name: string | null
          accepted_on: string | null
          agreement_type: string
          created_at: string
          created_by: string
          customer_id: string
          details: Json
          edit_version: number
          ends_on: string | null
          evidence_document_id: string | null
          id: string
          notice_on: string | null
          owner_user_id: string | null
          previous_id: string | null
          renewal_on: string | null
          review_on: string | null
          starts_on: string | null
          state: string
          tenant_id: string
          title: string
          version: number
        }
        Insert: {
          accepted_by_name?: string | null
          accepted_on?: string | null
          agreement_type?: string
          created_at?: string
          created_by?: string
          customer_id: string
          details?: Json
          edit_version?: number
          ends_on?: string | null
          evidence_document_id?: string | null
          id?: string
          notice_on?: string | null
          owner_user_id?: string | null
          previous_id?: string | null
          renewal_on?: string | null
          review_on?: string | null
          starts_on?: string | null
          state?: string
          tenant_id: string
          title: string
          version?: number
        }
        Update: {
          accepted_by_name?: string | null
          accepted_on?: string | null
          agreement_type?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          details?: Json
          edit_version?: number
          ends_on?: string | null
          evidence_document_id?: string | null
          id?: string
          notice_on?: string | null
          owner_user_id?: string | null
          previous_id?: string | null
          renewal_on?: string | null
          review_on?: string | null
          starts_on?: string | null
          state?: string
          tenant_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_agreement_owner_fk"
            columns: ["tenant_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "customer_agreements_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_agreements_tenant_id_evidence_document_id_fkey"
            columns: ["tenant_id", "evidence_document_id"]
            isOneToOne: false
            referencedRelation: "customer_documents"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_agreements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_agreements_tenant_id_previous_id_fkey"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "customer_agreements"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          active: boolean
          active_from: string | null
          active_until: string | null
          availability: string
          created_at: string
          customer_id: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          labels: string[]
          object_ids: string[]
          organization: string
          phone: string | null
          role: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          availability?: string
          created_at?: string
          customer_id: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          labels?: string[]
          object_ids?: string[]
          organization?: string
          phone?: string | null
          role?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          availability?: string
          created_at?: string
          customer_id?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          labels?: string[]
          object_ids?: string[]
          organization?: string
          phone?: string | null
          role?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          archived: boolean
          category: string
          created_at: string
          created_by: string
          customer_id: string
          document_on: string | null
          file_name: string
          id: string
          metadata_version: number
          mime_type: string
          portal_object_id: string | null
          previous_id: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
          valid_until: string | null
          version: number
          visibility: string
        }
        Insert: {
          archived?: boolean
          category?: string
          created_at?: string
          created_by: string
          customer_id: string
          document_on?: string | null
          file_name: string
          id?: string
          metadata_version?: number
          mime_type: string
          portal_object_id?: string | null
          previous_id?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
          valid_until?: string | null
          version?: number
          visibility?: string
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          document_on?: string | null
          file_name?: string
          id?: string
          metadata_version?: number
          mime_type?: string
          portal_object_id?: string | null
          previous_id?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          title?: string
          valid_until?: string | null
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_document_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "customer_documents"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_documents_portal_object_fkey"
            columns: ["tenant_id", "portal_object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_documents_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          customer_id: string
          due_on: string | null
          id: string
          kind: string
          object_id: string | null
          owner_user_id: string | null
          state: string
          tenant_id: string
          title: string
          updated_at: string
          version: number
          work_order_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          customer_id: string
          due_on?: string | null
          id?: string
          kind?: string
          object_id?: string | null
          owner_user_id?: string | null
          state?: string
          tenant_id: string
          title?: string
          updated_at?: string
          version?: number
          work_order_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          due_on?: string | null
          id?: string
          kind?: string
          object_id?: string | null
          owner_user_id?: string | null
          state?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_note_object_fk"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_note_order_fk"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_note_owner_fk"
            columns: ["tenant_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "customer_notes_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_accounts: {
        Row: {
          active: boolean
          can_create_objects: boolean
          can_edit_objects: boolean
          can_edit_profile: boolean
          contact_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          onboarding_completed_at: string | null
          onboarding_draft: Json
          onboarding_step: number
          tenant_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          can_create_objects?: boolean
          can_edit_objects?: boolean
          can_edit_profile?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          onboarding_completed_at?: string | null
          onboarding_draft?: Json
          onboarding_step?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          can_create_objects?: boolean
          can_edit_objects?: boolean
          can_edit_profile?: boolean
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          onboarding_completed_at?: string | null
          onboarding_draft?: Json
          onboarding_step?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_accounts_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_portal_accounts_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_portal_revisions: {
        Row: {
          account_id: string
          changed_at: string
          revision: number
          tenant_id: string
        }
        Insert: {
          account_id: string
          changed_at?: string
          revision?: number
          tenant_id: string
        }
        Update: {
          account_id?: string
          changed_at?: string
          revision?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_revisions_tenant_id_account_id_fkey"
            columns: ["tenant_id", "account_id"]
            isOneToOne: true
            referencedRelation: "customer_portal_accounts"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: Json
          billing_email: string | null
          billing_preferences: Json
          company_number: string
          created_at: string
          created_by: string | null
          customer_number: string
          customer_type: string
          email: string
          id: string
          legal_name: string
          name: string
          owner_user_id: string | null
          payment_terms_days: number | null
          phone: string | null
          preferences: string
          relationship_since: string | null
          reminders_enabled: boolean
          services: string[]
          status: string
          tenant_id: string
          trade_name: string
          updated_at: string
          updated_by: string | null
          vat_number: string
          version: number
          visit_address: Json
          website: string
        }
        Insert: {
          billing_address?: Json
          billing_email?: string | null
          billing_preferences?: Json
          company_number?: string
          created_at?: string
          created_by?: string | null
          customer_number: string
          customer_type?: string
          email?: string
          id?: string
          legal_name?: string
          name: string
          owner_user_id?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferences?: string
          relationship_since?: string | null
          reminders_enabled?: boolean
          services?: string[]
          status?: string
          tenant_id: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          vat_number?: string
          version?: number
          visit_address?: Json
          website?: string
        }
        Update: {
          billing_address?: Json
          billing_email?: string | null
          billing_preferences?: Json
          company_number?: string
          created_at?: string
          created_by?: string | null
          customer_number?: string
          customer_type?: string
          email?: string
          id?: string
          legal_name?: string
          name?: string
          owner_user_id?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferences?: string
          relationship_since?: string | null
          reminders_enabled?: boolean
          services?: string[]
          status?: string
          tenant_id?: string
          trade_name?: string
          updated_at?: string
          updated_by?: string | null
          vat_number?: string
          version?: number
          visit_address?: Json
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_owner_fk"
            columns: ["tenant_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          assignment_id: string
          dispatched_at: string
          dispatched_by: string
          id: string
          idempotency_key: string
          revoked_at: string | null
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          assignment_id: string
          dispatched_at?: string
          dispatched_by: string
          id?: string
          idempotency_key: string
          revoked_at?: string | null
          tenant_id: string
          work_order_id: string
        }
        Update: {
          assignment_id?: string
          dispatched_at?: string
          dispatched_by?: string
          id?: string
          idempotency_key?: string
          revoked_at?: string | null
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_tenant_id_assignment_id_fkey"
            columns: ["tenant_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "work_order_assignments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "dispatches_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      dossier_documents: {
        Row: {
          classification: string
          customer_id: string | null
          id: string
          object_id: string | null
          personnel_id: string | null
          source_id: string
          source_kind: string
          tenant_id: string
        }
        Insert: {
          classification: string
          customer_id?: string | null
          id?: string
          object_id?: string | null
          personnel_id?: string | null
          source_id: string
          source_kind: string
          tenant_id: string
        }
        Update: {
          classification?: string
          customer_id?: string | null
          id?: string
          object_id?: string | null
          personnel_id?: string | null
          source_id?: string
          source_kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_documents_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "dossier_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_documents_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "dossier_documents_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      external_action_tokens: {
        Row: {
          booking_kind: string
          consumed_at: string | null
          created_at: string
          decision: Json | null
          expires_at: string
          id: string
          purpose: string
          recipient: string | null
          revoked_at: string | null
          subject_id: string
          tenant_id: string
          token_hash: string
          work_order_id: string | null
        }
        Insert: {
          booking_kind?: string
          consumed_at?: string | null
          created_at?: string
          decision?: Json | null
          expires_at: string
          id?: string
          purpose: string
          recipient?: string | null
          revoked_at?: string | null
          subject_id: string
          tenant_id: string
          token_hash: string
          work_order_id?: string | null
        }
        Update: {
          booking_kind?: string
          consumed_at?: string | null
          created_at?: string
          decision?: Json | null
          expires_at?: string
          id?: string
          purpose?: string
          recipient?: string | null
          revoked_at?: string | null
          subject_id?: string
          tenant_id?: string
          token_hash?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_action_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_action_tokens_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      extra_work_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          requires_photo: boolean
          requires_review: boolean
          task_revision_id: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          requires_photo?: boolean
          requires_review?: boolean
          task_revision_id: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          requires_photo?: boolean
          requires_review?: boolean
          task_revision_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extra_work_rules_tenant_id_task_revision_id_fkey"
            columns: ["tenant_id", "task_revision_id"]
            isOneToOne: true
            referencedRelation: "task_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      function_catalog: {
        Row: {
          active: boolean
          created_at: string
          discipline: string
          id: string
          name: string
          required_certificate_codes: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discipline: string
          id?: string
          name: string
          required_certificate_codes?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discipline?: string
          id?: string
          name?: string
          required_certificate_codes?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "function_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_group_items: {
        Row: {
          created_at: string
          id: string
          invoice_group_id: string
          invoice_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_group_id: string
          invoice_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_group_id?: string
          invoice_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_group_items_tenant_id_invoice_group_id_fkey"
            columns: ["tenant_id", "invoice_group_id"]
            isOneToOne: false
            referencedRelation: "invoice_groups"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoice_group_items_tenant_id_invoice_id_fkey"
            columns: ["tenant_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      invoice_groups: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          expires_at: string | null
          id: string
          purpose: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          expires_at?: string | null
          id?: string
          purpose: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          expires_at?: string | null
          id?: string
          purpose?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_groups_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoice_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          commercial_period_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          source_snapshot: Json
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          vat_cents: number
          work_order_id: string | null
          work_order_task_id: string | null
        }
        Insert: {
          commercial_period_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity: number
          source_snapshot: Json
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          vat_cents: number
          work_order_id?: string | null
          work_order_task_id?: string | null
        }
        Update: {
          commercial_period_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          source_snapshot?: Json
          subtotal_cents?: number
          tenant_id?: string
          total_cents?: number
          unit?: string
          unit_price_cents?: number
          vat_basis_points?: number
          vat_cents?: number
          work_order_id?: string | null
          work_order_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_commercial_period_fk"
            columns: ["tenant_id", "commercial_period_id"]
            isOneToOne: false
            referencedRelation: "commercial_billing_periods"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_invoice_id_fkey"
            columns: ["tenant_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoice_task_fk"
            columns: ["tenant_id", "work_order_task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          last_number: number
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          last_number?: number
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          last_number?: number
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branding_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_on: string | null
          finalized_at: string | null
          id: string
          invoice_number: string | null
          issued_on: string | null
          lines_snapshot: Json | null
          paid_cents: number
          pdf_sha256: string | null
          pdf_storage_path: string | null
          sent_at: string | null
          source_request_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
        }
        Insert: {
          branding_snapshot?: Json | null
          created_at?: string
          created_by: string
          currency?: string
          customer_id: string
          customer_snapshot?: Json | null
          due_on?: string | null
          finalized_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_on?: string | null
          lines_snapshot?: Json | null
          paid_cents?: number
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          sent_at?: string | null
          source_request_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tenant_id: string
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          version?: number
        }
        Update: {
          branding_snapshot?: Json | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string
          customer_snapshot?: Json | null
          due_on?: string | null
          finalized_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_on?: string | null
          lines_snapshot?: Json | null
          paid_cents?: number
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          sent_at?: string | null
          source_request_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents?: number
          tenant_id?: string
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_deliveries: {
        Row: {
          attempts: number
          branding_snapshot: Json | null
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_until: string | null
          outbox_event_id: string | null
          provider_message_id: string | null
          recipient: string
          render_snapshot: Json | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          template: string
          template_revision: number | null
          tenant_id: string
        }
        Insert: {
          attempts?: number
          branding_snapshot?: Json | null
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_until?: string | null
          outbox_event_id?: string | null
          provider_message_id?: string | null
          recipient: string
          render_snapshot?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          template: string
          template_revision?: number | null
          tenant_id: string
        }
        Update: {
          attempts?: number
          branding_snapshot?: Json | null
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_until?: string | null
          outbox_event_id?: string | null
          provider_message_id?: string | null
          recipient?: string
          render_snapshot?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          template?: string
          template_revision?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_deliveries_tenant_id_outbox_event_id_fkey"
            columns: ["tenant_id", "outbox_event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      notification_catalog: {
        Row: {
          allowed_fields: string[]
          bundle_seconds: number
          category: string
          channels: string[]
          code: string
          contexts: string[]
          default_channels: string[]
          description: string
          module: string | null
          name: string
          recipient_description: string
          status: string
          tenant_override: boolean
          ttl_minutes: number
          variables: string[]
        }
        Insert: {
          allowed_fields?: string[]
          bundle_seconds?: number
          category: string
          channels: string[]
          code: string
          contexts: string[]
          default_channels: string[]
          description: string
          module?: string | null
          name: string
          recipient_description: string
          status: string
          tenant_override?: boolean
          ttl_minutes?: number
          variables?: string[]
        }
        Update: {
          allowed_fields?: string[]
          bundle_seconds?: number
          category?: string
          channels?: string[]
          code?: string
          contexts?: string[]
          default_channels?: string[]
          description?: string
          module?: string | null
          name?: string
          recipient_description?: string
          status?: string
          tenant_override?: boolean
          ttl_minutes?: number
          variables?: string[]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          ack_required: boolean
          acknowledged_at: string | null
          action_label: string | null
          archived_at: string | null
          body: string
          campaign_id: string | null
          channel: string
          clicked_at: string | null
          context: string
          created_at: string
          delivery_id: string | null
          id: string
          last_error: string | null
          outbox_event_id: string | null
          priority: string
          read_at: string | null
          revision: number
          sender_name: string
          sent_at: string | null
          source_id: string | null
          source_kind: string | null
          source_revision: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          target_path: string | null
          tenant_id: string | null
          title: string
          type_code: string | null
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          ack_required?: boolean
          acknowledged_at?: string | null
          action_label?: string | null
          archived_at?: string | null
          body: string
          campaign_id?: string | null
          channel: string
          clicked_at?: string | null
          context?: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          last_error?: string | null
          outbox_event_id?: string | null
          priority?: string
          read_at?: string | null
          revision?: number
          sender_name?: string
          sent_at?: string | null
          source_id?: string | null
          source_kind?: string | null
          source_revision?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          target_path?: string | null
          tenant_id?: string | null
          title: string
          type_code?: string | null
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          ack_required?: boolean
          acknowledged_at?: string | null
          action_label?: string | null
          archived_at?: string | null
          body?: string
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          context?: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          last_error?: string | null
          outbox_event_id?: string | null
          priority?: string
          read_at?: string | null
          revision?: number
          sender_name?: string
          sent_at?: string | null
          source_id?: string | null
          source_kind?: string | null
          source_revision?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          target_path?: string | null
          tenant_id?: string | null
          title?: string
          type_code?: string | null
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_outbox_event_id_fkey"
            columns: ["tenant_id", "outbox_event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_customer_bindings: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          manage_secrets: boolean
          object_id: string
          tenant_id: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          manage_secrets?: boolean
          object_id: string
          tenant_id: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          manage_secrets?: boolean
          object_id?: string
          tenant_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_customer_bindings_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_documents: {
        Row: {
          category: string
          created_at: string
          created_by: string
          file_name: string
          id: string
          mime_type: string
          node_id: string | null
          object_id: string
          previous_id: string | null
          record_id: string | null
          request_id: string | null
          scan_status: string
          service: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
          valid_until: string | null
          version: number
          work_order_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string
          file_name: string
          id?: string
          mime_type: string
          node_id?: string | null
          object_id: string
          previous_id?: string | null
          record_id?: string | null
          request_id?: string | null
          scan_status?: string
          service?: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          title: string
          valid_until?: string | null
          version?: number
          work_order_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          mime_type?: string
          node_id?: string | null
          object_id?: string
          previous_id?: string | null
          record_id?: string | null
          request_id?: string | null
          scan_status?: string
          service?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          title?: string
          valid_until?: string | null
          version?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_documents_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_documents_tenant_id_object_id_node_id_fkey"
            columns: ["tenant_id", "object_id", "node_id"]
            isOneToOne: false
            referencedRelation: "object_nodes"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_documents_tenant_id_object_id_previous_id_fkey"
            columns: ["tenant_id", "object_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "object_documents"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_documents_tenant_id_object_id_record_id_fkey"
            columns: ["tenant_id", "object_id", "record_id"]
            isOneToOne: false
            referencedRelation: "object_records"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_documents_tenant_id_object_id_request_id_fkey"
            columns: ["tenant_id", "object_id", "request_id"]
            isOneToOne: false
            referencedRelation: "object_visit_requests"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_documents_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: string
          id: string
          object_id: string
          snapshot: Json
          source_id: string
          source_table: string
          tenant_id: string
          version: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: string
          id?: string
          object_id: string
          snapshot: Json
          source_id: string
          source_table: string
          tenant_id: string
          version: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: string
          id?: string
          object_id?: string
          snapshot?: Json
          source_id?: string
          source_table?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_history_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_instruction_receipts: {
        Row: {
          id: string
          object_id: string
          read_at: string
          record_id: string
          record_version: number
          snapshot: Json
          tenant_id: string
          user_id: string
          work_order_id: string
        }
        Insert: {
          id?: string
          object_id: string
          read_at?: string
          record_id: string
          record_version: number
          snapshot: Json
          tenant_id: string
          user_id: string
          work_order_id: string
        }
        Update: {
          id?: string
          object_id?: string
          read_at?: string
          record_id?: string
          record_version?: number
          snapshot?: Json
          tenant_id?: string
          user_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_instruction_receipts_tenant_id_object_id_record_id_fkey"
            columns: ["tenant_id", "object_id", "record_id"]
            isOneToOne: false
            referencedRelation: "object_records"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_instruction_receipts_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_nodes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          details: Json
          id: string
          kind: string
          name: string
          object_id: string
          parent_id: string | null
          position: number
          tenant_id: string
          version: number
        }
        Insert: {
          active?: boolean
          code?: string
          created_at?: string
          details?: Json
          id?: string
          kind: string
          name: string
          object_id: string
          parent_id?: string | null
          position?: number
          tenant_id: string
          version?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          name?: string
          object_id?: string
          parent_id?: string | null
          position?: number
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_nodes_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_nodes_tenant_id_object_id_parent_id_fkey"
            columns: ["tenant_id", "object_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "object_nodes"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
        ]
      }
      object_records: {
        Row: {
          agreement_line_id: string | null
          body: string
          contact_id: string | null
          created_at: string
          created_by: string
          customer_visible: boolean
          details: Json
          due_on: string | null
          ends_at: string | null
          id: string
          instruction_type: string | null
          kind: string
          node_id: string | null
          object_id: string
          owner_user_id: string | null
          personnel_asset_id: string | null
          service: string
          starts_at: string | null
          state: string
          task_revision_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string
          version: number
          work_order_id: string | null
        }
        Insert: {
          agreement_line_id?: string | null
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          customer_visible?: boolean
          details?: Json
          due_on?: string | null
          ends_at?: string | null
          id?: string
          instruction_type?: string | null
          kind: string
          node_id?: string | null
          object_id: string
          owner_user_id?: string | null
          personnel_asset_id?: string | null
          service?: string
          starts_at?: string | null
          state?: string
          task_revision_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string
          version?: number
          work_order_id?: string | null
        }
        Update: {
          agreement_line_id?: string | null
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          customer_visible?: boolean
          details?: Json
          due_on?: string | null
          ends_at?: string | null
          id?: string
          instruction_type?: string | null
          kind?: string
          node_id?: string | null
          object_id?: string
          owner_user_id?: string | null
          personnel_asset_id?: string | null
          service?: string
          starts_at?: string | null
          state?: string
          task_revision_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_record_agreement_fk"
            columns: ["tenant_id", "agreement_line_id"]
            isOneToOne: false
            referencedRelation: "customer_agreement_lines"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_records_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_records_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_records_tenant_id_object_id_node_id_fkey"
            columns: ["tenant_id", "object_id", "node_id"]
            isOneToOne: false
            referencedRelation: "object_nodes"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_records_tenant_id_task_revision_id_fkey"
            columns: ["tenant_id", "task_revision_id"]
            isOneToOne: false
            referencedRelation: "task_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_records_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_reminder_recipients: {
        Row: {
          active: boolean
          created_by: string
          object_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_by?: string
          object_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_by?: string
          object_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_reminder_recipients_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_request_proposals: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          id: string
          object_id: string
          price_cents: number
          quantity: number
          request_id: string
          scope: string
          task_revision_id: string
          tenant_id: string
          title: string
          vat_basis_points: number
          version: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          object_id: string
          price_cents: number
          quantity: number
          request_id: string
          scope: string
          task_revision_id: string
          tenant_id: string
          title: string
          vat_basis_points: number
          version: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          object_id?: string
          price_cents?: number
          quantity?: number
          request_id?: string
          scope?: string
          task_revision_id?: string
          tenant_id?: string
          title?: string
          vat_basis_points?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_request_proposals_tenant_id_object_id_request_id_fkey"
            columns: ["tenant_id", "object_id", "request_id"]
            isOneToOne: false
            referencedRelation: "object_visit_requests"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_request_proposals_tenant_id_task_revision_id_fkey"
            columns: ["tenant_id", "task_revision_id"]
            isOneToOne: false
            referencedRelation: "task_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      object_request_receipts: {
        Row: {
          object_id: string
          read_at: string
          request_id: string
          tenant_id: string
          user_id: string
          version: number
        }
        Insert: {
          object_id: string
          read_at?: string
          request_id: string
          tenant_id: string
          user_id: string
          version: number
        }
        Update: {
          object_id?: string
          read_at?: string
          request_id?: string
          tenant_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_request_receipts_tenant_id_object_id_request_id_fkey"
            columns: ["tenant_id", "object_id", "request_id"]
            isOneToOne: false
            referencedRelation: "object_visit_requests"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
        ]
      }
      object_visit_requests: {
        Row: {
          body: string
          created_at: string
          created_by: string
          due_on: string | null
          feedback: string
          id: string
          kind: string
          needs_review: boolean
          node_id: string | null
          object_id: string
          owner_user_id: string | null
          priority: string
          response: string
          review_note: string
          state: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string
          version: number
          work_order_id: string
          work_order_task_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          due_on?: string | null
          feedback?: string
          id: string
          kind: string
          needs_review?: boolean
          node_id?: string | null
          object_id: string
          owner_user_id?: string | null
          priority?: string
          response?: string
          review_note?: string
          state?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string
          version?: number
          work_order_id: string
          work_order_task_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          due_on?: string | null
          feedback?: string
          id?: string
          kind?: string
          needs_review?: boolean
          node_id?: string | null
          object_id?: string
          owner_user_id?: string | null
          priority?: string
          response?: string
          review_note?: string
          state?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
          work_order_id?: string
          work_order_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_visit_requests_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_visit_requests_tenant_id_object_id_node_id_fkey"
            columns: ["tenant_id", "object_id", "node_id"]
            isOneToOne: false
            referencedRelation: "object_nodes"
            referencedColumns: ["tenant_id", "object_id", "id"]
          },
          {
            foreignKeyName: "object_visit_requests_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "object_visit_requests_tenant_id_work_order_task_id_fkey"
            columns: ["tenant_id", "work_order_task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      objects: {
        Row: {
          access_instructions: string | null
          active: boolean
          address: Json
          arrival_instruction: string
          arrival_location: Json | null
          created_at: string
          customer_id: string
          dossier_status: string
          floor_area_m2: number | null
          id: string
          latitude: number | null
          location_description: string
          longitude: number | null
          name: string
          object_number: string
          object_type: string
          signature_mode: string
          tenant_id: string
          travel_margin_minutes: number | null
          updated_at: string
          version: number
        }
        Insert: {
          access_instructions?: string | null
          active?: boolean
          address: Json
          arrival_instruction?: string
          arrival_location?: Json | null
          created_at?: string
          customer_id: string
          dossier_status?: string
          floor_area_m2?: number | null
          id?: string
          latitude?: number | null
          location_description?: string
          longitude?: number | null
          name: string
          object_number: string
          object_type?: string
          signature_mode?: string
          tenant_id: string
          travel_margin_minutes?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          access_instructions?: string | null
          active?: boolean
          address?: Json
          arrival_instruction?: string
          arrival_location?: Json | null
          created_at?: string
          customer_id?: string
          dossier_status?: string
          floor_area_m2?: number | null
          id?: string
          latitude?: number | null
          location_description?: string
          longitude?: number | null
          name?: string
          object_number?: string
          object_type?: string
          signature_mode?: string
          tenant_id?: string
          travel_margin_minutes?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "objects_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      open_shifts: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          function_id: string
          id: string
          required_certificate_codes: string[]
          selected_personnel_id: string | null
          starts_at: string
          status: string
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at: string
          function_id: string
          id?: string
          required_certificate_codes?: string[]
          selected_personnel_id?: string | null
          starts_at: string
          status?: string
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          function_id?: string
          id?: string
          required_certificate_codes?: string[]
          selected_personnel_id?: string | null
          starts_at?: string
          status?: string
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_shifts_tenant_id_function_id_fkey"
            columns: ["tenant_id", "function_id"]
            isOneToOne: false
            referencedRelation: "function_catalog"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "open_shifts_tenant_id_selected_personnel_id_fkey"
            columns: ["tenant_id", "selected_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "open_shifts_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_until: string | null
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          available_at?: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_until?: string | null
          payload: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          available_at?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_until?: string | null
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_at: string
          amount_cents: number
          id: string
          invoice_id: string
          payment_attempt_id: string
          tenant_id: string
        }
        Insert: {
          allocated_at?: string
          amount_cents: number
          id?: string
          invoice_id: string
          payment_attempt_id: string
          tenant_id: string
        }
        Update: {
          allocated_at?: string
          amount_cents?: number
          id?: string
          invoice_id?: string
          payment_attempt_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_tenant_id_invoice_id_fkey"
            columns: ["tenant_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_payment_attempt_id_fkey"
            columns: ["tenant_id", "payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string
          invoice_group_id: string | null
          last_checked_at: string | null
          merchant_profile_id: string | null
          paid_at: string | null
          provider: string
          provider_check_lease: string | null
          provider_check_until: string | null
          provider_mode: string
          provider_payload: Json
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key: string
          invoice_group_id?: string | null
          last_checked_at?: string | null
          merchant_profile_id?: string | null
          paid_at?: string | null
          provider: string
          provider_check_lease?: string | null
          provider_check_until?: string | null
          provider_mode: string
          provider_payload?: Json
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string
          invoice_group_id?: string | null
          last_checked_at?: string | null
          merchant_profile_id?: string | null
          paid_at?: string | null
          provider?: string
          provider_check_lease?: string | null
          provider_check_until?: string | null
          provider_mode?: string
          provider_payload?: Json
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_tenant_id_invoice_group_id_fkey"
            columns: ["tenant_id", "invoice_group_id"]
            isOneToOne: false
            referencedRelation: "invoice_groups"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      permission_catalog: {
        Row: {
          action: string
          dependencies: string[]
          description: string
          domain: string
          key: string
          module: string
          name: string
          scopes: string[]
          sensitive: boolean
        }
        Insert: {
          action: string
          dependencies?: string[]
          description: string
          domain: string
          key: string
          module?: string
          name: string
          scopes?: string[]
          sensitive?: boolean
        }
        Update: {
          action?: string
          dependencies?: string[]
          description?: string
          domain?: string
          key?: string
          module?: string
          name?: string
          scopes?: string[]
          sensitive?: boolean
        }
        Relationships: []
      }
      permission_grants: {
        Row: {
          capability: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          membership_id: string | null
          revision: number
          scope: Json
          source: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          membership_id?: string | null
          revision?: number
          scope?: Json
          source?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          membership_id?: string | null
          revision?: number
          scope?: Json
          source?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_grants_capability_fkey"
            columns: ["capability"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "permission_grants_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_role_defaults: {
        Row: {
          capability: string
          category_codes: string[]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          capability: string
          category_codes?: string[]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          capability?: string
          category_codes?: string[]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "permission_role_defaults_capability_fkey"
            columns: ["capability"]
            isOneToOne: false
            referencedRelation: "permission_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      personnel: {
        Row: {
          alternate_departure_address: Json
          availability_preferences: Json
          availability_self_service_enabled: boolean
          birth_date: string | null
          carpool_allowed: boolean
          created_at: string
          departure_depot_id: string | null
          departure_kind: string | null
          driving_license: boolean
          driving_license_categories: string[]
          email: string | null
          emergency_contact: Json
          employee_number: string
          end_date: string | null
          full_name: string
          home_address: Json
          id: string
          mobile_phone: string | null
          notification_preferences: Json
          onboarding_completed_at: string | null
          onboarding_draft: Json
          onboarding_step: number
          onboarding_version: number
          own_transport: boolean
          phone: string | null
          preferred_name: string | null
          return_to_departure: boolean
          standard_vehicle: string | null
          start_date: string | null
          status: string
          tenant_id: string
          travel_limitations: string | null
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          alternate_departure_address?: Json
          availability_preferences?: Json
          availability_self_service_enabled?: boolean
          birth_date?: string | null
          carpool_allowed?: boolean
          created_at?: string
          departure_depot_id?: string | null
          departure_kind?: string | null
          driving_license?: boolean
          driving_license_categories?: string[]
          email?: string | null
          emergency_contact?: Json
          employee_number?: string
          end_date?: string | null
          full_name: string
          home_address?: Json
          id?: string
          mobile_phone?: string | null
          notification_preferences?: Json
          onboarding_completed_at?: string | null
          onboarding_draft?: Json
          onboarding_step?: number
          onboarding_version?: number
          own_transport?: boolean
          phone?: string | null
          preferred_name?: string | null
          return_to_departure?: boolean
          standard_vehicle?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          travel_limitations?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          alternate_departure_address?: Json
          availability_preferences?: Json
          availability_self_service_enabled?: boolean
          birth_date?: string | null
          carpool_allowed?: boolean
          created_at?: string
          departure_depot_id?: string | null
          departure_kind?: string | null
          driving_license?: boolean
          driving_license_categories?: string[]
          email?: string | null
          emergency_contact?: Json
          employee_number?: string
          end_date?: string | null
          full_name?: string
          home_address?: Json
          id?: string
          mobile_phone?: string | null
          notification_preferences?: Json
          onboarding_completed_at?: string | null
          onboarding_draft?: Json
          onboarding_step?: number
          onboarding_version?: number
          own_transport?: boolean
          phone?: string | null
          preferred_name?: string | null
          return_to_departure?: boolean
          standard_vehicle?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          travel_limitations?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "personnel_tenant_id_departure_depot_id_fkey"
            columns: ["tenant_id", "departure_depot_id"]
            isOneToOne: false
            referencedRelation: "travel_depots"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_contracts: {
        Row: {
          active: boolean
          created_at: string
          dossier_data: Json
          dossier_managed: boolean
          dossier_revision: number
          dossier_status: string
          employment_type: string
          ends_on: string | null
          function_id: string | null
          hours_per_week: number | null
          id: string
          personnel_id: string
          previous_id: string | null
          review_on: string | null
          starts_on: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          employment_type: string
          ends_on?: string | null
          function_id?: string | null
          hours_per_week?: number | null
          id?: string
          personnel_id: string
          previous_id?: string | null
          review_on?: string | null
          starts_on: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          employment_type?: string
          ends_on?: string | null
          function_id?: string | null
          hours_per_week?: number | null
          id?: string
          personnel_id?: string
          previous_id?: string | null
          review_on?: string | null
          starts_on?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_function_fk"
            columns: ["tenant_id", "function_id"]
            isOneToOne: false
            referencedRelation: "function_catalog"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_contracts_dossier_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "personnel_contracts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_contracts_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_documents: {
        Row: {
          created_at: string
          created_by: string
          document_type: string
          dossier_data: Json
          dossier_managed: boolean
          dossier_revision: number
          dossier_status: string
          file_name: string | null
          id: string
          mime_type: string | null
          personnel_id: string
          previous_id: string | null
          replaced_by: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          visible_to_employee: boolean
        }
        Insert: {
          created_at?: string
          created_by: string
          document_type: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          personnel_id: string
          previous_id?: string | null
          replaced_by?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_to_employee?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string
          document_type?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          personnel_id?: string
          previous_id?: string | null
          replaced_by?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visible_to_employee?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "personnel_documents_dossier_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "personnel_documents"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_documents_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_documents_tenant_id_replaced_by_fkey"
            columns: ["tenant_id", "replaced_by"]
            isOneToOne: false
            referencedRelation: "personnel_documents"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_dossier_access: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          personnel_id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string
          created_at?: string
          id?: string
          personnel_id: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          personnel_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_dossier_access_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_dossier_deliveries: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          due_on: string
          id: string
          last_error: string | null
          personnel_id: string
          recipient: string
          recipient_user_id: string | null
          sent_at: string | null
          source_id: string
          source_revision: number
          source_table: string
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          due_on: string
          id?: string
          last_error?: string | null
          personnel_id: string
          recipient: string
          recipient_user_id?: string | null
          sent_at?: string | null
          source_id: string
          source_revision: number
          source_table: string
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          due_on?: string
          id?: string
          last_error?: string | null
          personnel_id?: string
          recipient?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          source_id?: string
          source_revision?: number
          source_table?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_dossier_deliveries_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_dossier_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          personnel_id: string
          revision: number
          snapshot: Json
          source_id: string
          source_table: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          personnel_id: string
          revision: number
          snapshot: Json
          source_id: string
          source_table: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          personnel_id?: string
          revision?: number
          snapshot?: Json
          source_id?: string
          source_table?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_dossier_history_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_dossier_items: {
        Row: {
          created_at: string
          dossier_data: Json
          dossier_managed: boolean
          dossier_revision: number
          dossier_status: string
          due_on: string | null
          id: string
          kind: string
          owner_user_id: string | null
          personnel_id: string
          previous_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          due_on?: string | null
          id?: string
          kind: string
          owner_user_id?: string | null
          personnel_id: string
          previous_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          due_on?: string | null
          id?: string
          kind?: string
          owner_user_id?: string | null
          personnel_id?: string
          previous_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_dossier_items_dossier_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "personnel_dossier_items"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_dossier_items_tenant_id_owner_user_id_fkey"
            columns: ["tenant_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "user_id"]
          },
          {
            foreignKeyName: "personnel_dossier_items_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_functions: {
        Row: {
          assigned_at: string
          function_id: string
          id: string
          personnel_id: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string
          function_id: string
          id?: string
          personnel_id: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string
          function_id?: string
          id?: string
          personnel_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_functions_tenant_id_function_id_fkey"
            columns: ["tenant_id", "function_id"]
            isOneToOne: false
            referencedRelation: "function_catalog"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_functions_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          dossier_data: Json
          dossier_managed: boolean
          dossier_revision: number
          dossier_status: string
          id: string
          personnel_id: string
          previous_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          id?: string
          personnel_id: string
          previous_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          dossier_data?: Json
          dossier_managed?: boolean
          dossier_revision?: number
          dossier_status?: string
          id?: string
          personnel_id?: string
          previous_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_notes_dossier_previous_fk"
            columns: ["tenant_id", "previous_id"]
            isOneToOne: false
            referencedRelation: "personnel_notes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_notes_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      personnel_travel_days: {
        Row: {
          day: string
          departure_address: Json | null
          departure_depot_id: string | null
          departure_kind: string | null
          personnel_id: string
          return_to_departure: boolean | null
          standard_vehicle: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          day: string
          departure_address?: Json | null
          departure_depot_id?: string | null
          departure_kind?: string | null
          personnel_id: string
          return_to_departure?: boolean | null
          standard_vehicle?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          day?: string
          departure_address?: Json | null
          departure_depot_id?: string | null
          departure_kind?: string | null
          personnel_id?: string
          return_to_departure?: boolean | null
          standard_vehicle?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "personnel_travel_days_tenant_id_departure_depot_id_fkey"
            columns: ["tenant_id", "departure_depot_id"]
            isOneToOne: false
            referencedRelation: "travel_depots"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "personnel_travel_days_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      planning_changes: {
        Row: {
          actor_user_id: string
          after_data: Json
          before_data: Json
          confirmed_warnings: Json
          created_at: string
          id: string
          tenant_id: string
          undone_by: string | null
          work_order_id: string
        }
        Insert: {
          actor_user_id: string
          after_data: Json
          before_data: Json
          confirmed_warnings?: Json
          created_at?: string
          id: string
          tenant_id: string
          undone_by?: string | null
          work_order_id: string
        }
        Update: {
          actor_user_id?: string
          after_data?: Json
          before_data?: Json
          confirmed_warnings?: Json
          created_at?: string
          id?: string
          tenant_id?: string
          undone_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_changes_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "planning_changes_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "planning_changes"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          revoked_at: string | null
          tenant_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          revoked_at?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          revoked_at?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_requirements: {
        Row: {
          active: boolean
          code: string
          hard_requirement: boolean
          id: string
          scope: string
          service_name: string | null
          subject_id: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          code: string
          hard_requirement?: boolean
          id?: string
          scope: string
          service_name?: string | null
          subject_id?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          code?: string
          hard_requirement?: boolean
          id?: string
          scope?: string
          service_name?: string | null
          subject_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_requirements_tenant_id_code_fkey"
            columns: ["tenant_id", "code"]
            isOneToOne: false
            referencedRelation: "qualification_types"
            referencedColumns: ["tenant_id", "code"]
          },
        ]
      }
      qualification_types: {
        Row: {
          active: boolean
          code: string
          id: string
          name: string
          reminder_days: number[]
          tenant_id: string
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          name: string
          reminder_days?: number[]
          tenant_id: string
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          name?: string
          reminder_days?: number[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualifications: {
        Row: {
          code: string
          created_at: string
          id: string
          issued_at: string | null
          name: string
          personnel_id: string
          tenant_id: string
          valid_until: string | null
          verified_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          issued_at?: string | null
          name: string
          personnel_id: string
          tenant_id: string
          valid_until?: string | null
          verified_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          issued_at?: string | null
          name?: string
          personnel_id?: string
          tenant_id?: string
          valid_until?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualifications_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      quotes: {
        Row: {
          acceptance_channel: string | null
          acceptance_evidence: string | null
          accepted_at: string | null
          accepted_by_name: string | null
          archived_at: string | null
          contact_id: string | null
          created_at: string
          currency: string
          customer_id: string
          expires_at: string | null
          followup_on: string | null
          id: string
          lines: Json
          logo_path: string | null
          next_action: string
          object_id: string | null
          operation_id: string | null
          owner_id: string | null
          pdf_path: string | null
          previous_id: string | null
          price_basis: string
          published_at: string | null
          quote_number: string
          request_id: string | null
          revision: number
          sent_at: string | null
          series_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["quote_status"]
          subject: string
          subtotal_cents: number
          superseded_at: string | null
          tenant_id: string
          terms: Json
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
          visit_request_id: string | null
          work_kind: string
        }
        Insert: {
          acceptance_channel?: string | null
          acceptance_evidence?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          expires_at?: string | null
          followup_on?: string | null
          id?: string
          lines?: Json
          logo_path?: string | null
          next_action?: string
          object_id?: string | null
          operation_id?: string | null
          owner_id?: string | null
          pdf_path?: string | null
          previous_id?: string | null
          price_basis?: string
          published_at?: string | null
          quote_number: string
          request_id?: string | null
          revision?: number
          sent_at?: string | null
          series_id?: string
          snapshot: Json
          status?: Database["public"]["Enums"]["quote_status"]
          subject?: string
          subtotal_cents: number
          superseded_at?: string | null
          tenant_id: string
          terms?: Json
          total_cents: number
          updated_at?: string
          vat_cents: number
          version?: number
          visit_request_id?: string | null
          work_kind?: string
        }
        Update: {
          acceptance_channel?: string | null
          acceptance_evidence?: string | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          expires_at?: string | null
          followup_on?: string | null
          id?: string
          lines?: Json
          logo_path?: string | null
          next_action?: string
          object_id?: string | null
          operation_id?: string | null
          owner_id?: string | null
          pdf_path?: string | null
          previous_id?: string | null
          price_basis?: string
          published_at?: string | null
          quote_number?: string
          request_id?: string | null
          revision?: number
          sent_at?: string | null
          series_id?: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          subject?: string
          subtotal_cents?: number
          superseded_at?: string | null
          tenant_id?: string
          terms?: Json
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          version?: number
          visit_request_id?: string | null
          work_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_contact_fk"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_operation_fk"
            columns: ["tenant_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_visit_request_id_fkey"
            columns: ["visit_request_id"]
            isOneToOne: false
            referencedRelation: "object_visit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          assigned_user_id: string | null
          completed_at: string | null
          created_at: string
          deduplication_key: string
          due_at: string
          id: string
          kind: string
          personnel_id: string | null
          source_id: string | null
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          deduplication_key: string
          due_at: string
          id?: string
          kind: string
          personnel_id?: string | null
          source_id?: string | null
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          deduplication_key?: string
          due_at?: string
          id?: string
          kind?: string
          personnel_id?: string | null
          source_id?: string | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      report_entries: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          customer_visible: boolean
          deleted_at: string | null
          id: string
          incident_severity: string | null
          incident_status: string | null
          is_incident: boolean
          tenant_id: string
          updated_at: string
          version: number
          work_order_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          id?: string
          incident_severity?: string | null
          incident_status?: string | null
          is_incident?: boolean
          tenant_id: string
          updated_at?: string
          version?: number
          work_order_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          customer_visible?: boolean
          deleted_at?: string | null
          id?: string
          incident_severity?: string | null
          incident_status?: string | null
          is_incident?: boolean
          tenant_id?: string
          updated_at?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_entries_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      requests: {
        Row: {
          archived_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_portal_group_id: string | null
          description: string
          discipline: string
          followup_on: string | null
          id: string
          next_action: string
          object_id: string | null
          outcome: string | null
          owner_id: string | null
          preferences: Json
          preferred_slot_id: string | null
          priority: string
          request_number: string
          source: string
          status: string
          subject: string
          tenant_id: string
          updated_at: string
          version: number
          work_kind: string
        }
        Insert: {
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_portal_group_id?: string | null
          description: string
          discipline: string
          followup_on?: string | null
          id?: string
          next_action?: string
          object_id?: string | null
          outcome?: string | null
          owner_id?: string | null
          preferences?: Json
          preferred_slot_id?: string | null
          priority?: string
          request_number: string
          source?: string
          status?: string
          subject?: string
          tenant_id: string
          updated_at?: string
          version?: number
          work_kind?: string
        }
        Update: {
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_portal_group_id?: string | null
          description?: string
          discipline?: string
          followup_on?: string | null
          id?: string
          next_action?: string
          object_id?: string | null
          outcome?: string | null
          owner_id?: string | null
          preferences?: Json
          preferred_slot_id?: string | null
          priority?: string
          request_number?: string
          source?: string
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          work_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "requests_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "requests_tenant_id_preferred_slot_id_fkey"
            columns: ["tenant_id", "preferred_slot_id"]
            isOneToOne: false
            referencedRelation: "appointment_slots"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      review_decisions: {
        Row: {
          created_at: string
          decided_by: string
          decision: string
          id: string
          reason: string | null
          report_version: number
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          decided_by: string
          decision: string
          id?: string
          reason?: string | null
          report_version: number
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          decided_by?: string
          decision?: string
          id?: string
          reason?: string | null
          report_version?: number
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      shift_interests: {
        Row: {
          created_at: string
          id: string
          open_shift_id: string
          personnel_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          open_shift_id: string
          personnel_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          open_shift_id?: string
          personnel_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_interests_tenant_id_open_shift_id_fkey"
            columns: ["tenant_id", "open_shift_id"]
            isOneToOne: false
            referencedRelation: "open_shifts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "shift_interests_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      signatures: {
        Row: {
          captured_by: string
          captured_by_name: string | null
          channel: string
          content_hash: string | null
          id: string
          report_id: string | null
          report_version: number
          revoked_at: string | null
          sha256: string
          signature_kind: string
          signed_at: string
          signer_capacity: string | null
          signer_name: string
          storage_path: string
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          captured_by: string
          captured_by_name?: string | null
          channel?: string
          content_hash?: string | null
          id?: string
          report_id?: string | null
          report_version: number
          revoked_at?: string | null
          sha256: string
          signature_kind?: string
          signed_at?: string
          signer_capacity?: string | null
          signer_name: string
          storage_path: string
          tenant_id: string
          work_order_id: string
        }
        Update: {
          captured_by?: string
          captured_by_name?: string | null
          channel?: string
          content_hash?: string | null
          id?: string
          report_id?: string | null
          report_version?: number
          revoked_at?: string | null
          sha256?: string
          signature_kind?: string
          signed_at?: string
          signer_capacity?: string | null
          signer_name?: string
          storage_path?: string
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_report_fk"
            columns: ["tenant_id", "report_id"]
            isOneToOne: false
            referencedRelation: "work_order_report_versions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "signatures_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      staff_day_reviews: {
        Row: {
          closed_at: string | null
          confirmed_at: string | null
          correction_requested_at: string | null
          created_at: string
          created_by: string
          day: string
          id: string
          note: string
          personnel_id: string
          state: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          closed_at?: string | null
          confirmed_at?: string | null
          correction_requested_at?: string | null
          created_at?: string
          created_by: string
          day: string
          id?: string
          note?: string
          personnel_id: string
          state?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          closed_at?: string | null
          confirmed_at?: string | null
          correction_requested_at?: string | null
          created_at?: string
          created_by?: string
          day?: string
          id?: string
          note?: string
          personnel_id?: string
          state?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_day_reviews_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      staff_leave_entitlements: {
        Row: {
          allowance_minutes: number
          calendar_year: number
          carryover_minutes: number
          created_at: string
          id: string
          personnel_id: string
          tenant_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          allowance_minutes: number
          calendar_year: number
          carryover_minutes?: number
          created_at?: string
          id?: string
          personnel_id: string
          tenant_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          allowance_minutes?: number
          calendar_year?: number
          carryover_minutes?: number
          created_at?: string
          id?: string
          personnel_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_entitlements_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      staff_leave_requests: {
        Row: {
          approved_minutes: number | null
          approved_minutes_by_year: Json
          availability_id: string | null
          created_at: string
          created_by: string
          ends_on: string
          id: string
          leave_type: string
          note: string
          personnel_id: string
          requested_minutes: number | null
          requested_minutes_by_year: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          starts_on: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          withdrawal_note: string | null
          withdrawn_at: string | null
        }
        Insert: {
          approved_minutes?: number | null
          approved_minutes_by_year?: Json
          availability_id?: string | null
          created_at?: string
          created_by: string
          ends_on: string
          id?: string
          leave_type: string
          note?: string
          personnel_id: string
          requested_minutes?: number | null
          requested_minutes_by_year?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_on: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          withdrawal_note?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          approved_minutes?: number | null
          approved_minutes_by_year?: Json
          availability_id?: string | null
          created_at?: string
          created_by?: string
          ends_on?: string
          id?: string
          leave_type?: string
          note?: string
          personnel_id?: string
          requested_minutes?: number | null
          requested_minutes_by_year?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          starts_on?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          withdrawal_note?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_requests_tenant_id_availability_id_fkey"
            columns: ["tenant_id", "availability_id"]
            isOneToOne: false
            referencedRelation: "availability"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "staff_leave_requests_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      staff_time_correction_requests: {
        Row: {
          correction_mode: string
          created_at: string
          created_by: string
          id: string
          personnel_id: string
          reason: string
          requested_duration_minutes: number
          requested_ends_at: string
          requested_starts_at: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_day_state: string
          source_ends_at: string
          source_kind: string
          source_starts_at: string
          source_status: string
          source_version: number
          status: string
          tenant_id: string
          time_entry_id: string
          updated_at: string
          version: number
        }
        Insert: {
          correction_mode: string
          created_at?: string
          created_by: string
          id?: string
          personnel_id: string
          reason: string
          requested_duration_minutes: number
          requested_ends_at: string
          requested_starts_at: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_day_state: string
          source_ends_at: string
          source_kind: string
          source_starts_at: string
          source_status: string
          source_version: number
          status?: string
          tenant_id: string
          time_entry_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          correction_mode?: string
          created_at?: string
          created_by?: string
          id?: string
          personnel_id?: string
          reason?: string
          requested_duration_minutes?: number
          requested_ends_at?: string
          requested_starts_at?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_day_state?: string
          source_ends_at?: string
          source_kind?: string
          source_starts_at?: string
          source_status?: string
          source_version?: number
          status?: string
          tenant_id?: string
          time_entry_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_correction_requests_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "staff_time_correction_requests_tenant_id_time_entry_id_fkey"
            columns: ["tenant_id", "time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      staff_workspace_revisions: {
        Row: {
          revision: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          revision?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          revision?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_workspace_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      status_events: {
        Row: {
          actor_user_id: string | null
          assignment_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          new_status: Database["public"]["Enums"]["work_order_status"]
          note: string | null
          previous_status:
            | Database["public"]["Enums"]["work_order_status"]
            | null
          reason_code: string | null
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          new_status: Database["public"]["Enums"]["work_order_status"]
          note?: string | null
          previous_status?:
            | Database["public"]["Enums"]["work_order_status"]
            | null
          reason_code?: string | null
          tenant_id: string
          work_order_id: string
        }
        Update: {
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          new_status?: Database["public"]["Enums"]["work_order_status"]
          note?: string | null
          previous_status?:
            | Database["public"]["Enums"]["work_order_status"]
            | null
          reason_code?: string | null
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_events_tenant_id_assignment_id_fkey"
            columns: ["tenant_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "work_order_assignments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "status_events_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      task_catalog: {
        Row: {
          active: boolean
          category_id: string | null
          code: string
          created_at: string
          description: string | null
          discipline: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          discipline: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          discipline?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_catalog_tenant_id_category_id_fkey"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "task_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          next_number: number
          prefix: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          next_number?: number
          prefix: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          next_number?: number
          prefix?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_revisions: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          price_cents: number
          requires_customer_signature: boolean
          requires_photo: boolean
          revision: number
          task_id: string
          tenant_id: string
          unit: string
          valid_from: string
          valid_until: string | null
          vat_basis_points: number
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          price_cents: number
          requires_customer_signature?: boolean
          requires_photo?: boolean
          revision: number
          task_id: string
          tenant_id: string
          unit?: string
          valid_from?: string
          valid_until?: string | null
          vat_basis_points?: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          price_cents?: number
          requires_customer_signature?: boolean
          requires_photo?: boolean
          revision?: number
          task_id?: string
          tenant_id?: string
          unit?: string
          valid_from?: string
          valid_until?: string | null
          vat_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_revisions_tenant_id_task_id_fkey"
            columns: ["tenant_id", "task_id"]
            isOneToOne: false
            referencedRelation: "task_catalog"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      tenant_admin_invitations: {
        Row: {
          auth_user_id: string | null
          bound_at: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string | null
          last_error: string | null
          request_fingerprint: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          bound_at?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          invited_at?: string | null
          last_error?: string | null
          request_fingerprint?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          bound_at?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          last_error?: string | null
          request_fingerprint?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_admin_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          accent_color: string
          logo_path: string | null
          pdf_footer: string | null
          primary_color: string
          sender_email: string | null
          sender_name: string | null
          surface_color: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          logo_path?: string | null
          pdf_footer?: string | null
          primary_color?: string
          sender_email?: string | null
          sender_name?: string | null
          surface_color?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          logo_path?: string | null
          pdf_footer?: string | null
          primary_color?: string
          sender_email?: string | null
          sender_name?: string | null
          surface_color?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          host: string
          id: string
          tenant_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          tenant_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          tenant_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          activated_at: string | null
          created_at: string
          id: string
          invited_at: string
          revoked_at: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          revoked_at?: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          revoked_at?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_message_template_revisions: {
        Row: {
          actor_user_id: string | null
          body: string
          channel: string
          created_at: string
          customized: boolean
          id: string
          revision: number
          subject: string
          template_key: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body: string
          channel: string
          created_at?: string
          customized: boolean
          id?: string
          revision: number
          subject: string
          template_key: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          customized?: boolean
          id?: string
          revision?: number
          subject?: string
          template_key?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_message_template_revisions_tenant_id_template_key_fkey"
            columns: ["tenant_id", "template_key"]
            isOneToOne: false
            referencedRelation: "tenant_message_templates"
            referencedColumns: ["tenant_id", "template_key"]
          },
        ]
      }
      tenant_message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          customized: boolean
          default_body: string
          default_subject: string
          revision: number
          subject: string
          template_key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          customized?: boolean
          default_body: string
          default_subject: string
          revision?: number
          subject: string
          template_key: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          customized?: boolean
          default_body?: string
          default_subject?: string
          revision?: number
          subject?: string
          template_key?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_provider_connections: {
        Row: {
          active: boolean
          created_at: string
          id: string
          mode: string
          provider: string
          public_config: Json
          secret_reference: string | null
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          mode: string
          provider: string
          public_config?: Json
          secret_reference?: string | null
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          mode?: string
          provider?: string
          public_config?: Json
          secret_reference?: string | null
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_provider_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          appointment_blocks: Json
          bill_travel_default: boolean
          contract_reminder_days: number
          enabled_services: string[]
          invoice_prefix: string
          payment_terms_days: number
          personnel_number_prefix: string
          personnel_number_start: number
          settings: Json
          signature_required_default: boolean
          task_code_prefix: string
          tenant_id: string
          travel_margin_minutes: number
          travel_vehicle_margins: Json
          updated_at: string
          white_label_enabled: boolean
        }
        Insert: {
          appointment_blocks?: Json
          bill_travel_default?: boolean
          contract_reminder_days?: number
          enabled_services?: string[]
          invoice_prefix?: string
          payment_terms_days?: number
          personnel_number_prefix?: string
          personnel_number_start?: number
          settings?: Json
          signature_required_default?: boolean
          task_code_prefix?: string
          tenant_id: string
          travel_margin_minutes?: number
          travel_vehicle_margins?: Json
          updated_at?: string
          white_label_enabled?: boolean
        }
        Update: {
          appointment_blocks?: Json
          bill_travel_default?: boolean
          contract_reminder_days?: number
          enabled_services?: string[]
          invoice_prefix?: string
          payment_terms_days?: number
          personnel_number_prefix?: string
          personnel_number_start?: number
          settings?: Json
          signature_required_default?: boolean
          task_code_prefix?: string
          tenant_id?: string
          travel_margin_minutes?: number
          travel_vehicle_margins?: Json
          updated_at?: string
          white_label_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          onboarding_key: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          onboarding_key?: string | null
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          onboarding_key?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      ticket_categories: {
        Row: {
          archived_at: string | null
          auto_close_days: number | null
          can_escalate: boolean
          code: string
          confidential: boolean
          created_at: string
          customer_visible: boolean
          default_assignee_id: string | null
          default_group_id: string | null
          description: string
          fallback_category_id: string | null
          fallback_group_id: string | null
          first_response_minutes: number
          id: string
          name: string
          pause_while_waiting: boolean
          resolution_minutes: number
          retention_profile: string | null
          revision: number
          route: string
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          archived_at?: string | null
          auto_close_days?: number | null
          can_escalate?: boolean
          code: string
          confidential?: boolean
          created_at?: string
          customer_visible?: boolean
          default_assignee_id?: string | null
          default_group_id?: string | null
          description?: string
          fallback_category_id?: string | null
          fallback_group_id?: string | null
          first_response_minutes?: number
          id?: string
          name: string
          pause_while_waiting?: boolean
          resolution_minutes?: number
          retention_profile?: string | null
          revision?: number
          route: string
          sort_order?: number
          tenant_id?: string | null
        }
        Update: {
          archived_at?: string | null
          auto_close_days?: number | null
          can_escalate?: boolean
          code?: string
          confidential?: boolean
          created_at?: string
          customer_visible?: boolean
          default_assignee_id?: string | null
          default_group_id?: string | null
          description?: string
          fallback_category_id?: string | null
          fallback_group_id?: string | null
          first_response_minutes?: number
          id?: string
          name?: string
          pause_while_waiting?: boolean
          resolution_minutes?: number
          retention_profile?: string | null
          revision?: number
          route?: string
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_categories_default_group_id_fkey"
            columns: ["default_group_id"]
            isOneToOne: false
            referencedRelation: "ticket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_categories_fallback_category_id_fkey"
            columns: ["fallback_category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_categories_fallback_group_id_fkey"
            columns: ["fallback_group_id"]
            isOneToOne: false
            referencedRelation: "ticket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          actor_user_id: string | null
          audience: string
          created_at: string
          id: string
          label: string
          tenant_id: string
          ticket_id: string
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          audience: string
          created_at?: string
          id?: string
          label: string
          tenant_id: string
          ticket_id: string
          type: string
        }
        Update: {
          actor_user_id?: string | null
          audience?: string
          created_at?: string
          id?: string
          label?: string
          tenant_id?: string
          ticket_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_tenant_id_ticket_id_fkey"
            columns: ["tenant_id", "ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ticket_files: {
        Row: {
          audience: string
          category_id: string
          copied_by: string | null
          created_at: string
          deleted_at: string | null
          draft_id: string
          error_code: string | null
          expires_at: string
          id: string
          message_id: string | null
          mime_type: string
          original_name: string
          quarantine_path: string
          scan_attempts: number
          scan_available_at: string
          scan_lease: string | null
          scan_locked_until: string | null
          scan_status: string
          scanned_at: string | null
          scanner_database: string | null
          scanner_engine: string | null
          sha256: string | null
          size_bytes: number
          source_file_id: string | null
          source_sha256: string | null
          storage_deleted_at: string | null
          storage_path: string | null
          tenant_id: string
          ticket_id: string | null
          upload_sha256: string | null
          upload_size_bytes: number | null
          uploader_id: string
          uploader_session_id: string | null
          workspace: string
        }
        Insert: {
          audience: string
          category_id: string
          copied_by?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_id: string
          error_code?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          mime_type: string
          original_name: string
          quarantine_path: string
          scan_attempts?: number
          scan_available_at?: string
          scan_lease?: string | null
          scan_locked_until?: string | null
          scan_status?: string
          scanned_at?: string | null
          scanner_database?: string | null
          scanner_engine?: string | null
          sha256?: string | null
          size_bytes: number
          source_file_id?: string | null
          source_sha256?: string | null
          storage_deleted_at?: string | null
          storage_path?: string | null
          tenant_id: string
          ticket_id?: string | null
          upload_sha256?: string | null
          upload_size_bytes?: number | null
          uploader_id: string
          uploader_session_id?: string | null
          workspace: string
        }
        Update: {
          audience?: string
          category_id?: string
          copied_by?: string | null
          created_at?: string
          deleted_at?: string | null
          draft_id?: string
          error_code?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          mime_type?: string
          original_name?: string
          quarantine_path?: string
          scan_attempts?: number
          scan_available_at?: string
          scan_lease?: string | null
          scan_locked_until?: string | null
          scan_status?: string
          scanned_at?: string | null
          scanner_database?: string | null
          scanner_engine?: string | null
          sha256?: string | null
          size_bytes?: number
          source_file_id?: string | null
          source_sha256?: string | null
          storage_deleted_at?: string | null
          storage_path?: string | null
          tenant_id?: string
          ticket_id?: string | null
          upload_sha256?: string | null
          upload_size_bytes?: number | null
          uploader_id?: string
          uploader_session_id?: string | null
          workspace?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_files_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_files_message_parent_fk"
            columns: ["tenant_id", "ticket_id", "message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["tenant_id", "ticket_id", "id"]
          },
          {
            foreignKeyName: "ticket_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_files_tenant_id_message_id_fkey"
            columns: ["tenant_id", "message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ticket_files_tenant_id_source_file_id_fkey"
            columns: ["tenant_id", "source_file_id"]
            isOneToOne: false
            referencedRelation: "ticket_files"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ticket_files_tenant_id_ticket_id_fkey"
            columns: ["tenant_id", "ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ticket_group_members: {
        Row: {
          group_id: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ticket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_groups: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          revision: number
          tenant_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          revision?: number
          tenant_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          revision?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          audience: string
          author_context: string
          author_name: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          audience: string
          author_context?: string
          author_name: string
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          tenant_id: string
          ticket_id: string
        }
        Update: {
          audience?: string
          author_context?: string
          author_name?: string
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_tenant_id_ticket_id_fkey"
            columns: ["tenant_id", "ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      ticket_notification_preferences: {
        Row: {
          context: string
          email: boolean
          id: string
          in_app: boolean
          push: boolean
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          context: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          context?: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          archived_at: string | null
          assigned_group_id: string | null
          assigned_user_id: string | null
          audience_activity: Json
          audience_revisions: Json
          category_id: string
          closed_at: string | null
          context_snapshot: Json
          created_at: string
          customer_id: string | null
          first_response_at: string | null
          first_response_due_at: string | null
          id: string
          module: string
          needed_before: string | null
          next_step: string | null
          next_step_message_id: string | null
          number: string
          object_id: string | null
          paused_minutes: Json | null
          personnel_id: string | null
          priority: string
          reporter_name: string
          reporter_personnel_id: string | null
          reporter_user_id: string
          resolution_due_at: string | null
          resolution_message_id: string | null
          resolved_at: string | null
          revision: number
          route: string
          status: string
          technical_context: Json
          tenant_id: string
          title: string
          updated_at: string
          wait_started_at: string | null
          work_order_id: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_group_id?: string | null
          assigned_user_id?: string | null
          audience_activity?: Json
          audience_revisions?: Json
          category_id: string
          closed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          customer_id?: string | null
          first_response_at?: string | null
          first_response_due_at?: string | null
          id?: string
          module?: string
          needed_before?: string | null
          next_step?: string | null
          next_step_message_id?: string | null
          number: string
          object_id?: string | null
          paused_minutes?: Json | null
          personnel_id?: string | null
          priority?: string
          reporter_name: string
          reporter_personnel_id?: string | null
          reporter_user_id: string
          resolution_due_at?: string | null
          resolution_message_id?: string | null
          resolved_at?: string | null
          revision?: number
          route: string
          status?: string
          technical_context?: Json
          tenant_id: string
          title: string
          updated_at?: string
          wait_started_at?: string | null
          work_order_id?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_group_id?: string | null
          assigned_user_id?: string | null
          audience_activity?: Json
          audience_revisions?: Json
          category_id?: string
          closed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          customer_id?: string | null
          first_response_at?: string | null
          first_response_due_at?: string | null
          id?: string
          module?: string
          needed_before?: string | null
          next_step?: string | null
          next_step_message_id?: string | null
          number?: string
          object_id?: string | null
          paused_minutes?: Json | null
          personnel_id?: string | null
          priority?: string
          reporter_name?: string
          reporter_personnel_id?: string | null
          reporter_user_id?: string
          resolution_due_at?: string | null
          resolution_message_id?: string | null
          resolved_at?: string | null
          revision?: number
          route?: string
          status?: string
          technical_context?: Json
          tenant_id?: string
          title?: string
          updated_at?: string
          wait_started_at?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "ticket_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_next_step_message_id_fkey"
            columns: ["next_step_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_resolution_message_id_fkey"
            columns: ["resolution_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_reporter_personnel_id_fkey"
            columns: ["tenant_id", "reporter_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assignment_id: string | null
          correction_reason: string | null
          created_at: string
          ends_at: string | null
          id: string
          kind: string
          personnel_id: string
          starts_at: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_id?: string | null
          correction_reason?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind: string
          personnel_id: string
          starts_at: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_id?: string | null
          correction_reason?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: string
          personnel_id?: string
          starts_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_tenant_id_assignment_id_fkey"
            columns: ["tenant_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "work_order_assignments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "time_entries_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      travel_depots: {
        Row: {
          active: boolean
          address: Json
          id: string
          name: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          address?: Json
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          address?: Json
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "travel_depots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_legs: {
        Row: {
          actual_ended_at: string | null
          actual_started_at: string | null
          assignment_id: string
          basis_calculated_at: string | null
          basis_distance_metres: number | null
          basis_seconds: number | null
          billable: boolean
          calculated_at: string | null
          created_at: string
          destination_address: Json
          direction: string
          error_code: string | null
          estimate_snapshot: Json | null
          estimated_distance_metres: number | null
          estimated_minutes: number | null
          id: string
          manual_metres: number | null
          manual_reason: string | null
          manual_seconds: number | null
          manual_signature: string | null
          manual_updated_at: string | null
          manual_updated_by: string | null
          origin_address: Json
          planning_day: string | null
          planning_margin_minutes: number
          planning_revision: number | null
          provider: string | null
          provider_reference: string | null
          route_signature: string | null
          routing_profile: string | null
          tenant_id: string
          travel_mode: string
        }
        Insert: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          assignment_id: string
          basis_calculated_at?: string | null
          basis_distance_metres?: number | null
          basis_seconds?: number | null
          billable?: boolean
          calculated_at?: string | null
          created_at?: string
          destination_address: Json
          direction: string
          error_code?: string | null
          estimate_snapshot?: Json | null
          estimated_distance_metres?: number | null
          estimated_minutes?: number | null
          id?: string
          manual_metres?: number | null
          manual_reason?: string | null
          manual_seconds?: number | null
          manual_signature?: string | null
          manual_updated_at?: string | null
          manual_updated_by?: string | null
          origin_address: Json
          planning_day?: string | null
          planning_margin_minutes?: number
          planning_revision?: number | null
          provider?: string | null
          provider_reference?: string | null
          route_signature?: string | null
          routing_profile?: string | null
          tenant_id: string
          travel_mode: string
        }
        Update: {
          actual_ended_at?: string | null
          actual_started_at?: string | null
          assignment_id?: string
          basis_calculated_at?: string | null
          basis_distance_metres?: number | null
          basis_seconds?: number | null
          billable?: boolean
          calculated_at?: string | null
          created_at?: string
          destination_address?: Json
          direction?: string
          error_code?: string | null
          estimate_snapshot?: Json | null
          estimated_distance_metres?: number | null
          estimated_minutes?: number | null
          id?: string
          manual_metres?: number | null
          manual_reason?: string | null
          manual_seconds?: number | null
          manual_signature?: string | null
          manual_updated_at?: string | null
          manual_updated_by?: string | null
          origin_address?: Json
          planning_day?: string | null
          planning_margin_minutes?: number
          planning_revision?: number | null
          provider?: string | null
          provider_reference?: string | null
          route_signature?: string | null
          routing_profile?: string | null
          tenant_id?: string
          travel_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_legs_tenant_id_assignment_id_fkey"
            columns: ["tenant_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "work_order_assignments"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_allowed_extra_work: {
        Row: {
          created_at: string
          extra_work_rule_id: string
          id: string
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          extra_work_rule_id: string
          id?: string
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          extra_work_rule_id?: string
          id?: string
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_allowed_extra_work_tenant_id_extra_work_rule_id_fkey"
            columns: ["tenant_id", "extra_work_rule_id"]
            isOneToOne: false
            referencedRelation: "extra_work_rules"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_allowed_extra_work_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_assignments: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          created_at: string
          departed_at: string | null
          id: string
          paused_at: string | null
          personnel_id: string
          planned_end_at: string
          planned_start_at: string
          projected_end_at: string
          projected_start_at: string
          qualification_snapshot: Json
          return_note: string | null
          return_reason_code: string | null
          seen_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          version: number
          work_order_id: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          created_at?: string
          departed_at?: string | null
          id?: string
          paused_at?: string | null
          personnel_id: string
          planned_end_at: string
          planned_start_at: string
          projected_end_at: string
          projected_start_at: string
          qualification_snapshot?: Json
          return_note?: string | null
          return_reason_code?: string | null
          seen_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          work_order_id: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          created_at?: string
          departed_at?: string | null
          id?: string
          paused_at?: string | null
          personnel_id?: string
          planned_end_at?: string
          planned_start_at?: string
          projected_end_at?: string
          projected_start_at?: string
          qualification_snapshot?: Json
          return_note?: string | null
          return_reason_code?: string | null
          seen_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_assignments_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_assignments_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_checklist_answers: {
        Row: {
          attachment_id: string | null
          checklist_id: string
          id: string
          not_applicable: boolean
          question_id: string
          reason: string
          tenant_id: string
          updated_at: string
          updated_by: string
          value: Json | null
          version: number
        }
        Insert: {
          attachment_id?: string | null
          checklist_id: string
          id?: string
          not_applicable?: boolean
          question_id: string
          reason?: string
          tenant_id: string
          updated_at?: string
          updated_by: string
          value?: Json | null
          version?: number
        }
        Update: {
          attachment_id?: string | null
          checklist_id?: string
          id?: string
          not_applicable?: boolean
          question_id?: string
          reason?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string
          value?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_order_checklist_answers_tenant_id_attachment_id_fkey"
            columns: ["tenant_id", "attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_checklist_answers_tenant_id_checklist_id_fkey"
            columns: ["tenant_id", "checklist_id"]
            isOneToOne: false
            referencedRelation: "work_order_checklists"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_checklists: {
        Row: {
          created_at: string
          definition: Json
          id: string
          name: string
          template_revision_id: string
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          name: string
          template_revision_id: string
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          template_revision_id?: string
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_checklists_tenant_id_template_revision_id_fkey"
            columns: ["tenant_id", "template_revision_id"]
            isOneToOne: false
            referencedRelation: "work_order_template_versions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_checklists_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_contacts: {
        Row: {
          contact_id: string
          id: string
          roles: string[]
          snapshot: Json
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          contact_id: string
          id?: string
          roles: string[]
          snapshot: Json
          tenant_id: string
          work_order_id: string
        }
        Update: {
          contact_id?: string
          id?: string
          roles?: string[]
          snapshot?: Json
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_contacts_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_contacts_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_exceptions: {
        Row: {
          attachment_id: string | null
          blocking: boolean
          created_at: string
          created_by: string
          description: string
          id: string
          kind: string
          owner_user_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          state: string
          tenant_id: string
          version: number
          work_order_id: string
        }
        Insert: {
          attachment_id?: string | null
          blocking?: boolean
          created_at?: string
          created_by: string
          description: string
          id: string
          kind: string
          owner_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          tenant_id: string
          version?: number
          work_order_id: string
        }
        Update: {
          attachment_id?: string | null
          blocking?: boolean
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          kind?: string
          owner_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          state?: string
          tenant_id?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_exceptions_tenant_id_attachment_id_fkey"
            columns: ["tenant_id", "attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_exceptions_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_expenses: {
        Row: {
          amount_cents: number
          assignment_id: string
          created_at: string
          created_by: string
          customer_visible: boolean
          description: string
          id: string
          personnel_id: string
          tenant_id: string
          updated_at: string
          version: number
          work_order_id: string
        }
        Insert: {
          amount_cents: number
          assignment_id: string
          created_at?: string
          created_by: string
          customer_visible?: boolean
          description: string
          id?: string
          personnel_id: string
          tenant_id: string
          updated_at?: string
          version?: number
          work_order_id: string
        }
        Update: {
          amount_cents?: number
          assignment_id?: string
          created_at?: string
          created_by?: string
          customer_visible?: boolean
          description?: string
          id?: string
          personnel_id?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_expenses_tenant_id_assignment_id_fkey"
            columns: ["tenant_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "work_order_assignments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_expenses_tenant_id_personnel_id_fkey"
            columns: ["tenant_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_expenses_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_material_usage: {
        Row: {
          created_at: string
          created_by: string
          customer_visible: boolean
          description: string
          id: string
          quantity: number
          task_id: string | null
          tenant_id: string
          unit: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_visible?: boolean
          description: string
          id?: string
          quantity: number
          task_id?: string | null
          tenant_id: string
          unit: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_visible?: boolean
          description?: string
          id?: string
          quantity?: number
          task_id?: string | null
          tenant_id?: string
          unit?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_material_usage_tenant_id_task_id_fkey"
            columns: ["tenant_id", "task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_material_usage_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_occurrences: {
        Row: {
          created_at: string
          generated_order_version: number | null
          occurrence_on: string
          reason: string
          series_id: string
          series_version: number
          state: string
          tenant_id: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          generated_order_version?: number | null
          occurrence_on: string
          reason?: string
          series_id: string
          series_version: number
          state: string
          tenant_id: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          generated_order_version?: number | null
          occurrence_on?: string
          reason?: string
          series_id?: string
          series_version?: number
          state?: string
          tenant_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_order_occurrences_tenant_id_series_id_fkey"
            columns: ["tenant_id", "series_id"]
            isOneToOne: false
            referencedRelation: "work_order_series"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_occurrences_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_relations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          reason: string
          source_order_id: string
          target_order_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          reason?: string
          source_order_id: string
          target_order_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          reason?: string
          source_order_id?: string
          target_order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_relations_tenant_id_source_order_id_fkey"
            columns: ["tenant_id", "source_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_relations_tenant_id_target_order_id_fkey"
            columns: ["tenant_id", "target_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_report_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content_hash: string
          created_at: string
          created_by: string
          id: string
          signature_policy: Json
          snapshot: Json
          state: string
          submission_key: string
          tenant_id: string
          version: number
          work_order_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          signature_policy: Json
          snapshot: Json
          state: string
          submission_key: string
          tenant_id: string
          version: number
          work_order_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          signature_policy?: Json
          snapshot?: Json
          state?: string
          submission_key?: string
          tenant_id?: string
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_report_versions_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_scope_transfers: {
        Row: {
          created_at: string
          created_by: string
          id: string
          quantity: number
          reason: string
          source_task_id: string
          target_order_id: string
          target_task_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          quantity: number
          reason: string
          source_task_id: string
          target_order_id: string
          target_task_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          quantity?: number
          reason?: string
          source_task_id?: string
          target_order_id?: string
          target_task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_scope_transfers_tenant_id_source_task_id_fkey"
            columns: ["tenant_id", "source_task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_scope_transfers_tenant_id_target_order_id_fkey"
            columns: ["tenant_id", "target_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_scope_transfers_tenant_id_target_task_id_fkey"
            columns: ["tenant_id", "target_task_id"]
            isOneToOne: true
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_series: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          definition: Json
          id: string
          source_order_id: string
          tenant_id: string
          timezone: string
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          definition: Json
          id?: string
          source_order_id: string
          tenant_id: string
          timezone: string
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          definition?: Json
          id?: string
          source_order_id?: string
          tenant_id?: string
          timezone?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_order_series_tenant_id_source_order_id_fkey"
            columns: ["tenant_id", "source_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_signature_waivers: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          reason: string
          report_id: string
          tenant_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          reason: string
          report_id: string
          tenant_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          reason?: string
          report_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_signature_waivers_tenant_id_report_id_fkey"
            columns: ["tenant_id", "report_id"]
            isOneToOne: true
            referencedRelation: "work_order_report_versions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_task_contributions: {
        Row: {
          actor_id: string
          execution_version: number
          from_quantity: number
          id: string
          note: string | null
          recorded_at: string
          result: string
          task_id: string
          tenant_id: string
          to_quantity: number
        }
        Insert: {
          actor_id: string
          execution_version: number
          from_quantity: number
          id?: string
          note?: string | null
          recorded_at?: string
          result: string
          task_id: string
          tenant_id: string
          to_quantity: number
        }
        Update: {
          actor_id?: string
          execution_version?: number
          from_quantity?: number
          id?: string
          note?: string | null
          recorded_at?: string
          result?: string
          task_id?: string
          tenant_id?: string
          to_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_order_task_contributions_tenant_id_task_id_fkey"
            columns: ["tenant_id", "task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_tasks: {
        Row: {
          added_by: string | null
          agreement_line_id: string | null
          allowed_for_staff: boolean
          assigned_personnel_id: string | null
          commercial_snapshot: Json
          completed_at: string | null
          completion_note: string | null
          created_at: string
          duration_minutes: number
          executed_quantity: number | null
          execution_state: string
          execution_version: number
          extra_work_status: string | null
          id: string
          instructions: string
          is_extra_work: boolean
          quantity: number
          scope_root_task_id: string | null
          staff_request_reason: string | null
          staff_requested_amount_cents: number | null
          task_code: string
          task_name: string
          task_revision_id: string | null
          tenant_id: string
          transferred_quantity: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          withdrawn_quantity: number
          work_order_id: string
        }
        Insert: {
          added_by?: string | null
          agreement_line_id?: string | null
          allowed_for_staff?: boolean
          assigned_personnel_id?: string | null
          commercial_snapshot?: Json
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          duration_minutes: number
          executed_quantity?: number | null
          execution_state?: string
          execution_version?: number
          extra_work_status?: string | null
          id?: string
          instructions?: string
          is_extra_work?: boolean
          quantity?: number
          scope_root_task_id?: string | null
          staff_request_reason?: string | null
          staff_requested_amount_cents?: number | null
          task_code: string
          task_name: string
          task_revision_id?: string | null
          tenant_id: string
          transferred_quantity?: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          withdrawn_quantity?: number
          work_order_id: string
        }
        Update: {
          added_by?: string | null
          agreement_line_id?: string | null
          allowed_for_staff?: boolean
          assigned_personnel_id?: string | null
          commercial_snapshot?: Json
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          duration_minutes?: number
          executed_quantity?: number | null
          execution_state?: string
          execution_version?: number
          extra_work_status?: string | null
          id?: string
          instructions?: string
          is_extra_work?: boolean
          quantity?: number
          scope_root_task_id?: string | null
          staff_request_reason?: string | null
          staff_requested_amount_cents?: number | null
          task_code?: string
          task_name?: string
          task_revision_id?: string | null
          tenant_id?: string
          transferred_quantity?: number
          unit?: string
          unit_price_cents?: number
          vat_basis_points?: number
          withdrawn_quantity?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_agreement_line_fk"
            columns: ["tenant_id", "agreement_line_id"]
            isOneToOne: false
            referencedRelation: "customer_agreement_lines"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_scope_root_fk"
            columns: ["tenant_id", "scope_root_task_id"]
            isOneToOne: false
            referencedRelation: "work_order_tasks"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_tasks_personnel_fk"
            columns: ["tenant_id", "assigned_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_tasks_tenant_id_task_revision_id_fkey"
            columns: ["tenant_id", "task_revision_id"]
            isOneToOne: false
            referencedRelation: "task_revisions"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_order_tasks_tenant_id_work_order_id_fkey"
            columns: ["tenant_id", "work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_template_versions: {
        Row: {
          created_at: string
          created_by: string
          definition: Json
          edit_version: number
          id: string
          published_at: string | null
          state: string
          template_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          definition?: Json
          edit_version?: number
          id?: string
          published_at?: string | null
          state?: string
          template_id: string
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: Json
          edit_version?: number
          id?: string
          published_at?: string | null
          state?: string
          template_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_order_template_versions_tenant_id_template_id_fkey"
            columns: ["tenant_id", "template_id"]
            isOneToOne: false
            referencedRelation: "work_order_templates"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      work_order_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          appointment_slot_id?: string | null
          archive_at?: string | null
          attention_reason?: string | null
          bill_travel?: boolean
          budget_labor_minutes?: number | null
          commercial_terms?: Json
          created_at?: string
          created_by: string
          customer_id: string
          customer_window_kind?: string
          day_instructions?: string
          deadline?: string | null
          description?: string
          details?: Json
          discipline: string
          employee_signature_required?: boolean
          id?: string
          labels?: string[]
          lead_personnel_id?: string | null
          object_id: string
          object_snapshot?: Json
          planned_end_at?: string | null
          planned_start_at?: string | null
          planner_user_id?: string | null
          planning_state?: string
          priority?: string
          projected_end_at?: string | null
          projected_start_at?: string | null
          published_at?: string | null
          quote_id?: string | null
          report_state?: string
          report_version?: number
          request_id?: string | null
          requested_date?: string | null
          required_personnel?: number
          signature_mode?: string
          signature_policy_snapshot?: Json | null
          signature_required?: boolean
          source_kind?: string
          status?: Database["public"]["Enums"]["work_order_status"]
          template_snapshot?: Json
          tenant_id: string
          title?: string
          updated_at?: string
          version?: number
          visit_kind?: string
          work_order_number: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          appointment_slot_id?: string | null
          archive_at?: string | null
          attention_reason?: string | null
          bill_travel?: boolean
          budget_labor_minutes?: number | null
          commercial_terms?: Json
          created_at?: string
          created_by?: string
          customer_id?: string
          customer_window_kind?: string
          day_instructions?: string
          deadline?: string | null
          description?: string
          details?: Json
          discipline?: string
          employee_signature_required?: boolean
          id?: string
          labels?: string[]
          lead_personnel_id?: string | null
          object_id?: string
          object_snapshot?: Json
          planned_end_at?: string | null
          planned_start_at?: string | null
          planner_user_id?: string | null
          planning_state?: string
          priority?: string
          projected_end_at?: string | null
          projected_start_at?: string | null
          published_at?: string | null
          quote_id?: string | null
          report_state?: string
          report_version?: number
          request_id?: string | null
          requested_date?: string | null
          required_personnel?: number
          signature_mode?: string
          signature_policy_snapshot?: Json | null
          signature_required?: boolean
          source_kind?: string
          status?: Database["public"]["Enums"]["work_order_status"]
          template_snapshot?: Json
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number
          visit_kind?: string
          work_order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_lead_fk"
            columns: ["tenant_id", "lead_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_appointment_slot_id_fkey"
            columns: ["tenant_id", "appointment_slot_id"]
            isOneToOne: false
            referencedRelation: "appointment_slots"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_object_id_fkey"
            columns: ["tenant_id", "object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_quote_id_fkey"
            columns: ["tenant_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_object_proposal: {
        Args: { target_proposal: string; target_tenant: string }
        Returns: undefined
      }
      account_guide_state: { Args: never; Returns: string[] }
      acknowledge_object_instruction: {
        Args: {
          expected_version: number
          target_order: string
          target_record: string
          target_tenant: string
        }
        Returns: undefined
      }
      acknowledge_object_request: {
        Args: {
          expected_version: number
          target_request: string
          target_tenant: string
        }
        Returns: undefined
      }
      add_extra_work: {
        Args: {
          idempotency_key: string
          target_extra_work_rule_id: string
          target_work_order_id: string
        }
        Returns: {
          added_by: string | null
          agreement_line_id: string | null
          allowed_for_staff: boolean
          assigned_personnel_id: string | null
          commercial_snapshot: Json
          completed_at: string | null
          completion_note: string | null
          created_at: string
          duration_minutes: number
          executed_quantity: number | null
          execution_state: string
          execution_version: number
          extra_work_status: string | null
          id: string
          instructions: string
          is_extra_work: boolean
          quantity: number
          scope_root_task_id: string | null
          staff_request_reason: string | null
          staff_requested_amount_cents: number | null
          task_code: string
          task_name: string
          task_revision_id: string | null
          tenant_id: string
          transferred_quantity: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          withdrawn_quantity: number
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_order_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      answer_work_order_checklist: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      apply_confirmed_provider_payment: {
        Args: {
          provider_amount_cents: number
          provider_currency: string
          provider_payload: Json
          provider_payment_id: string
          provider_status: Database["public"]["Enums"]["payment_status"]
          target_payment_attempt_id: string
        }
        Returns: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string
          invoice_group_id: string | null
          last_checked_at: string | null
          merchant_profile_id: string | null
          paid_at: string | null
          provider: string
          provider_check_lease: string | null
          provider_check_until: string | null
          provider_mode: string
          provider_payload: Json
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_work_order_task: {
        Args: {
          expected_version: number
          personnel?: string
          target_task: string
          target_tenant: string
        }
        Returns: undefined
      }
      attach_invoice_pdf: {
        Args: {
          sha256: string
          storage_path: string
          target_invoice_id: string
        }
        Returns: {
          branding_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_on: string | null
          finalized_at: string | null
          id: string
          invoice_number: string | null
          issued_on: string | null
          lines_snapshot: Json | null
          paid_cents: number
          pdf_sha256: string | null
          pdf_storage_path: string | null
          sent_at: string | null
          source_request_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_work_order_checklist: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      bind_object_customer: {
        Args: {
          allow_secrets: boolean
          email_address: string
          is_active: boolean
          target_object: string
          target_tenant: string
        }
        Returns: undefined
      }
      book_appointment_slot: {
        Args: {
          target_request_id: string
          target_slot_id: string
          target_tenant_id: string
          target_token_id: string
        }
        Returns: {
          booked_count: number
          capacity: number
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          status: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "appointment_slots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_work_order_planning: {
        Args: {
          appointment_data?: Json
          confirmed_warnings?: string[]
          expected_version: number
          mutation_id: string
          target_assignments: Json
          target_end: string
          target_start: string
          target_tenant: string
          target_work_order: string
          undo_change?: string
        }
        Returns: Json
      }
      change_work_order_signature_policy: {
        Args: {
          employee_required: boolean
          expected_version: number
          mode: string
          mutation_id: string
          reason: string
          target_order: string
        }
        Returns: undefined
      }
      claim_mail_delivery: {
        Args: {
          target_idempotency_key: string
          target_recipient: string
          target_template: string
          target_tenant_id: string
        }
        Returns: {
          current_status: Database["public"]["Enums"]["delivery_status"]
          delivery_id: string
          should_send: boolean
        }[]
      }
      claim_outbox: {
        Args: {
          batch_size?: number
          include_notifications?: boolean
          include_tickets?: boolean
          lock_seconds?: number
          target_tenant?: string
        }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_until: string | null
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_personnel_dossier_deliveries: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          due_on: string
          id: string
          last_error: string | null
          personnel_id: string
          recipient: string
          recipient_user_id: string | null
          sent_at: string | null
          source_id: string
          source_revision: number
          source_table: string
          status: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "personnel_dossier_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_provider_payment_check: {
        Args: { lease_id: string; target_attempt: string }
        Returns: Json
      }
      commercial_booking: {
        Args: { command_id: string; input: Json; target_tenant: string }
        Returns: Json
      }
      commercial_cancel_booking: {
        Args: {
          command_id: string
          reason: string
          target_order: string
          target_tenant: string
        }
        Returns: boolean
      }
      commercial_command: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      commercial_customer_action: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      commercial_customer_file: {
        Args: { asset?: string; target_id: string; target_tenant: string }
        Returns: Json
      }
      commercial_customer_list: {
        Args: { page_number?: number; target_tenant: string }
        Returns: Json
      }
      commercial_detail: {
        Args: { source_kind: string; target_id: string; target_tenant: string }
        Returns: Json
      }
      commercial_external_decision: {
        Args: { input: Json; target_tenant: string; token_hash_input: string }
        Returns: Json
      }
      commercial_list: {
        Args: { filters?: Json; target_tenant: string }
        Returns: Json
      }
      commercial_mail_claim: {
        Args: {
          event_id: string
          recipient_input: string
          target_tenant: string
        }
        Returns: Json
      }
      commercial_next_visit: {
        Args: {
          command_id: string
          quote_id: string
          target_tenant: string
          visit_date: string
        }
        Returns: string
      }
      commercial_options: {
        Args: { customer?: string; query?: string; target_tenant: string }
        Returns: Json
      }
      commercial_order_context: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      commercial_public_intake: {
        Args: {
          client_hash: string
          input: Json
          request_id: string
          target_tenant: string
        }
        Returns: boolean
      }
      commercial_quote_mail_claim: {
        Args: {
          command_id: string
          reminder: boolean
          target_quote: string
          target_tenant: string
        }
        Returns: Json
      }
      commercial_quote_mail_finish: {
        Args: {
          actor: string
          delivery_id: string
          message_id: string
          target_tenant: string
        }
        Returns: undefined
      }
      commercial_save_quote: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      commercial_save_request: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      complete_platform_admin_invitation: {
        Args: {
          actor_user_id: string
          target_tenant: string
          target_user: string
        }
        Returns: boolean
      }
      complete_work_order_task: {
        Args: {
          completed: boolean
          completion_note?: string
          target_task_id: string
        }
        Returns: {
          added_by: string | null
          agreement_line_id: string | null
          allowed_for_staff: boolean
          assigned_personnel_id: string | null
          commercial_snapshot: Json
          completed_at: string | null
          completion_note: string | null
          created_at: string
          duration_minutes: number
          executed_quantity: number | null
          execution_state: string
          execution_version: number
          extra_work_status: string | null
          id: string
          instructions: string
          is_extra_work: boolean
          quantity: number
          scope_root_task_id: string | null
          staff_request_reason: string | null
          staff_requested_amount_cents: number | null
          task_code: string
          task_name: string
          task_revision_id: string | null
          tenant_id: string
          transferred_quantity: number
          unit: string
          unit_price_cents: number
          vat_basis_points: number
          withdrawn_quantity: number
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_order_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_shift_interest: {
        Args: { target_personnel_id: string; target_shift_id: string }
        Returns: {
          created_at: string
          created_by: string
          ends_at: string
          function_id: string
          id: string
          required_certificate_codes: string[]
          selected_personnel_id: string | null
          starts_at: string
          status: string
          tenant_id: string
          work_order_id: string
        }
        SetofOptions: {
          from: "*"
          to: "open_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_commercial_period_invoice: {
        Args: {
          confirmed: boolean
          period_start: string
          request_id: string
          target_quote: string
          target_tenant: string
        }
        Returns: {
          branding_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_on: string | null
          finalized_at: string | null
          id: string
          invoice_number: string | null
          issued_on: string | null
          lines_snapshot: Json | null
          paid_cents: number
          pdf_sha256: string | null
          pdf_storage_path: string | null
          sent_at: string | null
          source_request_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_execution_invoice: {
        Args: { request_id: string; sources: Json; target_tenant: string }
        Returns: {
          branding_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_on: string | null
          finalized_at: string | null
          id: string
          invoice_number: string | null
          issued_on: string | null
          lines_snapshot: Json | null
          paid_cents: number
          pdf_sha256: string | null
          pdf_storage_path: string | null
          sent_at: string | null
          source_request_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_event_recipients: {
        Args: { target_event: string }
        Returns: {
          user_id: string
        }[]
      }
      customer_command: {
        Args: {
          command: string
          input: Json
          request_id: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_commercial_followup: {
        Args: { target_customer: string; target_tenant: string }
        Returns: Json
      }
      customer_document_metadata: {
        Args: {
          expected_version: number
          input_archived: boolean
          input_category: string
          input_visibility: string
          portal_object: string
          target_document: string
          target_tenant: string
        }
        Returns: undefined
      }
      customer_extra_agreements: {
        Args: { target_object: string; target_tenant: string }
        Returns: Json
      }
      customer_file_access: {
        Args: { kind: string; target_id: string; target_tenant: string }
        Returns: Json
      }
      customer_history: {
        Args: { target_customer: string; target_tenant: string }
        Returns: Json
      }
      customer_list: {
        Args: { filters?: Json; target_tenant: string }
        Returns: Json
      }
      customer_object_visits: { Args: { target_tenant: string }; Returns: Json }
      customer_owners: {
        Args: { target_tenant: string }
        Returns: {
          commercial: boolean
          id: string
          label: string
        }[]
      }
      customer_portal_accounts: {
        Args: { target_tenant: string }
        Returns: Json
      }
      customer_portal_activity: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_activity_mark: {
        Args: {
          expected_version?: number
          operation: string
          request_id: string
          target_account: string
          target_notification?: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_bind: {
        Args: {
          can_create: boolean
          can_edit_objects: boolean
          can_edit_profile: boolean
          enabled: boolean
          expected_version: number
          target_contact: string
          target_customer: string
          target_tenant: string
          target_user: string
        }
        Returns: string
      }
      customer_portal_commercial_command: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_documents: {
        Args: { target_tenant: string }
        Returns: Json
      }
      customer_portal_draft: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_file_authorize: {
        Args: {
          kind: string
          target_account: string
          target_id: string
          target_tenant: string
        }
        Returns: boolean
      }
      customer_portal_instruction_add: {
        Args: {
          expected_version: number
          input_body: string
          request_id: string
          target_account: string
          target_object: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_invoices: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_management: {
        Args: { target_customer: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_news: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_news_mark: {
        Args: {
          expected_version: number
          operation: string
          request_id: string
          target_account: string
          target_notification: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_object_save: {
        Args: {
          expected_account_version: number
          input: Json
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_onboarding_save: {
        Args: {
          input: Json
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_payment_prepare: {
        Args: {
          expected_mode: string
          expected_profile: string
          invoice_ids: string[]
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: string
      }
      customer_portal_preferences: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_preferences_save: {
        Args: {
          expected_version: number
          input: Json
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_profile_save: {
        Args: {
          expected_account_version: number
          expected_contact_version: number
          expected_customer_version: number
          input: Json
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_report_file: {
        Args: {
          asset_id?: string
          target_account: string
          target_report: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_reports: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_request_create: {
        Args: {
          input: Json
          request_id: string
          target_account: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_request_detail: {
        Args: {
          target_account: string
          target_request: string
          target_tenant: string
        }
        Returns: Json
      }
      customer_portal_requests: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_services: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_shared_documents: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      customer_portal_visit: {
        Args: {
          target_account: string
          target_tenant: string
          target_visit: string
        }
        Returns: Json
      }
      customer_portal_visit_command: {
        Args: {
          input: Json
          operation: string
          request_id: string
          target_account: string
          target_tenant: string
          target_visit: string
        }
        Returns: Json
      }
      customer_portal_visit_note_add: {
        Args: {
          expected_version: number
          input_body: string
          request_id: string
          target_account: string
          target_tenant: string
          target_visit: string
        }
        Returns: Json
      }
      customer_portal_workspace: {
        Args: { target_account: string; target_tenant: string }
        Returns: Json
      }
      dismiss_account_guide: { Args: { guide_key: string }; Returns: undefined }
      dispatch_work_order: {
        Args: {
          expected_version: number
          idempotency_key: string
          target_personnel_id: string
          target_work_order_id: string
        }
        Returns: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dossier_chain: {
        Args: {
          target_customer?: string
          target_object?: string
          target_order?: string
          target_personnel?: string
          target_tenant: string
        }
        Returns: Json
      }
      email_auth_context: {
        Args: {
          action_type: string
          actor: string
          recipient: string
          target_slug: string
        }
        Returns: Json
      }
      email_auth_hook_receipt: {
        Args: { hook_id: string; operation: string; payload_hash: string }
        Returns: Json
      }
      email_auth_login_prepare: {
        Args: { recipient: string; target_slug: string }
        Returns: string
      }
      email_auth_login_release: {
        Args: { target_request: string }
        Returns: undefined
      }
      email_auth_login_resolve: {
        Args: { actor: string; hook_id: string; target_slug: string }
        Returns: string
      }
      email_provider_event: { Args: { input: Json }; Returns: boolean }
      email_transport: {
        Args: { input: Json; operation: string }
        Returns: Json
      }
      execution_invoice_concepts: {
        Args: { target_order?: string; target_tenant: string }
        Returns: Json
      }
      expired_work_order_signature_uploads: {
        Args: never
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      extend_object_access: {
        Args: {
          reason: string
          target_assignment: string
          target_tenant: string
          until_time: string
        }
        Returns: undefined
      }
      extend_staff_work_order: {
        Args: {
          expected_version: number
          idempotency_key: string
          target_work_order: string
        }
        Returns: Json
      }
      file_scan_attest: {
        Args: {
          expected_id: string
          expected_version: string
          proof: Json
          target_bucket: string
          target_path: string
        }
        Returns: undefined
      }
      file_scan_state: {
        Args: { target_bucket: string; target_path: string }
        Returns: Json
      }
      file_upload_allowed: {
        Args: {
          target_bucket: string
          target_path: string
          visit_request?: string
        }
        Returns: boolean
      }
      finalize_invoice: {
        Args: { target_invoice_id: string }
        Returns: {
          branding_snapshot: Json | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_on: string | null
          finalized_at: string | null
          id: string
          invoice_number: string | null
          issued_on: string | null
          lines_snapshot: Json | null
          paid_cents: number
          pdf_sha256: string | null
          pdf_storage_path: string | null
          sent_at: string | null
          source_request_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
          vat_cents: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_work_order_signature: {
        Args: { image_hash: string; target_intent: string }
        Returns: Json
      }
      get_object_document: {
        Args: {
          target_document: string
          target_order?: string
          target_tenant: string
        }
        Returns: Json
      }
      get_planboard: {
        Args: {
          list_view?: string
          page_number?: number
          search_text?: string
          status_filter?: string
          target_day: string
          target_tenant: string
        }
        Returns: Json
      }
      get_planboard_order: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      manage_work_order: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      mutate_work_order: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      notification_command: {
        Args: {
          actor_context: string
          command: string
          payload: Json
          request_id: string
          target_tenant: string
        }
        Returns: Json
      }
      notification_deferred_mail: {
        Args: {
          input?: Json
          operation: string
          target_mail_id?: string
          target_tenant?: string
        }
        Returns: Json
      }
      notification_delivery_begin: {
        Args: { delivery_id: string; lease_id: string }
        Returns: Json
      }
      notification_delivery_claim: {
        Args: { batch_size?: number; target_tenant?: string }
        Returns: Json
      }
      notification_delivery_defer: {
        Args: { delivery_id: string; lease_id: string; retry_at: string }
        Returns: boolean
      }
      notification_delivery_finish: {
        Args: {
          delivery_id: string
          lease_id: string
          outcome: string
          provider_id?: string
        }
        Returns: boolean
      }
      notification_delivery_freeze: {
        Args: { delivery_id: string; input: Json; lease_id: string }
        Returns: Json
      }
      notification_delivery_prepare: {
        Args: { request_id: string }
        Returns: number
      }
      notification_device_logout: {
        Args: { actor_id: string; session_id: string }
        Returns: undefined
      }
      notification_mail_attachment: {
        Args: { target_mail_id: string; target_tenant: string }
        Returns: Json
      }
      notification_mail_snapshot: {
        Args: { delivery_id: string; draft: Json; target_tenant: string }
        Returns: Json
      }
      notification_outbox_prepare: {
        Args: { target_event: string }
        Returns: number
      }
      notification_policy_check: {
        Args: {
          channel: string
          recipient_user_id?: string
          target_context: string
          target_tenant: string
          type_code: string
        }
        Returns: Json
      }
      notification_prepare_dossier: {
        Args: { batch_size?: number; target_tenant?: string }
        Returns: number
      }
      notification_provider_gate: {
        Args: {
          channel: string
          delivery_key: string
          input?: Json
          operation: string
          recipient_user_id: string
          source_id: string
          target_context: string
          target_tenant: string
          type_code: string
        }
        Returns: Json
      }
      notification_push_device: {
        Args: {
          actor_context: string
          actor_id: string
          input?: Json
          operation: string
          session_id: string
          target_tenant: string
        }
        Returns: Json
      }
      notification_query: {
        Args: {
          actor_context: string
          operation: string
          payload?: Json
          target_tenant: string
        }
        Returns: Json
      }
      notification_template_resolve: {
        Args: {
          channel: string
          target_context: string
          target_tenant: string
          type_code: string
        }
        Returns: Json
      }
      notification_verification: {
        Args: {
          actor: string
          actor_context: string
          input: Json
          operation: string
          session_id: string
          target_tenant: string
        }
        Returns: Json
      }
      object_agreement_options: {
        Args: { target_object: string; target_tenant: string }
        Returns: {
          id: string
          scope: string
          task_revision_id: string
          title: string
          version: number
        }[]
      }
      object_customer_accounts: {
        Args: { target_object: string; target_tenant: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      object_dossier_owners: {
        Args: { target_tenant: string }
        Returns: {
          id: string
          label: string
        }[]
      }
      object_vault_operation: {
        Args: {
          actor: string
          input?: Json
          operation: string
          session_id: string
          target_item: string
          target_object: string
          target_order: string
          target_tenant: string
        }
        Returns: Json
      }
      object_visit_context: {
        Args: {
          target_object: string
          target_order?: string
          target_tenant: string
        }
        Returns: Json
      }
      object_visit_signals: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      personnel_availability: {
        Args: { target_tenant: string }
        Returns: {
          approved_at: string
          created_at: string
          dossier_source_id: string
          ends_at: string
          id: string
          kind: string
          note: string
          personnel_id: string
          starts_at: string
          tenant_id: string
        }[]
      }
      personnel_document_file: {
        Args: { target_document: string; target_tenant: string }
        Returns: {
          file_name: string
          id: string
          mime_type: string
          personnel_id: string
          sha256: string
          storage_path: string
          tenant_id: string
        }[]
      }
      personnel_dossier_owners: {
        Args: { target_tenant: string }
        Returns: {
          id: string
          label: string
        }[]
      }
      personnel_dossier_staff_projection: {
        Args: { target_personnel: string; target_tenant: string }
        Returns: Json
      }
      personnel_dossier_summary: {
        Args: { target_tenant: string }
        Returns: {
          certificate_attention: boolean
          employment_status: string
          ends_on: string
          function_id: string
          open_actions: number
          personnel_id: string
          team: string
        }[]
      }
      personnel_mobility: {
        Args: { target_personnel: string; target_tenant: string }
        Returns: Json
      }
      personnel_qualification_gaps: {
        Args: { target_tenant: string }
        Returns: {
          assignment_id: string
          code: string
          hard_requirement: boolean
          personnel_id: string
        }[]
      }
      prepare_personnel_checklist: {
        Args: {
          checklist_type: string
          target_personnel: string
          target_tenant: string
        }
        Returns: number
      }
      prepare_provider_payment: {
        Args: { expected_mode: string; payment_token_hash: string }
        Returns: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string
          invoice_group_id: string | null
          last_checked_at: string | null
          merchant_profile_id: string | null
          paid_at: string | null
          provider: string
          provider_check_lease: string | null
          provider_check_until: string | null
          provider_mode: string
          provider_payload: Json
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_work_order_signature: {
        Args: {
          expected_hash: string
          idempotency_key: string
          signature_kind: string
          signer_capacity: string
          signer_name: string
          target_report_id: string
          target_work_order_id: string
        }
        Returns: Json
      }
      process_customer_reminders: { Args: never; Returns: number }
      process_live_planning: { Args: never; Returns: number }
      process_object_reminders: { Args: never; Returns: number }
      process_ticket_deadlines: {
        Args: { target_tenant?: string }
        Returns: Json
      }
      provision_platform_tenant: {
        Args: {
          accent_color: string
          actor_user_id: string
          admin_email: string
          admin_name: string
          enabled_services: string[]
          primary_color: string
          request_key: string
          sender_email?: string
          tenant_domain?: string
          tenant_name: string
          tenant_slug: string
        }
        Returns: string
      }
      provision_tenant: {
        Args: {
          actor_user_id: string
          owner_user_id: string
          tenant_name: string
          tenant_slug: string
        }
        Returns: string
      }
      publish_announcement: {
        Args: { target_announcement_id: string }
        Returns: {
          audience_roles: Database["public"]["Enums"]["app_role"][]
          body: string
          created_at: string
          created_by: string
          id: string
          publish_at: string | null
          published_at: string | null
          send_push: boolean
          tenant_id: string
          title: string
          updated_at: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "announcements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_customer_agreement: {
        Args: { input: Json; target_customer: string; target_tenant: string }
        Returns: string
      }
      record_task_execution: {
        Args: {
          actual_quantity: number
          expected_version: number
          reason: string
          result: string
          target_task: string
          target_tenant: string
        }
        Returns: undefined
      }
      register_manual_payment: {
        Args: {
          allocations: Json
          idempotency_key: string
          payment_date: string
          reference: string
          target_tenant_id: string
        }
        Returns: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string
          invoice_group_id: string | null
          last_checked_at: string | null
          merchant_profile_id: string | null
          paid_at: string | null
          provider: string
          provider_check_lease: string | null
          provider_check_until: string | null
          provider_mode: string
          provider_payload: Json
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_visit_attachment: {
        Args: { input: Json; target_request: string; target_tenant: string }
        Returns: string
      }
      release_provider_payment_check: {
        Args: { lease_id: string; target_attempt: string }
        Returns: undefined
      }
      reschedule_work_order: {
        Args: {
          expected_version: number
          target_personnel_id: string
          target_start_at: string
          target_work_order_id: string
        }
        Returns: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_tenant_context: {
        Args: { requested_host?: string; requested_tenant_id?: string }
        Returns: {
          accent_color: string
          enabled_services: string[]
          logo_path: string
          primary_color: string
          roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          timezone: string
          white_label_enabled: boolean
        }[]
      }
      review_object_visit_request: {
        Args: {
          decision: string
          expected_version: number
          input: Json
          target_request: string
          target_tenant: string
        }
        Returns: undefined
      }
      review_staff_leave_request:
        | {
            Args: {
              approved_minutes: number
              decision: string
              expected_version: number
              note?: string
              target_request: string
              target_tenant: string
            }
            Returns: Json
          }
        | {
            Args: {
              decision: string
              expected_version: number
              note?: string
              target_request: string
              target_tenant: string
            }
            Returns: Json
          }
      review_staff_time_correction: {
        Args: {
          decision: string
          expected_version: number
          note?: string
          target_request: string
          target_tenant: string
        }
        Returns: Json
      }
      review_work_order: {
        Args: {
          decision: string
          reason?: string
          target_work_order_id: string
        }
        Returns: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_work_order_report: {
        Args: {
          decision: string
          reason?: string
          target_report_id: string
          target_work_order_id: string
        }
        Returns: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      route_cache_claim: {
        Args: {
          day_limit: number
          keys: string[]
          lease_id: string
          minute_limit: number
          provider_name: string
          request_kind: string
        }
        Returns: Json
      }
      route_cache_finish: {
        Args: {
          cache_key: string
          failure: string
          lease_id: string
          payload: Json
          ttl_days: number
        }
        Returns: undefined
      }
      route_cache_read: { Args: { keys: string[] }; Returns: Json }
      save_object_dossier: {
        Args: { input: Json; target_tenant: string }
        Returns: string
      }
      save_tenant_message_template: {
        Args: {
          actor_user_id: string
          reset_to_default: boolean
          target_body: string
          target_subject: string
          target_template_key: string
          target_tenant_id: string
        }
        Returns: {
          body: string
          channel: string
          created_at: string
          customized: boolean
          default_body: string
          default_subject: string
          revision: number
          subject: string
          template_key: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenant_message_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_work_order: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      set_shift_interest: {
        Args: {
          interested: boolean
          target_shift: string
          target_tenant: string
        }
        Returns: undefined
      }
      set_staff_availability_permission: {
        Args: {
          enabled: boolean
          expected_version: number
          target_personnel: string
          target_tenant: string
        }
        Returns: Json
      }
      set_staff_leave_entitlement: {
        Args: {
          allowance_minutes: number
          calendar_year: number
          carryover_minutes: number
          expected_version: number
          target_personnel: string
          target_tenant: string
        }
        Returns: Json
      }
      staff_day_command: {
        Args: {
          command: string
          idempotency_key: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      staff_finalize_report_entry: {
        Args: { idempotency_key: string; input: Json; target_tenant: string }
        Returns: Json
      }
      staff_leave_command: {
        Args: {
          command: string
          idempotency_key: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      staff_report_customer_absent: {
        Args: {
          absence_reason: string
          expected_content_hash: string
          idempotency_key: string
          target_report: string
          target_tenant: string
        }
        Returns: Json
      }
      staff_report_entry_command: {
        Args: {
          command: string
          idempotency_key: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      staff_report_signature_preview: {
        Args: {
          expected_content_hash: string
          target_report: string
          target_tenant: string
        }
        Returns: Json
      }
      staff_report_signature_preview_file: {
        Args: {
          asset_id: string
          expected_content_hash: string
          target_report: string
        }
        Returns: Json
      }
      staff_report_upload_allowed: {
        Args: {
          target_entry: string
          target_order: string
          target_path: string
          target_tenant: string
        }
        Returns: boolean
      }
      staff_request_extra_work: {
        Args: { idempotency_key: string; input: Json; target_tenant: string }
        Returns: Json
      }
      staff_request_time_correction: {
        Args: {
          correction_mode: string
          expected_version: number
          idempotency_key: string
          reason: string
          requested_duration: number
          requested_end: string
          requested_start: string
          target_tenant: string
          target_time_entry: string
        }
        Returns: Json
      }
      staff_save_onboarding: {
        Args: { complete: boolean; input: Json; target_tenant: string }
        Returns: Json
      }
      staff_update_availability: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      staff_update_profile: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      staff_work_order_cost_command: {
        Args: {
          command: string
          idempotency_key: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      staff_workspace: { Args: { target_tenant: string }; Returns: Json }
      store_travel_estimates: {
        Args: {
          actor?: string
          actor_session?: string
          legs: Json
          manual_action?: string
          revision: number
          t: string
        }
        Returns: boolean
      }
      submit_object_visit_request: {
        Args: {
          input: Json
          request_id: string
          target_object: string
          target_order: string
          target_tenant: string
        }
        Returns: string
      }
      submit_work_order_report: {
        Args: {
          expected_version: number
          idempotency_key: string
          summary: string
          target_work_order_id: string
        }
        Returns: Json
      }
      suggest_personnel_number: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      task_catalogue: { Args: { target_tenant: string }; Returns: Json }
      task_catalogue_command: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      ticket_command: {
        Args: {
          actor_context: string
          command: string
          payload: Json
          request_id: string
          target_tenant: string
        }
        Returns: Json
      }
      ticket_delivery_begin: {
        Args: { delivery_id: string; lease_id: string }
        Returns: Json
      }
      ticket_delivery_claim: {
        Args: { batch_size?: number; target_tenant?: string }
        Returns: Json
      }
      ticket_delivery_defer: {
        Args: { delivery_id: string; lease_id: string; retry_at: string }
        Returns: boolean
      }
      ticket_delivery_finish: {
        Args: {
          delivery_id: string
          lease_id: string
          outcome: string
          provider_id?: string
        }
        Returns: boolean
      }
      ticket_file_cleanup: {
        Args: { batch_size?: number; target_tenant?: string }
        Returns: Json
      }
      ticket_file_cleanup_done: {
        Args: { file_id: string }
        Returns: undefined
      }
      ticket_file_command: {
        Args: {
          actor_context: string
          command: string
          input: Json
          request_id?: string
          target_tenant: string
        }
        Returns: Json
      }
      ticket_file_server_finalize: {
        Args: {
          actor_id: string
          content_hash: string
          file_id: string
          session_id: string
        }
        Returns: Json
      }
      ticket_outbox_prepare: { Args: { target_event: string }; Returns: number }
      ticket_push_subscription: {
        Args: { action: string; ctx: string; input: Json; targettenant: string }
        Returns: Json
      }
      ticket_query: {
        Args: {
          actor_context: string
          operation: string
          payload?: Json
          target_tenant: string
        }
        Returns: Json
      }
      ticket_scan_claim: {
        Args: { batch_size?: number; target_file?: string }
        Returns: Json
      }
      ticket_scan_finish: {
        Args: {
          file_id: string
          lease_id: string
          outcome: string
          result?: Json
        }
        Returns: boolean
      }
      ticket_verification: {
        Args: {
          actor: string
          input: Json
          operation: string
          session_id: string
          target_tenant: string
        }
        Returns: Json
      }
      transition_work_order: {
        Args: {
          action: string
          expected_version: number
          idempotency_key: string
          note?: string
          reason_code?: string
          target_work_order_id: string
        }
        Returns: {
          actual_end_at: string | null
          actual_start_at: string | null
          appointment_slot_id: string | null
          archive_at: string | null
          attention_reason: string | null
          bill_travel: boolean
          budget_labor_minutes: number | null
          commercial_terms: Json
          created_at: string
          created_by: string
          customer_id: string
          customer_window_kind: string
          day_instructions: string
          deadline: string | null
          description: string
          details: Json
          discipline: string
          employee_signature_required: boolean
          id: string
          labels: string[]
          lead_personnel_id: string | null
          object_id: string
          object_snapshot: Json
          planned_end_at: string | null
          planned_start_at: string | null
          planner_user_id: string | null
          planning_state: string
          priority: string
          projected_end_at: string | null
          projected_start_at: string | null
          published_at: string | null
          quote_id: string | null
          report_state: string
          report_version: number
          request_id: string | null
          requested_date: string | null
          required_personnel: number
          signature_mode: string
          signature_policy_snapshot: Json | null
          signature_required: boolean
          source_kind: string
          status: Database["public"]["Enums"]["work_order_status"]
          template_snapshot: Json
          tenant_id: string
          title: string
          updated_at: string
          version: number
          visit_kind: string
          work_order_number: string
        }
        SetofOptions: {
          from: "*"
          to: "work_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      travel_context: {
        Args: { d: string; p?: string; s: string; t: string; u: string }
        Returns: Json
      }
      travel_day_departure: {
        Args: { d: string; p: string; t: string }
        Returns: Json
      }
      travel_session_active: { Args: never; Returns: boolean }
      update_object_visit_request: {
        Args: {
          expected_version: number
          input: Json
          target_request: string
          target_tenant: string
        }
        Returns: undefined
      }
      waive_work_order_signature: {
        Args: { reason: string; target_report_id: string }
        Returns: undefined
      }
      withdraw_object_request: {
        Args: {
          expected_version: number
          reason: string
          target_request: string
          target_tenant: string
        }
        Returns: undefined
      }
      work_order_communication: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      work_order_dossier: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      work_order_exception_command: {
        Args: { input: Json; target_tenant: string }
        Returns: Json
      }
      work_order_exceptions: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      work_order_list: {
        Args: { filters?: Json; target_tenant: string }
        Returns: Json
      }
      work_order_operational_rows: {
        Args: {
          open_only?: boolean
          page_offset?: number
          page_size?: number
          target_customer?: string
          target_object?: string
          target_tenant: string
        }
        Returns: Json
      }
      work_order_operational_task_data: {
        Args: { target_tenant: string }
        Returns: Json
      }
      work_order_options: { Args: { target_tenant: string }; Returns: Json }
      work_order_related_command: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      work_order_related_context: {
        Args: { target_order: string; target_tenant: string }
        Returns: Json
      }
      work_order_report: {
        Args: { target_work_order_id: string }
        Returns: Json
      }
      work_order_report_file: {
        Args: { asset_id?: string; target_report_id: string }
        Returns: Json
      }
      work_order_series_command: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
      work_order_signature_settings: {
        Args: { input?: Json; target_object?: string; target_tenant: string }
        Returns: Json
      }
      work_order_task_context: {
        Args: { target_task: string; target_tenant: string }
        Returns: Json
      }
      work_order_template_command: {
        Args: {
          command: string
          command_id: string
          input: Json
          target_tenant: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "tenant_admin"
        | "management"
        | "planner"
        | "finance"
        | "hr"
        | "staff"
      delivery_status:
        | "queued"
        | "processing"
        | "sent"
        | "failed"
        | "dead_letter"
        | "suppressed"
        | "uncertain"
        | "unreachable"
        | "cancelled"
      invoice_status:
        | "draft"
        | "final"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "credited"
        | "void"
      membership_status: "invited" | "active" | "suspended" | "revoked"
      payment_status:
        | "open"
        | "pending"
        | "paid"
        | "failed"
        | "expired"
        | "canceled"
        | "refunded"
      quote_status:
        | "draft"
        | "sent"
        | "awaiting_acceptance"
        | "accepted"
        | "rejected"
        | "expired"
        | "change_requested"
      work_order_status:
        | "planned"
        | "released"
        | "seen"
        | "travelling"
        | "in_progress"
        | "completed"
        | "returned"
        | "under_review"
        | "correction_required"
        | "approved"
        | "invoice_ready"
        | "invoiced"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "tenant_admin",
        "management",
        "planner",
        "finance",
        "hr",
        "staff",
      ],
      delivery_status: [
        "queued",
        "processing",
        "sent",
        "failed",
        "dead_letter",
        "suppressed",
        "uncertain",
        "unreachable",
        "cancelled",
      ],
      invoice_status: [
        "draft",
        "final",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "credited",
        "void",
      ],
      membership_status: ["invited", "active", "suspended", "revoked"],
      payment_status: [
        "open",
        "pending",
        "paid",
        "failed",
        "expired",
        "canceled",
        "refunded",
      ],
      quote_status: [
        "draft",
        "sent",
        "awaiting_acceptance",
        "accepted",
        "rejected",
        "expired",
        "change_requested",
      ],
      work_order_status: [
        "planned",
        "released",
        "seen",
        "travelling",
        "in_progress",
        "completed",
        "returned",
        "under_review",
        "correction_required",
        "approved",
        "invoice_ready",
        "invoiced",
        "cancelled",
      ],
    },
  },
} as const

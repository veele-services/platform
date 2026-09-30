
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "announcement_reads": {
                  Row: {
                    "announcement_id": string,"id": string,"read_at": string,"tenant_id": string,"user_id": string
                  }
                  Insert: {
                    "announcement_id": string,"id"?: string,"read_at"?: string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "announcement_id"?: string,"id"?: string,"read_at"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_reads_tenant_id_announcement_id_fkey"
      columns: ["tenant_id","announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "audience_roles": (Database["public"]['Enums']["app_role"])[],"body": string,"created_at": string,"created_by": string,"id": string,"publish_at": string | null,"published_at": string | null,"send_push": boolean,"tenant_id": string,"title": string,"updated_at": string,"withdrawn_at": string | null
                  }
                  Insert: {
                    "audience_roles"?: (Database["public"]['Enums']["app_role"])[],"body": string,"created_at"?: string,"created_by": string,"id"?: string,"publish_at"?: string | null,"published_at"?: string | null,"send_push"?: boolean,"tenant_id": string,"title": string,"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "audience_roles"?: (Database["public"]['Enums']["app_role"])[],"body"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"publish_at"?: string | null,"published_at"?: string | null,"send_push"?: boolean,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"appointment_slots": {
                  Row: {
                    "booked_count": number,"capacity": number,"created_at": string,"ends_at": string,"id": string,"starts_at": string,"status": string,"tenant_id": string
                  }
                  Insert: {
                    "booked_count"?: number,"capacity"?: number,"created_at"?: string,"ends_at": string,"id"?: string,"starts_at": string,"status"?: string,"tenant_id": string
                  }
                  Update: {
                    "booked_count"?: number,"capacity"?: number,"created_at"?: string,"ends_at"?: string,"id"?: string,"starts_at"?: string,"status"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_slots_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"customer_visible": boolean,"deleted_at": string | null,"file_name": string,"id": string,"mime_type": string,"report_entry_id": string | null,"sha256": string,"size_bytes": number,"storage_bucket": string,"storage_path": string,"tenant_id": string,"uploaded_by": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"customer_visible"?: boolean,"deleted_at"?: string | null,"file_name": string,"id"?: string,"mime_type": string,"report_entry_id"?: string | null,"sha256": string,"size_bytes": number,"storage_bucket": string,"storage_path": string,"tenant_id": string,"uploaded_by": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_visible"?: boolean,"deleted_at"?: string | null,"file_name"?: string,"id"?: string,"mime_type"?: string,"report_entry_id"?: string | null,"sha256"?: string,"size_bytes"?: number,"storage_bucket"?: string,"storage_path"?: string,"tenant_id"?: string,"uploaded_by"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_tenant_id_report_entry_id_fkey"
      columns: ["tenant_id","report_entry_id"]
isOneToOne: false
      referencedRelation: "report_entries"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "attachments_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"after_data": Json | null,"before_data": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"ip_hash": string | null,"request_id": string | null,"tenant_id": string
                  }
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"ip_hash"?: string | null,"request_id"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"ip_hash"?: string | null,"request_id"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"availability": {
                  Row: {
                    "approved_at": string | null,"created_at": string,"dossier_source_id": string | null,"ends_at": string,"id": string,"kind": string,"note": string | null,"personnel_id": string,"starts_at": string,"tenant_id": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"created_at"?: string,"dossier_source_id"?: string | null,"ends_at": string,"id"?: string,"kind": string,"note"?: string | null,"personnel_id": string,"starts_at": string,"tenant_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"created_at"?: string,"dossier_source_id"?: string | null,"ends_at"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"personnel_id"?: string,"starts_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_dossier_source_id_fkey"
      columns: ["dossier_source_id"]
isOneToOne: true
      referencedRelation: "personnel_dossier_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "availability_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"booking_options": {
                  Row: {
                    "created_at": string,"id": string,"slot_id": string,"tenant_id": string,"token_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"slot_id": string,"tenant_id": string,"token_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"slot_id"?: string,"tenant_id"?: string,"token_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_options_tenant_id_slot_id_fkey"
      columns: ["tenant_id","slot_id"]
isOneToOne: false
      referencedRelation: "appointment_slots"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "booking_options_tenant_id_token_id_fkey"
      columns: ["tenant_id","token_id"]
isOneToOne: false
      referencedRelation: "external_action_tokens"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"certificates": {
                  Row: {
                    "code": string,"created_at": string,"dossier_data": NonNullable<Json>,"dossier_managed": boolean,"dossier_revision": number,"dossier_status": string,"expires_on": string | null,"id": string,"issued_on": string | null,"name": string,"personnel_id": string,"previous_id": string | null,"storage_path": string | null,"tenant_id": string,"updated_at": string,"updated_by": string | null,"valid_from": string | null,"verified_at": string | null,"verified_by": string | null,"version": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"name": string,"personnel_id": string,"previous_id"?: string | null,"storage_path"?: string | null,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null,"valid_from"?: string | null,"verified_at"?: string | null,"verified_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"name"?: string,"personnel_id"?: string,"previous_id"?: string | null,"storage_path"?: string | null,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"valid_from"?: string | null,"verified_at"?: string | null,"verified_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificates_dossier_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "certificates"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "certificates_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"commercial_attachments": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"mime_type": string,"public_in_offer": boolean,"quote_id": string | null,"request_id": string | null,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id": string,"mime_type": string,"public_in_offer"?: boolean,"quote_id"?: string | null,"request_id"?: string | null,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"mime_type"?: string,"public_in_offer"?: boolean,"quote_id"?: string | null,"request_id"?: string | null,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string,"tenant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commercial_attachments_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commercial_attachments_tenant_id_quote_id_fkey"
      columns: ["tenant_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "commercial_attachments_tenant_id_request_id_fkey"
      columns: ["tenant_id","request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"commercial_billing_periods": {
                  Row: {
                    "confirmed_by": string,"created_at": string,"ends_before": string,"id": string,"invoice_id": string,"quote_id": string,"starts_on": string,"tenant_id": string
                  }
                  Insert: {
                    "confirmed_by": string,"created_at"?: string,"ends_before": string,"id"?: string,"invoice_id": string,"quote_id": string,"starts_on": string,"tenant_id": string
                  }
                  Update: {
                    "confirmed_by"?: string,"created_at"?: string,"ends_before"?: string,"id"?: string,"invoice_id"?: string,"quote_id"?: string,"starts_on"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commercial_billing_periods_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commercial_billing_periods_tenant_id_invoice_id_fkey"
      columns: ["tenant_id","invoice_id"]
isOneToOne: true
      referencedRelation: "invoices"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "commercial_billing_periods_tenant_id_quote_id_fkey"
      columns: ["tenant_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"commercial_events": {
                  Row: {
                    "actor_id": string | null,"body": string,"created_at": string,"details": NonNullable<Json>,"id": string,"kind": string,"mail_snapshot": Json | null,"quote_id": string | null,"request_id": string | null,"tenant_id": string,"visibility": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"kind": string,"mail_snapshot"?: Json | null,"quote_id"?: string | null,"request_id"?: string | null,"tenant_id": string,"visibility"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"kind"?: string,"mail_snapshot"?: Json | null,"quote_id"?: string | null,"request_id"?: string | null,"tenant_id"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commercial_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commercial_events_tenant_id_quote_id_fkey"
      columns: ["tenant_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "commercial_events_tenant_id_request_id_fkey"
      columns: ["tenant_id","request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"customer_agreement_lines": {
                  Row: {
                    "agreement_id": string,"duration_minutes": number | null,"extra_work": boolean,"frequency": string,"id": string,"limit_cents": number,"object_id": string,"price_basis": string,"price_cents": number,"quantity": number,"scope": string,"task_revision_id": string,"tenant_id": string,"time_window": string,"unit": string,"vat_basis_points": number | null
                  }
                  Insert: {
                    "agreement_id": string,"duration_minutes"?: number | null,"extra_work"?: boolean,"frequency"?: string,"id"?: string,"limit_cents": number,"object_id": string,"price_basis"?: string,"price_cents": number,"quantity": number,"scope": string,"task_revision_id": string,"tenant_id": string,"time_window"?: string,"unit"?: string,"vat_basis_points"?: number | null
                  }
                  Update: {
                    "agreement_id"?: string,"duration_minutes"?: number | null,"extra_work"?: boolean,"frequency"?: string,"id"?: string,"limit_cents"?: number,"object_id"?: string,"price_basis"?: string,"price_cents"?: number,"quantity"?: number,"scope"?: string,"task_revision_id"?: string,"tenant_id"?: string,"time_window"?: string,"unit"?: string,"vat_basis_points"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_agreement_lines_tenant_id_agreement_id_fkey"
      columns: ["tenant_id","agreement_id"]
isOneToOne: false
      referencedRelation: "customer_agreements"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_agreement_lines_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_agreement_lines_tenant_id_task_revision_id_fkey"
      columns: ["tenant_id","task_revision_id"]
isOneToOne: false
      referencedRelation: "task_revisions"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"customer_agreements": {
                  Row: {
                    "accepted_by_name": string | null,"accepted_on": string | null,"agreement_type": string,"created_at": string,"created_by": string,"customer_id": string,"details": NonNullable<Json>,"edit_version": number,"ends_on": string | null,"evidence_document_id": string | null,"id": string,"notice_on": string | null,"owner_user_id": string | null,"previous_id": string | null,"renewal_on": string | null,"review_on": string | null,"starts_on": string | null,"state": string,"tenant_id": string,"title": string,"version": number
                  }
                  Insert: {
                    "accepted_by_name"?: string | null,"accepted_on"?: string | null,"agreement_type"?: string,"created_at"?: string,"created_by"?: string,"customer_id": string,"details"?: NonNullable<Json>,"edit_version"?: number,"ends_on"?: string | null,"evidence_document_id"?: string | null,"id"?: string,"notice_on"?: string | null,"owner_user_id"?: string | null,"previous_id"?: string | null,"renewal_on"?: string | null,"review_on"?: string | null,"starts_on"?: string | null,"state"?: string,"tenant_id": string,"title": string,"version"?: number
                  }
                  Update: {
                    "accepted_by_name"?: string | null,"accepted_on"?: string | null,"agreement_type"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"details"?: NonNullable<Json>,"edit_version"?: number,"ends_on"?: string | null,"evidence_document_id"?: string | null,"id"?: string,"notice_on"?: string | null,"owner_user_id"?: string | null,"previous_id"?: string | null,"renewal_on"?: string | null,"review_on"?: string | null,"starts_on"?: string | null,"state"?: string,"tenant_id"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_agreement_owner_fk"
      columns: ["tenant_id","owner_user_id"]
isOneToOne: false
      referencedRelation: "tenant_memberships"
      referencedColumns: ["tenant_id","user_id"]
    },{
      foreignKeyName: "customer_agreements_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_agreements_tenant_id_evidence_document_id_fkey"
      columns: ["tenant_id","evidence_document_id"]
isOneToOne: false
      referencedRelation: "customer_documents"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_agreements_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_agreements_tenant_id_previous_id_fkey"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "customer_agreements"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"customer_contacts": {
                  Row: {
                    "active": boolean,"active_from": string | null,"active_until": string | null,"availability": string,"created_at": string,"customer_id": string,"email": string | null,"full_name": string,"id": string,"is_primary": boolean,"labels": (string)[],"object_ids": (string)[],"organization": string,"phone": string | null,"role": string | null,"tenant_id": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"active_from"?: string | null,"active_until"?: string | null,"availability"?: string,"created_at"?: string,"customer_id": string,"email"?: string | null,"full_name": string,"id"?: string,"is_primary"?: boolean,"labels"?: (string)[],"object_ids"?: (string)[],"organization"?: string,"phone"?: string | null,"role"?: string | null,"tenant_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"active_from"?: string | null,"active_until"?: string | null,"availability"?: string,"created_at"?: string,"customer_id"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_primary"?: boolean,"labels"?: (string)[],"object_ids"?: (string)[],"organization"?: string,"phone"?: string | null,"role"?: string | null,"tenant_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_contacts_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"customer_documents": {
                  Row: {
                    "archived": boolean,"category": string,"created_at": string,"created_by": string,"customer_id": string,"document_on": string | null,"file_name": string,"id": string,"metadata_version": number,"mime_type": string,"previous_id": string | null,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string,"valid_until": string | null,"version": number,"visibility": string
                  }
                  Insert: {
                    "archived"?: boolean,"category"?: string,"created_at"?: string,"created_by": string,"customer_id": string,"document_on"?: string | null,"file_name": string,"id"?: string,"metadata_version"?: number,"mime_type": string,"previous_id"?: string | null,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string,"valid_until"?: string | null,"version"?: number,"visibility"?: string
                  }
                  Update: {
                    "archived"?: boolean,"category"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"document_on"?: string | null,"file_name"?: string,"id"?: string,"metadata_version"?: number,"mime_type"?: string,"previous_id"?: string | null,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string,"tenant_id"?: string,"title"?: string,"valid_until"?: string | null,"version"?: number,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_document_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "customer_documents"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_documents_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_documents_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_notes": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string,"customer_id": string,"due_on": string | null,"id": string,"kind": string,"object_id": string | null,"owner_user_id": string | null,"state": string,"tenant_id": string,"title": string,"updated_at": string,"version": number,"work_order_id": string | null
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"created_by": string,"customer_id": string,"due_on"?: string | null,"id"?: string,"kind"?: string,"object_id"?: string | null,"owner_user_id"?: string | null,"state"?: string,"tenant_id": string,"title"?: string,"updated_at"?: string,"version"?: number,"work_order_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"due_on"?: string | null,"id"?: string,"kind"?: string,"object_id"?: string | null,"owner_user_id"?: string | null,"state"?: string,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_note_object_fk"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_note_order_fk"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_note_owner_fk"
      columns: ["tenant_id","owner_user_id"]
isOneToOne: false
      referencedRelation: "tenant_memberships"
      referencedColumns: ["tenant_id","user_id"]
    },{
      foreignKeyName: "customer_notes_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "customer_notes_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "billing_address": NonNullable<Json>,"billing_email": string | null,"billing_preferences": NonNullable<Json>,"company_number": string,"created_at": string,"created_by": string | null,"customer_number": string,"customer_type": string,"email": string,"id": string,"legal_name": string,"name": string,"owner_user_id": string | null,"payment_terms_days": number | null,"phone": string | null,"preferences": string,"relationship_since": string | null,"reminders_enabled": boolean,"services": (string)[],"status": string,"tenant_id": string,"trade_name": string,"updated_at": string,"updated_by": string | null,"vat_number": string,"version": number,"visit_address": NonNullable<Json>,"website": string
                  }
                  Insert: {
                    "billing_address"?: NonNullable<Json>,"billing_email"?: string | null,"billing_preferences"?: NonNullable<Json>,"company_number"?: string,"created_at"?: string,"created_by"?: string | null,"customer_number": string,"customer_type"?: string,"email"?: string,"id"?: string,"legal_name"?: string,"name": string,"owner_user_id"?: string | null,"payment_terms_days"?: number | null,"phone"?: string | null,"preferences"?: string,"relationship_since"?: string | null,"reminders_enabled"?: boolean,"services"?: (string)[],"status"?: string,"tenant_id": string,"trade_name"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_number"?: string,"version"?: number,"visit_address"?: NonNullable<Json>,"website"?: string
                  }
                  Update: {
                    "billing_address"?: NonNullable<Json>,"billing_email"?: string | null,"billing_preferences"?: NonNullable<Json>,"company_number"?: string,"created_at"?: string,"created_by"?: string | null,"customer_number"?: string,"customer_type"?: string,"email"?: string,"id"?: string,"legal_name"?: string,"name"?: string,"owner_user_id"?: string | null,"payment_terms_days"?: number | null,"phone"?: string | null,"preferences"?: string,"relationship_since"?: string | null,"reminders_enabled"?: boolean,"services"?: (string)[],"status"?: string,"tenant_id"?: string,"trade_name"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_number"?: string,"version"?: number,"visit_address"?: NonNullable<Json>,"website"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_owner_fk"
      columns: ["tenant_id","owner_user_id"]
isOneToOne: false
      referencedRelation: "tenant_memberships"
      referencedColumns: ["tenant_id","user_id"]
    },{
      foreignKeyName: "customers_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"dispatches": {
                  Row: {
                    "assignment_id": string,"dispatched_at": string,"dispatched_by": string,"id": string,"idempotency_key": string,"revoked_at": string | null,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "assignment_id": string,"dispatched_at"?: string,"dispatched_by": string,"id"?: string,"idempotency_key": string,"revoked_at"?: string | null,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "assignment_id"?: string,"dispatched_at"?: string,"dispatched_by"?: string,"id"?: string,"idempotency_key"?: string,"revoked_at"?: string | null,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispatches_tenant_id_assignment_id_fkey"
      columns: ["tenant_id","assignment_id"]
isOneToOne: false
      referencedRelation: "work_order_assignments"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "dispatches_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"dossier_documents": {
                  Row: {
                    "classification": string,"customer_id": string | null,"id": string,"object_id": string | null,"personnel_id": string | null,"source_id": string,"source_kind": string,"tenant_id": string
                  }
                  Insert: {
                    "classification": string,"customer_id"?: string | null,"id"?: string,"object_id"?: string | null,"personnel_id"?: string | null,"source_id": string,"source_kind": string,"tenant_id": string
                  }
                  Update: {
                    "classification"?: string,"customer_id"?: string | null,"id"?: string,"object_id"?: string | null,"personnel_id"?: string | null,"source_id"?: string,"source_kind"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dossier_documents_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "dossier_documents_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossier_documents_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "dossier_documents_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"external_action_tokens": {
                  Row: {
                    "booking_kind": string,"consumed_at": string | null,"created_at": string,"decision": Json | null,"expires_at": string,"id": string,"purpose": string,"recipient": string | null,"revoked_at": string | null,"subject_id": string,"tenant_id": string,"token_hash": string,"work_order_id": string | null
                  }
                  Insert: {
                    "booking_kind"?: string,"consumed_at"?: string | null,"created_at"?: string,"decision"?: Json | null,"expires_at": string,"id"?: string,"purpose": string,"recipient"?: string | null,"revoked_at"?: string | null,"subject_id": string,"tenant_id": string,"token_hash": string,"work_order_id"?: string | null
                  }
                  Update: {
                    "booking_kind"?: string,"consumed_at"?: string | null,"created_at"?: string,"decision"?: Json | null,"expires_at"?: string,"id"?: string,"purpose"?: string,"recipient"?: string | null,"revoked_at"?: string | null,"subject_id"?: string,"tenant_id"?: string,"token_hash"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_action_tokens_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_action_tokens_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"extra_work_rules": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"requires_photo": boolean,"requires_review": boolean,"task_revision_id": string,"tenant_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"requires_photo"?: boolean,"requires_review"?: boolean,"task_revision_id": string,"tenant_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"requires_photo"?: boolean,"requires_review"?: boolean,"task_revision_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "extra_work_rules_tenant_id_task_revision_id_fkey"
      columns: ["tenant_id","task_revision_id"]
isOneToOne: true
      referencedRelation: "task_revisions"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"function_catalog": {
                  Row: {
                    "active": boolean,"created_at": string,"discipline": string,"id": string,"name": string,"required_certificate_codes": (string)[],"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"discipline": string,"id"?: string,"name": string,"required_certificate_codes"?: (string)[],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"discipline"?: string,"id"?: string,"name"?: string,"required_certificate_codes"?: (string)[],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "function_catalog_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_group_items": {
                  Row: {
                    "created_at": string,"id": string,"invoice_group_id": string,"invoice_id": string,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"invoice_group_id": string,"invoice_id": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invoice_group_id"?: string,"invoice_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_group_items_tenant_id_invoice_group_id_fkey"
      columns: ["tenant_id","invoice_group_id"]
isOneToOne: false
      referencedRelation: "invoice_groups"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoice_group_items_tenant_id_invoice_id_fkey"
      columns: ["tenant_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"invoice_groups": {
                  Row: {
                    "created_at": string,"created_by": string | null,"customer_id": string,"expires_at": string | null,"id": string,"purpose": string,"status": string,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id": string,"expires_at"?: string | null,"id"?: string,"purpose": string,"status"?: string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"expires_at"?: string | null,"id"?: string,"purpose"?: string,"status"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_groups_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoice_groups_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_lines": {
                  Row: {
                    "commercial_period_id": string | null,"created_at": string,"description": string,"id": string,"invoice_id": string,"quantity": number,"source_snapshot": NonNullable<Json>,"subtotal_cents": number,"tenant_id": string,"total_cents": number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"vat_cents": number,"work_order_id": string | null,"work_order_task_id": string | null
                  }
                  Insert: {
                    "commercial_period_id"?: string | null,"created_at"?: string,"description": string,"id"?: string,"invoice_id": string,"quantity": number,"source_snapshot": NonNullable<Json>,"subtotal_cents": number,"tenant_id": string,"total_cents": number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"vat_cents": number,"work_order_id"?: string | null,"work_order_task_id"?: string | null
                  }
                  Update: {
                    "commercial_period_id"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"invoice_id"?: string,"quantity"?: number,"source_snapshot"?: NonNullable<Json>,"subtotal_cents"?: number,"tenant_id"?: string,"total_cents"?: number,"unit"?: string,"unit_price_cents"?: number,"vat_basis_points"?: number,"vat_cents"?: number,"work_order_id"?: string | null,"work_order_task_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_lines_commercial_period_fk"
      columns: ["tenant_id","commercial_period_id"]
isOneToOne: false
      referencedRelation: "commercial_billing_periods"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoice_lines_tenant_id_invoice_id_fkey"
      columns: ["tenant_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoice_lines_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoice_task_fk"
      columns: ["tenant_id","work_order_task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"invoice_sequences": {
                  Row: {
                    "last_number": number,"tenant_id": string,"updated_at": string,"year": number
                  }
                  Insert: {
                    "last_number"?: number,"tenant_id": string,"updated_at"?: string,"year": number
                  }
                  Update: {
                    "last_number"?: number,"tenant_id"?: string,"updated_at"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_sequences_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "branding_snapshot": Json | null,"created_at": string,"created_by": string,"currency": string,"customer_id": string,"customer_snapshot": Json | null,"due_on": string | null,"finalized_at": string | null,"id": string,"invoice_number": string | null,"issued_on": string | null,"lines_snapshot": Json | null,"paid_cents": number,"pdf_sha256": string | null,"pdf_storage_path": string | null,"sent_at": string | null,"source_request_id": string | null,"status": Database["public"]['Enums']["invoice_status"],"subtotal_cents": number,"tenant_id": string,"total_cents": number,"updated_at": string,"vat_cents": number,"version": number
                  }
                  Insert: {
                    "branding_snapshot"?: Json | null,"created_at"?: string,"created_by": string,"currency"?: string,"customer_id": string,"customer_snapshot"?: Json | null,"due_on"?: string | null,"finalized_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"issued_on"?: string | null,"lines_snapshot"?: Json | null,"paid_cents"?: number,"pdf_sha256"?: string | null,"pdf_storage_path"?: string | null,"sent_at"?: string | null,"source_request_id"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_cents"?: number,"tenant_id": string,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number,"version"?: number
                  }
                  Update: {
                    "branding_snapshot"?: Json | null,"created_at"?: string,"created_by"?: string,"currency"?: string,"customer_id"?: string,"customer_snapshot"?: Json | null,"due_on"?: string | null,"finalized_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"issued_on"?: string | null,"lines_snapshot"?: Json | null,"paid_cents"?: number,"pdf_sha256"?: string | null,"pdf_storage_path"?: string | null,"sent_at"?: string | null,"source_request_id"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_cents"?: number,"tenant_id"?: string,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "invoices_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"mail_deliveries": {
                  Row: {
                    "attempts": number,"branding_snapshot": Json | null,"created_at": string,"id": string,"idempotency_key": string,"last_error": string | null,"locked_until": string | null,"outbox_event_id": string | null,"provider_message_id": string | null,"recipient": string,"render_snapshot": Json | null,"sent_at": string | null,"status": Database["public"]['Enums']["delivery_status"],"template": string,"template_revision": number | null,"tenant_id": string
                  }
                  Insert: {
                    "attempts"?: number,"branding_snapshot"?: Json | null,"created_at"?: string,"id"?: string,"idempotency_key": string,"last_error"?: string | null,"locked_until"?: string | null,"outbox_event_id"?: string | null,"provider_message_id"?: string | null,"recipient": string,"render_snapshot"?: Json | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"template": string,"template_revision"?: number | null,"tenant_id": string
                  }
                  Update: {
                    "attempts"?: number,"branding_snapshot"?: Json | null,"created_at"?: string,"id"?: string,"idempotency_key"?: string,"last_error"?: string | null,"locked_until"?: string | null,"outbox_event_id"?: string | null,"provider_message_id"?: string | null,"recipient"?: string,"render_snapshot"?: Json | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"template"?: string,"template_revision"?: number | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mail_deliveries_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mail_deliveries_tenant_id_outbox_event_id_fkey"
      columns: ["tenant_id","outbox_event_id"]
isOneToOne: false
      referencedRelation: "outbox_events"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"channel": string,"created_at": string,"id": string,"last_error": string | null,"outbox_event_id": string | null,"read_at": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["delivery_status"],"target_path": string | null,"tenant_id": string,"title": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"channel": string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"outbox_event_id"?: string | null,"read_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"target_path"?: string | null,"tenant_id": string,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"outbox_event_id"?: string | null,"read_at"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"target_path"?: string | null,"tenant_id"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_tenant_id_outbox_event_id_fkey"
      columns: ["tenant_id","outbox_event_id"]
isOneToOne: false
      referencedRelation: "outbox_events"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_customer_bindings": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string,"id": string,"manage_secrets": boolean,"object_id": string,"tenant_id": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"id"?: string,"manage_secrets"?: boolean,"object_id": string,"tenant_id": string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"id"?: string,"manage_secrets"?: boolean,"object_id"?: string,"tenant_id"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_customer_bindings_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_documents": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string,"file_name": string,"id": string,"mime_type": string,"node_id": string | null,"object_id": string,"previous_id": string | null,"record_id": string | null,"request_id": string | null,"scan_status": string,"service": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string,"valid_until": string | null,"version": number,"work_order_id": string | null
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"created_by"?: string,"file_name": string,"id"?: string,"mime_type": string,"node_id"?: string | null,"object_id": string,"previous_id"?: string | null,"record_id"?: string | null,"request_id"?: string | null,"scan_status"?: string,"service"?: string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string,"valid_until"?: string | null,"version"?: number,"work_order_id"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"node_id"?: string | null,"object_id"?: string,"previous_id"?: string | null,"record_id"?: string | null,"request_id"?: string | null,"scan_status"?: string,"service"?: string,"size_bytes"?: number,"storage_path"?: string,"tenant_id"?: string,"title"?: string,"valid_until"?: string | null,"version"?: number,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_documents_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_documents_tenant_id_object_id_node_id_fkey"
      columns: ["tenant_id","object_id","node_id"]
isOneToOne: false
      referencedRelation: "object_nodes"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_documents_tenant_id_object_id_previous_id_fkey"
      columns: ["tenant_id","object_id","previous_id"]
isOneToOne: false
      referencedRelation: "object_documents"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_documents_tenant_id_object_id_record_id_fkey"
      columns: ["tenant_id","object_id","record_id"]
isOneToOne: false
      referencedRelation: "object_records"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_documents_tenant_id_object_id_request_id_fkey"
      columns: ["tenant_id","object_id","request_id"]
isOneToOne: false
      referencedRelation: "object_visit_requests"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_documents_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_history": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"event": string,"id": string,"object_id": string,"snapshot": NonNullable<Json>,"source_id": string,"source_table": string,"tenant_id": string,"version": number
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event": string,"id"?: string,"object_id": string,"snapshot": NonNullable<Json>,"source_id": string,"source_table": string,"tenant_id": string,"version": number
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event"?: string,"id"?: string,"object_id"?: string,"snapshot"?: NonNullable<Json>,"source_id"?: string,"source_table"?: string,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_history_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_instruction_receipts": {
                  Row: {
                    "id": string,"object_id": string,"read_at": string,"record_id": string,"record_version": number,"snapshot": NonNullable<Json>,"tenant_id": string,"user_id": string,"work_order_id": string
                  }
                  Insert: {
                    "id"?: string,"object_id": string,"read_at"?: string,"record_id": string,"record_version": number,"snapshot": NonNullable<Json>,"tenant_id": string,"user_id": string,"work_order_id": string
                  }
                  Update: {
                    "id"?: string,"object_id"?: string,"read_at"?: string,"record_id"?: string,"record_version"?: number,"snapshot"?: NonNullable<Json>,"tenant_id"?: string,"user_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_instruction_receipts_tenant_id_object_id_record_id_fkey"
      columns: ["tenant_id","object_id","record_id"]
isOneToOne: false
      referencedRelation: "object_records"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_instruction_receipts_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_nodes": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"details": NonNullable<Json>,"id": string,"kind": string,"name": string,"object_id": string,"parent_id": string | null,"position": number,"tenant_id": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"kind": string,"name": string,"object_id": string,"parent_id"?: string | null,"position"?: number,"tenant_id": string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name"?: string,"object_id"?: string,"parent_id"?: string | null,"position"?: number,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_nodes_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_nodes_tenant_id_object_id_parent_id_fkey"
      columns: ["tenant_id","object_id","parent_id"]
isOneToOne: false
      referencedRelation: "object_nodes"
      referencedColumns: ["tenant_id","object_id","id"]
    }
                  ]
                },"object_records": {
                  Row: {
                    "agreement_line_id": string | null,"body": string,"contact_id": string | null,"created_at": string,"created_by": string,"details": NonNullable<Json>,"due_on": string | null,"ends_at": string | null,"id": string,"instruction_type": string | null,"kind": string,"node_id": string | null,"object_id": string,"owner_user_id": string | null,"personnel_asset_id": string | null,"service": string,"starts_at": string | null,"state": string,"task_revision_id": string | null,"tenant_id": string,"title": string,"updated_at": string,"updated_by": string,"version": number,"work_order_id": string | null
                  }
                  Insert: {
                    "agreement_line_id"?: string | null,"body"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string,"details"?: NonNullable<Json>,"due_on"?: string | null,"ends_at"?: string | null,"id"?: string,"instruction_type"?: string | null,"kind": string,"node_id"?: string | null,"object_id": string,"owner_user_id"?: string | null,"personnel_asset_id"?: string | null,"service"?: string,"starts_at"?: string | null,"state"?: string,"task_revision_id"?: string | null,"tenant_id": string,"title": string,"updated_at"?: string,"updated_by"?: string,"version"?: number,"work_order_id"?: string | null
                  }
                  Update: {
                    "agreement_line_id"?: string | null,"body"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string,"details"?: NonNullable<Json>,"due_on"?: string | null,"ends_at"?: string | null,"id"?: string,"instruction_type"?: string | null,"kind"?: string,"node_id"?: string | null,"object_id"?: string,"owner_user_id"?: string | null,"personnel_asset_id"?: string | null,"service"?: string,"starts_at"?: string | null,"state"?: string,"task_revision_id"?: string | null,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string,"version"?: number,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_record_agreement_fk"
      columns: ["tenant_id","agreement_line_id"]
isOneToOne: false
      referencedRelation: "customer_agreement_lines"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_records_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "customer_contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_records_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_records_tenant_id_object_id_node_id_fkey"
      columns: ["tenant_id","object_id","node_id"]
isOneToOne: false
      referencedRelation: "object_nodes"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_records_tenant_id_task_revision_id_fkey"
      columns: ["tenant_id","task_revision_id"]
isOneToOne: false
      referencedRelation: "task_revisions"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_records_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_reminder_recipients": {
                  Row: {
                    "active": boolean,"created_by": string,"object_id": string,"tenant_id": string,"user_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_by"?: string,"object_id": string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_by"?: string,"object_id"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_reminder_recipients_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_request_proposals": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string,"id": string,"object_id": string,"price_cents": number,"quantity": number,"request_id": string,"scope": string,"task_revision_id": string,"tenant_id": string,"title": string,"vat_basis_points": number,"version": number
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"object_id": string,"price_cents": number,"quantity": number,"request_id": string,"scope": string,"task_revision_id": string,"tenant_id": string,"title": string,"vat_basis_points": number,"version": number
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"object_id"?: string,"price_cents"?: number,"quantity"?: number,"request_id"?: string,"scope"?: string,"task_revision_id"?: string,"tenant_id"?: string,"title"?: string,"vat_basis_points"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_request_proposals_tenant_id_object_id_request_id_fkey"
      columns: ["tenant_id","object_id","request_id"]
isOneToOne: false
      referencedRelation: "object_visit_requests"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_request_proposals_tenant_id_task_revision_id_fkey"
      columns: ["tenant_id","task_revision_id"]
isOneToOne: false
      referencedRelation: "task_revisions"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"object_request_receipts": {
                  Row: {
                    "object_id": string,"read_at": string,"request_id": string,"tenant_id": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "object_id": string,"read_at"?: string,"request_id": string,"tenant_id": string,"user_id": string,"version": number
                  }
                  Update: {
                    "object_id"?: string,"read_at"?: string,"request_id"?: string,"tenant_id"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_request_receipts_tenant_id_object_id_request_id_fkey"
      columns: ["tenant_id","object_id","request_id"]
isOneToOne: false
      referencedRelation: "object_visit_requests"
      referencedColumns: ["tenant_id","object_id","id"]
    }
                  ]
                },"object_visit_requests": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string,"due_on": string | null,"feedback": string,"id": string,"kind": string,"needs_review": boolean,"node_id": string | null,"object_id": string,"owner_user_id": string | null,"priority": string,"response": string,"review_note": string,"state": string,"tenant_id": string,"title": string,"updated_at": string,"updated_by": string,"version": number,"work_order_id": string,"work_order_task_id": string | null
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string,"due_on"?: string | null,"feedback"?: string,"id": string,"kind": string,"needs_review"?: boolean,"node_id"?: string | null,"object_id": string,"owner_user_id"?: string | null,"priority"?: string,"response"?: string,"review_note"?: string,"state"?: string,"tenant_id": string,"title": string,"updated_at"?: string,"updated_by"?: string,"version"?: number,"work_order_id": string,"work_order_task_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"due_on"?: string | null,"feedback"?: string,"id"?: string,"kind"?: string,"needs_review"?: boolean,"node_id"?: string | null,"object_id"?: string,"owner_user_id"?: string | null,"priority"?: string,"response"?: string,"review_note"?: string,"state"?: string,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string,"version"?: number,"work_order_id"?: string,"work_order_task_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "object_visit_requests_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_visit_requests_tenant_id_object_id_node_id_fkey"
      columns: ["tenant_id","object_id","node_id"]
isOneToOne: false
      referencedRelation: "object_nodes"
      referencedColumns: ["tenant_id","object_id","id"]
    },{
      foreignKeyName: "object_visit_requests_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "object_visit_requests_tenant_id_work_order_task_id_fkey"
      columns: ["tenant_id","work_order_task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"objects": {
                  Row: {
                    "access_instructions": string | null,"active": boolean,"address": NonNullable<Json>,"arrival_instruction": string,"arrival_location": Json | null,"created_at": string,"customer_id": string,"dossier_status": string,"id": string,"latitude": number | null,"location_description": string,"longitude": number | null,"name": string,"object_number": string,"object_type": string,"signature_mode": string,"tenant_id": string,"travel_margin_minutes": number | null,"updated_at": string,"version": number
                  }
                  Insert: {
                    "access_instructions"?: string | null,"active"?: boolean,"address": NonNullable<Json>,"arrival_instruction"?: string,"arrival_location"?: Json | null,"created_at"?: string,"customer_id": string,"dossier_status"?: string,"id"?: string,"latitude"?: number | null,"location_description"?: string,"longitude"?: number | null,"name": string,"object_number": string,"object_type"?: string,"signature_mode"?: string,"tenant_id": string,"travel_margin_minutes"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "access_instructions"?: string | null,"active"?: boolean,"address"?: NonNullable<Json>,"arrival_instruction"?: string,"arrival_location"?: Json | null,"created_at"?: string,"customer_id"?: string,"dossier_status"?: string,"id"?: string,"latitude"?: number | null,"location_description"?: string,"longitude"?: number | null,"name"?: string,"object_number"?: string,"object_type"?: string,"signature_mode"?: string,"tenant_id"?: string,"travel_margin_minutes"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "objects_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"open_shifts": {
                  Row: {
                    "created_at": string,"created_by": string,"ends_at": string,"function_id": string,"id": string,"required_certificate_codes": (string)[],"selected_personnel_id": string | null,"starts_at": string,"status": string,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"ends_at": string,"function_id": string,"id"?: string,"required_certificate_codes"?: (string)[],"selected_personnel_id"?: string | null,"starts_at": string,"status"?: string,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"ends_at"?: string,"function_id"?: string,"id"?: string,"required_certificate_codes"?: (string)[],"selected_personnel_id"?: string | null,"starts_at"?: string,"status"?: string,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "open_shifts_tenant_id_function_id_fkey"
      columns: ["tenant_id","function_id"]
isOneToOne: false
      referencedRelation: "function_catalog"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "open_shifts_tenant_id_selected_personnel_id_fkey"
      columns: ["tenant_id","selected_personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "open_shifts_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"outbox_events": {
                  Row: {
                    "aggregate_id": string,"aggregate_type": string,"attempts": number,"available_at": string,"created_at": string,"event_type": string,"id": string,"idempotency_key": string,"last_error": string | null,"locked_until": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"status": Database["public"]['Enums']["delivery_status"],"tenant_id": string
                  }
                  Insert: {
                    "aggregate_id": string,"aggregate_type": string,"attempts"?: number,"available_at"?: string,"created_at"?: string,"event_type": string,"id"?: string,"idempotency_key": string,"last_error"?: string | null,"locked_until"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"tenant_id": string
                  }
                  Update: {
                    "aggregate_id"?: string,"aggregate_type"?: string,"attempts"?: number,"available_at"?: string,"created_at"?: string,"event_type"?: string,"id"?: string,"idempotency_key"?: string,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"],"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbox_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "allocated_at": string,"amount_cents": number,"id": string,"invoice_id": string,"payment_attempt_id": string,"tenant_id": string
                  }
                  Insert: {
                    "allocated_at"?: string,"amount_cents": number,"id"?: string,"invoice_id": string,"payment_attempt_id": string,"tenant_id": string
                  }
                  Update: {
                    "allocated_at"?: string,"amount_cents"?: number,"id"?: string,"invoice_id"?: string,"payment_attempt_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_tenant_id_invoice_id_fkey"
      columns: ["tenant_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "payment_allocations_tenant_id_payment_attempt_id_fkey"
      columns: ["tenant_id","payment_attempt_id"]
isOneToOne: false
      referencedRelation: "payment_attempts"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"payment_attempts": {
                  Row: {
                    "amount_cents": number,"checkout_url": string | null,"created_at": string,"created_by": string | null,"currency": string,"id": string,"idempotency_key": string,"invoice_group_id": string | null,"last_checked_at": string | null,"paid_at": string | null,"provider": string,"provider_mode": string,"provider_payload": NonNullable<Json>,"provider_payment_id": string | null,"status": Database["public"]['Enums']["payment_status"],"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "amount_cents": number,"checkout_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"idempotency_key": string,"invoice_group_id"?: string | null,"last_checked_at"?: string | null,"paid_at"?: string | null,"provider": string,"provider_mode": string,"provider_payload"?: NonNullable<Json>,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"checkout_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"idempotency_key"?: string,"invoice_group_id"?: string | null,"last_checked_at"?: string | null,"paid_at"?: string | null,"provider"?: string,"provider_mode"?: string,"provider_payload"?: NonNullable<Json>,"provider_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_attempts_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_attempts_tenant_id_invoice_group_id_fkey"
      columns: ["tenant_id","invoice_group_id"]
isOneToOne: false
      referencedRelation: "invoice_groups"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel": {
                  Row: {
                    "alternate_departure_address": NonNullable<Json>,"created_at": string,"departure_depot_id": string | null,"departure_kind": string | null,"email": string | null,"emergency_contact": NonNullable<Json>,"employee_number": string,"end_date": string | null,"full_name": string,"home_address": NonNullable<Json>,"id": string,"phone": string | null,"return_to_departure": boolean,"standard_vehicle": string | null,"start_date": string | null,"status": string,"tenant_id": string,"updated_at": string,"user_id": string | null,"version": number
                  }
                  Insert: {
                    "alternate_departure_address"?: NonNullable<Json>,"created_at"?: string,"departure_depot_id"?: string | null,"departure_kind"?: string | null,"email"?: string | null,"emergency_contact"?: NonNullable<Json>,"employee_number"?: string,"end_date"?: string | null,"full_name": string,"home_address"?: NonNullable<Json>,"id"?: string,"phone"?: string | null,"return_to_departure"?: boolean,"standard_vehicle"?: string | null,"start_date"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Update: {
                    "alternate_departure_address"?: NonNullable<Json>,"created_at"?: string,"departure_depot_id"?: string | null,"departure_kind"?: string | null,"email"?: string | null,"emergency_contact"?: NonNullable<Json>,"employee_number"?: string,"end_date"?: string | null,"full_name"?: string,"home_address"?: NonNullable<Json>,"id"?: string,"phone"?: string | null,"return_to_departure"?: boolean,"standard_vehicle"?: string | null,"start_date"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_tenant_id_departure_depot_id_fkey"
      columns: ["tenant_id","departure_depot_id"]
isOneToOne: false
      referencedRelation: "travel_depots"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"personnel_contracts": {
                  Row: {
                    "active": boolean,"created_at": string,"dossier_data": NonNullable<Json>,"dossier_managed": boolean,"dossier_revision": number,"dossier_status": string,"employment_type": string,"ends_on": string | null,"function_id": string | null,"hours_per_week": number | null,"id": string,"personnel_id": string,"previous_id": string | null,"review_on": string | null,"starts_on": string,"tenant_id": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"employment_type": string,"ends_on"?: string | null,"function_id"?: string | null,"hours_per_week"?: number | null,"id"?: string,"personnel_id": string,"previous_id"?: string | null,"review_on"?: string | null,"starts_on": string,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"employment_type"?: string,"ends_on"?: string | null,"function_id"?: string | null,"hours_per_week"?: number | null,"id"?: string,"personnel_id"?: string,"previous_id"?: string | null,"review_on"?: string | null,"starts_on"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_function_fk"
      columns: ["tenant_id","function_id"]
isOneToOne: false
      referencedRelation: "function_catalog"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_contracts_dossier_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "personnel_contracts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_contracts_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_documents": {
                  Row: {
                    "created_at": string,"created_by": string,"document_type": string,"dossier_data": NonNullable<Json>,"dossier_managed": boolean,"dossier_revision": number,"dossier_status": string,"file_name": string | null,"id": string,"mime_type": string | null,"personnel_id": string,"previous_id": string | null,"replaced_by": string | null,"sha256": string | null,"size_bytes": number | null,"storage_path": string,"tenant_id": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"visible_to_employee": boolean
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"document_type": string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"file_name"?: string | null,"id"?: string,"mime_type"?: string | null,"personnel_id": string,"previous_id"?: string | null,"replaced_by"?: string | null,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path": string,"tenant_id": string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"visible_to_employee"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"document_type"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"file_name"?: string | null,"id"?: string,"mime_type"?: string | null,"personnel_id"?: string,"previous_id"?: string | null,"replaced_by"?: string | null,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"visible_to_employee"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_documents_dossier_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "personnel_documents"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_documents_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_documents_tenant_id_replaced_by_fkey"
      columns: ["tenant_id","replaced_by"]
isOneToOne: false
      referencedRelation: "personnel_documents"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_dossier_access": {
                  Row: {
                    "action": string,"actor_user_id": string,"created_at": string,"id": string,"personnel_id": string,"tenant_id": string
                  }
                  Insert: {
                    "action": string,"actor_user_id"?: string,"created_at"?: string,"id"?: string,"personnel_id": string,"tenant_id": string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string,"created_at"?: string,"id"?: string,"personnel_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_dossier_access_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_dossier_deliveries": {
                  Row: {
                    "attempts": number,"available_at": string,"created_at": string,"due_on": string,"id": string,"last_error": string | null,"personnel_id": string,"recipient": string,"recipient_user_id": string | null,"sent_at": string | null,"source_id": string,"source_revision": number,"source_table": string,"status": string,"tenant_id": string
                  }
                  Insert: {
                    "attempts"?: number,"available_at"?: string,"created_at"?: string,"due_on": string,"id"?: string,"last_error"?: string | null,"personnel_id": string,"recipient": string,"recipient_user_id"?: string | null,"sent_at"?: string | null,"source_id": string,"source_revision": number,"source_table": string,"status"?: string,"tenant_id": string
                  }
                  Update: {
                    "attempts"?: number,"available_at"?: string,"created_at"?: string,"due_on"?: string,"id"?: string,"last_error"?: string | null,"personnel_id"?: string,"recipient"?: string,"recipient_user_id"?: string | null,"sent_at"?: string | null,"source_id"?: string,"source_revision"?: number,"source_table"?: string,"status"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_dossier_deliveries_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_dossier_history": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"id": string,"personnel_id": string,"revision": number,"snapshot": NonNullable<Json>,"source_id": string,"source_table": string,"tenant_id": string
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"personnel_id": string,"revision": number,"snapshot": NonNullable<Json>,"source_id": string,"source_table": string,"tenant_id": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"personnel_id"?: string,"revision"?: number,"snapshot"?: NonNullable<Json>,"source_id"?: string,"source_table"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_dossier_history_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_dossier_items": {
                  Row: {
                    "created_at": string,"dossier_data": NonNullable<Json>,"dossier_managed": boolean,"dossier_revision": number,"dossier_status": string,"due_on": string | null,"id": string,"kind": string,"owner_user_id": string | null,"personnel_id": string,"previous_id": string | null,"tenant_id": string,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"due_on"?: string | null,"id"?: string,"kind": string,"owner_user_id"?: string | null,"personnel_id": string,"previous_id"?: string | null,"tenant_id": string,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"due_on"?: string | null,"id"?: string,"kind"?: string,"owner_user_id"?: string | null,"personnel_id"?: string,"previous_id"?: string | null,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_dossier_items_dossier_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "personnel_dossier_items"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_dossier_items_tenant_id_owner_user_id_fkey"
      columns: ["tenant_id","owner_user_id"]
isOneToOne: false
      referencedRelation: "tenant_memberships"
      referencedColumns: ["tenant_id","user_id"]
    },{
      foreignKeyName: "personnel_dossier_items_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_functions": {
                  Row: {
                    "assigned_at": string,"function_id": string,"id": string,"personnel_id": string,"tenant_id": string
                  }
                  Insert: {
                    "assigned_at"?: string,"function_id": string,"id"?: string,"personnel_id": string,"tenant_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"function_id"?: string,"id"?: string,"personnel_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_functions_tenant_id_function_id_fkey"
      columns: ["tenant_id","function_id"]
isOneToOne: false
      referencedRelation: "function_catalog"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_functions_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_notes": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string,"dossier_data": NonNullable<Json>,"dossier_managed": boolean,"dossier_revision": number,"dossier_status": string,"id": string,"personnel_id": string,"previous_id": string | null,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"created_by": string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"id"?: string,"personnel_id": string,"previous_id"?: string | null,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"dossier_data"?: NonNullable<Json>,"dossier_managed"?: boolean,"dossier_revision"?: number,"dossier_status"?: string,"id"?: string,"personnel_id"?: string,"previous_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_notes_dossier_previous_fk"
      columns: ["tenant_id","previous_id"]
isOneToOne: false
      referencedRelation: "personnel_notes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_notes_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_travel_days": {
                  Row: {
                    "day": string,"departure_address": Json | null,"departure_depot_id": string | null,"departure_kind": string | null,"personnel_id": string,"return_to_departure": boolean | null,"standard_vehicle": string | null,"tenant_id": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  Insert: {
                    "day": string,"departure_address"?: Json | null,"departure_depot_id"?: string | null,"departure_kind"?: string | null,"personnel_id": string,"return_to_departure"?: boolean | null,"standard_vehicle"?: string | null,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "day"?: string,"departure_address"?: Json | null,"departure_depot_id"?: string | null,"departure_kind"?: string | null,"personnel_id"?: string,"return_to_departure"?: boolean | null,"standard_vehicle"?: string | null,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_travel_days_tenant_id_departure_depot_id_fkey"
      columns: ["tenant_id","departure_depot_id"]
isOneToOne: false
      referencedRelation: "travel_depots"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "personnel_travel_days_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"planning_changes": {
                  Row: {
                    "actor_user_id": string,"after_data": NonNullable<Json>,"before_data": NonNullable<Json>,"confirmed_warnings": NonNullable<Json>,"created_at": string,"id": string,"tenant_id": string,"undone_by": string | null,"work_order_id": string
                  }
                  Insert: {
                    "actor_user_id": string,"after_data": NonNullable<Json>,"before_data": NonNullable<Json>,"confirmed_warnings"?: NonNullable<Json>,"created_at"?: string,"id": string,"tenant_id": string,"undone_by"?: string | null,"work_order_id": string
                  }
                  Update: {
                    "actor_user_id"?: string,"after_data"?: NonNullable<Json>,"before_data"?: NonNullable<Json>,"confirmed_warnings"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"tenant_id"?: string,"undone_by"?: string | null,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planning_changes_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planning_changes_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "planning_changes_undone_by_fkey"
      columns: ["undone_by"]
isOneToOne: false
      referencedRelation: "planning_changes"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"created_by": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth_secret": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"revoked_at": string | null,"tenant_id": string,"updated_at": string,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "auth_secret": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"revoked_at"?: string | null,"tenant_id": string,"updated_at"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth_secret"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"revoked_at"?: string | null,"tenant_id"?: string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"qualification_requirements": {
                  Row: {
                    "active": boolean,"code": string,"hard_requirement": boolean,"id": string,"scope": string,"service_name": string | null,"subject_id": string | null,"tenant_id": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"hard_requirement"?: boolean,"id"?: string,"scope": string,"service_name"?: string | null,"subject_id"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"hard_requirement"?: boolean,"id"?: string,"scope"?: string,"service_name"?: string | null,"subject_id"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qualification_requirements_tenant_id_code_fkey"
      columns: ["tenant_id","code"]
isOneToOne: false
      referencedRelation: "qualification_types"
      referencedColumns: ["tenant_id","code"]
    }
                  ]
                },"qualification_types": {
                  Row: {
                    "active": boolean,"code": string,"id": string,"name": string,"reminder_days": (number)[],"tenant_id": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"id"?: string,"name": string,"reminder_days"?: (number)[],"tenant_id": string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"id"?: string,"name"?: string,"reminder_days"?: (number)[],"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qualification_types_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"qualifications": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"issued_at": string | null,"name": string,"personnel_id": string,"tenant_id": string,"valid_until": string | null,"verified_at": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"issued_at"?: string | null,"name": string,"personnel_id": string,"tenant_id": string,"valid_until"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"issued_at"?: string | null,"name"?: string,"personnel_id"?: string,"tenant_id"?: string,"valid_until"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "qualifications_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "acceptance_channel": string | null,"acceptance_evidence": string | null,"accepted_at": string | null,"accepted_by_name": string | null,"archived_at": string | null,"contact_id": string | null,"created_at": string,"currency": string,"customer_id": string,"expires_at": string | null,"followup_on": string | null,"id": string,"lines": NonNullable<Json>,"logo_path": string | null,"next_action": string,"object_id": string | null,"operation_id": string | null,"owner_id": string | null,"pdf_path": string | null,"previous_id": string | null,"price_basis": string,"published_at": string | null,"quote_number": string,"request_id": string | null,"revision": number,"sent_at": string | null,"series_id": string,"snapshot": NonNullable<Json>,"status": Database["public"]['Enums']["quote_status"],"subject": string,"subtotal_cents": number,"superseded_at": string | null,"tenant_id": string,"terms": NonNullable<Json>,"total_cents": number,"updated_at": string,"vat_cents": number,"version": number,"visit_request_id": string | null,"work_kind": string
                  }
                  Insert: {
                    "acceptance_channel"?: string | null,"acceptance_evidence"?: string | null,"accepted_at"?: string | null,"accepted_by_name"?: string | null,"archived_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"currency"?: string,"customer_id": string,"expires_at"?: string | null,"followup_on"?: string | null,"id"?: string,"lines"?: NonNullable<Json>,"logo_path"?: string | null,"next_action"?: string,"object_id"?: string | null,"operation_id"?: string | null,"owner_id"?: string | null,"pdf_path"?: string | null,"previous_id"?: string | null,"price_basis"?: string,"published_at"?: string | null,"quote_number": string,"request_id"?: string | null,"revision"?: number,"sent_at"?: string | null,"series_id"?: string,"snapshot": NonNullable<Json>,"status"?: Database["public"]['Enums']["quote_status"],"subject"?: string,"subtotal_cents": number,"superseded_at"?: string | null,"tenant_id": string,"terms"?: NonNullable<Json>,"total_cents": number,"updated_at"?: string,"vat_cents": number,"version"?: number,"visit_request_id"?: string | null,"work_kind"?: string
                  }
                  Update: {
                    "acceptance_channel"?: string | null,"acceptance_evidence"?: string | null,"accepted_at"?: string | null,"accepted_by_name"?: string | null,"archived_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"currency"?: string,"customer_id"?: string,"expires_at"?: string | null,"followup_on"?: string | null,"id"?: string,"lines"?: NonNullable<Json>,"logo_path"?: string | null,"next_action"?: string,"object_id"?: string | null,"operation_id"?: string | null,"owner_id"?: string | null,"pdf_path"?: string | null,"previous_id"?: string | null,"price_basis"?: string,"published_at"?: string | null,"quote_number"?: string,"request_id"?: string | null,"revision"?: number,"sent_at"?: string | null,"series_id"?: string,"snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["quote_status"],"subject"?: string,"subtotal_cents"?: number,"superseded_at"?: string | null,"tenant_id"?: string,"terms"?: NonNullable<Json>,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number,"version"?: number,"visit_request_id"?: string | null,"work_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_contact_fk"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "customer_contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "quotes_operation_fk"
      columns: ["tenant_id","operation_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "quotes_previous_id_fkey"
      columns: ["previous_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "quotes_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "quotes_tenant_id_request_id_fkey"
      columns: ["tenant_id","request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "quotes_visit_request_id_fkey"
      columns: ["visit_request_id"]
isOneToOne: false
      referencedRelation: "object_visit_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "assigned_user_id": string | null,"completed_at": string | null,"created_at": string,"deduplication_key": string,"due_at": string,"id": string,"kind": string,"personnel_id": string | null,"source_id": string | null,"status": string,"tenant_id": string,"title": string
                  }
                  Insert: {
                    "assigned_user_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"deduplication_key": string,"due_at": string,"id"?: string,"kind": string,"personnel_id"?: string | null,"source_id"?: string | null,"status"?: string,"tenant_id": string,"title": string
                  }
                  Update: {
                    "assigned_user_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"deduplication_key"?: string,"due_at"?: string,"id"?: string,"kind"?: string,"personnel_id"?: string | null,"source_id"?: string | null,"status"?: string,"tenant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"report_entries": {
                  Row: {
                    "author_user_id": string,"body": string,"created_at": string,"customer_visible": boolean,"deleted_at": string | null,"id": string,"incident_severity": string | null,"incident_status": string | null,"is_incident": boolean,"tenant_id": string,"updated_at": string,"version": number,"work_order_id": string
                  }
                  Insert: {
                    "author_user_id": string,"body": string,"created_at"?: string,"customer_visible"?: boolean,"deleted_at"?: string | null,"id"?: string,"incident_severity"?: string | null,"incident_status"?: string | null,"is_incident"?: boolean,"tenant_id": string,"updated_at"?: string,"version"?: number,"work_order_id": string
                  }
                  Update: {
                    "author_user_id"?: string,"body"?: string,"created_at"?: string,"customer_visible"?: boolean,"deleted_at"?: string | null,"id"?: string,"incident_severity"?: string | null,"incident_status"?: string | null,"is_incident"?: boolean,"tenant_id"?: string,"updated_at"?: string,"version"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_entries_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"requests": {
                  Row: {
                    "archived_at": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"description": string,"discipline": string,"followup_on": string | null,"id": string,"next_action": string,"object_id": string | null,"outcome": string | null,"owner_id": string | null,"preferences": NonNullable<Json>,"preferred_slot_id": string | null,"priority": string,"request_number": string,"source": string,"status": string,"subject": string,"tenant_id": string,"updated_at": string,"version": number,"work_kind": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"description": string,"discipline": string,"followup_on"?: string | null,"id"?: string,"next_action"?: string,"object_id"?: string | null,"outcome"?: string | null,"owner_id"?: string | null,"preferences"?: NonNullable<Json>,"preferred_slot_id"?: string | null,"priority"?: string,"request_number": string,"source"?: string,"status"?: string,"subject"?: string,"tenant_id": string,"updated_at"?: string,"version"?: number,"work_kind"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"description"?: string,"discipline"?: string,"followup_on"?: string | null,"id"?: string,"next_action"?: string,"object_id"?: string | null,"outcome"?: string | null,"owner_id"?: string | null,"preferences"?: NonNullable<Json>,"preferred_slot_id"?: string | null,"priority"?: string,"request_number"?: string,"source"?: string,"status"?: string,"subject"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number,"work_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "requests_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "customer_contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "requests_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "requests_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requests_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "requests_tenant_id_preferred_slot_id_fkey"
      columns: ["tenant_id","preferred_slot_id"]
isOneToOne: false
      referencedRelation: "appointment_slots"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"review_decisions": {
                  Row: {
                    "created_at": string,"decided_by": string,"decision": string,"id": string,"reason": string | null,"report_version": number,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"decided_by": string,"decision": string,"id"?: string,"reason"?: string | null,"report_version": number,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_by"?: string,"decision"?: string,"id"?: string,"reason"?: string | null,"report_version"?: number,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_decisions_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"shift_interests": {
                  Row: {
                    "created_at": string,"id": string,"open_shift_id": string,"personnel_id": string,"status": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"open_shift_id": string,"personnel_id": string,"status"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"open_shift_id"?: string,"personnel_id"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shift_interests_tenant_id_open_shift_id_fkey"
      columns: ["tenant_id","open_shift_id"]
isOneToOne: false
      referencedRelation: "open_shifts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "shift_interests_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"signatures": {
                  Row: {
                    "captured_by": string,"captured_by_name": string | null,"channel": string,"content_hash": string | null,"id": string,"report_id": string | null,"report_version": number,"revoked_at": string | null,"sha256": string,"signature_kind": string,"signed_at": string,"signer_capacity": string | null,"signer_name": string,"storage_path": string,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "captured_by": string,"captured_by_name"?: string | null,"channel"?: string,"content_hash"?: string | null,"id"?: string,"report_id"?: string | null,"report_version": number,"revoked_at"?: string | null,"sha256": string,"signature_kind"?: string,"signed_at"?: string,"signer_capacity"?: string | null,"signer_name": string,"storage_path": string,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "captured_by"?: string,"captured_by_name"?: string | null,"channel"?: string,"content_hash"?: string | null,"id"?: string,"report_id"?: string | null,"report_version"?: number,"revoked_at"?: string | null,"sha256"?: string,"signature_kind"?: string,"signed_at"?: string,"signer_capacity"?: string | null,"signer_name"?: string,"storage_path"?: string,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "signatures_report_fk"
      columns: ["tenant_id","report_id"]
isOneToOne: false
      referencedRelation: "work_order_report_versions"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "signatures_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"status_events": {
                  Row: {
                    "actor_user_id": string | null,"assignment_id": string | null,"created_at": string,"id": string,"idempotency_key": string,"new_status": Database["public"]['Enums']["work_order_status"],"note": string | null,"previous_status": Database["public"]['Enums']["work_order_status"] | null,"reason_code": string | null,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"assignment_id"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key": string,"new_status": Database["public"]['Enums']["work_order_status"],"note"?: string | null,"previous_status"?: Database["public"]['Enums']["work_order_status"] | null,"reason_code"?: string | null,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"assignment_id"?: string | null,"created_at"?: string,"id"?: string,"idempotency_key"?: string,"new_status"?: Database["public"]['Enums']["work_order_status"],"note"?: string | null,"previous_status"?: Database["public"]['Enums']["work_order_status"] | null,"reason_code"?: string | null,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "status_events_tenant_id_assignment_id_fkey"
      columns: ["tenant_id","assignment_id"]
isOneToOne: false
      referencedRelation: "work_order_assignments"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "status_events_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"task_catalog": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"description": string | null,"discipline": string,"id": string,"name": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"description"?: string | null,"discipline": string,"id"?: string,"name": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"description"?: string | null,"discipline"?: string,"id"?: string,"name"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_catalog_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"task_revisions": {
                  Row: {
                    "created_at": string,"duration_minutes": number,"id": string,"price_cents": number,"revision": number,"task_id": string,"tenant_id": string,"unit": string,"valid_from": string,"valid_until": string | null,"vat_basis_points": number
                  }
                  Insert: {
                    "created_at"?: string,"duration_minutes": number,"id"?: string,"price_cents": number,"revision": number,"task_id": string,"tenant_id": string,"unit"?: string,"valid_from"?: string,"valid_until"?: string | null,"vat_basis_points"?: number
                  }
                  Update: {
                    "created_at"?: string,"duration_minutes"?: number,"id"?: string,"price_cents"?: number,"revision"?: number,"task_id"?: string,"tenant_id"?: string,"unit"?: string,"valid_from"?: string,"valid_until"?: string | null,"vat_basis_points"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_revisions_tenant_id_task_id_fkey"
      columns: ["tenant_id","task_id"]
isOneToOne: false
      referencedRelation: "task_catalog"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"tenant_admin_invitations": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"invited_at": string | null,"last_error": string | null,"status": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email": string,"full_name": string,"id"?: string,"invited_at"?: string | null,"last_error"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"invited_at"?: string | null,"last_error"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_admin_invitations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_branding": {
                  Row: {
                    "accent_color": string,"logo_path": string | null,"pdf_footer": string | null,"primary_color": string,"sender_email": string | null,"sender_name": string | null,"surface_color": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "accent_color"?: string,"logo_path"?: string | null,"pdf_footer"?: string | null,"primary_color"?: string,"sender_email"?: string | null,"sender_name"?: string | null,"surface_color"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accent_color"?: string,"logo_path"?: string | null,"pdf_footer"?: string | null,"primary_color"?: string,"sender_email"?: string | null,"sender_name"?: string | null,"surface_color"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_branding_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_domains": {
                  Row: {
                    "created_at": string,"host": string,"id": string,"tenant_id": string,"verified_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"host": string,"id"?: string,"tenant_id": string,"verified_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"host"?: string,"id"?: string,"tenant_id"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_domains_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_memberships": {
                  Row: {
                    "activated_at": string | null,"created_at": string,"id": string,"invited_at": string,"revoked_at": string | null,"roles": (Database["public"]['Enums']["app_role"])[],"status": Database["public"]['Enums']["membership_status"],"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "activated_at"?: string | null,"created_at"?: string,"id"?: string,"invited_at"?: string,"revoked_at"?: string | null,"roles": (Database["public"]['Enums']["app_role"])[],"status"?: Database["public"]['Enums']["membership_status"],"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "activated_at"?: string | null,"created_at"?: string,"id"?: string,"invited_at"?: string,"revoked_at"?: string | null,"roles"?: (Database["public"]['Enums']["app_role"])[],"status"?: Database["public"]['Enums']["membership_status"],"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_memberships_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_message_template_revisions": {
                  Row: {
                    "actor_user_id": string | null,"body": string,"channel": string,"created_at": string,"customized": boolean,"id": string,"revision": number,"subject": string,"template_key": string,"tenant_id": string
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"body": string,"channel": string,"created_at"?: string,"customized": boolean,"id"?: string,"revision": number,"subject": string,"template_key": string,"tenant_id": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"body"?: string,"channel"?: string,"created_at"?: string,"customized"?: boolean,"id"?: string,"revision"?: number,"subject"?: string,"template_key"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_message_template_revisions_tenant_id_template_key_fkey"
      columns: ["tenant_id","template_key"]
isOneToOne: false
      referencedRelation: "tenant_message_templates"
      referencedColumns: ["tenant_id","template_key"]
    }
                  ]
                },"tenant_message_templates": {
                  Row: {
                    "body": string,"channel": string,"created_at": string,"customized": boolean,"default_body": string,"default_subject": string,"revision": number,"subject": string,"template_key": string,"tenant_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "body": string,"channel": string,"created_at"?: string,"customized"?: boolean,"default_body": string,"default_subject": string,"revision"?: number,"subject": string,"template_key": string,"tenant_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"created_at"?: string,"customized"?: boolean,"default_body"?: string,"default_subject"?: string,"revision"?: number,"subject"?: string,"template_key"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_message_templates_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_provider_connections": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"mode": string,"provider": string,"public_config": NonNullable<Json>,"secret_reference": string | null,"tenant_id": string,"updated_at": string,"verified_at": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"mode": string,"provider": string,"public_config"?: NonNullable<Json>,"secret_reference"?: string | null,"tenant_id": string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"mode"?: string,"provider"?: string,"public_config"?: NonNullable<Json>,"secret_reference"?: string | null,"tenant_id"?: string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_provider_connections_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenant_settings": {
                  Row: {
                    "appointment_blocks": NonNullable<Json>,"bill_travel_default": boolean,"contract_reminder_days": number,"enabled_services": (string)[],"invoice_prefix": string,"payment_terms_days": number,"personnel_number_prefix": string,"personnel_number_start": number,"settings": NonNullable<Json>,"signature_required_default": boolean,"task_code_prefix": string,"tenant_id": string,"travel_margin_minutes": number,"travel_vehicle_margins": NonNullable<Json>,"updated_at": string,"white_label_enabled": boolean
                  }
                  Insert: {
                    "appointment_blocks"?: NonNullable<Json>,"bill_travel_default"?: boolean,"contract_reminder_days"?: number,"enabled_services"?: (string)[],"invoice_prefix"?: string,"payment_terms_days"?: number,"personnel_number_prefix"?: string,"personnel_number_start"?: number,"settings"?: NonNullable<Json>,"signature_required_default"?: boolean,"task_code_prefix"?: string,"tenant_id": string,"travel_margin_minutes"?: number,"travel_vehicle_margins"?: NonNullable<Json>,"updated_at"?: string,"white_label_enabled"?: boolean
                  }
                  Update: {
                    "appointment_blocks"?: NonNullable<Json>,"bill_travel_default"?: boolean,"contract_reminder_days"?: number,"enabled_services"?: (string)[],"invoice_prefix"?: string,"payment_terms_days"?: number,"personnel_number_prefix"?: string,"personnel_number_start"?: number,"settings"?: NonNullable<Json>,"signature_required_default"?: boolean,"task_code_prefix"?: string,"tenant_id"?: string,"travel_margin_minutes"?: number,"travel_vehicle_margins"?: NonNullable<Json>,"updated_at"?: string,"white_label_enabled"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenant_settings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: true
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"onboarding_key": string | null,"slug": string,"status": string,"timezone": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"onboarding_key"?: string | null,"slug": string,"status"?: string,"timezone"?: string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"onboarding_key"?: string | null,"slug"?: string,"status"?: string,"timezone"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"time_entries": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"assignment_id": string | null,"correction_reason": string | null,"created_at": string,"ends_at": string | null,"id": string,"kind": string,"personnel_id": string,"starts_at": string,"status": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"assignment_id"?: string | null,"correction_reason"?: string | null,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"kind": string,"personnel_id": string,"starts_at": string,"status"?: string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"assignment_id"?: string | null,"correction_reason"?: string | null,"created_at"?: string,"ends_at"?: string | null,"id"?: string,"kind"?: string,"personnel_id"?: string,"starts_at"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_tenant_id_assignment_id_fkey"
      columns: ["tenant_id","assignment_id"]
isOneToOne: false
      referencedRelation: "work_order_assignments"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "time_entries_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"travel_depots": {
                  Row: {
                    "active": boolean,"address": NonNullable<Json>,"id": string,"name": string,"tenant_id": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"address"?: NonNullable<Json>,"id"?: string,"name": string,"tenant_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"address"?: NonNullable<Json>,"id"?: string,"name"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "travel_depots_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"travel_legs": {
                  Row: {
                    "actual_ended_at": string | null,"actual_started_at": string | null,"assignment_id": string,"basis_calculated_at": string | null,"basis_distance_metres": number | null,"basis_seconds": number | null,"billable": boolean,"calculated_at": string | null,"created_at": string,"destination_address": NonNullable<Json>,"direction": string,"error_code": string | null,"estimate_snapshot": Json | null,"estimated_distance_metres": number | null,"estimated_minutes": number | null,"id": string,"manual_metres": number | null,"manual_reason": string | null,"manual_seconds": number | null,"manual_signature": string | null,"manual_updated_at": string | null,"manual_updated_by": string | null,"origin_address": NonNullable<Json>,"planning_day": string | null,"planning_margin_minutes": number,"planning_revision": number | null,"provider": string | null,"provider_reference": string | null,"route_signature": string | null,"routing_profile": string | null,"tenant_id": string,"travel_mode": string
                  }
                  Insert: {
                    "actual_ended_at"?: string | null,"actual_started_at"?: string | null,"assignment_id": string,"basis_calculated_at"?: string | null,"basis_distance_metres"?: number | null,"basis_seconds"?: number | null,"billable"?: boolean,"calculated_at"?: string | null,"created_at"?: string,"destination_address": NonNullable<Json>,"direction": string,"error_code"?: string | null,"estimate_snapshot"?: Json | null,"estimated_distance_metres"?: number | null,"estimated_minutes"?: number | null,"id"?: string,"manual_metres"?: number | null,"manual_reason"?: string | null,"manual_seconds"?: number | null,"manual_signature"?: string | null,"manual_updated_at"?: string | null,"manual_updated_by"?: string | null,"origin_address": NonNullable<Json>,"planning_day"?: string | null,"planning_margin_minutes"?: number,"planning_revision"?: number | null,"provider"?: string | null,"provider_reference"?: string | null,"route_signature"?: string | null,"routing_profile"?: string | null,"tenant_id": string,"travel_mode": string
                  }
                  Update: {
                    "actual_ended_at"?: string | null,"actual_started_at"?: string | null,"assignment_id"?: string,"basis_calculated_at"?: string | null,"basis_distance_metres"?: number | null,"basis_seconds"?: number | null,"billable"?: boolean,"calculated_at"?: string | null,"created_at"?: string,"destination_address"?: NonNullable<Json>,"direction"?: string,"error_code"?: string | null,"estimate_snapshot"?: Json | null,"estimated_distance_metres"?: number | null,"estimated_minutes"?: number | null,"id"?: string,"manual_metres"?: number | null,"manual_reason"?: string | null,"manual_seconds"?: number | null,"manual_signature"?: string | null,"manual_updated_at"?: string | null,"manual_updated_by"?: string | null,"origin_address"?: NonNullable<Json>,"planning_day"?: string | null,"planning_margin_minutes"?: number,"planning_revision"?: number | null,"provider"?: string | null,"provider_reference"?: string | null,"route_signature"?: string | null,"routing_profile"?: string | null,"tenant_id"?: string,"travel_mode"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "travel_legs_tenant_id_assignment_id_fkey"
      columns: ["tenant_id","assignment_id"]
isOneToOne: false
      referencedRelation: "work_order_assignments"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_allowed_extra_work": {
                  Row: {
                    "created_at": string,"extra_work_rule_id": string,"id": string,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"extra_work_rule_id": string,"id"?: string,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"extra_work_rule_id"?: string,"id"?: string,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_allowed_extra_work_tenant_id_extra_work_rule_id_fkey"
      columns: ["tenant_id","extra_work_rule_id"]
isOneToOne: false
      referencedRelation: "extra_work_rules"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_allowed_extra_work_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_assignments": {
                  Row: {
                    "actual_end_at": string | null,"actual_start_at": string | null,"created_at": string,"departed_at": string | null,"id": string,"paused_at": string | null,"personnel_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"qualification_snapshot": NonNullable<Json>,"return_note": string | null,"return_reason_code": string | null,"seen_at": string | null,"status": string,"tenant_id": string,"updated_at": string,"version": number,"work_order_id": string
                  }
                  Insert: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"created_at"?: string,"departed_at"?: string | null,"id"?: string,"paused_at"?: string | null,"personnel_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"qualification_snapshot"?: NonNullable<Json>,"return_note"?: string | null,"return_reason_code"?: string | null,"seen_at"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string,"version"?: number,"work_order_id": string
                  }
                  Update: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"created_at"?: string,"departed_at"?: string | null,"id"?: string,"paused_at"?: string | null,"personnel_id"?: string,"planned_end_at"?: string,"planned_start_at"?: string,"projected_end_at"?: string,"projected_start_at"?: string,"qualification_snapshot"?: NonNullable<Json>,"return_note"?: string | null,"return_reason_code"?: string | null,"seen_at"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_assignments_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_assignments_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_checklist_answers": {
                  Row: {
                    "attachment_id": string | null,"checklist_id": string,"id": string,"not_applicable": boolean,"question_id": string,"reason": string,"tenant_id": string,"updated_at": string,"updated_by": string,"value": Json | null,"version": number
                  }
                  Insert: {
                    "attachment_id"?: string | null,"checklist_id": string,"id"?: string,"not_applicable"?: boolean,"question_id": string,"reason"?: string,"tenant_id": string,"updated_at"?: string,"updated_by": string,"value"?: Json | null,"version"?: number
                  }
                  Update: {
                    "attachment_id"?: string | null,"checklist_id"?: string,"id"?: string,"not_applicable"?: boolean,"question_id"?: string,"reason"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string,"value"?: Json | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_checklist_answers_tenant_id_attachment_id_fkey"
      columns: ["tenant_id","attachment_id"]
isOneToOne: false
      referencedRelation: "attachments"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_checklist_answers_tenant_id_checklist_id_fkey"
      columns: ["tenant_id","checklist_id"]
isOneToOne: false
      referencedRelation: "work_order_checklists"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_checklists": {
                  Row: {
                    "created_at": string,"definition": NonNullable<Json>,"id": string,"name": string,"template_revision_id": string,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"definition": NonNullable<Json>,"id"?: string,"name": string,"template_revision_id": string,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"definition"?: NonNullable<Json>,"id"?: string,"name"?: string,"template_revision_id"?: string,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_checklists_tenant_id_template_revision_id_fkey"
      columns: ["tenant_id","template_revision_id"]
isOneToOne: false
      referencedRelation: "work_order_template_versions"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_checklists_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_contacts": {
                  Row: {
                    "contact_id": string,"id": string,"roles": (string)[],"snapshot": NonNullable<Json>,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "contact_id": string,"id"?: string,"roles": (string)[],"snapshot": NonNullable<Json>,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "contact_id"?: string,"id"?: string,"roles"?: (string)[],"snapshot"?: NonNullable<Json>,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_contacts_tenant_id_contact_id_fkey"
      columns: ["tenant_id","contact_id"]
isOneToOne: false
      referencedRelation: "customer_contacts"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_contacts_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_exceptions": {
                  Row: {
                    "attachment_id": string | null,"blocking": boolean,"created_at": string,"created_by": string,"description": string,"id": string,"kind": string,"owner_user_id": string | null,"resolution": string | null,"resolved_at": string | null,"resolved_by": string | null,"state": string,"tenant_id": string,"version": number,"work_order_id": string
                  }
                  Insert: {
                    "attachment_id"?: string | null,"blocking"?: boolean,"created_at"?: string,"created_by": string,"description": string,"id": string,"kind": string,"owner_user_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"state"?: string,"tenant_id": string,"version"?: number,"work_order_id": string
                  }
                  Update: {
                    "attachment_id"?: string | null,"blocking"?: boolean,"created_at"?: string,"created_by"?: string,"description"?: string,"id"?: string,"kind"?: string,"owner_user_id"?: string | null,"resolution"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"state"?: string,"tenant_id"?: string,"version"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_exceptions_tenant_id_attachment_id_fkey"
      columns: ["tenant_id","attachment_id"]
isOneToOne: false
      referencedRelation: "attachments"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_exceptions_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_material_usage": {
                  Row: {
                    "created_at": string,"created_by": string,"customer_visible": boolean,"description": string,"id": string,"quantity": number,"task_id": string | null,"tenant_id": string,"unit": string,"work_order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"customer_visible"?: boolean,"description": string,"id"?: string,"quantity": number,"task_id"?: string | null,"tenant_id": string,"unit": string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"customer_visible"?: boolean,"description"?: string,"id"?: string,"quantity"?: number,"task_id"?: string | null,"tenant_id"?: string,"unit"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_material_usage_tenant_id_task_id_fkey"
      columns: ["tenant_id","task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_material_usage_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_occurrences": {
                  Row: {
                    "created_at": string,"generated_order_version": number | null,"occurrence_on": string,"reason": string,"series_id": string,"series_version": number,"state": string,"tenant_id": string,"work_order_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"generated_order_version"?: number | null,"occurrence_on": string,"reason"?: string,"series_id": string,"series_version": number,"state": string,"tenant_id": string,"work_order_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"generated_order_version"?: number | null,"occurrence_on"?: string,"reason"?: string,"series_id"?: string,"series_version"?: number,"state"?: string,"tenant_id"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_occurrences_tenant_id_series_id_fkey"
      columns: ["tenant_id","series_id"]
isOneToOne: false
      referencedRelation: "work_order_series"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_occurrences_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: true
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_relations": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"kind": string,"reason": string,"source_order_id": string,"target_order_id": string,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"kind": string,"reason"?: string,"source_order_id": string,"target_order_id": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"reason"?: string,"source_order_id"?: string,"target_order_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_relations_tenant_id_source_order_id_fkey"
      columns: ["tenant_id","source_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_relations_tenant_id_target_order_id_fkey"
      columns: ["tenant_id","target_order_id"]
isOneToOne: true
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_report_versions": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"content_hash": string,"created_at": string,"created_by": string,"id": string,"signature_policy": NonNullable<Json>,"snapshot": NonNullable<Json>,"state": string,"submission_key": string,"tenant_id": string,"version": number,"work_order_id": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"content_hash": string,"created_at"?: string,"created_by": string,"id"?: string,"signature_policy": NonNullable<Json>,"snapshot": NonNullable<Json>,"state": string,"submission_key": string,"tenant_id": string,"version": number,"work_order_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"content_hash"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"signature_policy"?: NonNullable<Json>,"snapshot"?: NonNullable<Json>,"state"?: string,"submission_key"?: string,"tenant_id"?: string,"version"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_report_versions_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_scope_transfers": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"quantity": number,"reason": string,"source_task_id": string,"target_order_id": string,"target_task_id": string,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"quantity": number,"reason": string,"source_task_id": string,"target_order_id": string,"target_task_id": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"quantity"?: number,"reason"?: string,"source_task_id"?: string,"target_order_id"?: string,"target_task_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_scope_transfers_tenant_id_source_task_id_fkey"
      columns: ["tenant_id","source_task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_scope_transfers_tenant_id_target_order_id_fkey"
      columns: ["tenant_id","target_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_scope_transfers_tenant_id_target_task_id_fkey"
      columns: ["tenant_id","target_task_id"]
isOneToOne: true
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_series": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string,"definition": NonNullable<Json>,"id": string,"source_order_id": string,"tenant_id": string,"timezone": string,"title": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by": string,"definition": NonNullable<Json>,"id"?: string,"source_order_id": string,"tenant_id": string,"timezone": string,"title": string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string,"definition"?: NonNullable<Json>,"id"?: string,"source_order_id"?: string,"tenant_id"?: string,"timezone"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_series_tenant_id_source_order_id_fkey"
      columns: ["tenant_id","source_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_signature_waivers": {
                  Row: {
                    "actor_id": string,"created_at": string,"id": string,"reason": string,"report_id": string,"tenant_id": string
                  }
                  Insert: {
                    "actor_id": string,"created_at"?: string,"id"?: string,"reason": string,"report_id": string,"tenant_id": string
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"id"?: string,"reason"?: string,"report_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_signature_waivers_tenant_id_report_id_fkey"
      columns: ["tenant_id","report_id"]
isOneToOne: true
      referencedRelation: "work_order_report_versions"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_task_contributions": {
                  Row: {
                    "actor_id": string,"execution_version": number,"from_quantity": number,"id": string,"note": string | null,"recorded_at": string,"result": string,"task_id": string,"tenant_id": string,"to_quantity": number
                  }
                  Insert: {
                    "actor_id": string,"execution_version": number,"from_quantity": number,"id"?: string,"note"?: string | null,"recorded_at"?: string,"result": string,"task_id": string,"tenant_id": string,"to_quantity": number
                  }
                  Update: {
                    "actor_id"?: string,"execution_version"?: number,"from_quantity"?: number,"id"?: string,"note"?: string | null,"recorded_at"?: string,"result"?: string,"task_id"?: string,"tenant_id"?: string,"to_quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_task_contributions_tenant_id_task_id_fkey"
      columns: ["tenant_id","task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_tasks": {
                  Row: {
                    "added_by": string | null,"agreement_line_id": string | null,"allowed_for_staff": boolean,"assigned_personnel_id": string | null,"commercial_snapshot": NonNullable<Json>,"completed_at": string | null,"completion_note": string | null,"created_at": string,"duration_minutes": number,"executed_quantity": number | null,"execution_state": string,"execution_version": number,"extra_work_status": string | null,"id": string,"instructions": string,"is_extra_work": boolean,"quantity": number,"scope_root_task_id": string | null,"task_code": string,"task_name": string,"task_revision_id": string | null,"tenant_id": string,"transferred_quantity": number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"withdrawn_quantity": number,"work_order_id": string
                  }
                  Insert: {
                    "added_by"?: string | null,"agreement_line_id"?: string | null,"allowed_for_staff"?: boolean,"assigned_personnel_id"?: string | null,"commercial_snapshot"?: NonNullable<Json>,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"duration_minutes": number,"executed_quantity"?: number | null,"execution_state"?: string,"execution_version"?: number,"extra_work_status"?: string | null,"id"?: string,"instructions"?: string,"is_extra_work"?: boolean,"quantity"?: number,"scope_root_task_id"?: string | null,"task_code": string,"task_name": string,"task_revision_id"?: string | null,"tenant_id": string,"transferred_quantity"?: number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"withdrawn_quantity"?: number,"work_order_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"agreement_line_id"?: string | null,"allowed_for_staff"?: boolean,"assigned_personnel_id"?: string | null,"commercial_snapshot"?: NonNullable<Json>,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"duration_minutes"?: number,"executed_quantity"?: number | null,"execution_state"?: string,"execution_version"?: number,"extra_work_status"?: string | null,"id"?: string,"instructions"?: string,"is_extra_work"?: boolean,"quantity"?: number,"scope_root_task_id"?: string | null,"task_code"?: string,"task_name"?: string,"task_revision_id"?: string | null,"tenant_id"?: string,"transferred_quantity"?: number,"unit"?: string,"unit_price_cents"?: number,"vat_basis_points"?: number,"withdrawn_quantity"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_agreement_line_fk"
      columns: ["tenant_id","agreement_line_id"]
isOneToOne: false
      referencedRelation: "customer_agreement_lines"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_scope_root_fk"
      columns: ["tenant_id","scope_root_task_id"]
isOneToOne: false
      referencedRelation: "work_order_tasks"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_tasks_personnel_fk"
      columns: ["tenant_id","assigned_personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_tasks_tenant_id_task_revision_id_fkey"
      columns: ["tenant_id","task_revision_id"]
isOneToOne: false
      referencedRelation: "task_revisions"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_order_tasks_tenant_id_work_order_id_fkey"
      columns: ["tenant_id","work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_template_versions": {
                  Row: {
                    "created_at": string,"created_by": string,"definition": NonNullable<Json>,"edit_version": number,"id": string,"published_at": string | null,"state": string,"template_id": string,"tenant_id": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"definition"?: NonNullable<Json>,"edit_version"?: number,"id"?: string,"published_at"?: string | null,"state"?: string,"template_id": string,"tenant_id": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"definition"?: NonNullable<Json>,"edit_version"?: number,"id"?: string,"published_at"?: string | null,"state"?: string,"template_id"?: string,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_template_versions_tenant_id_template_id_fkey"
      columns: ["tenant_id","template_id"]
isOneToOne: false
      referencedRelation: "work_order_templates"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"work_order_templates": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"kind": string,"name": string,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"kind": string,"name": string,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"name"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_templates_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"work_orders": {
                  Row: {
                    "actual_end_at": string | null,"actual_start_at": string | null,"appointment_slot_id": string | null,"archive_at": string | null,"attention_reason": string | null,"bill_travel": boolean,"budget_labor_minutes": number | null,"commercial_terms": NonNullable<Json>,"created_at": string,"created_by": string,"customer_id": string,"customer_window_kind": string,"day_instructions": string,"deadline": string | null,"description": string,"details": NonNullable<Json>,"discipline": string,"employee_signature_required": boolean,"id": string,"labels": (string)[],"lead_personnel_id": string | null,"object_id": string,"object_snapshot": NonNullable<Json>,"planned_end_at": string | null,"planned_start_at": string | null,"planner_user_id": string | null,"planning_state": string,"priority": string,"projected_end_at": string | null,"projected_start_at": string | null,"published_at": string | null,"quote_id": string | null,"report_state": string,"report_version": number,"request_id": string | null,"requested_date": string | null,"required_personnel": number,"signature_mode": string,"signature_policy_snapshot": Json | null,"signature_required": boolean,"source_kind": string,"status": Database["public"]['Enums']["work_order_status"],"template_snapshot": NonNullable<Json>,"tenant_id": string,"title": string,"updated_at": string,"version": number,"visit_kind": string,"work_order_number": string
                  }
                  Insert: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"appointment_slot_id"?: string | null,"archive_at"?: string | null,"attention_reason"?: string | null,"bill_travel"?: boolean,"budget_labor_minutes"?: number | null,"commercial_terms"?: NonNullable<Json>,"created_at"?: string,"created_by": string,"customer_id": string,"customer_window_kind"?: string,"day_instructions"?: string,"deadline"?: string | null,"description"?: string,"details"?: NonNullable<Json>,"discipline": string,"employee_signature_required"?: boolean,"id"?: string,"labels"?: (string)[],"lead_personnel_id"?: string | null,"object_id": string,"object_snapshot"?: NonNullable<Json>,"planned_end_at"?: string | null,"planned_start_at"?: string | null,"planner_user_id"?: string | null,"planning_state"?: string,"priority"?: string,"projected_end_at"?: string | null,"projected_start_at"?: string | null,"published_at"?: string | null,"quote_id"?: string | null,"report_state"?: string,"report_version"?: number,"request_id"?: string | null,"requested_date"?: string | null,"required_personnel"?: number,"signature_mode"?: string,"signature_policy_snapshot"?: Json | null,"signature_required"?: boolean,"source_kind"?: string,"status"?: Database["public"]['Enums']["work_order_status"],"template_snapshot"?: NonNullable<Json>,"tenant_id": string,"title"?: string,"updated_at"?: string,"version"?: number,"visit_kind"?: string,"work_order_number": string
                  }
                  Update: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"appointment_slot_id"?: string | null,"archive_at"?: string | null,"attention_reason"?: string | null,"bill_travel"?: boolean,"budget_labor_minutes"?: number | null,"commercial_terms"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"customer_window_kind"?: string,"day_instructions"?: string,"deadline"?: string | null,"description"?: string,"details"?: NonNullable<Json>,"discipline"?: string,"employee_signature_required"?: boolean,"id"?: string,"labels"?: (string)[],"lead_personnel_id"?: string | null,"object_id"?: string,"object_snapshot"?: NonNullable<Json>,"planned_end_at"?: string | null,"planned_start_at"?: string | null,"planner_user_id"?: string | null,"planning_state"?: string,"priority"?: string,"projected_end_at"?: string | null,"projected_start_at"?: string | null,"published_at"?: string | null,"quote_id"?: string | null,"report_state"?: string,"report_version"?: number,"request_id"?: string | null,"requested_date"?: string | null,"required_personnel"?: number,"signature_mode"?: string,"signature_policy_snapshot"?: Json | null,"signature_required"?: boolean,"source_kind"?: string,"status"?: Database["public"]['Enums']["work_order_status"],"template_snapshot"?: NonNullable<Json>,"tenant_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number,"visit_kind"?: string,"work_order_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_orders_lead_fk"
      columns: ["tenant_id","lead_personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_orders_tenant_id_appointment_slot_id_fkey"
      columns: ["tenant_id","appointment_slot_id"]
isOneToOne: false
      referencedRelation: "appointment_slots"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_orders_tenant_id_customer_id_fkey"
      columns: ["tenant_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_orders_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_tenant_id_object_id_fkey"
      columns: ["tenant_id","object_id"]
isOneToOne: false
      referencedRelation: "objects"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_orders_tenant_id_quote_id_fkey"
      columns: ["tenant_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "work_orders_tenant_id_request_id_fkey"
      columns: ["tenant_id","request_id"]
isOneToOne: false
      referencedRelation: "requests"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_object_proposal":
{ Args: { "target_proposal": string,"target_tenant": string }; Returns: undefined
                           },
"acknowledge_object_instruction":
{ Args: { "expected_version": number,"target_order": string,"target_record": string,"target_tenant": string }; Returns: undefined
                           },
"acknowledge_object_request":
{ Args: { "expected_version": number,"target_request": string,"target_tenant": string }; Returns: undefined
                           },
"add_extra_work":
{ Args: { "idempotency_key": string,"target_extra_work_rule_id": string,"target_work_order_id": string }; Returns: {
              "added_by": string | null,
"agreement_line_id": string | null,
"allowed_for_staff": boolean,
"assigned_personnel_id": string | null,
"commercial_snapshot": NonNullable<Json>,
"completed_at": string | null,
"completion_note": string | null,
"created_at": string,
"duration_minutes": number,
"executed_quantity": number | null,
"execution_state": string,
"execution_version": number,
"extra_work_status": string | null,
"id": string,
"instructions": string,
"is_extra_work": boolean,
"quantity": number,
"scope_root_task_id": string | null,
"task_code": string,
"task_name": string,
"task_revision_id": string | null,
"tenant_id": string,
"transferred_quantity": number,
"unit": string,
"unit_price_cents": number,
"vat_basis_points": number,
"withdrawn_quantity": number,
"work_order_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_order_tasks"
        isOneToOne: true
        isSetofReturn: false
      } },
"answer_work_order_checklist":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"apply_confirmed_provider_payment":
{ Args: { "provider_amount_cents": number,"provider_currency": string,"provider_payload": Json,"provider_payment_id": string,"provider_status": Database["public"]['Enums']["payment_status"],"target_payment_attempt_id": string }; Returns: {
              "amount_cents": number,
"checkout_url": string | null,
"created_at": string,
"created_by": string | null,
"currency": string,
"id": string,
"idempotency_key": string,
"invoice_group_id": string | null,
"last_checked_at": string | null,
"paid_at": string | null,
"provider": string,
"provider_mode": string,
"provider_payload": NonNullable<Json>,
"provider_payment_id": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tenant_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_attempts"
        isOneToOne: true
        isSetofReturn: false
      } },
"assign_work_order_task":
{ Args: { "expected_version": number,"personnel"?: string,"target_task": string,"target_tenant": string }; Returns: undefined
                           },
"attach_invoice_pdf":
{ Args: { "sha256": string,"storage_path": string,"target_invoice_id": string }; Returns: {
              "branding_snapshot": Json | null,
"created_at": string,
"created_by": string,
"currency": string,
"customer_id": string,
"customer_snapshot": Json | null,
"due_on": string | null,
"finalized_at": string | null,
"id": string,
"invoice_number": string | null,
"issued_on": string | null,
"lines_snapshot": Json | null,
"paid_cents": number,
"pdf_sha256": string | null,
"pdf_storage_path": string | null,
"sent_at": string | null,
"source_request_id": string | null,
"status": Database["public"]['Enums']["invoice_status"],
"subtotal_cents": number,
"tenant_id": string,
"total_cents": number,
"updated_at": string,
"vat_cents": number,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"bind_object_customer":
{ Args: { "allow_secrets": boolean,"email_address": string,"is_active": boolean,"target_object": string,"target_tenant": string }; Returns: undefined
                           },
"book_appointment_slot":
{ Args: { "target_request_id": string,"target_slot_id": string,"target_tenant_id": string,"target_token_id": string }; Returns: {
              "booked_count": number,
"capacity": number,
"created_at": string,
"ends_at": string,
"id": string,
"starts_at": string,
"status": string,
"tenant_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "appointment_slots"
        isOneToOne: true
        isSetofReturn: false
      } },
"change_work_order_planning":
{ Args: { "appointment_data"?: Json,"confirmed_warnings"?: (string)[],"expected_version": number,"mutation_id": string,"target_assignments": Json,"target_end": string,"target_start": string,"target_tenant": string,"target_work_order": string,"undo_change"?: string }; Returns: Json
                           },
"change_work_order_signature_policy":
{ Args: { "employee_required": boolean,"expected_version": number,"mode": string,"mutation_id": string,"reason": string,"target_order": string }; Returns: undefined
                           },
"claim_mail_delivery":
{ Args: { "target_idempotency_key": string,"target_recipient": string,"target_template": string,"target_tenant_id": string }; Returns: {
              "current_status": Database["public"]['Enums']["delivery_status"],"delivery_id": string,"should_send": boolean
            }[]
                           },
"claim_outbox":
{ Args: { "batch_size"?: number,"lock_seconds"?: number }; Returns: {
              "aggregate_id": string,
"aggregate_type": string,
"attempts": number,
"available_at": string,
"created_at": string,
"event_type": string,
"id": string,
"idempotency_key": string,
"last_error": string | null,
"locked_until": string | null,
"payload": NonNullable<Json>,
"processed_at": string | null,
"status": Database["public"]['Enums']["delivery_status"],
"tenant_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "outbox_events"
        isOneToOne: false
        isSetofReturn: true
      } },
"claim_personnel_dossier_deliveries":
{ Args: { "batch_size"?: number }; Returns: {
              "attempts": number,
"available_at": string,
"created_at": string,
"due_on": string,
"id": string,
"last_error": string | null,
"personnel_id": string,
"recipient": string,
"recipient_user_id": string | null,
"sent_at": string | null,
"source_id": string,
"source_revision": number,
"source_table": string,
"status": string,
"tenant_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "personnel_dossier_deliveries"
        isOneToOne: false
        isSetofReturn: true
      } },
"commercial_booking":
{ Args: { "command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           },
"commercial_cancel_booking":
{ Args: { "command_id": string,"reason": string,"target_order": string,"target_tenant": string }; Returns: boolean
                           },
"commercial_command":
{ Args: { "command": string,"command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           },
"commercial_customer_action":
{ Args: { "command": string,"command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           },
"commercial_customer_file":
{ Args: { "asset"?: string,"target_id": string,"target_tenant": string }; Returns: Json
                           },
"commercial_customer_list":
{ Args: { "page_number"?: number,"target_tenant": string }; Returns: Json
                           },
"commercial_detail":
{ Args: { "source_kind": string,"target_id": string,"target_tenant": string }; Returns: Json
                           },
"commercial_external_decision":
{ Args: { "input": Json,"target_tenant": string,"token_hash_input": string }; Returns: Json
                           },
"commercial_list":
{ Args: { "filters"?: Json,"target_tenant": string }; Returns: Json
                           },
"commercial_mail_claim":
{ Args: { "event_id": string,"recipient_input": string,"target_tenant": string }; Returns: Json
                           },
"commercial_next_visit":
{ Args: { "command_id": string,"quote_id": string,"target_tenant": string,"visit_date": string }; Returns: string
                           },
"commercial_options":
{ Args: { "customer"?: string,"query"?: string,"target_tenant": string }; Returns: Json
                           },
"commercial_order_context":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"commercial_public_intake":
{ Args: { "client_hash": string,"input": Json,"request_id": string,"target_tenant": string }; Returns: boolean
                           },
"commercial_quote_mail_claim":
{ Args: { "command_id": string,"reminder": boolean,"target_quote": string,"target_tenant": string }; Returns: Json
                           },
"commercial_quote_mail_finish":
{ Args: { "actor": string,"delivery_id": string,"message_id": string,"target_tenant": string }; Returns: undefined
                           },
"commercial_save_quote":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"commercial_save_request":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"complete_work_order_task":
{ Args: { "completed": boolean,"completion_note"?: string,"target_task_id": string }; Returns: {
              "added_by": string | null,
"agreement_line_id": string | null,
"allowed_for_staff": boolean,
"assigned_personnel_id": string | null,
"commercial_snapshot": NonNullable<Json>,
"completed_at": string | null,
"completion_note": string | null,
"created_at": string,
"duration_minutes": number,
"executed_quantity": number | null,
"execution_state": string,
"execution_version": number,
"extra_work_status": string | null,
"id": string,
"instructions": string,
"is_extra_work": boolean,
"quantity": number,
"scope_root_task_id": string | null,
"task_code": string,
"task_name": string,
"task_revision_id": string | null,
"tenant_id": string,
"transferred_quantity": number,
"unit": string,
"unit_price_cents": number,
"vat_basis_points": number,
"withdrawn_quantity": number,
"work_order_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_order_tasks"
        isOneToOne: true
        isSetofReturn: false
      } },
"confirm_shift_interest":
{ Args: { "target_personnel_id": string,"target_shift_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"ends_at": string,
"function_id": string,
"id": string,
"required_certificate_codes": (string)[],
"selected_personnel_id": string | null,
"starts_at": string,
"status": string,
"tenant_id": string,
"work_order_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "open_shifts"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_commercial_period_invoice":
{ Args: { "confirmed": boolean,"period_start": string,"request_id": string,"target_quote": string,"target_tenant": string }; Returns: {
              "branding_snapshot": Json | null,
"created_at": string,
"created_by": string,
"currency": string,
"customer_id": string,
"customer_snapshot": Json | null,
"due_on": string | null,
"finalized_at": string | null,
"id": string,
"invoice_number": string | null,
"issued_on": string | null,
"lines_snapshot": Json | null,
"paid_cents": number,
"pdf_sha256": string | null,
"pdf_storage_path": string | null,
"sent_at": string | null,
"source_request_id": string | null,
"status": Database["public"]['Enums']["invoice_status"],
"subtotal_cents": number,
"tenant_id": string,
"total_cents": number,
"updated_at": string,
"vat_cents": number,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_execution_invoice":
{ Args: { "request_id": string,"sources": Json,"target_tenant": string }; Returns: {
              "branding_snapshot": Json | null,
"created_at": string,
"created_by": string,
"currency": string,
"customer_id": string,
"customer_snapshot": Json | null,
"due_on": string | null,
"finalized_at": string | null,
"id": string,
"invoice_number": string | null,
"issued_on": string | null,
"lines_snapshot": Json | null,
"paid_cents": number,
"pdf_sha256": string | null,
"pdf_storage_path": string | null,
"sent_at": string | null,
"source_request_id": string | null,
"status": Database["public"]['Enums']["invoice_status"],
"subtotal_cents": number,
"tenant_id": string,
"total_cents": number,
"updated_at": string,
"vat_cents": number,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_event_recipients":
{ Args: { "target_event": string }; Returns: {
              "user_id": string
            }[]
                           },
"customer_command":
{ Args: { "command": string,"input": Json,"request_id": string,"target_tenant": string }; Returns: Json
                           },
"customer_commercial_followup":
{ Args: { "target_customer": string,"target_tenant": string }; Returns: Json
                           },
"customer_extra_agreements":
{ Args: { "target_object": string,"target_tenant": string }; Returns: Json
                           },
"customer_file_access":
{ Args: { "kind": string,"target_id": string,"target_tenant": string }; Returns: Json
                           },
"customer_history":
{ Args: { "target_customer": string,"target_tenant": string }; Returns: Json
                           },
"customer_list":
{ Args: { "filters"?: Json,"target_tenant": string }; Returns: Json
                           },
"customer_object_visits":
{ Args: { "target_tenant": string }; Returns: Json
                           },
"customer_owners":
{ Args: { "target_tenant": string }; Returns: {
              "commercial": boolean,"id": string,"label": string
            }[]
                           },
"customer_portal_documents":
{ Args: { "target_tenant": string }; Returns: Json
                           },
"dispatch_work_order":
{ Args: { "expected_version": number,"idempotency_key": string,"target_personnel_id": string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"archive_at": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"budget_labor_minutes": number | null,
"commercial_terms": NonNullable<Json>,
"created_at": string,
"created_by": string,
"customer_id": string,
"customer_window_kind": string,
"day_instructions": string,
"deadline": string | null,
"description": string,
"details": NonNullable<Json>,
"discipline": string,
"employee_signature_required": boolean,
"id": string,
"labels": (string)[],
"lead_personnel_id": string | null,
"object_id": string,
"object_snapshot": NonNullable<Json>,
"planned_end_at": string | null,
"planned_start_at": string | null,
"planner_user_id": string | null,
"planning_state": string,
"priority": string,
"projected_end_at": string | null,
"projected_start_at": string | null,
"published_at": string | null,
"quote_id": string | null,
"report_state": string,
"report_version": number,
"request_id": string | null,
"requested_date": string | null,
"required_personnel": number,
"signature_mode": string,
"signature_policy_snapshot": Json | null,
"signature_required": boolean,
"source_kind": string,
"status": Database["public"]['Enums']["work_order_status"],
"template_snapshot": NonNullable<Json>,
"tenant_id": string,
"title": string,
"updated_at": string,
"version": number,
"visit_kind": string,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"dossier_chain":
{ Args: { "target_customer"?: string,"target_object"?: string,"target_order"?: string,"target_personnel"?: string,"target_tenant": string }; Returns: Json
                           },
"expired_work_order_signature_uploads":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"storage_path": string
            }[]
                           },
"extend_object_access":
{ Args: { "reason": string,"target_assignment": string,"target_tenant": string,"until_time": string }; Returns: undefined
                           },
"finalize_invoice":
{ Args: { "target_invoice_id": string }; Returns: {
              "branding_snapshot": Json | null,
"created_at": string,
"created_by": string,
"currency": string,
"customer_id": string,
"customer_snapshot": Json | null,
"due_on": string | null,
"finalized_at": string | null,
"id": string,
"invoice_number": string | null,
"issued_on": string | null,
"lines_snapshot": Json | null,
"paid_cents": number,
"pdf_sha256": string | null,
"pdf_storage_path": string | null,
"sent_at": string | null,
"source_request_id": string | null,
"status": Database["public"]['Enums']["invoice_status"],
"subtotal_cents": number,
"tenant_id": string,
"total_cents": number,
"updated_at": string,
"vat_cents": number,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"finalize_work_order_signature":
{ Args: { "image_hash": string,"target_intent": string }; Returns: Json
                           },
"get_object_document":
{ Args: { "target_document": string,"target_order"?: string,"target_tenant": string }; Returns: Json
                           },
"get_planboard":
{ Args: { "list_view"?: string,"page_number"?: number,"search_text"?: string,"status_filter"?: string,"target_day": string,"target_tenant": string }; Returns: Json
                           },
"get_planboard_order":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"mutate_work_order":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"object_agreement_options":
{ Args: { "target_object": string,"target_tenant": string }; Returns: {
              "id": string,"scope": string,"task_revision_id": string,"title": string,"version": number
            }[]
                           },
"object_customer_accounts":
{ Args: { "target_object": string,"target_tenant": string }; Returns: {
              "email": string,"user_id": string
            }[]
                           },
"object_dossier_owners":
{ Args: { "target_tenant": string }; Returns: {
              "id": string,"label": string
            }[]
                           },
"object_vault_operation":
{ Args: { "actor": string,"input"?: Json,"operation": string,"session_id": string,"target_item": string,"target_object": string,"target_order": string,"target_tenant": string }; Returns: Json
                           },
"object_visit_context":
{ Args: { "target_object": string,"target_order"?: string,"target_tenant": string }; Returns: Json
                           },
"object_visit_signals":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"personnel_dossier_owners":
{ Args: { "target_tenant": string }; Returns: {
              "id": string,"label": string
            }[]
                           },
"personnel_dossier_summary":
{ Args: { "target_tenant": string }; Returns: {
              "certificate_attention": boolean,"employment_status": string,"ends_on": string,"function_id": string,"open_actions": number,"personnel_id": string,"team": string
            }[]
                           },
"personnel_mobility":
{ Args: { "target_personnel": string,"target_tenant": string }; Returns: Json
                           },
"personnel_qualification_gaps":
{ Args: { "target_tenant": string }; Returns: {
              "assignment_id": string,"code": string,"hard_requirement": boolean,"personnel_id": string
            }[]
                           },
"prepare_personnel_checklist":
{ Args: { "checklist_type": string,"target_personnel": string,"target_tenant": string }; Returns: number
                           },
"prepare_work_order_signature":
{ Args: { "expected_hash": string,"idempotency_key": string,"signature_kind": string,"signer_capacity": string,"signer_name": string,"target_report_id": string,"target_work_order_id": string }; Returns: Json
                           },
"process_customer_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"process_object_reminders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"provision_platform_tenant":
{ Args: { "accent_color": string,"actor_user_id": string,"admin_email": string,"admin_name": string,"enabled_services": (string)[],"primary_color": string,"request_key": string,"sender_email"?: string,"tenant_domain"?: string,"tenant_name": string,"tenant_slug": string }; Returns: string
                           },
"provision_tenant":
{ Args: { "actor_user_id": string,"owner_user_id": string,"tenant_name": string,"tenant_slug": string }; Returns: string
                           },
"publish_announcement":
{ Args: { "target_announcement_id": string }; Returns: {
              "audience_roles": (Database["public"]['Enums']["app_role"])[],
"body": string,
"created_at": string,
"created_by": string,
"id": string,
"publish_at": string | null,
"published_at": string | null,
"send_push": boolean,
"tenant_id": string,
"title": string,
"updated_at": string,
"withdrawn_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "announcements"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_customer_agreement":
{ Args: { "input": Json,"target_customer": string,"target_tenant": string }; Returns: string
                           },
"record_task_execution":
{ Args: { "actual_quantity": number,"expected_version": number,"reason": string,"result": string,"target_task": string,"target_tenant": string }; Returns: undefined
                           },
"register_manual_payment":
{ Args: { "allocations": Json,"idempotency_key": string,"payment_date": string,"reference": string,"target_tenant_id": string }; Returns: {
              "amount_cents": number,
"checkout_url": string | null,
"created_at": string,
"created_by": string | null,
"currency": string,
"id": string,
"idempotency_key": string,
"invoice_group_id": string | null,
"last_checked_at": string | null,
"paid_at": string | null,
"provider": string,
"provider_mode": string,
"provider_payload": NonNullable<Json>,
"provider_payment_id": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tenant_id": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_attempts"
        isOneToOne: true
        isSetofReturn: false
      } },
"register_visit_attachment":
{ Args: { "input": Json,"target_request": string,"target_tenant": string }; Returns: string
                           },
"reschedule_work_order":
{ Args: { "expected_version": number,"target_personnel_id": string,"target_start_at": string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"archive_at": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"budget_labor_minutes": number | null,
"commercial_terms": NonNullable<Json>,
"created_at": string,
"created_by": string,
"customer_id": string,
"customer_window_kind": string,
"day_instructions": string,
"deadline": string | null,
"description": string,
"details": NonNullable<Json>,
"discipline": string,
"employee_signature_required": boolean,
"id": string,
"labels": (string)[],
"lead_personnel_id": string | null,
"object_id": string,
"object_snapshot": NonNullable<Json>,
"planned_end_at": string | null,
"planned_start_at": string | null,
"planner_user_id": string | null,
"planning_state": string,
"priority": string,
"projected_end_at": string | null,
"projected_start_at": string | null,
"published_at": string | null,
"quote_id": string | null,
"report_state": string,
"report_version": number,
"request_id": string | null,
"requested_date": string | null,
"required_personnel": number,
"signature_mode": string,
"signature_policy_snapshot": Json | null,
"signature_required": boolean,
"source_kind": string,
"status": Database["public"]['Enums']["work_order_status"],
"template_snapshot": NonNullable<Json>,
"tenant_id": string,
"title": string,
"updated_at": string,
"version": number,
"visit_kind": string,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolve_tenant_context":
{ Args: { "requested_host"?: string,"requested_tenant_id"?: string }; Returns: {
              "accent_color": string,"enabled_services": (string)[],"logo_path": string,"primary_color": string,"roles": (Database["public"]['Enums']["app_role"])[],"tenant_id": string,"tenant_name": string,"tenant_slug": string,"timezone": string,"white_label_enabled": boolean
            }[]
                           },
"review_object_visit_request":
{ Args: { "decision": string,"expected_version": number,"input": Json,"target_request": string,"target_tenant": string }; Returns: undefined
                           },
"review_work_order":
{ Args: { "decision": string,"reason"?: string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"archive_at": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"budget_labor_minutes": number | null,
"commercial_terms": NonNullable<Json>,
"created_at": string,
"created_by": string,
"customer_id": string,
"customer_window_kind": string,
"day_instructions": string,
"deadline": string | null,
"description": string,
"details": NonNullable<Json>,
"discipline": string,
"employee_signature_required": boolean,
"id": string,
"labels": (string)[],
"lead_personnel_id": string | null,
"object_id": string,
"object_snapshot": NonNullable<Json>,
"planned_end_at": string | null,
"planned_start_at": string | null,
"planner_user_id": string | null,
"planning_state": string,
"priority": string,
"projected_end_at": string | null,
"projected_start_at": string | null,
"published_at": string | null,
"quote_id": string | null,
"report_state": string,
"report_version": number,
"request_id": string | null,
"requested_date": string | null,
"required_personnel": number,
"signature_mode": string,
"signature_policy_snapshot": Json | null,
"signature_required": boolean,
"source_kind": string,
"status": Database["public"]['Enums']["work_order_status"],
"template_snapshot": NonNullable<Json>,
"tenant_id": string,
"title": string,
"updated_at": string,
"version": number,
"visit_kind": string,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"review_work_order_report":
{ Args: { "decision": string,"reason"?: string,"target_report_id": string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"archive_at": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"budget_labor_minutes": number | null,
"commercial_terms": NonNullable<Json>,
"created_at": string,
"created_by": string,
"customer_id": string,
"customer_window_kind": string,
"day_instructions": string,
"deadline": string | null,
"description": string,
"details": NonNullable<Json>,
"discipline": string,
"employee_signature_required": boolean,
"id": string,
"labels": (string)[],
"lead_personnel_id": string | null,
"object_id": string,
"object_snapshot": NonNullable<Json>,
"planned_end_at": string | null,
"planned_start_at": string | null,
"planner_user_id": string | null,
"planning_state": string,
"priority": string,
"projected_end_at": string | null,
"projected_start_at": string | null,
"published_at": string | null,
"quote_id": string | null,
"report_state": string,
"report_version": number,
"request_id": string | null,
"requested_date": string | null,
"required_personnel": number,
"signature_mode": string,
"signature_policy_snapshot": Json | null,
"signature_required": boolean,
"source_kind": string,
"status": Database["public"]['Enums']["work_order_status"],
"template_snapshot": NonNullable<Json>,
"tenant_id": string,
"title": string,
"updated_at": string,
"version": number,
"visit_kind": string,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"route_cache_claim":
{ Args: { "day_limit": number,"keys": (string)[],"lease_id": string,"minute_limit": number,"provider_name": string,"request_kind": string }; Returns: Json
                           },
"route_cache_finish":
{ Args: { "cache_key": string,"failure": string,"lease_id": string,"payload": Json,"ttl_days": number }; Returns: undefined
                           },
"route_cache_read":
{ Args: { "keys": (string)[] }; Returns: Json
                           },
"save_object_dossier":
{ Args: { "input": Json,"target_tenant": string }; Returns: string
                           },
"save_tenant_message_template":
{ Args: { "actor_user_id": string,"reset_to_default": boolean,"target_body": string,"target_subject": string,"target_template_key": string,"target_tenant_id": string }; Returns: {
              "body": string,
"channel": string,
"created_at": string,
"customized": boolean,
"default_body": string,
"default_subject": string,
"revision": number,
"subject": string,
"template_key": string,
"tenant_id": string,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "tenant_message_templates"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_work_order":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"staff_workspace":
{ Args: { "target_tenant": string }; Returns: Json
                           },
"store_travel_estimates":
{ Args: { "actor"?: string,"legs": Json,"manual_action"?: string,"revision": number,"t": string }; Returns: boolean
                           },
"submit_object_visit_request":
{ Args: { "input": Json,"request_id": string,"target_object": string,"target_order": string,"target_tenant": string }; Returns: string
                           },
"submit_work_order_report":
{ Args: { "expected_version": number,"idempotency_key": string,"summary": string,"target_work_order_id": string }; Returns: Json
                           },
"suggest_personnel_number":
{ Args: { "target_tenant_id": string }; Returns: string
                           },
"transition_work_order":
{ Args: { "action": string,"expected_version": number,"idempotency_key": string,"note"?: string,"reason_code"?: string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"archive_at": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"budget_labor_minutes": number | null,
"commercial_terms": NonNullable<Json>,
"created_at": string,
"created_by": string,
"customer_id": string,
"customer_window_kind": string,
"day_instructions": string,
"deadline": string | null,
"description": string,
"details": NonNullable<Json>,
"discipline": string,
"employee_signature_required": boolean,
"id": string,
"labels": (string)[],
"lead_personnel_id": string | null,
"object_id": string,
"object_snapshot": NonNullable<Json>,
"planned_end_at": string | null,
"planned_start_at": string | null,
"planner_user_id": string | null,
"planning_state": string,
"priority": string,
"projected_end_at": string | null,
"projected_start_at": string | null,
"published_at": string | null,
"quote_id": string | null,
"report_state": string,
"report_version": number,
"request_id": string | null,
"requested_date": string | null,
"required_personnel": number,
"signature_mode": string,
"signature_policy_snapshot": Json | null,
"signature_required": boolean,
"source_kind": string,
"status": Database["public"]['Enums']["work_order_status"],
"template_snapshot": NonNullable<Json>,
"tenant_id": string,
"title": string,
"updated_at": string,
"version": number,
"visit_kind": string,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
"travel_context":
{ Args: { "d": string,"p"?: string,"s": string,"t": string,"u": string }; Returns: Json
                           },
"travel_day_departure":
{ Args: { "d": string,"p": string,"t": string }; Returns: Json
                           },
"travel_session_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"update_object_visit_request":
{ Args: { "expected_version": number,"input": Json,"target_request": string,"target_tenant": string }; Returns: undefined
                           },
"waive_work_order_signature":
{ Args: { "reason": string,"target_report_id": string }; Returns: undefined
                           },
"withdraw_object_request":
{ Args: { "expected_version": number,"reason": string,"target_request": string,"target_tenant": string }; Returns: undefined
                           },
"work_order_communication":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"work_order_dossier":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"work_order_exception_command":
{ Args: { "input": Json,"target_tenant": string }; Returns: Json
                           },
"work_order_exceptions":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"work_order_list":
{ Args: { "filters"?: Json,"target_tenant": string }; Returns: Json
                           },
"work_order_operational_rows":
{ Args: { "open_only"?: boolean,"page_offset"?: number,"page_size"?: number,"target_customer"?: string,"target_object"?: string,"target_tenant": string }; Returns: Json
                           },
"work_order_operational_task_data":
{ Args: { "target_tenant": string }; Returns: Json
                           },
"work_order_options":
{ Args: { "target_tenant": string }; Returns: Json
                           },
"work_order_related_command":
{ Args: { "command": string,"command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           },
"work_order_related_context":
{ Args: { "target_order": string,"target_tenant": string }; Returns: Json
                           },
"work_order_report":
{ Args: { "target_work_order_id": string }; Returns: Json
                           },
"work_order_report_file":
{ Args: { "asset_id"?: string,"target_report_id": string }; Returns: Json
                           },
"work_order_series_command":
{ Args: { "command": string,"command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           },
"work_order_signature_settings":
{ Args: { "input"?: Json,"target_object"?: string,"target_tenant": string }; Returns: Json
                           },
"work_order_task_context":
{ Args: { "target_task": string,"target_tenant": string }; Returns: Json
                           },
"work_order_template_command":
{ Args: { "command": string,"command_id": string,"input": Json,"target_tenant": string }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "tenant_admin"|"management"|"planner"|"finance"|"hr"|"staff","delivery_status": "queued"|"processing"|"sent"|"failed"|"dead_letter","invoice_status": "draft"|"final"|"sent"|"partially_paid"|"paid"|"overdue"|"credited"|"void","membership_status": "invited"|"active"|"suspended"|"revoked","payment_status": "open"|"pending"|"paid"|"failed"|"expired"|"canceled"|"refunded","quote_status": "draft"|"sent"|"awaiting_acceptance"|"accepted"|"rejected"|"expired"|"change_requested","work_order_status": "planned"|"released"|"seen"|"travelling"|"in_progress"|"completed"|"returned"|"under_review"|"correction_required"|"approved"|"invoice_ready"|"invoiced"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {
            "app_role": ["tenant_admin", "management", "planner", "finance", "hr", "staff"],"delivery_status": ["queued", "processing", "sent", "failed", "dead_letter"],"invoice_status": ["draft", "final", "sent", "partially_paid", "paid", "overdue", "credited", "void"],"membership_status": ["invited", "active", "suspended", "revoked"],"payment_status": ["open", "pending", "paid", "failed", "expired", "canceled", "refunded"],"quote_status": ["draft", "sent", "awaiting_acceptance", "accepted", "rejected", "expired", "change_requested"],"work_order_status": ["planned", "released", "seen", "travelling", "in_progress", "completed", "returned", "under_review", "correction_required", "approved", "invoice_ready", "invoiced", "cancelled"]
          }
        }
} as const

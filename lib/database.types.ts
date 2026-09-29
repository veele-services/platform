
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
                    "approved_at": string | null,"created_at": string,"ends_at": string,"id": string,"kind": string,"note": string | null,"personnel_id": string,"starts_at": string,"tenant_id": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"created_at"?: string,"ends_at": string,"id"?: string,"kind": string,"note"?: string | null,"personnel_id": string,"starts_at": string,"tenant_id": string
                  }
                  Update: {
                    "approved_at"?: string | null,"created_at"?: string,"ends_at"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"personnel_id"?: string,"starts_at"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
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
                    "code": string,"created_at": string,"expires_on": string | null,"id": string,"issued_on": string | null,"name": string,"personnel_id": string,"storage_path": string | null,"tenant_id": string,"version": number
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"name": string,"personnel_id": string,"storage_path"?: string | null,"tenant_id": string,"version"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"name"?: string,"personnel_id"?: string,"storage_path"?: string | null,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificates_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"customer_contacts": {
                  Row: {
                    "created_at": string,"customer_id": string,"email": string | null,"full_name": string,"id": string,"is_primary": boolean,"phone": string | null,"role": string | null,"tenant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"customer_id": string,"email"?: string | null,"full_name": string,"id"?: string,"is_primary"?: boolean,"phone"?: string | null,"role"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_primary"?: boolean,"phone"?: string | null,"role"?: string | null,"tenant_id"?: string
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
                    "created_at": string,"created_by": string,"customer_id": string,"file_name": string,"id": string,"mime_type": string,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"customer_id": string,"file_name": string,"id"?: string,"mime_type": string,"sha256": string,"size_bytes": number,"storage_path": string,"tenant_id": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"customer_id"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string,"tenant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
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
                    "body": string,"created_at": string,"created_by": string,"customer_id": string,"id": string,"tenant_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"created_by": string,"customer_id": string,"id"?: string,"tenant_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
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
                    "billing_address": NonNullable<Json>,"billing_email": string | null,"created_at": string,"customer_number": string,"id": string,"name": string,"payment_terms_days": number | null,"phone": string | null,"status": string,"tenant_id": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "billing_address"?: NonNullable<Json>,"billing_email"?: string | null,"created_at"?: string,"customer_number": string,"id"?: string,"name": string,"payment_terms_days"?: number | null,"phone"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "billing_address"?: NonNullable<Json>,"billing_email"?: string | null,"created_at"?: string,"customer_number"?: string,"id"?: string,"name"?: string,"payment_terms_days"?: number | null,"phone"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
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
                },"external_action_tokens": {
                  Row: {
                    "consumed_at": string | null,"created_at": string,"expires_at": string,"id": string,"purpose": string,"subject_id": string,"tenant_id": string,"token_hash": string
                  }
                  Insert: {
                    "consumed_at"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"purpose": string,"subject_id": string,"tenant_id": string,"token_hash": string
                  }
                  Update: {
                    "consumed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"purpose"?: string,"subject_id"?: string,"tenant_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_action_tokens_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
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
                    "created_at": string,"description": string,"id": string,"invoice_id": string,"quantity": number,"source_snapshot": NonNullable<Json>,"subtotal_cents": number,"tenant_id": string,"total_cents": number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"vat_cents": number,"work_order_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"id"?: string,"invoice_id": string,"quantity": number,"source_snapshot": NonNullable<Json>,"subtotal_cents": number,"tenant_id": string,"total_cents": number,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"vat_cents": number,"work_order_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"invoice_id"?: string,"quantity"?: number,"source_snapshot"?: NonNullable<Json>,"subtotal_cents"?: number,"tenant_id"?: string,"total_cents"?: number,"unit"?: string,"unit_price_cents"?: number,"vat_basis_points"?: number,"vat_cents"?: number,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
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
                    "branding_snapshot": Json | null,"created_at": string,"created_by": string,"currency": string,"customer_id": string,"customer_snapshot": Json | null,"due_on": string | null,"finalized_at": string | null,"id": string,"invoice_number": string | null,"issued_on": string | null,"lines_snapshot": Json | null,"paid_cents": number,"pdf_sha256": string | null,"pdf_storage_path": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["invoice_status"],"subtotal_cents": number,"tenant_id": string,"total_cents": number,"updated_at": string,"vat_cents": number,"version": number
                  }
                  Insert: {
                    "branding_snapshot"?: Json | null,"created_at"?: string,"created_by": string,"currency"?: string,"customer_id": string,"customer_snapshot"?: Json | null,"due_on"?: string | null,"finalized_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"issued_on"?: string | null,"lines_snapshot"?: Json | null,"paid_cents"?: number,"pdf_sha256"?: string | null,"pdf_storage_path"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_cents"?: number,"tenant_id": string,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number,"version"?: number
                  }
                  Update: {
                    "branding_snapshot"?: Json | null,"created_at"?: string,"created_by"?: string,"currency"?: string,"customer_id"?: string,"customer_snapshot"?: Json | null,"due_on"?: string | null,"finalized_at"?: string | null,"id"?: string,"invoice_number"?: string | null,"issued_on"?: string | null,"lines_snapshot"?: Json | null,"paid_cents"?: number,"pdf_sha256"?: string | null,"pdf_storage_path"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal_cents"?: number,"tenant_id"?: string,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number,"version"?: number
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
                },"objects": {
                  Row: {
                    "access_instructions": string | null,"active": boolean,"address": NonNullable<Json>,"created_at": string,"customer_id": string,"id": string,"latitude": number | null,"longitude": number | null,"name": string,"object_number": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "access_instructions"?: string | null,"active"?: boolean,"address": NonNullable<Json>,"created_at"?: string,"customer_id": string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name": string,"object_number": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "access_instructions"?: string | null,"active"?: boolean,"address"?: NonNullable<Json>,"created_at"?: string,"customer_id"?: string,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"object_number"?: string,"tenant_id"?: string,"updated_at"?: string
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
                    "created_at": string,"email": string | null,"emergency_contact": NonNullable<Json>,"employee_number": string,"end_date": string | null,"full_name": string,"home_address": NonNullable<Json>,"id": string,"phone": string | null,"start_date": string | null,"status": string,"tenant_id": string,"updated_at": string,"user_id": string | null,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"emergency_contact"?: NonNullable<Json>,"employee_number": string,"end_date"?: string | null,"full_name": string,"home_address"?: NonNullable<Json>,"id"?: string,"phone"?: string | null,"start_date"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"emergency_contact"?: NonNullable<Json>,"employee_number"?: string,"end_date"?: string | null,"full_name"?: string,"home_address"?: NonNullable<Json>,"id"?: string,"phone"?: string | null,"start_date"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"personnel_contracts": {
                  Row: {
                    "active": boolean,"created_at": string,"employment_type": string,"ends_on": string | null,"hours_per_week": number | null,"id": string,"personnel_id": string,"review_on": string | null,"starts_on": string,"tenant_id": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"employment_type": string,"ends_on"?: string | null,"hours_per_week"?: number | null,"id"?: string,"personnel_id": string,"review_on"?: string | null,"starts_on": string,"tenant_id": string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"employment_type"?: string,"ends_on"?: string | null,"hours_per_week"?: number | null,"id"?: string,"personnel_id"?: string,"review_on"?: string | null,"starts_on"?: string,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_contracts_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"personnel_documents": {
                  Row: {
                    "created_at": string,"created_by": string,"document_type": string,"file_name": string | null,"id": string,"mime_type": string | null,"personnel_id": string,"replaced_by": string | null,"sha256": string | null,"size_bytes": number | null,"storage_path": string,"tenant_id": string,"title": string,"version": number,"visible_to_employee": boolean
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"document_type": string,"file_name"?: string | null,"id"?: string,"mime_type"?: string | null,"personnel_id": string,"replaced_by"?: string | null,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path": string,"tenant_id": string,"title": string,"version"?: number,"visible_to_employee"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"document_type"?: string,"file_name"?: string | null,"id"?: string,"mime_type"?: string | null,"personnel_id"?: string,"replaced_by"?: string | null,"sha256"?: string | null,"size_bytes"?: number | null,"storage_path"?: string,"tenant_id"?: string,"title"?: string,"version"?: number,"visible_to_employee"?: boolean
                  }
                  Relationships: [
                    {
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
                    "body": string,"created_at": string,"created_by": string,"id": string,"personnel_id": string,"tenant_id": string,"updated_at": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"created_by": string,"id"?: string,"personnel_id": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"personnel_id"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personnel_notes_tenant_id_personnel_id_fkey"
      columns: ["tenant_id","personnel_id"]
isOneToOne: false
      referencedRelation: "personnel"
      referencedColumns: ["tenant_id","id"]
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
                    "acceptance_channel": string | null,"acceptance_evidence": string | null,"accepted_at": string | null,"accepted_by_name": string | null,"created_at": string,"currency": string,"customer_id": string,"expires_at": string | null,"id": string,"object_id": string | null,"quote_number": string,"request_id": string,"revision": number,"sent_at": string | null,"snapshot": NonNullable<Json>,"status": Database["public"]['Enums']["quote_status"],"subtotal_cents": number,"tenant_id": string,"total_cents": number,"updated_at": string,"vat_cents": number
                  }
                  Insert: {
                    "acceptance_channel"?: string | null,"acceptance_evidence"?: string | null,"accepted_at"?: string | null,"accepted_by_name"?: string | null,"created_at"?: string,"currency"?: string,"customer_id": string,"expires_at"?: string | null,"id"?: string,"object_id"?: string | null,"quote_number": string,"request_id": string,"revision"?: number,"sent_at"?: string | null,"snapshot": NonNullable<Json>,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents": number,"tenant_id": string,"total_cents": number,"updated_at"?: string,"vat_cents": number
                  }
                  Update: {
                    "acceptance_channel"?: string | null,"acceptance_evidence"?: string | null,"accepted_at"?: string | null,"accepted_by_name"?: string | null,"created_at"?: string,"currency"?: string,"customer_id"?: string,"expires_at"?: string | null,"id"?: string,"object_id"?: string | null,"quote_number"?: string,"request_id"?: string,"revision"?: number,"sent_at"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents"?: number,"tenant_id"?: string,"total_cents"?: number,"updated_at"?: string,"vat_cents"?: number
                  }
                  Relationships: [
                    {
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
                    "contact_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string | null,"description": string,"discipline": string,"id": string,"object_id": string | null,"preferred_slot_id": string | null,"priority": string,"request_number": string,"source": string,"status": string,"tenant_id": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"description": string,"discipline": string,"id"?: string,"object_id"?: string | null,"preferred_slot_id"?: string | null,"priority"?: string,"request_number": string,"source"?: string,"status"?: string,"tenant_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"description"?: string,"discipline"?: string,"id"?: string,"object_id"?: string | null,"preferred_slot_id"?: string | null,"priority"?: string,"request_number"?: string,"source"?: string,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number
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
                    "captured_by": string,"id": string,"report_version": number,"revoked_at": string | null,"sha256": string,"signed_at": string,"signer_name": string,"storage_path": string,"tenant_id": string,"work_order_id": string
                  }
                  Insert: {
                    "captured_by": string,"id"?: string,"report_version": number,"revoked_at"?: string | null,"sha256": string,"signed_at"?: string,"signer_name": string,"storage_path": string,"tenant_id": string,"work_order_id": string
                  }
                  Update: {
                    "captured_by"?: string,"id"?: string,"report_version"?: number,"revoked_at"?: string | null,"sha256"?: string,"signed_at"?: string,"signer_name"?: string,"storage_path"?: string,"tenant_id"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
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
                    "appointment_blocks": NonNullable<Json>,"bill_travel_default": boolean,"contract_reminder_days": number,"enabled_services": (string)[],"invoice_prefix": string,"payment_terms_days": number,"settings": NonNullable<Json>,"signature_required_default": boolean,"task_code_prefix": string,"tenant_id": string,"updated_at": string,"white_label_enabled": boolean
                  }
                  Insert: {
                    "appointment_blocks"?: NonNullable<Json>,"bill_travel_default"?: boolean,"contract_reminder_days"?: number,"enabled_services"?: (string)[],"invoice_prefix"?: string,"payment_terms_days"?: number,"settings"?: NonNullable<Json>,"signature_required_default"?: boolean,"task_code_prefix"?: string,"tenant_id": string,"updated_at"?: string,"white_label_enabled"?: boolean
                  }
                  Update: {
                    "appointment_blocks"?: NonNullable<Json>,"bill_travel_default"?: boolean,"contract_reminder_days"?: number,"enabled_services"?: (string)[],"invoice_prefix"?: string,"payment_terms_days"?: number,"settings"?: NonNullable<Json>,"signature_required_default"?: boolean,"task_code_prefix"?: string,"tenant_id"?: string,"updated_at"?: string,"white_label_enabled"?: boolean
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
                },"travel_legs": {
                  Row: {
                    "actual_ended_at": string | null,"actual_started_at": string | null,"assignment_id": string,"billable": boolean,"calculated_at": string | null,"created_at": string,"destination_address": NonNullable<Json>,"direction": string,"error_code": string | null,"estimated_distance_metres": number | null,"estimated_minutes": number | null,"id": string,"origin_address": NonNullable<Json>,"provider": string | null,"provider_reference": string | null,"tenant_id": string,"travel_mode": string
                  }
                  Insert: {
                    "actual_ended_at"?: string | null,"actual_started_at"?: string | null,"assignment_id": string,"billable"?: boolean,"calculated_at"?: string | null,"created_at"?: string,"destination_address": NonNullable<Json>,"direction": string,"error_code"?: string | null,"estimated_distance_metres"?: number | null,"estimated_minutes"?: number | null,"id"?: string,"origin_address": NonNullable<Json>,"provider"?: string | null,"provider_reference"?: string | null,"tenant_id": string,"travel_mode": string
                  }
                  Update: {
                    "actual_ended_at"?: string | null,"actual_started_at"?: string | null,"assignment_id"?: string,"billable"?: boolean,"calculated_at"?: string | null,"created_at"?: string,"destination_address"?: NonNullable<Json>,"direction"?: string,"error_code"?: string | null,"estimated_distance_metres"?: number | null,"estimated_minutes"?: number | null,"id"?: string,"origin_address"?: NonNullable<Json>,"provider"?: string | null,"provider_reference"?: string | null,"tenant_id"?: string,"travel_mode"?: string
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
                    "actual_end_at": string | null,"actual_start_at": string | null,"created_at": string,"departed_at": string | null,"id": string,"personnel_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"return_note": string | null,"return_reason_code": string | null,"status": string,"tenant_id": string,"updated_at": string,"version": number,"work_order_id": string
                  }
                  Insert: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"created_at"?: string,"departed_at"?: string | null,"id"?: string,"personnel_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"return_note"?: string | null,"return_reason_code"?: string | null,"status"?: string,"tenant_id": string,"updated_at"?: string,"version"?: number,"work_order_id": string
                  }
                  Update: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"created_at"?: string,"departed_at"?: string | null,"id"?: string,"personnel_id"?: string,"planned_end_at"?: string,"planned_start_at"?: string,"projected_end_at"?: string,"projected_start_at"?: string,"return_note"?: string | null,"return_reason_code"?: string | null,"status"?: string,"tenant_id"?: string,"updated_at"?: string,"version"?: number,"work_order_id"?: string
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
                },"work_order_tasks": {
                  Row: {
                    "added_by": string | null,"allowed_for_staff": boolean,"completed_at": string | null,"completion_note": string | null,"created_at": string,"duration_minutes": number,"extra_work_status": string | null,"id": string,"is_extra_work": boolean,"quantity": number,"task_code": string,"task_name": string,"task_revision_id": string | null,"tenant_id": string,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"work_order_id": string
                  }
                  Insert: {
                    "added_by"?: string | null,"allowed_for_staff"?: boolean,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"duration_minutes": number,"extra_work_status"?: string | null,"id"?: string,"is_extra_work"?: boolean,"quantity"?: number,"task_code": string,"task_name": string,"task_revision_id"?: string | null,"tenant_id": string,"unit": string,"unit_price_cents": number,"vat_basis_points": number,"work_order_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"allowed_for_staff"?: boolean,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"duration_minutes"?: number,"extra_work_status"?: string | null,"id"?: string,"is_extra_work"?: boolean,"quantity"?: number,"task_code"?: string,"task_name"?: string,"task_revision_id"?: string | null,"tenant_id"?: string,"unit"?: string,"unit_price_cents"?: number,"vat_basis_points"?: number,"work_order_id"?: string
                  }
                  Relationships: [
                    {
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
                },"work_orders": {
                  Row: {
                    "actual_end_at": string | null,"actual_start_at": string | null,"appointment_slot_id": string | null,"attention_reason": string | null,"bill_travel": boolean,"created_at": string,"created_by": string,"customer_id": string,"discipline": string,"id": string,"object_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"quote_id": string | null,"report_version": number,"request_id": string | null,"signature_required": boolean,"status": Database["public"]['Enums']["work_order_status"],"tenant_id": string,"updated_at": string,"version": number,"work_order_number": string
                  }
                  Insert: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"appointment_slot_id"?: string | null,"attention_reason"?: string | null,"bill_travel"?: boolean,"created_at"?: string,"created_by": string,"customer_id": string,"discipline": string,"id"?: string,"object_id": string,"planned_end_at": string,"planned_start_at": string,"projected_end_at": string,"projected_start_at": string,"quote_id"?: string | null,"report_version"?: number,"request_id"?: string | null,"signature_required"?: boolean,"status"?: Database["public"]['Enums']["work_order_status"],"tenant_id": string,"updated_at"?: string,"version"?: number,"work_order_number": string
                  }
                  Update: {
                    "actual_end_at"?: string | null,"actual_start_at"?: string | null,"appointment_slot_id"?: string | null,"attention_reason"?: string | null,"bill_travel"?: boolean,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"discipline"?: string,"id"?: string,"object_id"?: string,"planned_end_at"?: string,"planned_start_at"?: string,"projected_end_at"?: string,"projected_start_at"?: string,"quote_id"?: string | null,"report_version"?: number,"request_id"?: string | null,"signature_required"?: boolean,"status"?: Database["public"]['Enums']["work_order_status"],"tenant_id"?: string,"updated_at"?: string,"version"?: number,"work_order_number"?: string
                  }
                  Relationships: [
                    {
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
            "add_extra_work":
{ Args: { "idempotency_key": string,"target_extra_work_rule_id": string,"target_work_order_id": string }; Returns: {
              "added_by": string | null,
"allowed_for_staff": boolean,
"completed_at": string | null,
"completion_note": string | null,
"created_at": string,
"duration_minutes": number,
"extra_work_status": string | null,
"id": string,
"is_extra_work": boolean,
"quantity": number,
"task_code": string,
"task_name": string,
"task_revision_id": string | null,
"tenant_id": string,
"unit": string,
"unit_price_cents": number,
"vat_basis_points": number,
"work_order_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_order_tasks"
        isOneToOne: true
        isSetofReturn: false
      } },
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
"complete_work_order_task":
{ Args: { "completed": boolean,"completion_note"?: string,"target_task_id": string }; Returns: {
              "added_by": string | null,
"allowed_for_staff": boolean,
"completed_at": string | null,
"completion_note": string | null,
"created_at": string,
"duration_minutes": number,
"extra_work_status": string | null,
"id": string,
"is_extra_work": boolean,
"quantity": number,
"task_code": string,
"task_name": string,
"task_revision_id": string | null,
"tenant_id": string,
"unit": string,
"unit_price_cents": number,
"vat_basis_points": number,
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
"dispatch_work_order":
{ Args: { "expected_version": number,"idempotency_key": string,"target_personnel_id": string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"created_at": string,
"created_by": string,
"customer_id": string,
"discipline": string,
"id": string,
"object_id": string,
"planned_end_at": string,
"planned_start_at": string,
"projected_end_at": string,
"projected_start_at": string,
"quote_id": string | null,
"report_version": number,
"request_id": string | null,
"signature_required": boolean,
"status": Database["public"]['Enums']["work_order_status"],
"tenant_id": string,
"updated_at": string,
"version": number,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
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
"reschedule_work_order":
{ Args: { "expected_version": number,"target_personnel_id": string,"target_start_at": string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"created_at": string,
"created_by": string,
"customer_id": string,
"discipline": string,
"id": string,
"object_id": string,
"planned_end_at": string,
"planned_start_at": string,
"projected_end_at": string,
"projected_start_at": string,
"quote_id": string | null,
"report_version": number,
"request_id": string | null,
"signature_required": boolean,
"status": Database["public"]['Enums']["work_order_status"],
"tenant_id": string,
"updated_at": string,
"version": number,
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
"review_work_order":
{ Args: { "decision": string,"reason"?: string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"created_at": string,
"created_by": string,
"customer_id": string,
"discipline": string,
"id": string,
"object_id": string,
"planned_end_at": string,
"planned_start_at": string,
"projected_end_at": string,
"projected_start_at": string,
"quote_id": string | null,
"report_version": number,
"request_id": string | null,
"signature_required": boolean,
"status": Database["public"]['Enums']["work_order_status"],
"tenant_id": string,
"updated_at": string,
"version": number,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } },
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
"transition_work_order":
{ Args: { "action": string,"expected_version": number,"idempotency_key": string,"note"?: string,"reason_code"?: string,"target_work_order_id": string }; Returns: {
              "actual_end_at": string | null,
"actual_start_at": string | null,
"appointment_slot_id": string | null,
"attention_reason": string | null,
"bill_travel": boolean,
"created_at": string,
"created_by": string,
"customer_id": string,
"discipline": string,
"id": string,
"object_id": string,
"planned_end_at": string,
"planned_start_at": string,
"projected_end_at": string,
"projected_start_at": string,
"quote_id": string | null,
"report_version": number,
"request_id": string | null,
"signature_required": boolean,
"status": Database["public"]['Enums']["work_order_status"],
"tenant_id": string,
"updated_at": string,
"version": number,
"work_order_number": string
            }
                          SetofOptions: {
        from: "*"
        to: "work_orders"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "app_role": "tenant_admin"|"management"|"planner"|"finance"|"hr"|"staff","delivery_status": "queued"|"processing"|"sent"|"failed"|"dead_letter","invoice_status": "draft"|"final"|"sent"|"partially_paid"|"paid"|"overdue"|"credited"|"void","membership_status": "invited"|"active"|"suspended"|"revoked","payment_status": "open"|"pending"|"paid"|"failed"|"expired"|"canceled"|"refunded","quote_status": "draft"|"sent"|"awaiting_acceptance"|"accepted"|"rejected"|"expired","work_order_status": "planned"|"released"|"seen"|"travelling"|"in_progress"|"completed"|"returned"|"under_review"|"correction_required"|"approved"|"invoice_ready"|"invoiced"|"cancelled"
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
            "app_role": ["tenant_admin", "management", "planner", "finance", "hr", "staff"],"delivery_status": ["queued", "processing", "sent", "failed", "dead_letter"],"invoice_status": ["draft", "final", "sent", "partially_paid", "paid", "overdue", "credited", "void"],"membership_status": ["invited", "active", "suspended", "revoked"],"payment_status": ["open", "pending", "paid", "failed", "expired", "canceled", "refunded"],"quote_status": ["draft", "sent", "awaiting_acceptance", "accepted", "rejected", "expired"],"work_order_status": ["planned", "released", "seen", "travelling", "in_progress", "completed", "returned", "under_review", "correction_required", "approved", "invoice_ready", "invoiced", "cancelled"]
          }
        }
} as const

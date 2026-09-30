SET local check_function_bodies = off;

DROP POLICY "quotes_manage_delete" ON "public"."quotes";

DROP POLICY "quotes_manage_insert" ON "public"."quotes";

DROP POLICY "quotes_manage_update" ON "public"."quotes";

DROP POLICY "quotes_read" ON "public"."quotes";

DROP POLICY "requests_manage_delete" ON "public"."requests";

DROP POLICY "requests_manage_insert" ON "public"."requests";

DROP POLICY "requests_manage_update" ON "public"."requests";

DROP POLICY "requests_read" ON "public"."requests";

ALTER TABLE "public"."requests"
  DROP CONSTRAINT "requests_source_check";

ALTER TABLE "public"."requests"
  DROP CONSTRAINT "requests_status_check";

CREATE TABLE "private"."commercial_commands" (
  "tenant_id"  uuid                     NOT NULL,
  "id"         uuid                     NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "command"    text                     NOT NULL,
  "payload"    jsonb                    NOT NULL,
  "result"     jsonb                    NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commercial_commands_pkey" PRIMARY KEY (tenant_id, id)
);

ALTER TABLE "private"."commercial_commands"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."commercial_intake_limits" (
  "tenant_id"  uuid                     NOT NULL,
  "key_hash"   text                     NOT NULL,
  "hour_start" timestamp with time zone NOT NULL,
  "attempts"   integer                  NOT NULL DEFAULT 1,
  CONSTRAINT "commercial_intake_limits_pkey" PRIMARY KEY (tenant_id, key_hash, hour_start)
);

ALTER TABLE "private"."commercial_intake_limits"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."commercial_intake_limits"
  FORCE ROW LEVEL SECURITY;

CREATE TABLE "public"."commercial_attachments" (
  "id"              uuid                     NOT NULL,
  "tenant_id"       uuid                     NOT NULL,
  "request_id"      uuid,
  "quote_id"        uuid,
  "title"           text                     NOT NULL,
  "storage_path"    text                     NOT NULL,
  "mime_type"       text                     NOT NULL,
  "size_bytes"      bigint                   NOT NULL,
  "sha256"          text                     NOT NULL,
  "public_in_offer" boolean                  NOT NULL DEFAULT false,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "commercial_attachments_check" CHECK ((num_nonnulls(request_id, quote_id) = 1)),
  CONSTRAINT "commercial_attachments_pkey" PRIMARY KEY (id),
  CONSTRAINT "commercial_attachments_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760))),
  CONSTRAINT "commercial_attachments_storage_path_key" UNIQUE (storage_path)
);

ALTER TABLE "public"."commercial_attachments"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."commercial_attachments"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."commercial_attachments" FROM "anon";

CREATE TABLE "public"."commercial_billing_periods" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    uuid                     NOT NULL,
  "quote_id"     uuid                     NOT NULL,
  "invoice_id"   uuid                     NOT NULL,
  "starts_on"    date                     NOT NULL,
  "ends_before"  date                     NOT NULL,
  "confirmed_by" uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "commercial_billing_periods_check" CHECK ((ends_before > starts_on)),
  CONSTRAINT "commercial_billing_periods_pkey" PRIMARY KEY (id),
  CONSTRAINT "commercial_billing_periods_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commercial_billing_periods_tenant_id_invoice_id_key" UNIQUE (tenant_id, invoice_id),
  CONSTRAINT "commercial_billing_periods_tenant_id_quote_id_starts_on_key" UNIQUE (tenant_id, quote_id, starts_on)
);

ALTER TABLE "public"."commercial_billing_periods"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."commercial_billing_periods"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."commercial_billing_periods" FROM "anon";

CREATE TABLE "public"."commercial_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "request_id"    uuid,
  "quote_id"      uuid,
  "actor_id"      uuid,
  "kind"          text                     NOT NULL,
  "body"          text                     NOT NULL DEFAULT ''::text,
  "visibility"    text                     NOT NULL DEFAULT 'internal'::text,
  "details"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "mail_snapshot" jsonb,
  CONSTRAINT "commercial_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commercial_events_visibility_check" CHECK ((visibility = ANY (ARRAY['internal'::text, 'customer'::text])))
);

ALTER TABLE "public"."commercial_events"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."commercial_events"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."commercial_events" FROM "anon";

ALTER TABLE "public"."external_action_tokens"
  ADD COLUMN "recipient" text;

ALTER TABLE "public"."external_action_tokens"
  ADD COLUMN "revoked_at" timestamp WITH time zone;

ALTER TABLE "public"."external_action_tokens"
  ADD COLUMN "decision" jsonb;

ALTER TABLE "public"."external_action_tokens"
  ADD COLUMN "booking_kind" text NOT NULL DEFAULT 'inspection'::text;

ALTER TABLE "public"."external_action_tokens"
  ADD COLUMN "work_order_id" uuid;

ALTER TABLE "public"."invoice_lines"
  ADD COLUMN "commercial_period_id" uuid;

ALTER TABLE "public"."object_visit_requests"
  ADD COLUMN "owner_user_id" uuid;

ALTER TABLE "public"."object_visit_requests"
  ADD COLUMN "due_on" date;

ALTER TABLE "public"."quotes"
  ADD COLUMN "series_id" uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "public"."quotes"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."quotes"
  ADD COLUMN "version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."quotes"
  ADD COLUMN "subject" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "contact_id" uuid;

ALTER TABLE "public"."quotes"
  ADD COLUMN "work_kind" text NOT NULL DEFAULT 'once'::text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "price_basis" text NOT NULL DEFAULT 'once'::text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "owner_id" uuid;

ALTER TABLE "public"."quotes"
  ADD COLUMN "next_action" text NOT NULL DEFAULT 'Offerte uitwerken'::text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "followup_on" date;

ALTER TABLE "public"."quotes"
  ADD COLUMN "lines" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "public"."quotes"
  ADD COLUMN "terms" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."quotes"
  ADD COLUMN "published_at" timestamp WITH time zone;

ALTER TABLE "public"."quotes"
  ADD COLUMN "superseded_at" timestamp WITH time zone;

ALTER TABLE "public"."quotes"
  ADD COLUMN "archived_at" timestamp WITH time zone;

ALTER TABLE "public"."quotes"
  ADD COLUMN "pdf_path" text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "logo_path" text;

ALTER TABLE "public"."quotes"
  ADD COLUMN "operation_id" uuid;

ALTER TABLE "public"."quotes"
  ADD COLUMN "visit_request_id" uuid;

ALTER TABLE "public"."requests"
  ADD COLUMN "subject" text NOT NULL DEFAULT ''::text;

ALTER TABLE "public"."requests"
  ADD COLUMN "work_kind" text NOT NULL DEFAULT 'once'::text;

ALTER TABLE "public"."requests"
  ADD COLUMN "owner_id" uuid;

ALTER TABLE "public"."requests"
  ADD COLUMN "next_action" text NOT NULL DEFAULT 'Aanvraag beoordelen'::text;

ALTER TABLE "public"."requests"
  ADD COLUMN "followup_on" date;

ALTER TABLE "public"."requests"
  ADD COLUMN "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."requests"
  ADD COLUMN "outcome" text;

ALTER TABLE "public"."requests"
  ADD COLUMN "archived_at" timestamp WITH time zone;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "commercial_terms" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."work_orders"
  ADD COLUMN "visit_kind" text NOT NULL DEFAULT 'execution'::text;

ALTER TABLE "public"."quotes"
  ALTER COLUMN "request_id" DROP NOT NULL;

ALTER TYPE "public"."quote_status" ADD VALUE 'change_requested' AFTER 'expired';

-- Add display/follow-up metadata without rewriting the original customer text,
-- historical offered snapshot, consent evidence, amounts or operational records.
UPDATE public.requests SET subject=left(description,180) WHERE subject='';
UPDATE public.quotes q SET subject=left(coalesce(q.snapshot->>'description',r.description,q.quote_number),180)
FROM public.requests r WHERE r.id=q.request_id AND r.tenant_id=q.tenant_id AND q.subject='';
UPDATE public.quotes SET subject=quote_number WHERE subject='';
UPDATE public.requests r SET owner_id=(SELECT m.user_id FROM public.tenant_memberships m WHERE m.tenant_id=r.tenant_id AND m.status='active' AND m.roles&&ARRAY['tenant_admin','management','planner']::public.app_role[] ORDER BY ('tenant_admin'=ANY(m.roles)) DESC,m.user_id LIMIT 1) WHERE owner_id IS NULL;
UPDATE public.quotes q SET owner_id=(SELECT m.user_id FROM public.tenant_memberships m WHERE m.tenant_id=q.tenant_id AND m.status='active' AND m.roles&&ARRAY['tenant_admin','management','planner','finance']::public.app_role[] ORDER BY ('tenant_admin'=ANY(m.roles)) DESC,m.user_id LIMIT 1) WHERE owner_id IS NULL;
UPDATE public.quotes q SET operation_id=(SELECT w.id FROM public.work_orders w WHERE w.tenant_id=q.tenant_id AND w.quote_id=q.id ORDER BY w.created_at,w.id LIMIT 1) WHERE operation_id IS NULL;

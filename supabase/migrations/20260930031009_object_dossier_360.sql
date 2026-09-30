-- Managed encryption is a prerequisite, not an application-managed key.
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

SET local check_function_bodies = off;

CREATE TABLE "private"."object_access_audit" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "actor_id"   uuid                     NOT NULL,
  "session_id" uuid                     NOT NULL,
  "object_id"  uuid                     NOT NULL,
  "order_id"   uuid,
  "item_id"    uuid,
  "event"      text                     NOT NULL,
  "reason"     text,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_access_audit_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."object_access_audit"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_access_extensions" (
  "assignment_id" uuid                     NOT NULL,
  "ends_at"       timestamp with time zone NOT NULL,
  "reason"        text                     NOT NULL,
  "decided_by"    uuid                     NOT NULL,
  "revision"      bigint                   NOT NULL DEFAULT 1,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_access_extensions_pkey" PRIMARY KEY (assignment_id),
  CONSTRAINT "object_access_extensions_reason_check" CHECK (((length(reason) >= 5) AND (length(reason) <= 1000)))
);

ALTER TABLE "private"."object_access_extensions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_access_grants" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "challenge_id" uuid                     NOT NULL,
  "tenant_id"    uuid                     NOT NULL,
  "actor_id"     uuid                     NOT NULL,
  "session_id"   uuid                     NOT NULL,
  "object_id"    uuid                     NOT NULL,
  "order_id"     uuid,
  "item_id"      uuid,
  "fingerprint"  text                     NOT NULL,
  "expires_at"   timestamp with time zone NOT NULL,
  "revoked_at"   timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_access_grants_challenge_id_key" UNIQUE (challenge_id),
  CONSTRAINT "object_access_grants_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."object_access_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_notification_keys" (
  "tenant_id"  uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "event_key"  text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "object_notification_keys_pkey" PRIMARY KEY (tenant_id, user_id, event_key)
);

ALTER TABLE "private"."object_notification_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_otp_challenges" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   uuid                     NOT NULL,
  "actor_id"    uuid                     NOT NULL,
  "session_id"  uuid                     NOT NULL,
  "object_id"   uuid                     NOT NULL,
  "order_id"    uuid,
  "item_id"     uuid,
  "fingerprint" text                     NOT NULL,
  "code_hmac"   bytea                    NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "delivered"   boolean                  NOT NULL DEFAULT false,
  "created_at"  timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_otp_challenges_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."object_otp_challenges"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_otp_key" (
  "id"       boolean NOT NULL DEFAULT true,
  "vault_id" uuid    NOT NULL,
  CONSTRAINT "object_otp_key_id_check" CHECK (id),
  CONSTRAINT "object_otp_key_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."object_otp_key"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_secret_items" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "object_id"     uuid                     NOT NULL,
  "node_id"       uuid,
  "name"          text                     NOT NULL,
  "kind"          text                     NOT NULL,
  "owner_user_id" uuid                     NOT NULL,
  "valid_from"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "valid_until"   timestamp with time zone,
  "version"       bigint                   NOT NULL DEFAULT 1,
  "active"        boolean                  NOT NULL DEFAULT true,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_secret_items_check" CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
  CONSTRAINT "object_secret_items_kind_check" CHECK ((kind = ANY (ARRAY['alarm'::text, 'key_safe'::text, 'access'::text, 'sensitive_instruction'::text]))),
  CONSTRAINT "object_secret_items_name_check" CHECK (((length(name) >= 2) AND (length(name) <= 160))),
  CONSTRAINT "object_secret_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_secret_items_tenant_id_object_id_id_key" UNIQUE (tenant_id, object_id, id)
);

ALTER TABLE "private"."object_secret_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_secret_scopes" (
  "assignment_id" uuid    NOT NULL,
  "item_id"       uuid    NOT NULL,
  "created_by"    uuid    NOT NULL,
  "revision"      bigint  NOT NULL DEFAULT 1,
  "active"        boolean NOT NULL DEFAULT true,
  CONSTRAINT "object_secret_scopes_pkey" PRIMARY KEY (assignment_id, item_id)
);

ALTER TABLE "private"."object_secret_scopes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_secret_versions" (
  "item_id"                   uuid                     NOT NULL,
  "version"                   bigint                   NOT NULL,
  "vault_id"                  uuid                     NOT NULL,
  "actor_user_id"             uuid                     NOT NULL,
  "external_change_confirmed" boolean                  NOT NULL,
  "created_at"                timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_secret_versions_pkey" PRIMARY KEY (item_id, VERSION)
);

ALTER TABLE "private"."object_secret_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."object_vault_state" (
  "object_id" uuid   NOT NULL,
  "revision"  bigint NOT NULL DEFAULT 1,
  CONSTRAINT "object_vault_state_pkey" PRIMARY KEY (object_id)
);

ALTER TABLE "private"."object_vault_state"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."object_customer_bindings" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      uuid                     NOT NULL,
  "object_id"      uuid                     NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "active"         boolean                  NOT NULL DEFAULT true,
  "manage_secrets" boolean                  NOT NULL DEFAULT false,
  "version"        bigint                   NOT NULL DEFAULT 1,
  "created_at"     timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_customer_bindings_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_customer_bindings_tenant_id_object_id_user_id_key" UNIQUE (tenant_id, object_id, user_id),
  "created_by"     uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_customer_bindings"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_customer_bindings" FROM "anon";

CREATE TABLE "public"."object_documents" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "object_id"     uuid                     NOT NULL,
  "node_id"       uuid,
  "record_id"     uuid,
  "work_order_id" uuid,
  "request_id"    uuid,
  "title"         text                     NOT NULL,
  "category"      text                     NOT NULL,
  "storage_path"  text                     NOT NULL,
  "mime_type"     text                     NOT NULL,
  "file_name"     text                     NOT NULL,
  "size_bytes"    bigint                   NOT NULL,
  "previous_id"   uuid,
  "version"       bigint                   NOT NULL DEFAULT 1,
  "valid_until"   date,
  "service"       text                     NOT NULL DEFAULT ''::text,
  "scan_status"   text                     NOT NULL DEFAULT 'not_connected'::text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_documents_category_check"
    CHECK ((category = ANY (ARRAY['instruction'::text, 'floorplan'::text, 'report'::text, 'agreement'::text, 'photo'::text, 'other'::text, 'security'::text]))),
  CONSTRAINT "object_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_documents_scan_status_check" CHECK ((scan_status = ANY (ARRAY['not_connected'::text, 'pending'::text, 'clean'::text, 'rejected'::text]))),
  CONSTRAINT "object_documents_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760))),
  CONSTRAINT "object_documents_storage_path_key" UNIQUE (storage_path),
  CONSTRAINT "object_documents_tenant_id_object_id_id_key" UNIQUE (tenant_id, object_id, id),
  CONSTRAINT "object_documents_title_check" CHECK (((length(title) >= 2) AND (length(title) <= 180))),
  "created_by"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_documents"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_documents" FROM "anon";

CREATE TABLE "public"."object_history" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "object_id"     uuid                     NOT NULL,
  "source_table"  text                     NOT NULL,
  "source_id"     uuid                     NOT NULL,
  "version"       bigint                   NOT NULL,
  "actor_user_id" uuid,
  "event"         text                     NOT NULL,
  "snapshot"      jsonb                    NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_history_source_table_source_id_version_key" UNIQUE (source_table, source_id, VERSION)
);

ALTER TABLE "public"."object_history"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_history" FROM "anon";

CREATE TABLE "public"."object_instruction_receipts" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"      uuid                     NOT NULL,
  "object_id"      uuid                     NOT NULL,
  "work_order_id"  uuid                     NOT NULL,
  "record_id"      uuid                     NOT NULL,
  "record_version" bigint                   NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "snapshot"       jsonb                    NOT NULL,
  "read_at"        timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_instruction_receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_instruction_receipts_tenant_id_work_order_id_record__key" UNIQUE (tenant_id, work_order_id, record_id, record_version, user_id)
);

ALTER TABLE "public"."object_instruction_receipts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_instruction_receipts" FROM "anon";

CREATE TABLE "public"."object_nodes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "object_id"  uuid                     NOT NULL,
  "parent_id"  uuid,
  "name"       text                     NOT NULL,
  "kind"       text                     NOT NULL,
  "code"       text                     NOT NULL DEFAULT ''::text,
  "position"   integer                  NOT NULL DEFAULT 0,
  "active"     boolean                  NOT NULL DEFAULT true,
  "details"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_nodes_kind_check" CHECK ((kind = ANY (ARRAY['building'::text, 'floor'::text, 'zone'::text, 'room'::text, 'component'::text]))),
  CONSTRAINT "object_nodes_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160))),
  CONSTRAINT "object_nodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_nodes_tenant_id_object_id_id_key" UNIQUE (tenant_id, object_id, id)
);

ALTER TABLE "public"."object_nodes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_nodes" FROM "anon";

CREATE TABLE "public"."object_records" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"          uuid                     NOT NULL,
  "object_id"          uuid                     NOT NULL,
  "node_id"            uuid,
  "work_order_id"      uuid,
  "kind"               text                     NOT NULL,
  "title"              text                     NOT NULL,
  "body"               text                     NOT NULL DEFAULT ''::text,
  "state"              text                     NOT NULL DEFAULT 'open'::text,
  "instruction_type"   text,
  "starts_at"          timestamp with time zone,
  "ends_at"            timestamp with time zone,
  "service"            text                     NOT NULL DEFAULT ''::text,
  "owner_user_id"      uuid,
  "due_on"             date,
  "task_revision_id"   uuid,
  "contact_id"         uuid,
  "personnel_asset_id" uuid,
  "details"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "version"            bigint                   NOT NULL DEFAULT 1,
  "created_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_records_body_check" CHECK ((length(body) <= 10000)),
  CONSTRAINT "object_records_check1" CHECK (((kind <> 'instruction'::text) OR ((instruction_type IS NOT NULL) AND (starts_at IS
    NOT NULL) AND ((instruction_type <> 'temporary'::text) OR (ends_at IS NOT NULL)) AND ((instruction_type <> 'appointment'::text) OR (work_order_id IS NOT NULL))))),
  CONSTRAINT "object_records_check" CHECK (((ends_at IS NULL) OR ((starts_at IS NOT NULL) AND (ends_at > starts_at)))),
  CONSTRAINT "object_records_details_check" CHECK ((jsonb_typeof(details) = 'object'::text)),
  CONSTRAINT "object_records_instruction_type_check" CHECK ((instruction_type = ANY (ARRAY['fixed'::text, 'temporary'::text, 'appointment'::text]))),
  CONSTRAINT "object_records_kind_check"
    CHECK ((kind = ANY (ARRAY['contact'::text, 'access'::text, 'programme'::text, 'instruction'::text, 'quality'::text, 'material'::text, 'task'::text]))),
  CONSTRAINT "object_records_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_records_state_check"
    CHECK ((state = ANY (ARRAY['draft'::text, 'open'::text, 'active'::text, 'progress'::text, 'completed'::text, 'partial'::text, 'not_done'::text, 'archived'::text]))),
  CONSTRAINT "object_records_tenant_id_object_id_id_key" UNIQUE (tenant_id, object_id, id),
  CONSTRAINT "object_records_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 180))),
  "created_by"         uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"         uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_records"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_records" FROM "anon";

CREATE TABLE "public"."object_request_proposals" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid                     NOT NULL,
  "object_id"        uuid                     NOT NULL,
  "request_id"       uuid                     NOT NULL,
  "version"          bigint                   NOT NULL,
  "title"            text                     NOT NULL,
  "scope"            text                     NOT NULL,
  "task_revision_id" uuid                     NOT NULL,
  "quantity"         numeric(12,3)            NOT NULL,
  "price_cents"      bigint                   NOT NULL,
  "vat_basis_points" integer                  NOT NULL,
  "accepted_by"      uuid,
  "accepted_at"      timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_request_proposals_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_request_proposals_price_cents_check" CHECK ((price_cents >= 0)),
  CONSTRAINT "object_request_proposals_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "object_request_proposals_request_id_version_key" UNIQUE (request_id, VERSION),
  CONSTRAINT "object_request_proposals_vat_basis_points_check" CHECK (((vat_basis_points >= 0) AND (vat_basis_points <= 10000))),
  "created_by"       uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_request_proposals"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_request_proposals" FROM "anon";

CREATE TABLE "public"."object_visit_requests" (
  "id"                 uuid                     NOT NULL,
  "tenant_id"          uuid                     NOT NULL,
  "object_id"          uuid                     NOT NULL,
  "work_order_id"      uuid                     NOT NULL,
  "node_id"            uuid,
  "title"              text                     NOT NULL,
  "body"               text                     NOT NULL,
  "kind"               text                     NOT NULL,
  "priority"           text                     NOT NULL DEFAULT 'normal'::text,
  "feedback"           text                     NOT NULL DEFAULT ''::text,
  "state"              text                     NOT NULL DEFAULT 'new'::text,
  "needs_review"       boolean                  NOT NULL DEFAULT true,
  "review_note"        text                     NOT NULL DEFAULT ''::text,
  "response"           text                     NOT NULL DEFAULT ''::text,
  "work_order_task_id" uuid,
  "version"            bigint                   NOT NULL DEFAULT 1,
  "created_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_visit_requests_body_check" CHECK (((length(body) >= 2) AND (length(body) <= 10000))),
  CONSTRAINT "object_visit_requests_kind_check" CHECK ((kind = ANY (ARRAY['attention'::text, 'change'::text, 'problem'::text, 'extra'::text]))),
  CONSTRAINT "object_visit_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "object_visit_requests_priority_check" CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text, 'urgent'::text]))),
  CONSTRAINT "object_visit_requests_state_check"
    CHECK
    ((state = ANY (ARRAY['new'::text, 'review'::text, 'regular'::text, 'proposal'::text, 'accepted'::text, 'rejected'::text, 'completed'::text, 'partial'::text,
    'not_done'::text]))),
  CONSTRAINT "object_visit_requests_tenant_id_object_id_id_key" UNIQUE (tenant_id, object_id, id),
  CONSTRAINT "object_visit_requests_title_check" CHECK (((length(btrim(title)) >= 2) AND (length(btrim(title)) <= 180))),
  "created_by"         uuid                     NOT NULL DEFAULT auth.uid(),
  "updated_by"         uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_visit_requests"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_visit_requests" FROM "anon";

ALTER TABLE "public"."objects"
  ADD COLUMN "dossier_status" text NOT NULL DEFAULT 'active'::text;

ALTER TABLE "public"."objects"
  ADD COLUMN "object_type" text NOT NULL DEFAULT 'other'::text;

ALTER TABLE "public"."objects"
  ADD COLUMN "version" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."objects"
  ADD COLUMN "location_description" text NOT NULL DEFAULT ''::text;

CREATE OR REPLACE FUNCTION private.object_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare obj public.objects;ord public.work_orders;p public.object_nodes;lvl integer;parentlvl integer;node uuid;seen uuid[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='UPDATE' then
  if new.id<>old.id or new.tenant_id<>old.tenant_id then raise exception 'De bronrelatie kan niet worden gewijzigd' using errcode='23514';end if;
  if tg_table_name<>'objects' and new.object_id<>old.object_id then raise exception 'De objectrelatie kan niet worden gewijzigd' using errcode='23514';end if;
  new.version:=old.version+1;
 end if;
 if tg_table_name='objects' then
  if tg_op='UPDATE' and new.customer_id<>old.customer_id and exists(select 1 from public.work_orders where tenant_id=new.tenant_id and object_id=new.id) then raise exception 'Een object met uitvoering kan niet naar een andere klant worden verplaatst' using errcode='23514';end if;
  if tg_op='UPDATE' and new.active is distinct from old.active and new.dossier_status=old.dossier_status then new.dossier_status:=case when new.active then 'active' else 'archived' end;end if;
  new.active:=new.dossier_status='active';return new;
 end if;
 select * into obj from public.objects where tenant_id=new.tenant_id and id=new.object_id;
 if obj.id is null then raise exception 'Object niet gevonden' using errcode='23514';end if;
 if tg_table_name='object_nodes' then
  lvl:=array_position(array['building','floor','zone','room','component'],new.kind);
  node:=new.parent_id;
  while node is not null loop
   if node=new.id or node=any(seen) then raise exception 'Een locatieonderdeel kan niet onder zichzelf vallen' using errcode='23514';end if;
   seen:=array_append(seen,node);
   select * into p from public.object_nodes where tenant_id=new.tenant_id and object_id=new.object_id and id=node;
   if p.id is null or not p.active then raise exception 'Kies een actief onderdeel van dit object' using errcode='23514';end if;
   parentlvl:=array_position(array['building','floor','zone','room','component'],p.kind);
   if parentlvl>=lvl then raise exception 'De locatievolgorde klopt niet' using errcode='23514';end if;
   lvl:=parentlvl;node:=p.parent_id;
  end loop;
  if tg_op='UPDATE' and new.kind<>old.kind and exists(select 1 from public.object_nodes n where n.parent_id=new.id and array_position(array['building','floor','zone','room','component'],n.kind)<=array_position(array['building','floor','zone','room','component'],new.kind)) then raise exception 'Het type past niet boven de gekoppelde onderdelen' using errcode='23514';end if;
  return new;
 end if;
 if new.work_order_id is not null then
  select * into ord from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id and object_id=new.object_id;
  if ord.id is null then raise exception 'De afspraak hoort niet bij dit object' using errcode='23514';end if;
 end if;
 if tg_table_name='object_records' then
  if new.contact_id is not null and not exists(select 1 from public.customer_contacts c where c.tenant_id=new.tenant_id and c.customer_id=obj.customer_id and c.id=new.contact_id) then raise exception 'Contactpersoon hoort niet bij deze klant' using errcode='23514';end if;
  if new.owner_user_id is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.owner_user_id and m.status='active') then raise exception 'Kies een actieve verantwoordelijke' using errcode='23514';end if;
  if new.personnel_asset_id is not null and not exists(select 1 from public.personnel_dossier_items a where a.tenant_id=new.tenant_id and a.id=new.personnel_asset_id and a.kind='asset') then raise exception 'Uitgifte niet gevonden' using errcode='23514';end if;
  if new.state in ('partial','not_done','completed') and new.kind='task' and length(coalesce(new.details->>'evidence',''))<2 then raise exception 'Leg het resultaat of de reden vast' using errcode='23514';end if;
 end if;
 if tg_table_name in ('object_records','object_visit_requests') then
  if tg_op='UPDATE' and old.work_order_id is not null and (new.work_order_id is distinct from old.work_order_id) then raise exception 'Een registratie blijft gekoppeld aan het oorspronkelijke bezoek' using errcode='23514';end if;
  if ord.status in ('completed','returned','under_review','approved','invoice_ready','invoiced','cancelled') and tg_op='UPDATE' then raise exception 'Deze uitvoering is afgesloten. Voeg een afzonderlijke opvolging toe.' using errcode='23514';end if;
  new.updated_at:=clock_timestamp();new.updated_by:=coalesce(auth.uid(),new.updated_by);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_history_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare oid uuid;v bigint;
begin
 oid:=case when tg_table_name='objects' then new.id else new.object_id end;v:=new.version;
 insert into public.object_history(tenant_id,object_id,source_table,source_id,version,actor_user_id,event,snapshot)
 values(new.tenant_id,oid,tg_table_name,new.id,v,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,to_jsonb(new));
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_instruction_notify()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w record;
begin
 if new.kind='instruction' and new.state='active' then
  for w in select id from public.work_orders where tenant_id=new.tenant_id and object_id=new.object_id and status in ('planned','released','seen','travelling','in_progress') and (new.work_order_id is null or id=new.work_order_id) and projected_end_at>=new.starts_at and (new.ends_at is null or projected_start_at<=new.ends_at) loop
   perform private.object_notify(new.tenant_id,new.object_id,w.id,'instruction:'||new.id::text||':'||new.version::text||':'||w.id::text);
  end loop;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_manage (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and private.has_role(t,array['tenant_admin','management','planner']::public.app_role[])
 and exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(s.enabled_services));
$function$;

CREATE OR REPLACE FUNCTION private.object_notify (
  t         uuid,
  o         uuid,
  w         uuid,
  event_key text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare u record;
begin
 -- Recipients are resolved at delivery, never copied from the requesting client.
 for u in select distinct m.user_id,case when m.roles && array['tenant_admin','management','planner']::public.app_role[] then '/app/objecten/'||o::text||'?tab=instructies' else '/staff/objecten/'||o::text||'?order='||w::text end as path
 from public.tenant_memberships m where m.tenant_id=t and m.status='active' and (
 m.roles && array['tenant_admin','management','planner']::public.app_role[] or exists(select 1 from public.personnel p join public.work_order_assignments a on a.tenant_id=p.tenant_id and a.personnel_id=p.id where p.tenant_id=t and p.user_id=m.user_id and p.status='active' and a.work_order_id=w and a.status not in ('cancelled','returned','completed') and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null))) loop
 insert into public.notifications(tenant_id,user_id,channel,title,body,target_path,status,sent_at)
 select t,u.user_id,'in_app','Een object vraagt aandacht','Bekijk de actuele instructies en opvolging in de beveiligde omgeving.',u.path,'sent',clock_timestamp()
 where not exists(select 1 from private.object_notification_keys k where k.tenant_id=t and k.user_id=u.user_id and k.event_key=object_notify.event_key);
 insert into private.object_notification_keys values(t,u.user_id,event_key,clock_timestamp()) on conflict do nothing;
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION private.object_replanning_review()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if (new.projected_start_at,new.projected_end_at,new.status='cancelled') is distinct from (old.projected_start_at,old.projected_end_at,old.status='cancelled') then
  update public.object_visit_requests set needs_review=true,review_note=case when new.status='cancelled' then 'Afspraak geannuleerd: bepaal de opvolging.' else 'Planning gewijzigd: beoordeel of dit verzoek nog geldt.' end where tenant_id=new.tenant_id and work_order_id=new.id;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_vault_context (
  t uuid,
  u uuid,
  s uuid,
  o uuid,
  w uuid,
  i uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare a public.work_order_assignments;ord public.work_orders;item private.object_secret_items;ext private.object_access_extensions;
 mail text;manager boolean;bound boolean;binding_revision bigint;scope_revision bigint;vault_revision bigint;end_at timestamptz;config jsonb;before_minutes integer;otp_minutes integer;view_minutes integer;
begin
 -- Even a cryptographically valid access token is insufficient after logout/revocation.
 select au.email into mail from auth.users au join auth.sessions sess on sess.user_id=au.id where au.id=u and sess.id=s and au.deleted_at is null and au.email_confirmed_at is not null and (au.banned_until is null or au.banned_until<clock_timestamp()) and (sess.not_after is null or sess.not_after>clock_timestamp());
 if mail is null or not exists(select 1 from public.tenants x join public.tenant_settings ts on ts.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(ts.enabled_services)) or not exists(select 1 from public.objects x where x.tenant_id=t and x.id=o and x.dossier_status in ('draft','active','paused')) then return null;end if;
 select exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=u and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]) into manager;
 select b.version into binding_revision from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u and b.active and b.manage_secrets;
 bound:=binding_revision is not null;
 select coalesce(settings->'objectVault','{}') into config from public.tenant_settings where tenant_id=t;
 before_minutes:=least(120,greatest(0,coalesce((config->>'beforeMinutes')::integer,60)));
 otp_minutes:=least(5,greatest(1,coalesce((config->>'otpMinutes')::integer,5)));
 view_minutes:=least(10,greatest(1,coalesce((config->>'viewMinutes')::integer,10)));
 select revision into vault_revision from private.object_vault_state where object_id=o;
 if i is not null then
  select * into item from private.object_secret_items where tenant_id=t and object_id=o and id=i and active and valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp());
  if item.id is null then return null;end if;
 elsif not manager and not bound then return null;
 end if;
 end_at:=clock_timestamp()+make_interval(mins=>view_minutes);
 if not manager and not bound then
  select aa.* into a from public.work_order_assignments aa join public.personnel p on p.tenant_id=aa.tenant_id and p.id=aa.personnel_id join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
  where aa.tenant_id=t and aa.work_order_id=w and p.user_id=u and p.status='active' and m.status='active' and aa.status in ('released','seen','travelling','in_progress')
   and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=aa.id and d.revoked_at is null);
  select * into ord from public.work_orders where tenant_id=t and id=w and object_id=o and status in ('released','seen','travelling','in_progress');
  if a.id is null or ord.id is null or a.projected_start_at is null or a.projected_end_at is null then return null;end if;
  select revision into scope_revision from private.object_secret_scopes sc where sc.assignment_id=a.id and sc.item_id=i and sc.active;
  if scope_revision is null then return null;end if;
  select * into ext from private.object_access_extensions where assignment_id=a.id;
  end_at:=greatest(a.projected_end_at,coalesce(ext.ends_at,a.projected_end_at));
  if clock_timestamp()<a.projected_start_at-make_interval(mins=>before_minutes) or clock_timestamp()>=end_at then return null;end if;
 end if;
 end_at:=least(end_at,coalesce(item.valid_until,end_at));
 return jsonb_build_object('email',mail,'canManage',manager or bound,'windowEnd',end_at,'otpMinutes',otp_minutes,'viewMinutes',view_minutes,'assignmentId',a.id,
 'fingerprint',md5(concat_ws(':',t,u,s,o,w,i,coalesce(vault_revision,0),item.version,manager,binding_revision,a.id,a.version,ord.version,scope_revision,ext.revision)));
end $function$;

CREATE OR REPLACE FUNCTION private.object_visit_access (
  t uuid,
  o uuid,
  w uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and exists(select 1 from public.tenants x where x.id=t and x.status='active') and
 (private.object_manage(t) or exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active)
 or exists(select 1 from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
 join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id
 join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
 where a.tenant_id=t and wo.object_id=o and wo.id=w and p.user_id=auth.uid() and p.status='active' and m.status='active'
 and a.status not in ('cancelled','returned') and wo.status<>'cancelled' and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)))
 and (w is null or exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.object_id=o));
$function$;

CREATE OR REPLACE FUNCTION public.accept_object_proposal (
  target_tenant   uuid,
  target_proposal uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare p public.object_request_proposals;r public.object_visit_requests;rev public.task_revisions;cat public.task_catalog;task uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into p from public.object_request_proposals where tenant_id=target_tenant and id=target_proposal for update;
 if p.id is null or not exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=p.object_id and b.user_id=auth.uid() and b.active) then raise exception 'Geen toegang tot dit voorstel' using errcode='42501';end if;
 if not private.object_visit_access(target_tenant,p.object_id,null) then raise exception 'Geen toegang' using errcode='42501';end if;
 if p.accepted_at is not null then return;end if;
 select * into r from public.object_visit_requests where id=p.request_id for update;
 if r.state<>'proposal' or r.needs_review or r.work_order_task_id is not null or exists(select 1 from public.object_request_proposals n where n.request_id=p.request_id and n.version>p.version) then raise exception 'Dit voorstel is gewijzigd. Bekijk de nieuwste versie.' using errcode='40001';end if;
 select * into rev from public.task_revisions where id=p.task_revision_id and tenant_id=target_tenant;
 select * into cat from public.task_catalog where id=rev.task_id and tenant_id=target_tenant;
 update public.object_request_proposals set accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=p.id;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,added_by)
 values(target_tenant,r.work_order_id,rev.id,cat.code,p.title,rev.duration_minutes,p.quantity,rev.unit,p.price_cents,p.vat_basis_points,true,'awaiting_review',auth.uid()) returning id into task;
 update public.object_visit_requests set state='accepted',work_order_task_id=task where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'accepted:'||p.id::text);
end $function$;

REVOKE ALL ON FUNCTION "public"."accept_object_proposal"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.acknowledge_object_instruction (
  target_tenant    uuid,
  target_order     uuid,
  target_record    uuid,
  expected_version bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_records;w public.work_orders;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not private.object_visit_access(target_tenant,w.object_id,w.id) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_records where tenant_id=target_tenant and object_id=w.object_id and id=target_record and version=expected_version and kind='instruction' and state='active' and (work_order_id is null or work_order_id=w.id)
 and starts_at<=w.projected_end_at and (ends_at is null or ends_at>=w.projected_start_at) and (service='' or service=w.discipline);
 if r.id is null then raise exception 'De instructie is gewijzigd. Lees de actuele versie.' using errcode='40001';end if;
 insert into public.object_instruction_receipts(tenant_id,object_id,work_order_id,record_id,record_version,user_id,snapshot) values(target_tenant,w.object_id,w.id,r.id,r.version,auth.uid(),to_jsonb(r)) on conflict do nothing;
end $function$;

REVOKE ALL ON FUNCTION "public"."acknowledge_object_instruction"(uuid, uuid, uuid, bigint) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_object_visits (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if auth.uid() is null or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'manageSecrets',b.manage_secrets,'visits',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) order by w.projected_start_at desc nulls last) from public.work_orders w where w.tenant_id=target_tenant and w.object_id=o.id),'[]')) order by o.name)
 from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id where b.tenant_id=target_tenant and b.user_id=auth.uid() and b.active),'[]');
end $function$;

REVOKE ALL ON FUNCTION "public"."customer_object_visits"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.extend_object_access (
  target_tenant     uuid,
  target_assignment uuid,
  until_time        timestamp with time zone,
  reason            text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare a public.work_order_assignments;w public.work_orders;
begin
 if not private.object_manage(target_tenant) or length(btrim(reason))<5 or until_time<=clock_timestamp() or until_time>clock_timestamp()+interval '4 hours' then raise exception 'Kies een eindtijd binnen vier uur en leg de reden vast' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into a from public.work_order_assignments where tenant_id=target_tenant and id=target_assignment and status in ('released','seen','travelling','in_progress');
 select * into w from public.work_orders where tenant_id=target_tenant and id=a.work_order_id and status in ('released','seen','travelling','in_progress');
 if w.id is null then raise exception 'Geen actieve gepubliceerde toewijzing' using errcode='23514';end if;
 insert into private.object_access_extensions values(a.id,until_time,reason,auth.uid(),1,clock_timestamp()) on conflict(assignment_id) do update set ends_at=excluded.ends_at,reason=excluded.reason,decided_by=excluded.decided_by,revision=private.object_access_extensions.revision+1,created_at=clock_timestamp();
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'object.access_extended','assignment',a.id,jsonb_build_object('endsAt',until_time,'reason',reason,'objectId',w.object_id));
end $function$;

REVOKE ALL ON FUNCTION "public"."extend_object_access"(uuid, uuid, timestamp WITH time zone, text) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.object_vault_operation (
  target_tenant uuid,
  actor         uuid,
  session_id    uuid,
  target_object uuid,
  target_order  uuid,
  target_item   uuid,
  operation     text,
  input         jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ctx jsonb;ch private.object_otp_challenges;g private.object_access_grants;item private.object_secret_items;pepper text;k uuid;v uuid;cid uuid;gid uuid;expiry timestamptz;n integer;val text;items jsonb;manager boolean;a public.work_order_assignments;
begin
 -- Service-only. Actor/session originate from verified server auth, not request JSON.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp:'||actor::text,0));
 ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,target_item);
 manager:=exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=actor and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]);
 if operation='metadata' and target_item is null and ctx is null then
  -- Enumerate only items explicitly granted to this concrete current assignment.
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version)),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
  return jsonb_build_object('ok',true,'items',items,'canManage',false);
 end if;
 if ctx is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Toegang niet beschikbaar. Controleer je actuele toewijzing of neem contact op met je leidinggevende.');
 end if;
 if operation='metadata' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version,'validFrom',x.valid_from,'validUntil',x.valid_until) order by x.name),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and x.active;
  return jsonb_build_object('ok',true,'items',items,'canManage',(ctx->>'canManage')::boolean,'email',left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2));
 elsif operation='request' then
  if coalesce(input->>'code','')!~'^[0-9]{6}$' then return jsonb_build_object('ok',false,'error','Verificatie niet beschikbaar.');end if;
  select count(*) into n from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '1 hour';
  if n>=5 or exists(select 1 from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '60 seconds') or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then return jsonb_build_object('ok',false,'error','Te veel pogingen. Wacht voordat je opnieuw een code aanvraagt.');end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp-key',0));
  select vault_id into k from private.object_otp_key where id;
  if k is null then
   k:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'fieldgrid_object_otp_pepper','Keyed verification; never expose');
   insert into private.object_otp_key(id,vault_id) values(true,k);
  end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where id=k;
  cid:=gen_random_uuid();expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'otpMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  update private.object_otp_challenges c set consumed_at=clock_timestamp() where c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.object_id=target_object and c.consumed_at is null;
  insert into private.object_otp_challenges(id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,code_hmac,expires_at)
  values(cid,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',extensions.hmac(cid::text||':'||(input->>'code'),pepper,'sha256'),expiry);
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'requested');
  return jsonb_build_object('ok',true,'challengeId',cid,'email',ctx->>'email','expiresAt',expiry);
 elsif operation in ('delivered','delivery_failed') then
  update private.object_otp_challenges c set delivered=operation='delivered',consumed_at=case when operation='delivery_failed' then clock_timestamp() else consumed_at end where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.fingerprint=ctx->>'fingerprint';
  return jsonb_build_object('ok',true);
 elsif operation='verify' then
  select * into ch from private.object_otp_challenges c where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.tenant_id=target_tenant and c.object_id=target_object for update;
  select d.decrypted_secret into pepper from private.object_otp_key k join vault.decrypted_secrets d on d.id=k.vault_id;
  if ch.id is null or not ch.delivered or ch.consumed_at is not null or ch.expires_at<=clock_timestamp() or ch.fingerprint<>ctx->>'fingerprint' or ch.code_hmac<>extensions.hmac(ch.id::text||':'||coalesce(input->>'code',''),pepper,'sha256')
   or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then
   insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verify_failed');
   return jsonb_build_object('ok',false,'error','De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.');
  end if;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where id=ch.id;
  expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'viewMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  insert into private.object_access_grants(challenge_id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,expires_at) values(ch.id,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',expiry) returning id into gid;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verified');
  return jsonb_build_object('ok',true,'grantId',gid,'expiresAt',expiry);
 end if;
 select * into g from private.object_access_grants ag where ag.id=(input->>'grantId')::uuid and ag.tenant_id=target_tenant and ag.actor_id=actor and ag.session_id=object_vault_operation.session_id and ag.object_id=target_object and ag.fingerprint=ctx->>'fingerprint' and ag.revoked_at is null and ag.expires_at>clock_timestamp() for update;
 if g.id is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Bevestig je toegang opnieuw met een e-mailcode.');
 end if;
 if operation='hide' then update private.object_access_grants set revoked_at=clock_timestamp() where id=g.id;return jsonb_build_object('ok',true);
 elsif operation='check' then return jsonb_build_object('ok',true,'expiresAt',g.expires_at);
 elsif operation='read' and target_item is not null then
  select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object;
  select ds.decrypted_secret into val from private.object_secret_versions sv join vault.decrypted_secrets ds on ds.id=sv.vault_id where sv.item_id=item.id and sv.version=item.version;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'read');
  return jsonb_build_object('ok',true,'value',val,'expiresAt',g.expires_at);
 elsif operation='save' and (ctx->>'canManage')::boolean then
  if length(coalesce(input->>'value','')) not between 1 and 4000 then return jsonb_build_object('ok',false,'error','Vul een geldige beveiligde waarde in.');end if;
  if target_item is not null then
   select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object for update;
   if item.version<>(input->>'version')::bigint or coalesce((input->>'externalChanged')::boolean,false)=false then return jsonb_build_object('ok',false,'error','Controleer de versie en bevestig dat de externe code werkelijk is gewijzigd.');end if;
   update private.object_secret_items set version=version+1,name=input->>'name',kind=input->>'kind',node_id=nullif(input->>'nodeId','')::uuid,valid_from=clock_timestamp(),valid_until=nullif(input->>'validUntil','')::timestamptz where id=item.id returning * into item;
  else
   insert into private.object_secret_items(tenant_id,object_id,node_id,name,kind,owner_user_id,valid_until) values(target_tenant,target_object,nullif(input->>'nodeId','')::uuid,input->>'name',input->>'kind',actor,nullif(input->>'validUntil','')::timestamptz) returning * into item;
  end if;
  v:=vault.create_secret(input->>'value',null,'Fieldgrid private object value');
  insert into private.object_secret_versions values(item.id,item.version,v,actor,coalesce((input->>'externalChanged')::boolean,false),clock_timestamp());
  insert into private.object_vault_state values(target_object,1) on conflict(object_id) do update set revision=private.object_vault_state.revision+1;
  update private.object_access_grants set revoked_at=clock_timestamp() where object_id=target_object;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where object_id=target_object and consumed_at is null;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,item.id,'rotated');
  return jsonb_build_object('ok',true);
 elsif operation='scope' and manager and target_item is not null then
  select aa.* into a from public.work_order_assignments aa join public.work_orders wo on wo.tenant_id=aa.tenant_id and wo.id=aa.work_order_id where aa.tenant_id=target_tenant and aa.id=(input->>'assignmentId')::uuid and wo.object_id=target_object and aa.status not in ('completed','returned','cancelled');
  if a.id is null then return jsonb_build_object('ok',false,'error','Kies een actuele toewijzing bij dit object.');end if;
  insert into private.object_secret_scopes values(a.id,target_item,actor,1,coalesce((input->>'active')::boolean,true)) on conflict(assignment_id,item_id) do update set active=excluded.active,revision=private.object_secret_scopes.revision+1,created_by=actor;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,a.work_order_id,target_item,'scope_changed');
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','Deze actie is niet beschikbaar.');
end $function$;

REVOKE ALL ON FUNCTION "public"."object_vault_operation"(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.object_visit_context (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;w public.work_orders;result jsonb;manager boolean;customer boolean;
begin
 if not private.object_visit_access(target_tenant,target_object,target_order) then raise exception 'Geen toegang tot deze uitvoering' using errcode='42501';end if;
 manager:=private.object_manage(target_tenant);
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active);
 select * into o from public.objects where tenant_id=target_tenant and id=target_object;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=o.id;
 result:=jsonb_build_object('object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'instructions',o.access_instructions,'status',o.dossier_status),
 'order',case when w.id is null then null else jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) end,
 'customer',customer,'manager',manager);
 return result||jsonb_build_object(
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind) order by n.position,n.name) from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=o.id and n.active),'[]'),
 'instructions',case when customer and not manager then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_instruction_receipts rc where rc.record_id=r.id and rc.record_version=r.version and rc.work_order_id=w.id and rc.user_id=auth.uid()))) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id and r.kind='instruction' and r.state='active' and (r.service='' or r.service=w.discipline) and (r.work_order_id is null or r.work_order_id=w.id) and r.starts_at<=coalesce(w.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(w.projected_start_at,clock_timestamp()))),'[]') end,
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]'))) from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=o.id and (w.id is null or r.work_order_id=w.id)),'[]'));
end $function$;

REVOKE ALL ON FUNCTION "public"."object_visit_context"(uuid, uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.review_object_visit_request (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint,
  decision         text,
  input            jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;rev public.task_revisions;cat public.task_catalog;task uuid;pv bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or r.version<>expected_version then raise exception 'Het verzoek is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
 if length(coalesce(input->>'reason',''))<2 then raise exception 'Leg je beoordeling vast' using errcode='23514';end if;
 if decision not in ('regular','proposal','rejected','review','completed','partial','not_done') then raise exception 'Onbekende beoordeling' using errcode='23514';end if;
 if decision in ('regular','proposal') then
  if r.work_order_task_id is not null then raise exception 'Dit verzoek heeft al een uitvoeringstaak' using errcode='23514';end if;
  select * into rev from public.task_revisions where tenant_id=target_tenant and id=(input->>'taskRevisionId')::uuid;
  select * into cat from public.task_catalog where tenant_id=target_tenant and id=rev.task_id and active;
  if cat.id is null then raise exception 'Kies een bestaande taak uit de catalogus' using errcode='23514';end if;
  if decision='regular' then
   -- Included scope reprioritises existing work; never adds another invoice charge.
   insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,added_by)
   values(target_tenant,r.work_order_id,rev.id,cat.code,r.title,rev.duration_minutes,1,rev.unit,0,rev.vat_basis_points,false,auth.uid()) returning id into task;
  else
   select coalesce(max(version),0)+1 into pv from public.object_request_proposals where request_id=r.id;
   insert into public.object_request_proposals(tenant_id,object_id,request_id,version,title,scope,task_revision_id,quantity,price_cents,vat_basis_points)
   values(target_tenant,r.object_id,r.id,pv,r.title,input->>'reason',rev.id,coalesce((input->>'quantity')::numeric,1),coalesce((input->>'priceCents')::bigint,rev.price_cents),rev.vat_basis_points);
  end if;
 end if;
 update public.object_visit_requests set state=decision,needs_review=false,review_note=input->>'reason',response=coalesce(input->>'response',response),work_order_task_id=coalesce(task,work_order_task_id) where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'review:'||r.id::text||':'||(r.version+1)::text);
end $function$;

REVOKE ALL ON FUNCTION "public"."review_object_visit_request"(uuid, uuid, bigint, text, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.submit_object_visit_request (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid,
  request_id    uuid,
  input         jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;r public.object_visit_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_visit_access(target_tenant,target_object,target_order) or target_order is null or request_id is null then raise exception 'Geen toegang' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=target_object for update;
 if w.status not in ('planned','released','seen','travelling','in_progress') then raise exception 'Deze afspraak is afgesloten. Vraag om een nieuwe vervolgafspraak.' using errcode='23514';end if;
 select * into r from public.object_visit_requests where id=request_id;
 if found then
  if r.tenant_id<>target_tenant or r.object_id<>target_object or r.work_order_id<>target_order or r.created_by<>auth.uid() then raise exception 'Ongeldige verzoekreferentie' using errcode='42501';end if;
  return r.id;
 end if;
 insert into public.object_visit_requests(id,tenant_id,object_id,work_order_id,node_id,title,body,kind,priority,feedback)
 values(request_id,target_tenant,target_object,target_order,nullif(input->>'nodeId','')::uuid,input->>'title',input->>'body',input->>'kind',coalesce(input->>'priority','normal'),coalesce(input->>'feedback',''));
 perform private.object_notify(target_tenant,target_object,target_order,'request:'||request_id::text);
 return request_id;
end $function$;

REVOKE ALL ON FUNCTION "public"."submit_object_visit_request"(uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "private"."object_access_extensions"
  ADD CONSTRAINT "object_access_extensions_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.work_order_assignments(id);

ALTER TABLE "private"."object_access_extensions"
  ADD CONSTRAINT "object_access_extensions_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);

ALTER TABLE "private"."object_access_grants"
  ADD CONSTRAINT "object_access_grants_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES private.object_otp_challenges(id);

ALTER TABLE "private"."object_otp_key"
  ADD CONSTRAINT "object_otp_key_vault_id_fkey" FOREIGN KEY (vault_id) REFERENCES vault.secrets(id);

ALTER TABLE "private"."object_secret_items"
  ADD CONSTRAINT "object_secret_items_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE "private"."object_secret_items"
  ADD CONSTRAINT "object_secret_items_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "private"."object_secret_scopes"
  ADD CONSTRAINT "object_secret_scopes_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.work_order_assignments(id);

ALTER TABLE "private"."object_secret_scopes"
  ADD CONSTRAINT "object_secret_scopes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."object_secret_scopes"
  ADD CONSTRAINT "object_secret_scopes_item_id_fkey" FOREIGN KEY (item_id) REFERENCES private.object_secret_items(id);

ALTER TABLE "private"."object_secret_versions"
  ADD CONSTRAINT "object_secret_versions_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE "private"."object_secret_versions"
  ADD CONSTRAINT "object_secret_versions_item_id_fkey" FOREIGN KEY (item_id) REFERENCES private.object_secret_items(id);

ALTER TABLE "private"."object_secret_versions"
  ADD CONSTRAINT "object_secret_versions_vault_id_fkey" FOREIGN KEY (vault_id) REFERENCES vault.secrets(id);

ALTER TABLE "private"."object_vault_state"
  ADD CONSTRAINT "object_vault_state_object_id_fkey" FOREIGN KEY (object_id) REFERENCES public.objects(id);

ALTER TABLE "public"."object_customer_bindings"
  ADD CONSTRAINT "object_customer_bindings_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_customer_bindings"
  ADD CONSTRAINT "object_customer_bindings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_object_id_previous_id_fkey" FOREIGN KEY (tenant_id, object_id, previous_id)
    REFERENCES public.object_documents(tenant_id, object_id, id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."object_history"
  ADD CONSTRAINT "object_history_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."object_history"
  ADD CONSTRAINT "object_history_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_instruction_receipts"
  ADD CONSTRAINT "object_instruction_receipts_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."object_instruction_receipts"
  ADD CONSTRAINT "object_instruction_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."object_nodes"
  ADD CONSTRAINT "object_nodes_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "private"."object_secret_items"
  ADD CONSTRAINT "object_secret_items_tenant_id_object_id_node_id_fkey" FOREIGN KEY (tenant_id, object_id, node_id) REFERENCES public.object_nodes(tenant_id, object_id, id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_object_id_node_id_fkey" FOREIGN KEY (tenant_id, object_id, node_id) REFERENCES public.object_nodes(tenant_id, object_id, id);

ALTER TABLE "public"."object_nodes"
  ADD CONSTRAINT "object_nodes_tenant_id_object_id_parent_id_fkey" FOREIGN KEY (tenant_id, object_id, parent_id) REFERENCES public.object_nodes(tenant_id, object_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_tenant_id_contact_id_fkey" FOREIGN KEY (tenant_id, contact_id) REFERENCES public.customer_contacts(tenant_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_object_id_record_id_fkey" FOREIGN KEY (tenant_id, object_id, record_id) REFERENCES public.object_records(tenant_id, object_id, id);

ALTER TABLE "public"."object_instruction_receipts"
  ADD CONSTRAINT "object_instruction_receipts_tenant_id_object_id_record_id_fkey" FOREIGN KEY (tenant_id, object_id, record_id)
    REFERENCES public.object_records(tenant_id, object_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_tenant_id_object_id_node_id_fkey" FOREIGN KEY (tenant_id, object_id, node_id) REFERENCES public.object_nodes(tenant_id, object_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_tenant_id_task_revision_id_fkey" FOREIGN KEY (tenant_id, task_revision_id) REFERENCES public.task_revisions(tenant_id, id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."object_request_proposals"
  ADD CONSTRAINT "object_request_proposals_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_request_proposals"
  ADD CONSTRAINT "object_request_proposals_tenant_id_task_revision_id_fkey" FOREIGN KEY (tenant_id, task_revision_id) REFERENCES public.task_revisions(tenant_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_tenant_id_object_id_request_id_fkey" FOREIGN KEY (tenant_id, object_id, request_id)
    REFERENCES public.object_visit_requests(tenant_id, object_id, id);

ALTER TABLE "public"."object_request_proposals"
  ADD CONSTRAINT "object_request_proposals_tenant_id_object_id_request_id_fkey" FOREIGN KEY (tenant_id, object_id, request_id)
    REFERENCES public.object_visit_requests(tenant_id, object_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_tenant_id_object_id_node_id_fkey" FOREIGN KEY (tenant_id, object_id, node_id) REFERENCES public.object_nodes(tenant_id, object_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_tenant_id_work_order_id_fkey" FOREIGN KEY (tenant_id, work_order_id) REFERENCES public.work_orders(tenant_id, id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_tenant_id_work_order_task_id_fkey" FOREIGN KEY (tenant_id, work_order_task_id) REFERENCES public.work_order_tasks(tenant_id, id);

ALTER TABLE "public"."objects"
  ADD CONSTRAINT "objects_dossier_status_check" CHECK ((dossier_status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])));

CREATE INDEX object_access_audit_actor_idx ON private.object_access_audit USING btree (actor_id, created_at DESC);

CREATE INDEX object_access_audit_object_idx ON private.object_access_audit USING btree (tenant_id, object_id, created_at DESC);

CREATE INDEX object_access_grants_context_idx ON private.object_access_grants USING btree (actor_id, session_id, object_id);

CREATE INDEX object_otp_challenges_context_idx ON private.object_otp_challenges USING btree (actor_id, session_id, object_id, created_at DESC);

CREATE INDEX object_secret_items_object_idx ON private.object_secret_items USING btree (tenant_id, object_id);

CREATE INDEX object_customer_bindings_user_idx ON public.object_customer_bindings USING btree (user_id, tenant_id)
  WHERE active;

CREATE INDEX object_documents_object_idx ON public.object_documents USING btree (tenant_id, object_id, created_at DESC);

CREATE INDEX object_history_object_idx ON public.object_history USING btree (tenant_id, object_id, created_at DESC);

CREATE INDEX object_instruction_receipts_object_idx ON public.object_instruction_receipts USING btree (tenant_id, object_id, work_order_id);

CREATE INDEX object_nodes_object_idx ON public.object_nodes USING btree (tenant_id, object_id, parent_id, "position");

CREATE INDEX object_records_due_idx ON public.object_records USING btree (tenant_id, due_on)
  WHERE (state = ANY (ARRAY['open'::text, 'progress'::text]));

CREATE INDEX object_records_object_idx ON public.object_records USING btree (tenant_id, object_id, kind, state);

CREATE INDEX object_records_order_idx ON public.object_records USING btree (tenant_id, work_order_id)
  WHERE (work_order_id IS NOT NULL);

CREATE INDEX object_visit_requests_order_idx ON public.object_visit_requests USING btree (tenant_id, object_id, work_order_id, state);

CREATE TRIGGER object360_guard
  BEFORE INSERT OR UPDATE ON public.object_nodes
  FOR EACH ROW
  EXECUTE FUNCTION private.object_guard();

CREATE TRIGGER object360_history
  AFTER INSERT OR UPDATE ON public.object_nodes
  FOR EACH ROW
  EXECUTE FUNCTION private.object_history_write();

CREATE TRIGGER object360_guard
  BEFORE INSERT OR UPDATE ON public.object_records
  FOR EACH ROW
  EXECUTE FUNCTION private.object_guard();

CREATE TRIGGER object360_history
  AFTER INSERT OR UPDATE ON public.object_records
  FOR EACH ROW
  EXECUTE FUNCTION private.object_history_write();

CREATE TRIGGER object360_instruction_notify
  AFTER INSERT OR UPDATE ON public.object_records
  FOR EACH ROW
  EXECUTE FUNCTION private.object_instruction_notify();

CREATE TRIGGER object360_guard
  BEFORE INSERT OR UPDATE ON public.object_visit_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.object_guard();

CREATE TRIGGER object360_history
  AFTER INSERT OR UPDATE ON public.object_visit_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.object_history_write();

CREATE TRIGGER object360_guard
  BEFORE INSERT OR UPDATE ON public.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.object_guard();

CREATE TRIGGER object360_history
  AFTER INSERT OR UPDATE ON public.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.object_history_write();

CREATE TRIGGER object360_replan
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.object_replanning_review();

CREATE POLICY "object_bindings_read" ON "public"."object_customer_bindings"
  FOR SELECT
  TO "authenticated"
  USING ((private.object_manage(tenant_id) OR (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "object360_read" ON "public"."object_documents"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_write" ON "public"."object_documents"
  FOR ALL
  TO "authenticated"
  USING (private.object_manage(tenant_id))
  WITH CHECK (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_history"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_instruction_receipts"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_nodes"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_write" ON "public"."object_nodes"
  FOR ALL
  TO "authenticated"
  USING (private.object_manage(tenant_id))
  WITH CHECK (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_records"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_write" ON "public"."object_records"
  FOR ALL
  TO "authenticated"
  USING (private.object_manage(tenant_id))
  WITH CHECK (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_request_proposals"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

CREATE POLICY "object360_read" ON "public"."object_visit_requests"
  FOR SELECT
  TO "authenticated"
  USING (private.object_manage(tenant_id));

REVOKE ALL ON FUNCTION "private"."object_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_history_write"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_history_write"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_instruction_notify"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_instruction_notify"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_manage"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_manage"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."object_notify"(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_notify"(uuid, uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_replanning_review"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_replanning_review"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_vault_context"(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_vault_context"(uuid, uuid, uuid, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_visit_access"(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_visit_access"(uuid, uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_object_proposal"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."acknowledge_object_instruction"(uuid, uuid, uuid, bigint) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."customer_object_visits"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."extend_object_access"(uuid, uuid, timestamp WITH time zone, text) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."object_vault_operation"(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."object_visit_context"(uuid, uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_object_visit_request"(uuid, uuid, bigint, text, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_object_visit_request"(uuid, uuid, uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_access_audit" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_access_extensions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_access_grants" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_notification_keys" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_otp_challenges" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_otp_key" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_secret_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_secret_scopes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_secret_versions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."object_vault_state" TO "postgres";

REVOKE ALL ON TABLE "public"."object_customer_bindings" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."object_customer_bindings" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_customer_bindings" TO "postgres";

REVOKE ALL ON TABLE "public"."object_customer_bindings" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_customer_bindings" TO "service_role";

REVOKE ALL ON TABLE "public"."object_documents" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."object_documents" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_documents" TO "postgres";

REVOKE ALL ON TABLE "public"."object_documents" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_documents" TO "service_role";

REVOKE ALL ON TABLE "public"."object_history" FROM "authenticated";

GRANT SELECT ON TABLE "public"."object_history" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_history" TO "postgres";

REVOKE ALL ON TABLE "public"."object_history" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_history" TO "service_role";

REVOKE ALL ON TABLE "public"."object_instruction_receipts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."object_instruction_receipts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_instruction_receipts" TO "postgres";

REVOKE ALL ON TABLE "public"."object_instruction_receipts" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_instruction_receipts" TO "service_role";

REVOKE ALL ON TABLE "public"."object_nodes" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."object_nodes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_nodes" TO "postgres";

REVOKE ALL ON TABLE "public"."object_nodes" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_nodes" TO "service_role";

REVOKE ALL ON TABLE "public"."object_records" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."object_records" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_records" TO "postgres";

REVOKE ALL ON TABLE "public"."object_records" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_records" TO "service_role";

REVOKE ALL ON TABLE "public"."object_request_proposals" FROM "authenticated";

GRANT SELECT ON TABLE "public"."object_request_proposals" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_request_proposals" TO "postgres";

REVOKE ALL ON TABLE "public"."object_request_proposals" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_request_proposals" TO "service_role";

REVOKE ALL ON TABLE "public"."object_visit_requests" FROM "authenticated";

GRANT SELECT ON TABLE "public"."object_visit_requests" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_visit_requests" TO "postgres";

REVOKE ALL ON TABLE "public"."object_visit_requests" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_visit_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."objects" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."objects" TO "authenticated";

ALTER TABLE "public"."object_customer_bindings"
  ADD CONSTRAINT "object_customer_bindings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

CREATE POLICY "object_bindings_manage" ON "public"."object_customer_bindings"
  FOR ALL
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role]))
  WITH CHECK ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role]) AND (created_by = auth.uid())));

ALTER TABLE "public"."object_documents"
  ADD CONSTRAINT "object_documents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_records"
  ADD CONSTRAINT "object_records_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_request_proposals"
  ADD CONSTRAINT "object_request_proposals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."object_visit_requests"
  ADD CONSTRAINT "object_visit_requests_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);

SET local check_function_bodies = off;

CREATE TABLE "public"."personnel_dossier_access" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "personnel_id"  uuid                     NOT NULL,
  "action"        text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "personnel_dossier_access_action_check" CHECK ((action = ANY (ARRAY['view'::text, 'download'::text]))),
  CONSTRAINT "personnel_dossier_access_pkey" PRIMARY KEY (id),
  "actor_user_id" uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."personnel_dossier_access"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."personnel_dossier_access"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."personnel_dossier_access" FROM "anon";

CREATE TABLE "public"."personnel_dossier_deliveries" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         uuid                     NOT NULL,
  "personnel_id"      uuid                     NOT NULL,
  "source_table"      text                     NOT NULL,
  "source_id"         uuid                     NOT NULL,
  "source_revision"   bigint                   NOT NULL,
  "recipient"         text                     NOT NULL,
  "recipient_user_id" uuid,
  "due_on"            date                     NOT NULL,
  "status"            text                     NOT NULL DEFAULT 'scheduled'::text,
  "attempts"          integer                  NOT NULL DEFAULT 0,
  "available_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at"           timestamp with time zone,
  "last_error"        text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "personnel_dossier_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "personnel_dossier_deliveries_status_check"
    CHECK ((status = ANY (ARRAY['scheduled'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'uncertain'::text]))),
  CONSTRAINT "personnel_dossier_deliveries_tenant_id_source_table_source__key" UNIQUE (tenant_id, source_table, source_id, source_revision, recipient, due_on)
);

ALTER TABLE "public"."personnel_dossier_deliveries"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."personnel_dossier_deliveries" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."personnel_dossier_deliveries" FROM "anon";

CREATE TABLE "public"."personnel_dossier_history" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "personnel_id"  uuid                     NOT NULL,
  "source_table"  text                     NOT NULL,
  "source_id"     uuid                     NOT NULL,
  "revision"      bigint                   NOT NULL,
  "snapshot"      jsonb                    NOT NULL,
  "actor_user_id" uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "personnel_dossier_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "personnel_dossier_history_source_table_source_id_revision_key" UNIQUE (source_table, source_id, revision)
);

ALTER TABLE "public"."personnel_dossier_history"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."personnel_dossier_history"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."personnel_dossier_history" FROM "anon";

CREATE TABLE "public"."personnel_dossier_items" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid                     NOT NULL,
  "personnel_id"     uuid                     NOT NULL,
  "kind"             text                     NOT NULL,
  "title"            text                     NOT NULL,
  "due_on"           date,
  "owner_user_id"    uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "dossier_data"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "dossier_revision" bigint                   NOT NULL DEFAULT 1,
  "dossier_status"   text                     NOT NULL DEFAULT 'draft'::text,
  "dossier_managed"  boolean                  NOT NULL DEFAULT false,
  "previous_id"      uuid,
  "updated_by"       uuid,
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "personnel_dossier_items_dossier_json_check" CHECK (((jsonb_typeof(dossier_data) = 'object'::text) AND (octet_length((dossier_data)::text) <= 40000))),
  CONSTRAINT "personnel_dossier_items_kind_check"
    CHECK ((kind = ANY (ARRAY['profile'::text, 'review'::text, 'asset'::text, 'absence'::text, 'task'::text, 'checklist'::text, 'vog'::text]))),
  CONSTRAINT "personnel_dossier_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "personnel_dossier_items_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "personnel_dossier_items_tenant_id_personnel_id_id_key" UNIQUE (tenant_id, personnel_id, id),
  CONSTRAINT "personnel_dossier_items_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))
);

ALTER TABLE "public"."personnel_dossier_items"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."personnel_dossier_items"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."personnel_dossier_items" FROM "anon";

CREATE TABLE "public"."qualification_requirements" (
  "id"               uuid    NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid    NOT NULL,
  "code"             text    NOT NULL,
  "scope"            text    NOT NULL,
  "subject_id"       uuid,
  "service_name"     text,
  "hard_requirement" boolean NOT NULL DEFAULT true,
  CONSTRAINT "qualification_requirements_pkey" PRIMARY KEY (id),
  CONSTRAINT "qualification_requirements_scope_check" CHECK ((scope = ANY (ARRAY['function'::text, 'customer'::text, 'object'::text, 'work_order'::text, 'service'::text]))),
  CONSTRAINT "qualification_requirements_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."qualification_requirements"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."qualification_requirements" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."qualification_requirements" FROM "anon";

CREATE TABLE "public"."qualification_types" (
  "id"            uuid      NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid      NOT NULL,
  "code"          text      NOT NULL,
  "name"          text      NOT NULL,
  "reminder_days" integer[] NOT NULL DEFAULT ARRAY[90,
  60,
  30,
  14,
  7               ],
  "active"        boolean   NOT NULL DEFAULT true,
  CONSTRAINT "qualification_types_code_check" CHECK (((code ~ '^[A-Z0-9][A-Z0-9_.-]{0,31}$'::text) AND (code <> 'VOG'::text))),
  CONSTRAINT "qualification_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "qualification_types_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "qualification_types_tenant_id_id_key" UNIQUE (tenant_id, id)
);

ALTER TABLE "public"."qualification_types"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."qualification_types" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."qualification_types" FROM "anon";

ALTER TABLE "public"."availability"
  ADD COLUMN "dossier_source_id" uuid;

ALTER TABLE "public"."certificates"
  ADD COLUMN "dossier_data" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."certificates"
  ADD COLUMN "dossier_revision" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."certificates"
  ADD COLUMN "dossier_status" text NOT NULL DEFAULT 'draft'::text;

ALTER TABLE "public"."certificates"
  ADD COLUMN "dossier_managed" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."certificates"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."certificates"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."certificates"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."certificates"
  ADD COLUMN "valid_from" date;

ALTER TABLE "public"."certificates"
  ADD COLUMN "verified_at" timestamp WITH time zone;

ALTER TABLE "public"."certificates"
  ADD COLUMN "verified_by" uuid;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "dossier_data" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "dossier_revision" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "dossier_status" text NOT NULL DEFAULT 'draft'::text;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "dossier_managed" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."personnel_contracts"
  ADD COLUMN "function_id" uuid;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "dossier_data" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "dossier_revision" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "dossier_status" text NOT NULL DEFAULT 'draft'::text;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "dossier_managed" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."personnel_documents"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "dossier_data" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "dossier_revision" bigint NOT NULL DEFAULT 1;

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "dossier_status" text NOT NULL DEFAULT 'draft'::text;

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "dossier_managed" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "previous_id" uuid;

ALTER TABLE "public"."personnel_notes"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."work_order_assignments"
  ADD COLUMN "qualification_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION private.assignment_qualification_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r record; snapshot jsonb:='[]';passed boolean;evidence uuid;evidence_revision bigint;
begin
 if tg_op='UPDATE' and (old.status in ('completed','returned','cancelled') or new.status in ('completed','returned','cancelled')
  or(new.personnel_id=old.personnel_id and new.work_order_id=old.work_order_id and new.projected_start_at=old.projected_start_at and new.projected_end_at=old.projected_end_at and new.status=old.status)) then new.qualification_snapshot:=old.qualification_snapshot;return new;end if;
 for r in select * from private.assignment_requirements(new.tenant_id,new.personnel_id,new.work_order_id,new.projected_start_at,new.projected_end_at) loop
  passed:=private.qualified_for_period(new.tenant_id,new.personnel_id,r.code,new.projected_start_at,new.projected_end_at);
  if r.hard_requirement and not passed then raise exception 'Vereiste kwalificatie % ontbreekt of is niet geldig voor de volledige uitvoering',r.code using errcode='23514';end if;
  select c.id,c.dossier_revision into evidence,evidence_revision from public.certificates c where c.tenant_id=new.tenant_id and c.personnel_id=new.personnel_id and c.code=r.code and c.dossier_status='approved'
   and(c.valid_from is null or c.valid_from<=(new.projected_start_at at time zone 'Europe/Amsterdam')::date) and(c.expires_on is null or c.expires_on>=((new.projected_end_at-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date) order by c.verified_at desc limit 1;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('code',r.code,'hard',r.hard_requirement,'verified',passed,'checked_at',now(),'starts_at',new.projected_start_at,'ends_at',new.projected_end_at,'evidence_id',evidence,'evidence_revision',evidence_revision));
 end loop;
 new.qualification_snapshot:=snapshot;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.assignment_requirements (
  t uuid,
  p uuid,
  w uuid,
  s timestamp with time zone,
  e timestamp with time zone
)
  RETURNS TABLE (
    code             text,
    hard_requirement boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 with functions as (
  select pf.function_id from public.personnel_functions pf where pf.tenant_id=t and pf.personnel_id=p
  union select c.function_id from public.personnel_contracts c where c.tenant_id=t and c.personnel_id=p and c.active and c.function_id is not null
   and c.starts_on<=((e-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date and (c.ends_on is null or c.ends_on>=(s at time zone 'Europe/Amsterdam')::date)
 ), requirements as (
  select q.code,q.hard_requirement from public.qualification_requirements q join public.work_orders wo on wo.id=w and wo.tenant_id=t where q.tenant_id=t
   and ((q.scope='customer' and q.subject_id=wo.customer_id) or(q.scope='object' and q.subject_id=wo.object_id) or(q.scope='work_order' and q.subject_id=w)
    or(q.scope='service' and q.service_name=wo.discipline) or(q.scope='function' and q.subject_id in(select function_id from functions)))
  union all select unnest(f.required_certificate_codes),true from public.function_catalog f where f.tenant_id=t and f.id in(select function_id from functions)
 ) select r.code,bool_or(r.hard_requirement) from requirements r group by r.code;
$function$;

CREATE OR REPLACE FUNCTION private.check_qualification_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare ok boolean; t text;
begin
 if new.scope='service' then
  if nullif(btrim(new.service_name),'') is null then raise exception 'Service is required' using errcode='23514'; end if;
 else
  t:=case new.scope when 'function' then 'function_catalog' when 'customer' then 'customers' when 'object' then 'objects' else 'work_orders' end;
  execute format('select exists(select 1 from public.%I where tenant_id=$1 and id=$2)',t) into ok using new.tenant_id,new.subject_id;
  if not ok then raise exception 'Requirement target not in tenant' using errcode='23514'; end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.dossier_access (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
 select auth.uid() is not null and private.has_role(t,array['tenant_admin','management','hr']::public.app_role[])
 and private.service_enabled(t,'personeel');
$function$;

CREATE OR REPLACE FUNCTION private.dossier_followup()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare payload jsonb:=new.dossier_data; deadline date; day_value text; reminder_recipient text; task_title text; item_kind text; owner_id uuid;
begin
 if not new.dossier_managed then return new; end if;
 owner_id:=nullif(payload->>'ownerId','')::uuid;
 if tg_table_name='personnel_dossier_items' then item_kind:=new.kind; end if;
 -- Canonical identity fields stay on personnel. No duplicate editable master data.
 if item_kind='profile' then
  update public.personnel set full_name=payload->>'name',employee_number=payload->>'employeeNumber',email=nullif(payload->>'email',''),phone=nullif(payload->>'phone',''),version=version+1,
   end_date=nullif(payload->>'lastDay','')::date,
   status=case when payload->>'employmentStatus' in ('former','archived') then 'former' else status end
  where tenant_id=new.tenant_id and id=new.personnel_id;
 end if;
 if item_kind='absence' then
  insert into public.availability(tenant_id,personnel_id,starts_at,ends_at,kind,note,approved_at,dossier_source_id)
  values(new.tenant_id,new.personnel_id,(payload->>'startsOn')::date::timestamp at time zone 'Europe/Amsterdam',
   ((coalesce(nullif(payload->>'endsOn','')::date,date '2099-12-30')+1)::timestamp at time zone 'Europe/Amsterdam'),'unavailable',null,now(),new.id)
  on conflict(dossier_source_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 end if;
 task_title:=nullif(payload->>'followupTitle','');
 if item_kind='asset' and new.dossier_status<>'returned' and nullif(payload->>'dueOn','') is not null then task_title:='Bedrijfsmiddel retourneren'; end if;
 if task_title is not null then
  insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,due_on,owner_user_id,dossier_managed,dossier_status,dossier_data)
  values(new.tenant_id,new.personnel_id,'task',task_title,nullif(payload->>'dueOn','')::date,owner_id,true,'open',jsonb_build_object('title',task_title,'dueOn',payload->>'dueOn','ownerId',owner_id,'relatedId',new.id,'generatedFrom',new.id,'priority','normal'))
  on conflict(tenant_id,personnel_id,(dossier_data->>'generatedFrom')) where kind='task' and dossier_data->>'generatedFrom' is not null
  do update set title=excluded.title,due_on=excluded.due_on,owner_user_id=excluded.owner_user_id,dossier_data=public.personnel_dossier_items.dossier_data||excluded.dossier_data;
 end if;
 if item_kind='asset' and new.dossier_status='returned' then
  update public.personnel_dossier_items set dossier_status='completed',dossier_data=dossier_data||jsonb_build_object('evidence','Retour geregistreerd op '||(payload->>'returnedOn'))
  where tenant_id=new.tenant_id and personnel_id=new.personnel_id and kind='task' and dossier_data->>'generatedFrom'=new.id::text;
 end if;
 update public.personnel_dossier_deliveries set status='cancelled' where source_table=tg_table_name and source_id=new.id and status in ('scheduled','failed');
 if new.dossier_status in ('draft','completed','ended','returned','recovered','archived','revoked','rejected') or item_kind in ('profile','task') and payload->>'generatedFrom' is not null then return new; end if;
 if tg_table_name='personnel_contracts' then
  if new.employment_type='fixed' and payload->>'noticePolicy'='applicable' and new.ends_on+1 >= (new.starts_on+interval '6 months')::date then deadline:=(new.ends_on-interval '1 month')::date;
  else deadline:=coalesce(new.review_on,new.ends_on); end if;
 elsif tg_table_name='certificates' then deadline:=new.expires_on;
 else deadline:=coalesce(nullif(payload->>'dueOn','')::date,case when item_kind='review' then nullif(payload->>'startsOn','')::date end); end if;
 if deadline is null then return new; end if;
 for reminder_recipient in select btrim(value) from regexp_split_to_table(coalesce(payload->>'reminderEmails',''),',') value where btrim(value)<>''
  union select 'user:'||owner_id::text where owner_id is not null
 loop
  for day_value in select btrim(value) from regexp_split_to_table(coalesce(nullif(payload->>'reminderDays',''),'0'),',') value where btrim(value)~'^\d{1,3}$' loop
   if deadline-day_value::integer < (now() at time zone 'Europe/Amsterdam')::date then continue; end if;
   if not exists(select 1 from public.personnel_dossier_deliveries d where d.source_table=tg_table_name and d.source_id=new.id and d.recipient=reminder_recipient and d.due_on=deadline-day_value::integer and d.status in ('sent','processing','uncertain')) then
    insert into public.personnel_dossier_deliveries(tenant_id,personnel_id,source_table,source_id,source_revision,recipient,recipient_user_id,due_on,available_at)
    values(new.tenant_id,new.personnel_id,tg_table_name,new.id,new.dossier_revision,reminder_recipient,case when starts_with(reminder_recipient,'user:') then owner_id end,deadline-day_value::integer,((deadline-day_value::integer)+time '09:00') at time zone 'Europe/Amsterdam')
    on conflict do nothing;
   end if;
  end loop;
 end loop;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.personnel_document_content_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if (new.title||' '||new.document_type||' '||coalesce(new.file_name,'')) ~* '(\mVOG\M|verklaring.omtrent.gedrag|medisch|diagnos|medicat|identiteits|paspoort|\mBSN\M)' then raise exception 'VOG, medical and identity documents are not allowed' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.qualified_for_period (
  t uuid,
  p uuid,
  c text,
  s timestamp with time zone,
  e timestamp with time zone
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select case when exists(select 1 from public.certificates b where b.tenant_id=t and b.personnel_id=p and b.code=c and b.dossier_managed)
 then exists(select 1 from public.certificates b where b.tenant_id=t and b.personnel_id=p and b.code=c and b.dossier_managed
  and b.dossier_status='approved' and (b.valid_from is null or b.valid_from <= (s at time zone 'Europe/Amsterdam')::date)
  and (b.expires_on is null or b.expires_on >= ((e-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date))
 else exists(select 1 from public.qualifications b where b.tenant_id=t and b.personnel_id=p and b.code=c and b.verified_at is not null
  and (b.issued_at is null or b.issued_at <= (s at time zone 'Europe/Amsterdam')::date)
  and (b.valid_until is null or b.valid_until >= ((e-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date)) end;
$function$;

CREATE OR REPLACE FUNCTION private.snapshot_dossier_record()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.dossier_managed then
  insert into public.personnel_dossier_history(tenant_id,personnel_id,source_table,source_id,revision,snapshot,actor_user_id)
  values(new.tenant_id,new.personnel_id,tg_table_name,new.id,new.dossier_revision,to_jsonb(new),auth.uid());
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.sync_certificate_qualification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare best public.certificates;
begin
 if not new.dossier_managed then return new;end if;
 select * into best from public.certificates c where c.tenant_id=new.tenant_id and c.personnel_id=new.personnel_id and c.code=new.code and c.dossier_managed and c.dossier_status='approved'
 order by (coalesce(c.valid_from,date '0001-01-01') <= (now() at time zone 'Europe/Amsterdam')::date) desc,c.expires_on desc nulls first limit 1;
 insert into public.qualifications(tenant_id,personnel_id,code,name,issued_at,valid_until,verified_at)
 values(new.tenant_id,new.personnel_id,new.code,coalesce(best.name,new.name),case when best.id is null then new.valid_from else best.valid_from end,case when best.id is null then new.expires_on else best.expires_on end,best.verified_at)
 on conflict(tenant_id,personnel_id,code) do update set name=excluded.name,issued_at=excluded.issued_at,valid_until=excluded.valid_until,verified_at=excluded.verified_at;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.track_dossier_record()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare previous_person uuid; doc uuid; key text;
begin
 if not new.dossier_managed then
  if tg_op='UPDATE' and old.dossier_managed then raise exception 'Dossier privacy cannot be removed' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is not null and not private.dossier_access(new.tenant_id) then raise exception 'Dossier access required' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if new.tenant_id<>old.tenant_id or new.personnel_id<>old.personnel_id then raise exception 'Dossier identity is immutable' using errcode='23514'; end if;
  new.dossier_revision:=old.dossier_revision+1;
  if not old.dossier_managed then
   insert into public.personnel_dossier_history(tenant_id,personnel_id,source_table,source_id,revision,snapshot,actor_user_id)
   values(old.tenant_id,old.personnel_id,tg_table_name,old.id,old.dossier_revision,to_jsonb(old),auth.uid()) on conflict do nothing;
  end if;
 else new.dossier_revision:=1; end if;
 new.updated_by:=auth.uid(); new.updated_at:=now();
 if new.previous_id is not null then
  execute format('select personnel_id from public.%I where tenant_id=$1 and id=$2',tg_table_name) into previous_person using new.tenant_id,new.previous_id;
  if previous_person is distinct from new.personnel_id or new.previous_id=new.id then raise exception 'Previous record belongs to another employee' using errcode='23514'; end if;
 end if;
 for key in select jsonb_array_elements_text(coalesce(new.dossier_data->'document_ids','[]')) loop
  doc:=key::uuid;
  if not exists(select 1 from public.personnel_documents d where d.id=doc and d.tenant_id=new.tenant_id and d.personnel_id=new.personnel_id and d.dossier_managed) then raise exception 'Document belongs to another dossier' using errcode='23514';end if;
 end loop;
 if tg_table_name='personnel_dossier_items' and tg_op='UPDATE' then
  if new.kind<>old.kind then raise exception 'Dossier category is immutable' using errcode='23514';end if;
  if old.dossier_data ? 'generatedFrom' then new.dossier_data:=new.dossier_data||jsonb_build_object('generatedFrom',old.dossier_data->>'generatedFrom');end if;
 end if;
 if tg_table_name='personnel_documents' then
  if new.visible_to_employee or new.document_type not in ('contract','addendum','certificate','review','training','instruction','asset','notice') then raise exception 'Private dossier document category required' using errcode='23514'; end if;
  if tg_op='UPDATE' and (new.storage_path<>old.storage_path or new.sha256 is distinct from old.sha256 or new.version<>old.version or new.previous_id is distinct from old.previous_id) then raise exception 'Upload a new document version' using errcode='23514';end if;
 end if;
 if tg_table_name='certificates' then
  if upper(new.code)='VOG' or new.storage_path is not null then raise exception 'Use a VOG control record, not a certificate file' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.dossier_managed and new.code<>old.code then raise exception 'Certificate type is immutable; create a new certificate' using errcode='23514';end if;
  if tg_op='INSERT' and new.dossier_status='approved' and auth.uid() is not null then raise exception 'Verification requires a separate review' using errcode='23514';end if;
  if tg_op='UPDATE' and old.dossier_status='approved' and new.dossier_status='approved'
   and (new.valid_from is distinct from old.valid_from or new.expires_on is distinct from old.expires_on or new.dossier_data->'document_ids' is distinct from old.dossier_data->'document_ids')
  then new.dossier_status:='review';new.verified_at:=null;new.verified_by:=null;end if;
  if new.dossier_status='approved' and (tg_op='INSERT' or old.dossier_status is distinct from new.dossier_status) then
   new.verified_at:=case when auth.uid() is null then coalesce(new.verified_at,now()) else now() end;new.verified_by:=auth.uid();
  elsif tg_op='UPDATE' and new.dossier_status='approved' then new.verified_at:=old.verified_at;new.verified_by:=old.verified_by;end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_personnel_dossier_deliveries (
  batch_size integer DEFAULT 25
)
  RETURNS SETOF public.personnel_dossier_deliveries
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
 update public.personnel_dossier_deliveries d set status='processing',attempts=attempts+1,available_at=now()
 where d.id in (select c.id from public.personnel_dossier_deliveries c where c.status in ('scheduled','failed') and c.attempts<5 and c.available_at<=now()
 order by c.available_at limit least(greatest(batch_size,1),100) for update skip locked) returning d.*;
$function$;

REVOKE ALL ON FUNCTION "public"."claim_personnel_dossier_deliveries"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.personnel_dossier_owners (
  target_tenant uuid
)
  RETURNS TABLE (
    id    uuid,
    label text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.dossier_access(target_tenant) then raise exception 'Access denied' using errcode='42501';end if;
 return query select m.user_id,coalesce(p.full_name,u.email,'Bevoegde beheerder') from public.tenant_memberships m
 join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
 where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','hr']::public.app_role[] order by coalesce(p.full_name,u.email);
end $function$;

REVOKE ALL ON FUNCTION "public"."personnel_dossier_owners"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.personnel_dossier_summary (
  target_tenant uuid
)
  RETURNS TABLE (
    personnel_id          uuid,
    employment_status     text,
    function_id           uuid,
    team                  text,
    ends_on               date,
    open_actions          bigint,
    certificate_attention boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.dossier_access(target_tenant) then return;end if;
 return query select p.id,coalesce(profile.dossier_data->>'employmentStatus',case when p.status='former' then 'former' when p.status='invited' then 'preparation' else 'active' end),c.function_id,coalesce(c.dossier_data->>'team',''),c.ends_on,
  (select count(*) from public.personnel_dossier_items i where i.tenant_id=target_tenant and i.personnel_id=p.id and i.kind in('task','checklist') and i.dossier_status<>'completed'),
  exists(select 1 from public.certificates cert where cert.tenant_id=target_tenant and cert.personnel_id=p.id and cert.dossier_managed and(cert.dossier_status in('unverified','review','revoked','rejected') or cert.expires_on<=((now() at time zone 'Europe/Amsterdam')::date+30)))
   or exists(select 1 from public.function_catalog f cross join lateral unnest(f.required_certificate_codes) code where f.tenant_id=target_tenant
    and(f.id=c.function_id or exists(select 1 from public.personnel_functions pf where pf.tenant_id=target_tenant and pf.personnel_id=p.id and pf.function_id=f.id))
    and not private.qualified_for_period(target_tenant,p.id,code,now(),now()+interval '1 microsecond'))
 from public.personnel p left join public.personnel_dossier_items profile on profile.tenant_id=target_tenant and profile.personnel_id=p.id and profile.kind='profile'
 left join lateral(select pc.* from public.personnel_contracts pc where pc.tenant_id=target_tenant and pc.personnel_id=p.id and pc.active and pc.starts_on<=(now() at time zone 'Europe/Amsterdam')::date and(pc.ends_on is null or pc.ends_on>=(now() at time zone 'Europe/Amsterdam')::date) order by pc.starts_on desc limit 1)c on true where p.tenant_id=target_tenant;
end $function$;

REVOKE ALL ON FUNCTION "public"."personnel_dossier_summary"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.personnel_qualification_gaps (
  target_tenant uuid
)
  RETURNS TABLE (
    assignment_id    uuid,
    personnel_id     uuid,
    code             text,
    hard_requirement boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.has_role(target_tenant,array['tenant_admin','management','hr','planner']::public.app_role[]) then raise exception 'Access denied' using errcode='42501';end if;
 return query select a.id,a.personnel_id,r.code,r.hard_requirement from public.work_order_assignments a
 cross join lateral private.assignment_requirements(a.tenant_id,a.personnel_id,a.work_order_id,a.projected_start_at,a.projected_end_at) r
 where a.tenant_id=target_tenant and a.projected_end_at>now() and a.status not in ('completed','returned','cancelled')
 and not private.qualified_for_period(a.tenant_id,a.personnel_id,r.code,a.projected_start_at,a.projected_end_at);
end $function$;

REVOKE ALL ON FUNCTION "public"."personnel_qualification_gaps"(uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.prepare_personnel_checklist (
  target_tenant    uuid,
  target_personnel uuid,
  checklist_type   text
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare title text;due_date date;count_added integer:=0;affected integer;contract_type text;
begin
 if not private.dossier_access(target_tenant) or checklist_type not in ('onboarding','offboarding') or not exists(select 1 from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel) then raise exception 'Access denied' using errcode='42501';end if;
 if checklist_type='offboarding' then select p.end_date into due_date from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;
 else select p.start_date into due_date from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;end if;
 select c.employment_type into contract_type from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel and c.active order by c.starts_on desc limit 1;
 for title in select unnest(case when checklist_type='onboarding' then array[
  case when contract_type='hire' then 'Inhuurovereenkomst controleren' else 'Overeenkomst en noodzakelijk bewijs controleren' end,
  'Contactgegevens controleren','Werkgerelateerde kwalificaties controleren','Introductie en toepasselijke veiligheidsinstructies bevestigen','Noodzakelijke middelen uitgeven','Bestaande portaaluitnodiging controleren']
 else array['Laatste werkdag en overdracht afstemmen','Openstaande afspraken afhandelen','Uitgegeven middelen retourneren','Accounttoegang via het bestaande proces afsluiten','Archivering en toepasselijk bewaarbeleid beoordelen'] end)
 loop
  insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,owner_user_id,due_on,dossier_managed,dossier_status,dossier_data)
  values(target_tenant,target_personnel,'checklist',title,auth.uid(),due_date,true,'open',jsonb_build_object('title',title,'checklistType',checklist_type,'templateKey',checklist_type||':'||title,'ownerId',auth.uid(),'dueOn',due_date,'reminderDays','0')) on conflict do nothing;
  get diagnostics affected=row_count;count_added:=count_added+affected;
 end loop;
 if checklist_type='offboarding' and due_date is not null then
  update public.personnel_dossier_items set dossier_data=dossier_data||jsonb_build_object('dueOn',due_date,'ownerId',auth.uid()),due_on=due_date
  where tenant_id=target_tenant and personnel_id=target_personnel and kind='asset' and dossier_status<>'returned' and due_on is null;
 end if;
 return count_added;
end $function$;

REVOKE ALL ON FUNCTION "public"."prepare_personnel_checklist"(uuid, uuid, text) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "public"."availability"
  ADD CONSTRAINT "availability_dossier_source_id_key" UNIQUE (dossier_source_id);

ALTER TABLE "public"."certificates"
  ADD CONSTRAINT "certificates_dossier_json_check" CHECK (((jsonb_typeof(dossier_data) = 'object'::text) AND (octet_length((dossier_data)::text) <= 40000)));

ALTER TABLE "public"."certificates"
  ADD CONSTRAINT "certificates_dossier_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.certificates(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_contracts"
  ADD CONSTRAINT "contract_function_fk" FOREIGN KEY (tenant_id, function_id) REFERENCES public.function_catalog(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_contracts"
  ADD CONSTRAINT "personnel_contracts_dossier_json_check" CHECK (((jsonb_typeof(dossier_data) = 'object'::text) AND (octet_length((dossier_data)::text) <= 40000)));

ALTER TABLE "public"."personnel_contracts"
  ADD CONSTRAINT "personnel_contracts_dossier_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.personnel_contracts(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_documents"
  ADD CONSTRAINT "personnel_documents_dossier_json_check" CHECK (((jsonb_typeof(dossier_data) = 'object'::text) AND (octet_length((dossier_data)::text) <= 40000)));

ALTER TABLE "public"."personnel_documents"
  ADD CONSTRAINT "personnel_documents_dossier_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.personnel_documents(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_access"
  ADD CONSTRAINT "personnel_dossier_access_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_deliveries"
  ADD CONSTRAINT "personnel_dossier_deliveries_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_history"
  ADD CONSTRAINT "personnel_dossier_history_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."availability"
  ADD CONSTRAINT "availability_dossier_source_id_fkey" FOREIGN KEY (dossier_source_id) REFERENCES public.personnel_dossier_items(id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_items"
  ADD CONSTRAINT "personnel_dossier_items_dossier_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.personnel_dossier_items(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_items"
  ADD CONSTRAINT "personnel_dossier_items_tenant_id_owner_user_id_fkey" FOREIGN KEY (tenant_id, owner_user_id) REFERENCES public.tenant_memberships(tenant_id, user_id)
    ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_dossier_items"
  ADD CONSTRAINT "personnel_dossier_items_tenant_id_personnel_id_fkey" FOREIGN KEY (tenant_id, personnel_id) REFERENCES public.personnel(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."personnel_notes"
  ADD CONSTRAINT "personnel_notes_dossier_json_check" CHECK (((jsonb_typeof(dossier_data) = 'object'::text) AND (octet_length((dossier_data)::text) <= 40000)));

ALTER TABLE "public"."personnel_notes"
  ADD CONSTRAINT "personnel_notes_dossier_previous_fk" FOREIGN KEY (tenant_id, previous_id) REFERENCES public.personnel_notes(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."qualification_requirements"
  ADD CONSTRAINT "qualification_requirements_tenant_id_code_fkey" FOREIGN KEY (tenant_id, code) REFERENCES public.qualification_types(tenant_id, code);

ALTER TABLE "public"."qualification_types"
  ADD CONSTRAINT "qualification_types_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

CREATE INDEX certificates_previous_idx ON public.certificates USING btree (tenant_id, previous_id);

CREATE INDEX contract_function_idx ON public.personnel_contracts USING btree (tenant_id, function_id);

CREATE INDEX dossier_access_person_idx ON public.personnel_dossier_access USING btree (tenant_id, personnel_id, created_at DESC);

CREATE UNIQUE INDEX dossier_checklist_template ON public.personnel_dossier_items USING btree (tenant_id, personnel_id, ((dossier_data ->> 'templateKey'::text)))
  WHERE ((kind = 'checklist'::text) AND ((dossier_data ->> 'templateKey'::text) IS NOT NULL));

CREATE INDEX dossier_delivery_due_idx ON public.personnel_dossier_deliveries USING btree (status, due_on, available_at);

CREATE INDEX dossier_delivery_person_idx ON public.personnel_dossier_deliveries USING btree (tenant_id, personnel_id);

CREATE UNIQUE INDEX dossier_generated_task ON public.personnel_dossier_items USING btree (tenant_id, personnel_id, ((dossier_data ->> 'generatedFrom'::text)))
  WHERE ((kind = 'task'::text) AND ((dossier_data ->> 'generatedFrom'::text) IS NOT NULL));

CREATE INDEX dossier_history_person_idx ON public.personnel_dossier_history USING btree (tenant_id, personnel_id, created_at DESC);

CREATE INDEX dossier_items_due_idx ON public.personnel_dossier_items USING btree (tenant_id, due_on)
  WHERE (due_on IS NOT NULL);

CREATE INDEX dossier_items_owner_idx ON public.personnel_dossier_items USING btree (tenant_id, owner_user_id);

CREATE INDEX dossier_items_person_idx ON public.personnel_dossier_items USING btree (tenant_id, personnel_id, kind);

CREATE UNIQUE INDEX dossier_one_profile ON public.personnel_dossier_items USING btree (tenant_id, personnel_id)
  WHERE (kind = 'profile'::text);

CREATE INDEX personnel_contracts_previous_idx ON public.personnel_contracts USING btree (tenant_id, previous_id);

CREATE INDEX personnel_documents_previous_idx ON public.personnel_documents USING btree (tenant_id, previous_id);

CREATE INDEX personnel_dossier_items_previous_idx ON public.personnel_dossier_items USING btree (tenant_id, previous_id);

CREATE INDEX personnel_notes_previous_idx ON public.personnel_notes USING btree (tenant_id, previous_id);

CREATE INDEX requirement_code_idx ON public.qualification_requirements USING btree (tenant_id, code);

CREATE INDEX requirement_scope_idx ON public.qualification_requirements USING btree (tenant_id, scope, subject_id);

CREATE TRIGGER certificate_operational_projection
  AFTER INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_certificate_qualification();

CREATE TRIGGER dossier_followup
  AFTER INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION private.dossier_followup();

CREATE TRIGGER dossier_guard
  BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION private.track_dossier_record();

CREATE TRIGGER dossier_history
  AFTER INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_dossier_record();

CREATE TRIGGER dossier_followup
  AFTER INSERT OR UPDATE ON public.personnel_contracts
  FOR EACH ROW
  EXECUTE FUNCTION private.dossier_followup();

CREATE TRIGGER dossier_guard
  BEFORE INSERT OR UPDATE ON public.personnel_contracts
  FOR EACH ROW
  EXECUTE FUNCTION private.track_dossier_record();

CREATE TRIGGER dossier_history
  AFTER INSERT OR UPDATE ON public.personnel_contracts
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_dossier_record();

CREATE TRIGGER dossier_guard
  BEFORE INSERT OR UPDATE ON public.personnel_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.track_dossier_record();

CREATE TRIGGER dossier_history
  AFTER INSERT OR UPDATE ON public.personnel_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_dossier_record();

CREATE TRIGGER personnel_document_content_guard
  BEFORE INSERT OR UPDATE ON public.personnel_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.personnel_document_content_guard();

CREATE TRIGGER dossier_followup
  AFTER INSERT OR UPDATE ON public.personnel_dossier_items
  FOR EACH ROW
  EXECUTE FUNCTION private.dossier_followup();

CREATE TRIGGER dossier_guard
  BEFORE INSERT OR UPDATE ON public.personnel_dossier_items
  FOR EACH ROW
  EXECUTE FUNCTION private.track_dossier_record();

CREATE TRIGGER dossier_history
  AFTER INSERT OR UPDATE ON public.personnel_dossier_items
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_dossier_record();

CREATE TRIGGER dossier_followup
  AFTER INSERT OR UPDATE ON public.personnel_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.dossier_followup();

CREATE TRIGGER dossier_guard
  BEFORE INSERT OR UPDATE ON public.personnel_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.track_dossier_record();

CREATE TRIGGER dossier_history
  AFTER INSERT OR UPDATE ON public.personnel_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.snapshot_dossier_record();

CREATE TRIGGER requirement_scope
  BEFORE INSERT OR UPDATE ON public.qualification_requirements
  FOR EACH ROW
  EXECUTE FUNCTION private.check_qualification_scope();

CREATE TRIGGER assignment_qualification_guard
  BEFORE INSERT OR UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.assignment_qualification_guard();

CREATE POLICY "certificates_dossier_privacy" ON "public"."certificates"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((NOT dossier_managed) OR private.dossier_access(tenant_id)))
  WITH CHECK (((NOT dossier_managed) OR private.dossier_access(tenant_id)));

CREATE POLICY "dossier_preserve_history" ON "public"."certificates"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT dossier_managed));

CREATE POLICY "dossier_preserve_history" ON "public"."personnel_contracts"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT dossier_managed));

CREATE POLICY "personnel_contracts_dossier_privacy" ON "public"."personnel_contracts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((NOT dossier_managed) OR private.dossier_access(tenant_id)))
  WITH CHECK (((NOT dossier_managed) OR private.dossier_access(tenant_id)));

CREATE POLICY "dossier_preserve_history" ON "public"."personnel_documents"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT dossier_managed));

CREATE POLICY "personnel_documents_dossier_privacy" ON "public"."personnel_documents"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((NOT dossier_managed) OR private.dossier_access(tenant_id)))
  WITH CHECK (((NOT dossier_managed) OR private.dossier_access(tenant_id)));

CREATE POLICY "dossier_read" ON "public"."personnel_dossier_access"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "dossier_delivery_read" ON "public"."personnel_dossier_deliveries"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "dossier_read" ON "public"."personnel_dossier_history"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "dossier_items_write" ON "public"."personnel_dossier_items"
  FOR ALL
  TO "authenticated"
  USING (private.dossier_access(tenant_id))
  WITH CHECK (private.dossier_access(tenant_id));

CREATE POLICY "dossier_preserve_history" ON "public"."personnel_dossier_items"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT dossier_managed));

CREATE POLICY "dossier_read" ON "public"."personnel_dossier_items"
  FOR SELECT
  TO "authenticated"
  USING (private.dossier_access(tenant_id));

CREATE POLICY "personnel_dossier_items_dossier_privacy" ON "public"."personnel_dossier_items"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((NOT dossier_managed) OR private.dossier_access(tenant_id)))
  WITH CHECK (((NOT dossier_managed) OR private.dossier_access(tenant_id)));

CREATE POLICY "dossier_preserve_history" ON "public"."personnel_notes"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING ((NOT dossier_managed));

CREATE POLICY "personnel_notes_dossier_privacy" ON "public"."personnel_notes"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((NOT dossier_managed) OR private.dossier_access(tenant_id)))
  WITH CHECK (((NOT dossier_managed) OR private.dossier_access(tenant_id)));

CREATE POLICY "catalog_read" ON "public"."qualification_requirements"
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'hr'::public.app_role, 'planner'::public.app_role]));

CREATE POLICY "catalog_write" ON "public"."qualification_requirements"
  FOR ALL
  TO "authenticated"
  USING (private.dossier_access(tenant_id))
  WITH CHECK (private.dossier_access(tenant_id));

CREATE POLICY "catalog_read" ON "public"."qualification_types"
  FOR SELECT
  TO "authenticated"
  USING (private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'hr'::public.app_role, 'planner'::public.app_role]));

CREATE POLICY "catalog_write" ON "public"."qualification_types"
  FOR ALL
  TO "authenticated"
  USING (private.dossier_access(tenant_id))
  WITH CHECK (private.dossier_access(tenant_id));

CREATE POLICY "dossier_storage_immutable" ON "storage"."objects"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (((bucket_id <> 'personnel-documents'::text) OR (NOT (EXISTS ( SELECT 1
   FROM public.personnel_documents d
  WHERE (d.storage_path = objects.name))))))
  WITH CHECK (true);

CREATE POLICY "dossier_storage_keep_history" ON "storage"."objects"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id <> 'personnel-documents'::text) OR (NOT (EXISTS ( SELECT 1
   FROM public.personnel_documents d
  WHERE (d.storage_path = objects.name))))));

CREATE POLICY "dossier_storage_privacy" ON "storage"."objects"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (((bucket_id <> 'personnel-documents'::text) OR (NOT (EXISTS ( SELECT 1
   FROM public.personnel_documents d
  WHERE ((d.storage_path = objects.name) AND d.dossier_managed)))) OR private.dossier_access(private.storage_tenant_id(name))))
  WITH CHECK (((bucket_id <> 'personnel-documents'::text) OR private.dossier_access(private.storage_tenant_id(name))));

REVOKE ALL ON FUNCTION "private"."assignment_qualification_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assignment_qualification_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."assignment_requirements"(uuid, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assignment_requirements"(uuid, uuid, uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "private"."check_qualification_scope"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."check_qualification_scope"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."dossier_access"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."dossier_access"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "private"."dossier_followup"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."dossier_followup"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."personnel_document_content_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."personnel_document_content_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."qualified_for_period"(uuid, uuid, text, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."qualified_for_period"(uuid, uuid, text, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "private"."snapshot_dossier_record"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."snapshot_dossier_record"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."sync_certificate_qualification"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."sync_certificate_qualification"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."track_dossier_record"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."track_dossier_record"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_personnel_dossier_deliveries"(integer) TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."personnel_dossier_owners"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."personnel_dossier_summary"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."personnel_qualification_gaps"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."prepare_personnel_checklist"(uuid, uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON TABLE "public"."personnel_dossier_access" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."personnel_dossier_access" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personnel_dossier_access" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."personnel_dossier_deliveries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."personnel_dossier_deliveries" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personnel_dossier_deliveries" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."personnel_dossier_history" FROM "authenticated";

GRANT SELECT ON TABLE "public"."personnel_dossier_history" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personnel_dossier_history" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."personnel_dossier_items" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."personnel_dossier_items" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."personnel_dossier_items" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."qualification_requirements" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."qualification_requirements" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."qualification_requirements" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."qualification_types" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."qualification_types" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."qualification_types" TO "postgres", "service_role";

CREATE POLICY "dossier_access_log" ON "public"."personnel_dossier_access"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((private.dossier_access(tenant_id) AND (actor_user_id = auth.uid())));

-- Avoid repeated authorization evaluation and duplicate permissive SELECT policies.
alter policy dossier_access_log on public.personnel_dossier_access with check(private.dossier_access(tenant_id) and actor_user_id=(select auth.uid()));
drop policy dossier_items_write on public.personnel_dossier_items;
create policy dossier_items_insert on public.personnel_dossier_items for insert to authenticated with check(private.dossier_access(tenant_id));
create policy dossier_items_update on public.personnel_dossier_items for update to authenticated using(private.dossier_access(tenant_id)) with check(private.dossier_access(tenant_id));
drop policy catalog_write on public.qualification_types;
drop policy catalog_write on public.qualification_requirements;
create policy catalog_insert on public.qualification_types for insert to authenticated with check(private.dossier_access(tenant_id));
create policy catalog_update on public.qualification_types for update to authenticated using(private.dossier_access(tenant_id)) with check(private.dossier_access(tenant_id));
create policy catalog_insert on public.qualification_requirements for insert to authenticated with check(private.dossier_access(tenant_id));
create policy catalog_update on public.qualification_requirements for update to authenticated using(private.dossier_access(tenant_id)) with check(private.dossier_access(tenant_id));

-- Data migration: preserve existing verified qualifications and identifiers.
-- No demonstration data, new approvals or deletion of existing records.
INSERT INTO public.qualification_types(tenant_id,code,name)
SELECT tenant_id,code,min(name) FROM (
 SELECT tenant_id,code,name FROM public.qualifications
 UNION ALL SELECT tenant_id,code,name FROM public.certificates
) existing WHERE code ~ '^[A-Z0-9][A-Z0-9_.-]{0,31}$' AND code<>'VOG'
GROUP BY tenant_id,code ON CONFLICT(tenant_id,code) DO NOTHING;

INSERT INTO public.certificates(id,tenant_id,personnel_id,code,name,issued_on,valid_from,expires_on,verified_at,dossier_managed,dossier_status,dossier_data)
SELECT q.id,q.tenant_id,q.personnel_id,q.code,q.name,q.issued_at,q.issued_at,q.valid_until,q.verified_at,true,
 CASE WHEN q.verified_at IS NULL THEN 'unverified' ELSE 'approved' END,
 jsonb_build_object('verificationNote',CASE WHEN q.verified_at IS NULL THEN 'Bestaande ongecontroleerde registratie' ELSE 'Bestaande verificatie behouden bij introductie dossier' END)
FROM public.qualifications q WHERE upper(q.code)<>'VOG' AND NOT EXISTS(
 SELECT 1 FROM public.certificates c WHERE c.id=q.id OR(c.tenant_id=q.tenant_id AND c.personnel_id=q.personnel_id AND c.code=q.code)
) ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

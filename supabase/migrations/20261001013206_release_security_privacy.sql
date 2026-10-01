-- Generated with `supabase db pull release_security_privacy --local --yes`.
-- Scope-reviewed against the verified query-first sources below. The independent
-- authorization-roles prototype is intentionally NOT part of this release.
-- Keep data initialization and publication/Storage policy changes: a schema-only
-- diff omits those. Existing records and original signed reports stay intact.

begin;

-- Source: scripts/sql/email-centre.sql
-- Query-first mail centre. Capture in a CLI-created migration after verification.
create table if not exists private.email_settings (
 scope_key text primary key, tenant_id uuid references public.tenants(id),
 owner text not null check(owner in ('platform','tenant')),
 stopped boolean not null default false, marketing_enabled boolean not null default false,
 disabled_categories text[] not null default '{}', disabled_types text[] not null default '{}',
 approval_required boolean not null default false, reply_to text,
 campaign_minute_limit integer not null default 20 check(campaign_minute_limit between 1 and 100),
 revision bigint not null default 1, updated_by uuid, updated_at timestamptz not null default clock_timestamp(),
 check(disabled_categories<@array['service','internal','marketing','security']::text[]),
 check(scope_key=case when tenant_id is null then 'platform' else owner||':'||tenant_id::text end),
 check(owner='platform' or tenant_id is not null)
);
insert into private.email_settings(scope_key,owner) values('platform','platform') on conflict do nothing;
create table if not exists private.email_consents (
 id uuid primary key default gen_random_uuid(), owner_key text not null, tenant_id uuid references public.tenants(id),
 recipient_hash text not null, category text not null default 'marketing' check(category in ('marketing','internal')),
 basis text not null check(basis in ('consent','existing_customer')), evidence text not null check(length(btrim(evidence)) between 10 and 2000),
 received_at timestamptz not null, expires_at timestamptz, revoked_at timestamptz, actor_id uuid,
 created_at timestamptz not null default clock_timestamp(), check(owner_key=coalesce(tenant_id::text,'platform')),
 unique(owner_key,recipient_hash,category), check(expires_at is null or expires_at>received_at)
);
create table if not exists private.email_suppressions (
 owner_key text not null, recipient_hash text not null, category text not null,
 reason text not null check(reason in ('unsubscribe','bounce','spam','provider_block')),
 created_at timestamptz not null default clock_timestamp(), primary key(owner_key,recipient_hash,category)
);
create table if not exists private.email_transports (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
 delivery_key text not null unique, recipient_hash text not null, type_code text not null,
 purpose text not null check(purpose in ('service','internal','marketing','security')), preference_owner text not null,
 source_kind text not null, source_id uuid, subject_label text not null default '',
 state text not null check(state in ('admitted','accepted','delivered','deferred','blocked','bounced','failed','uncertain','cancelled')),
 attempt_id uuid, attempts integer not null default 0, lease_until timestamptz, provider_id text,
 reason text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index if not exists email_transports_tenant_created on private.email_transports(tenant_id,created_at desc,id);
create index if not exists email_transports_provider on private.email_transports(provider_id) where provider_id is not null;
create table if not exists private.email_attempts (
 id uuid primary key, transport_id uuid not null references private.email_transports(id),
 state text not null, started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 unique(transport_id,id)
);
create table if not exists private.email_provider_events (
 event_id text primary key, transport_id uuid not null references private.email_transports(id),
 event text not null, event_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 provider_id text not null
);
create index if not exists email_events_transport on private.email_provider_events(transport_id,event_at);
create table if not exists private.email_hook_receipts (
 id text primary key, payload_hash text not null, state text not null check(state in ('processing','done','failed','uncertain','blocked')),
 created_at timestamptz not null default clock_timestamp(), finished_at timestamptz
);
create table if not exists private.email_audit (
 id uuid primary key default gen_random_uuid(),tenant_id uuid,actor_id uuid, action text not null,resource_id uuid,
 detail jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create or replace function private.email_hash(address text) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(lower(btrim(address)),'sha256'),'hex')
$$;
create or replace function private.email_policy(t uuid,code text,purpose text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.email_settings;
begin
 if purpose not in ('service','internal','marketing','security') or code is null then return '{"allowed":false,"reason":"invalid_type"}';end if;
 if t is not null and not exists(select 1 from public.tenants where id=t and status='active') then return '{"allowed":false,"reason":"tenant_inactive"}';end if;
 for s in select * from private.email_settings where scope_key='platform' or tenant_id=t order by (scope_key='platform') desc,owner loop
  if s.stopped then return jsonb_build_object('allowed',false,'reason','email_emergency_stop','owner',s.owner);end if;
  if purpose=any(s.disabled_categories) or code=any(s.disabled_types) then return jsonb_build_object('allowed',false,'reason','email_rule_off','owner',s.owner);end if;
  if purpose='marketing' and not s.marketing_enabled then return jsonb_build_object('allowed',false,'reason','marketing_not_enabled','owner',s.owner);end if;
 end loop;
 return '{"allowed":true,"reason":"allowed"}';
end$$;
create or replace function private.email_recipient_allowed(owner_key text,address_hash text,purpose text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.email_suppressions s where s.recipient_hash=address_hash and (s.owner_key='provider' or s.owner_key=email_recipient_allowed.owner_key and s.category in ('all',purpose)))
 and (purpose<>'marketing' or exists(select 1 from private.email_consents c where c.owner_key=email_recipient_allowed.owner_key and c.recipient_hash=address_hash and c.category='marketing' and c.revoked_at is null and c.received_at<=now() and(c.expires_at is null or c.expires_at>now())))
$$;

-- A separate hard mail boundary: unlike ordinary notification preferences this
-- deliberately includes authentication, OTPs and invitation activation.
create or replace function public.email_transport(operation text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.email_transports;policy jsonb;target uuid:=(input->>'tenant_id')::uuid;key text:=input->>'delivery_key';hash text:=private.email_hash(input->>'recipient');purpose text:=input->>'purpose';owner_key text:=coalesce(input->>'preference_owner',coalesce(target::text,'platform'));aid uuid;outcome text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or length(input::text)>12000 then raise exception 'Invalid mail input' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-email-policy',0));
 if operation='begin' then
  if key is null or length(key) not between 1 and 500 or hash is null or coalesce(input->>'recipient','')!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or coalesce(input->>'type_code','')!~'^[a-z0-9_.-]{1,160}$' or purpose is null or purpose not in ('service','internal','marketing','security') or owner_key not in ('platform',coalesce(target::text,'platform')) then raise exception 'Invalid mail identity' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-email:'||key,0));
  select * into t from private.email_transports where delivery_key=key for update;
  if found then
   if t.tenant_id is distinct from target or t.recipient_hash<>hash or t.type_code<>input->>'type_code' or t.purpose<>purpose or t.preference_owner<>owner_key then raise exception 'Mail identity changed' using errcode='23514';end if;
   if t.state='admitted' and t.lease_until<now() then update private.email_transports set state='uncertain',reason='interrupted_send',updated_at=clock_timestamp() where id=t.id;update private.email_attempts set state='uncertain',finished_at=clock_timestamp() where id=t.attempt_id;end if;
   if t.state<>'failed' or t.attempts>=5 then return jsonb_build_object('allowed',false,'reason','existing_'||t.state,'id',t.id);end if;
  end if;
  policy:=private.email_policy(target,input->>'type_code',purpose);
  if coalesce((policy->>'allowed')::boolean,false) and not private.email_recipient_allowed(owner_key,hash,purpose) then policy:='{"allowed":false,"reason":"recipient_suppressed_or_no_consent"}';end if;
  aid:=gen_random_uuid();
  if t.id is null then
   insert into private.email_transports(tenant_id,delivery_key,recipient_hash,type_code,purpose,preference_owner,source_kind,source_id,subject_label,state)
   values(target,key,hash,input->>'type_code',purpose,owner_key,coalesce(input->>'source_kind','security'),(input->>'source_id')::uuid,case when purpose='security' then 'Accountbeveiliging' else left(coalesce(input->>'subject_label',''),180) end,'blocked') returning * into t;
  end if;
  if not coalesce((policy->>'allowed')::boolean,false) then update private.email_transports set state='blocked',reason=policy->>'reason',updated_at=clock_timestamp() where id=t.id;return policy||jsonb_build_object('id',t.id);end if;
  update private.email_transports set state='admitted',attempt_id=aid,attempts=attempts+1,lease_until=now()+interval '90 seconds',reason=null,updated_at=clock_timestamp() where id=t.id;
  insert into private.email_attempts(id,transport_id,state) values(aid,t.id,'admitted');
  return jsonb_build_object('allowed',true,'id',t.id,'attempt_id',aid);
 elsif operation='finish' then
  select * into t from private.email_transports where id=(input->>'id')::uuid for update;
  if not found or t.state<>'admitted' or t.attempt_id is distinct from (input->>'attempt_id')::uuid then return '{"ok":false}';end if;
  outcome:=input->>'outcome';if outcome not in ('accepted','failed','uncertain') or outcome is null then raise exception 'Invalid outcome' using errcode='23514';end if;
  update private.email_transports set state=outcome,provider_id=left(input->>'provider_id',500),lease_until=null,updated_at=clock_timestamp() where id=t.id;
  update private.email_attempts set state=outcome,finished_at=clock_timestamp() where id=t.attempt_id;
  return '{"ok":true}';
 end if;
 raise exception 'Unknown operation' using errcode='23514';
end$$;

-- Provider data cannot choose tenant scope. The opaque transport ID, recipient
-- hash and provider message identity must all refer to the existing attempt.
create or replace function public.email_provider_event(input jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare t private.email_transports;e text:=input->>'event';pid text:=input->>'provider_id';event_id text:=input->>'event_id';at_time timestamptz:=to_timestamp((input->>'timestamp')::double precision);next_state text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if e is null or e not in ('processed','delivered','deferred','bounce','dropped','spamreport','unsubscribe','group_unsubscribe','group_resubscribe') or length(coalesce(event_id,'')) not between 1 and 500 or length(coalesce(pid,'')) not between 1 and 1000 or at_time>now()+interval '5 minutes' then return false;end if;
 select * into t from private.email_transports where id=(input->>'transport_id')::uuid for update;
 if not found or private.email_hash(input->>'recipient') is distinct from t.recipient_hash or t.attempts=0 or at_time<t.created_at-interval '5 minutes' then return false;end if;
 if t.provider_id is not null and not(pid=t.provider_id or starts_with(pid,t.provider_id||'.')) then return false;end if;
 -- A callback may arrive before the synchronous 202 has been recorded. Ask for
 -- a provider retry rather than manufacturing an accepted transport.
 if t.state='admitted' then raise exception 'Provider acceptance pending' using errcode='40001';end if;
 insert into private.email_provider_events(event_id,transport_id,event,event_at,provider_id) values(event_id,t.id,e,at_time,pid) on conflict do nothing;
 if not found then return true;end if;
 if e in ('bounce','dropped','spamreport','unsubscribe') then
  insert into private.email_suppressions(owner_key,recipient_hash,category,reason) values('provider',t.recipient_hash,'all',case e when 'bounce' then 'bounce' when 'spamreport' then 'spam' else 'provider_block' end) on conflict do nothing;
 elsif e='group_unsubscribe' then
  insert into private.email_suppressions(owner_key,recipient_hash,category,reason) values(t.preference_owner,t.recipient_hash,'marketing','unsubscribe') on conflict do nothing;
 end if;
 -- A provider resubscribe never fabricates our consent or removes a local optout.
 select case event when 'delivered' then 'delivered' when 'bounce' then 'bounced' when 'dropped' then 'blocked' when 'deferred' then 'deferred' else 'accepted' end into next_state
 from private.email_provider_events where transport_id=t.id and event in ('processed','delivered','deferred','bounce','dropped') order by case event when 'bounce' then 5 when 'dropped' then 4 when 'delivered' then 3 when 'deferred' then 2 else 1 end desc,event_at desc limit 1;
 if next_state is not null then update private.email_transports set state=next_state,updated_at=clock_timestamp() where id=t.id;end if;
 return true;
end$$;

-- Auth calls this inside its transaction: a newly invited auth.users row may
-- not yet be visible. Only a pre-existing server-created invitation can bridge
-- that case; client-editable user metadata is never consulted.
create or replace function public.email_auth_context(target_slug text,actor uuid,recipient text,action_type text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tenants;b public.tenant_branding;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if actor is null or coalesce(recipient,'')!~*'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid Auth context' using errcode='23514';end if;
 if target_slug is null then return '{"tenant_id":null,"company":"Fieldgrid","primary":"#222C35","accent":"#41AC42","logo":false}';end if;
 select * into t from public.tenants where slug=target_slug and status='active';
 if t.id is null or not (
  exists(select 1 from public.tenant_memberships m where m.tenant_id=t.id and m.user_id=actor and m.status='active')
  or exists(select 1 from public.object_customer_bindings c join public.objects o on o.id=c.object_id and o.tenant_id=c.tenant_id where c.tenant_id=t.id and c.user_id=actor and c.active and o.dossier_status<>'archived')
  or(action_type='invite' and exists(select 1 from public.tenant_admin_invitations i where i.tenant_id=t.id and lower(btrim(i.email))=lower(btrim(recipient)) and i.status in ('pending','invited','failed') and (i.auth_user_id is null or i.auth_user_id=actor)))
 ) then raise exception 'Auth tenant context unavailable' using errcode='42501';end if;
 select * into b from public.tenant_branding where tenant_id=t.id;
 return jsonb_build_object('tenant_id',t.id,'company',t.name,'primary',coalesce(b.primary_color,'#222C35'),'accent',coalesce(b.accent_color,'#41AC42'),'logo',b.logo_path is not null);
end$$;

create or replace function public.email_auth_hook_receipt(operation text,hook_id text,payload_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.email_hook_receipts;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if length(coalesce(hook_id,'')) not between 1 and 200 or coalesce(payload_hash,'')!~'^[0-9a-f]{64}$' then raise exception 'Invalid receipt' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-hook:'||hook_id,0));
 select * into r from private.email_hook_receipts where id=hook_id for update;
 if found and r.payload_hash<>payload_hash then raise exception 'Hook identity changed' using errcode='23514';end if;
 if operation='begin' then
  if found then return jsonb_build_object('claimed',false,'state',r.state);end if;
  insert into private.email_hook_receipts(id,payload_hash,state) values(hook_id,payload_hash,'processing');return '{"claimed":true}';
 elsif operation in ('done','failed','uncertain','blocked') then
  update private.email_hook_receipts set state=operation,finished_at=clock_timestamp() where id=hook_id and state='processing';return jsonb_build_object('ok',found);
 end if;
 raise exception 'Invalid operation' using errcode='23514';
end$$;

do $$declare name text;begin
 foreach name in array array['email_settings','email_consents','email_suppressions','email_transports','email_attempts','email_provider_events','email_hook_receipts','email_audit'] loop
  execute format('alter table private.%I enable row level security',name);execute format('alter table private.%I force row level security',name);execute format('revoke all on private.%I from public,anon,authenticated,service_role',name);
 end loop;
end$$;
revoke all on function private.email_hash(text),private.email_policy(uuid,text,text),private.email_recipient_allowed(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.email_transport(text,jsonb),public.email_provider_event(jsonb),public.email_auth_hook_receipt(text,text,text) from public,anon,authenticated;
grant execute on function public.email_transport(text,jsonb),public.email_provider_event(jsonb),public.email_auth_hook_receipt(text,text,text) to service_role;
revoke all on function public.email_auth_context(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_auth_context(text,uuid,text,text) to service_role;

-- Source: scripts/sql/release-access-boundaries.sql
-- Query-first release repair. Generate and verify a forward migration before release.

create or replace function private.actor_session_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
   select 1 from auth.sessions s join auth.users u on u.id=s.user_id
   where s.user_id=(select auth.uid())
     and s.id::text=(select auth.jwt()->>'session_id')
     and (s.not_after is null or s.not_after>now())
     and u.deleted_at is null and not coalesce(u.is_anonymous,false)
     and (u.banned_until is null or u.banned_until<=now())
 );
$$;
revoke all on function private.actor_session_active() from public,anon;
grant execute on function private.actor_session_active() to authenticated;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select (select private.actor_session_active()) and exists (
   select 1 from public.platform_admins where user_id=(select auth.uid())
 );
$$;

create or replace function private.member_roles(target_tenant_id uuid)
returns public.app_role[] language sql stable security definer set search_path='' as $$
 select coalesce((select m.roles from public.tenant_memberships m
   join public.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=target_tenant_id and m.user_id=(select auth.uid())
     and m.status='active' and (select private.actor_session_active())
 ),'{}'::public.app_role[]);
$$;

create or replace function private.is_member(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select cardinality((select private.member_roles(target_tenant_id)))>0;
$$;

create or replace function private.has_role(target_tenant_id uuid,required_roles public.app_role[])
returns boolean language sql stable security definer set search_path='' as $$
 select (select private.member_roles(target_tenant_id)) && required_roles;
$$;

create or replace function private.current_personnel_id(target_tenant_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.personnel p
 where p.tenant_id=target_tenant_id and p.user_id=(select auth.uid()) and p.status='active'
   and (select private.has_role(target_tenant_id,array['staff']::public.app_role[])) limit 1;
$$;

create or replace function private.is_work_order_assignee(target_tenant_id uuid,target_work_order_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.work_order_assignments a
   join public.work_orders w on w.id=a.work_order_id and w.tenant_id=a.tenant_id
   where a.tenant_id=target_tenant_id and a.work_order_id=target_work_order_id
     and a.personnel_id=(select private.current_personnel_id(target_tenant_id))
     and a.status not in ('cancelled','returned') and w.status<>'cancelled'
     and exists(select 1 from public.dispatches d where d.tenant_id=a.tenant_id
       and d.assignment_id=a.id and d.revoked_at is null));
$$;

-- The staff workspace supplies only customer ID/name. Assignment is not CRM access.
create or replace function private.can_access_customer(target_tenant_id uuid,target_customer_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(target_tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[]);
$$;

-- Staff uploads bytes after creating the report entry, before attachment metadata.
-- The owned report path therefore authorizes both that insertion and failure cleanup.
-- Metadata alone must never authorize somebody else's bytes.
create or replace function private.owns_report_path(t uuid,w uuid,path text)
returns boolean language sql stable security definer set search_path='' as $$
 select cardinality(string_to_array(path,'/'))=4
   and split_part(path,'/',1)=t::text and split_part(path,'/',2)=w::text
   and split_part(path,'/',4)<>''
   and exists(select 1 from public.report_entries e where e.tenant_id=t
     and e.work_order_id=w and e.id::text=split_part(path,'/',3)
     and e.author_user_id=(select auth.uid()) and e.deleted_at is null);
$$;
revoke all on function private.owns_report_path(uuid,uuid,text) from public,anon;
grant execute on function private.owns_report_path(uuid,uuid,text) to authenticated;

create or replace function private.can_access_storage_object(bucket text,object_name text,write_access boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.storage_tenant_id(object_name); w uuid:=private.storage_subject_id(object_name);
begin
 if t is null then return false;end if;
 if bucket='branding' then
   if write_access then return private.has_role(t,array['tenant_admin','management']::public.app_role[]);end if;
   return private.is_member(t);
 end if;
 if w is null then return false;end if;
 if bucket in ('reports','signatures') then
   if private.has_role(t,array['tenant_admin','management','planner']::public.app_role[]) then return true;end if;
   if bucket<>'reports' or not private.is_work_order_assignee(t,w) or not private.owns_report_path(t,w,object_name) then return false;end if;
   if not write_access then return true;end if;
   return exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.status in ('seen','travelling','in_progress','correction_required'));
 elsif bucket='invoices' then
   return private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]);
 elsif bucket='personnel-documents' then
   if private.has_role(t,array['tenant_admin','management','hr']::public.app_role[]) then return true;end if;
   return not write_access and w=private.current_personnel_id(t)
     and exists(select 1 from public.personnel_documents d where d.tenant_id=t
       and d.personnel_id=w and d.storage_path=object_name and d.visible_to_employee);
 end if;
 return false;
end;
$$;

drop policy if exists release_private_reports on public.report_entries;
create policy release_private_reports on public.report_entries as restrictive for select to authenticated
using (private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[])
  or (author_user_id=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)));

drop policy if exists release_private_attachments on public.attachments;
create policy release_private_attachments on public.attachments as restrictive for select to authenticated
using (private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[])
  or (uploaded_by=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)
    and private.owns_report_path(tenant_id,work_order_id,storage_path)));

-- Guard writes even when caller forges a metadata row pointing at another file.
create or replace function private.guard_staff_attachment_path()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not private.has_role(new.tenant_id,array['tenant_admin','management','planner']::public.app_role[]) then
   if new.uploaded_by is distinct from auth.uid() or new.storage_bucket<>'reports'
     or new.report_entry_id is null or new.report_entry_id::text<>split_part(new.storage_path,'/',3)
     or not private.is_work_order_assignee(new.tenant_id,new.work_order_id)
     or not private.owns_report_path(new.tenant_id,new.work_order_id,new.storage_path)
     or (tg_op='INSERT' and not private.can_access_storage_object('reports',new.storage_path,true))
     or (tg_op='UPDATE' and not private.staff_report_editable(new.tenant_id,new.work_order_id))
   then raise exception 'Geen toegang tot dit rapportbestand' using errcode='42501';end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_staff_attachment_path() from public,anon,authenticated;
drop trigger if exists release_attachment_path on public.attachments;
create trigger release_attachment_path before insert or update on public.attachments
for each row execute function private.guard_staff_attachment_path();

-- Preserve the full existing DTO; change exactly the two private row projections.
do $$
declare original text; revised text;
begin
 select pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure) into original;
 revised:=replace(original,'e.work_order_id=any(ids) and e.deleted_at is null',
   'e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null');
 revised:=replace(revised,'a.work_order_id=any(ids) and a.deleted_at is null',
   'a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null');
 if revised=original and position('e.author_user_id=auth.uid()' in original)=0 then
   raise exception 'staff_workspace source changed: review the projection';
 end if;
 execute revised;
 select pg_get_functiondef('public.work_order_task_context(uuid,uuid)'::regprocedure) into original;
 revised:=replace(original,'where c.tenant_id=target_tenant and c.task_id=task.id)',
   'where c.tenant_id=target_tenant and c.task_id=task.id and (private.object_manage(target_tenant) or c.actor_id=auth.uid()))');
 if revised=original and position('or c.actor_id=auth.uid()' in original)=0 then
   raise exception 'work_order_task_context source changed: review the projection';
 end if;
 revised:=replace(revised,'''assignedPersonnelId'',task.assigned_personnel_id,',
   '''assignedPersonnelId'',case when private.object_manage(target_tenant) or task.assigned_personnel_id=private.current_personnel_id(target_tenant) then task.assigned_personnel_id end,');
 revised:=replace(revised,'and p.status=''active''),''[]''),',
   'and p.status=''active'' and (private.object_manage(target_tenant) or p.user_id=auth.uid())),''[]''),');
 execute revised;
end;
$$;

alter table private.work_order_commands enable row level security;
alter table private.work_order_commands force row level security;
alter table private.work_order_signature_intents enable row level security;
alter table private.work_order_signature_intents force row level security;

-- Source: scripts/sql/release-vault-boundaries.sql
-- Query-first: retain the existing OTP/grant lifecycle, repair resource eligibility.
do $$
declare original text; revised text; signature regprocedure;
begin
 foreach signature in array array[
   'private.object_vault_context(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
   'private.object_visit_access(uuid,uuid,uuid)'::regprocedure
 ] loop
   select pg_get_functiondef(signature) into original;
   revised:=replace(original,'p.status=''active'' and m.status=''active''',
     'p.status=''active'' and m.status=''active'' and ''staff''=any(m.roles)');
   if position('and ''staff''=any(m.roles)' in original)>0 then continue;end if;
   if revised=original then raise exception 'Object assignment source changed; review authorization';end if;
   execute revised;
 end loop;
 select pg_get_functiondef('public.object_vault_operation(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) into original;
 revised:=replace(original,
   'where x.tenant_id=target_tenant and x.object_id=target_object and x.active;',
   'where x.tenant_id=target_tenant and x.object_id=target_object and x.active and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;');
 if revised=original and position('x.active and private.object_vault_context' in original)=0 then
   raise exception 'Vault metadata source changed; review item authorization';
 end if;
 execute revised;
end;
$$;

-- Source: scripts/sql/release-file-boundaries.sql
-- Query-first release fix. No historical document or file is deleted/rewritten.
create or replace function private.document_path_matches(path text, scope text[])
returns boolean language sql immutable set search_path='' as $$
 select coalesce(array_length(scope,1)>0
   and array_length(string_to_array(path,'/'),1)=array_length(scope,1)+1
   and (string_to_array(path,'/'))[1:array_length(scope,1)]=scope
   and split_part(path,'/',array_length(scope,1)+1) not in ('','.','..')
   and position(chr(92) in path)=0 and path !~ '[%?#[:cntrl:]]',false)
$$;
revoke all on function private.document_path_matches(text,text[]) from public,anon;
grant execute on function private.document_path_matches(text,text[]) to authenticated,service_role;

-- NOT VALID preserves historical metadata. New writes are checked, and every
-- privileged download independently checks its exact authorized namespace.
alter table public.personnel_documents drop constraint if exists personnel_document_scope;
alter table public.personnel_documents add constraint personnel_document_scope
 check(private.document_path_matches(storage_path,array[tenant_id::text,personnel_id::text])) not valid;
alter table public.invoices drop constraint if exists invoice_pdf_scope;
alter table public.invoices add constraint invoice_pdf_scope
 check(pdf_storage_path is null or private.document_path_matches(pdf_storage_path,array[tenant_id::text,id::text])) not valid;

-- The operation is supplied by Storage, not a client-controlled JWT claim.
-- SELECT also serves copy/move/upsert/delete: don't inadvertently disable them.
-- Public-facing branding deliberately keeps its existing short signed URLs.
drop policy if exists private_files_no_capability_issuance on storage.objects;
create policy private_files_no_capability_issuance on storage.objects
 as restrictive for all to authenticated
 using(bucket_id not in ('reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents','ticket-files')
   or not storage.allow_any_operation(array['storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign']))
 with check(bucket_id not in ('reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents','ticket-files')
   or not storage.allow_any_operation(array['storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign']));

-- Return the parent identity from the authorized source, not from the path.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.customer_file_access(uuid,uuid,text)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''mime'',d.mime_type)', '''mime'',d.mime_type,''scope'',jsonb_build_array(d.tenant_id,d.customer_id),''sha256'',d.sha256)');
  definition:=replace(definition,'''mime'',''application/pdf'')', '''mime'',''application/pdf'',''scope'',jsonb_build_array(i.tenant_id,i.id),''sha256'',i.pdf_sha256)');
  if position('''scope''' in definition)=0 then raise exception 'customer_file_access contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.get_object_document(uuid,uuid,uuid)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''title'',d.title)', '''title'',d.title,''scope'',jsonb_build_array(d.tenant_id,d.object_id))');
  if position('''scope''' in definition)=0 then raise exception 'get_object_document contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.commercial_customer_file(uuid,uuid,text)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'else d.mime_type end);','else d.mime_type end,''scope'',jsonb_build_array(q.tenant_id,''quote'',q.id),''sha256'',case when asset='''' then d.sha256 else null end);');
  if position('''scope''' in definition)=0 then raise exception 'commercial_customer_file contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.work_order_report_file(uuid,uuid)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''sha256'',signed_record.sha256)', '''sha256'',signed_record.sha256,''scope'',jsonb_build_array(r.tenant_id,w.id))');
  definition:=replace(definition,'''sha256'',a.sha256)', '''sha256'',a.sha256,''scope'',case when a.storage_path like r.tenant_id::text||''/''||w.id::text||''/communication/%'' then jsonb_build_array(r.tenant_id,w.id,''communication'') else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end)');
  if position('''scope''' in definition)=0 then raise exception 'work_order_report_file contract changed';end if;
  execute definition;
 end if;
end $$;

-- Source: scripts/sql/release-work-order-privacy.sql
-- Shared order access is not authority over a colleague's individual work.
create or replace function private.task_execution_allowed(task public.work_order_tasks)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_manage(task.tenant_id) or (
   private.is_work_order_assignee(task.tenant_id,task.work_order_id)
   and (task.assigned_personnel_id is null or task.assigned_personnel_id=private.current_personnel_id(task.tenant_id)))
$$;
revoke all on function private.task_execution_allowed(public.work_order_tasks) from public,anon,authenticated,service_role;

create or replace function private.staff_task_dto(task public.work_order_tasks)
returns jsonb language sql stable security definer set search_path='' as $$
 select (select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(task)) where key=any(array[
  'id','tenant_id','work_order_id','task_revision_id','task_code','task_name','quantity','unit','duration_minutes','is_extra_work','extra_work_status',
  'completed_at','created_at','updated_at','executed_quantity','execution_state','execution_version','instructions','scope_root_task_id','transferred_quantity','withdrawn_quantity']))
  ||jsonb_build_object('assigned_personnel_id',case when task.assigned_personnel_id=private.current_personnel_id(task.tenant_id) then task.assigned_personnel_id end,
    'completion_note',case when exists(select 1 from public.work_order_task_contributions c where c.tenant_id=task.tenant_id and c.task_id=task.id and c.execution_version=task.execution_version and c.actor_id=auth.uid()) then task.completion_note end,
    'can_execute',private.task_execution_allowed(task))
$$;
revoke all on function private.staff_task_dto(public.work_order_tasks) from public,anon,authenticated,service_role;

-- Composite RPC compatibility is retained, but new columns never implicitly
-- cross the staff boundary. All non-operational fields remain SQL NULL.
create or replace function private.staff_work_order_result(w public.work_orders)
returns public.work_orders language sql stable security definer set search_path='' as $$
 select case when private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]) then w
 else jsonb_populate_record(null::public.work_orders,(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(w)) where key=any(array[
 'id','tenant_id','work_order_number','customer_id','object_id','discipline','title','description','day_instructions','priority',
 'status','version','report_version','report_state','signature_required','signature_mode','employee_signature_required',
 'planned_start_at','planned_end_at','projected_start_at','projected_end_at','actual_start_at','actual_end_at',
 'created_at','updated_at','required_personnel','planning_state','requested_date','duration_minutes','location_label']))) end
$$;
revoke all on function private.staff_work_order_result(public.work_orders) from public,anon,authenticated,service_role;

do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.complete_work_order_task(uuid,boolean,text)'::regprocedure);
 if position('private.task_execution_allowed(task)' in definition)=0 then
  definition:=replace(definition,'if work.status not in', 'if not private.task_execution_allowed(task) then raise exception ''Deze taak is aan een andere medewerker toegewezen'' using errcode=''42501'';end if;'||chr(10)||' if work.status not in');
  definition:=replace(definition,'result.unit_price_cents:=0;', 'result:=jsonb_populate_record(null::public.work_order_tasks,private.staff_task_dto(result));result.unit_price_cents:=0;');
  if position('private.task_execution_allowed(task)' in definition)=0 or position('private.staff_task_dto(result)' in definition)=0 then raise exception 'Task completion contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.record_task_execution(uuid,uuid,bigint,text,numeric,text)'::regprocedure);
 if position('private.task_execution_allowed(task)' in definition)=0 then
  definition:=replace(definition,'if task.execution_version<>expected_version then', 'if not private.task_execution_allowed(task) then raise exception ''Deze taak is aan een andere medewerker toegewezen'' using errcode=''42501'';end if;'||chr(10)||' if task.execution_version<>expected_version then');
  if position('private.task_execution_allowed(task)' in definition)=0 then raise exception 'Task execution contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 if position('private.staff_task_dto(t)' in definition)=0 then
  definition:=replace(definition,'to_jsonb(t)-array[''unit_price_cents'',''vat_basis_points'',''commercial_snapshot'',''agreement_line_id'']','private.staff_task_dto(t)');
  if position('private.staff_task_dto(t)' in definition)=0 then raise exception 'Staff task projection contract changed';end if;
  execute definition;
 end if;
end $$;
-- Checklist values belong to their author. Shared conditional progress is a
-- separate boolean-only projection; knowing an answer version never grants edit.
do $$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.answer_work_order_checklist(uuid,jsonb)'::regprocedure);
 if position('Checklistantwoord is niet van jou' in definition)=0 then
  needle:='if coalesce(a.version,0)<>coalesce((input->>''version'')::bigint,0)';
  if position(needle in definition)=0 then raise exception 'Checklist answer version contract changed';end if;
  definition:=replace(definition,needle,
   'if a.id is not null and a.updated_by<>auth.uid() and not private.planning_access(target_tenant) then raise exception ''Checklistantwoord is niet van jou; vraag de backoffice om een correctie'' using errcode=''42501'';end if;
   if attachment is not null and not private.planning_access(target_tenant) and not exists(select 1 from public.attachments proof where proof.tenant_id=target_tenant and proof.work_order_id=w.id and proof.id=attachment and proof.uploaded_by=auth.uid()) then raise exception ''Kies een eigen bewijsfoto'' using errcode=''42501'';end if;
   '||needle);
  execute definition;
 end if;
end $$;

-- Source: scripts/sql/release-report-projections.sql
-- Preserve original signed evidence. Separate audience projections from it.
create table if not exists private.work_order_report_ownership (
 report_id uuid primary key,
 tenant_id uuid not null,
 owners jsonb not null,
 foreign key(tenant_id,report_id) references public.work_order_report_versions(tenant_id,id) on delete cascade
);
alter table private.work_order_report_ownership enable row level security;
alter table private.work_order_report_ownership force row level security;
revoke all on private.work_order_report_ownership from public,anon,authenticated,service_role;
create index if not exists report_ownership_tenant_idx on private.work_order_report_ownership(tenant_id,report_id);

create or replace function private.capture_report_ownership()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text;item record;actor uuid;owners jsonb:='{}';part jsonb;
begin
 foreach section in array array['notes','attachments','checklists','materials'] loop
  part:='{}';
  for item in select value,ordinality from jsonb_array_elements(coalesce(new.snapshot->section,'[]')) with ordinality loop
   actor:=null;
   if section='notes' then
    select e.author_user_id into actor from public.report_entries e where e.tenant_id=new.tenant_id and e.work_order_id=new.work_order_id and e.id::text=item.value->>'id';
   elsif section='attachments' then
    select a.uploaded_by into actor from public.attachments a where a.tenant_id=new.tenant_id and a.work_order_id=new.work_order_id and a.id::text=item.value->>'id' and a.sha256=item.value->>'sha256';
   elsif section='materials' then
    select case when count(distinct m.created_by)=1 then min(m.created_by::text)::uuid end into actor
    from public.work_order_material_usage m where m.tenant_id=new.tenant_id and m.work_order_id=new.work_order_id
     and jsonb_build_object('description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id)=item.value;
   else
    -- Existing snapshots identify checklist answers by their offered fields.
    -- Ambiguous matches have no owner; never guess from a matching label alone.
    select case when count(distinct a.updated_by)=1 then min(a.updated_by::text)::uuid end into actor
    from public.work_order_checklists cl join public.work_order_template_versions tv on tv.id=cl.template_revision_id
    cross join lateral jsonb_array_elements(cl.definition->'questions') q
    join public.work_order_checklist_answers a on a.checklist_id=cl.id and a.question_id=q->>'id'
    where cl.tenant_id=new.tenant_id and cl.work_order_id=new.work_order_id
     and jsonb_build_object('name',cl.name,'version',tv.version,'question',q->>'label','unit',q->>'unit','type',q->>'type','value',a.value,'notApplicable',a.not_applicable,'reason',case when a.not_applicable then a.reason else null end,'answerVersion',a.version,'attachmentId',a.attachment_id)=item.value;
   end if;
   if actor is not null then part:=part||jsonb_build_object(item.ordinality::text,actor);end if;
  end loop;
  owners:=owners||jsonb_build_object(section,part);
 end loop;
 insert into private.work_order_report_ownership(report_id,tenant_id,owners) values(new.id,new.tenant_id,owners);
 return new;
end $$;
revoke all on function private.capture_report_ownership() from public,anon,authenticated,service_role;
drop trigger if exists report_capture_ownership on public.work_order_report_versions;
create trigger report_capture_ownership after insert on public.work_order_report_versions for each row execute function private.capture_report_ownership();

create or replace function private.report_backoffice(t uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(t,array['tenant_admin','management','planner','finance']::public.app_role[])
$$;
revoke all on function private.report_backoffice(uuid) from public,anon,service_role;
grant execute on function private.report_backoffice(uuid) to authenticated;

create or replace function private.report_snapshot_for_actor(r public.work_order_report_versions)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;owners jsonb;section text;visible jsonb;
begin
 if private.report_backoffice(r.tenant_id) then return r.snapshot;end if;
 -- Only the documented customer-facing schema crosses a delivery boundary.
 select jsonb_object_agg(key,value) into result from jsonb_each(r.snapshot) where key=any(array['schema','number','title','summary','tenant','customer','object','executionDate','endedAt','timezone','tasks','notes','checklists','materials','attachments']);
 if not private.is_work_order_assignee(r.tenant_id,r.work_order_id) then return result;end if;
 select o.owners into owners from private.work_order_report_ownership o where o.tenant_id=r.tenant_id and o.report_id=r.id;
 foreach section in array array['notes','attachments','checklists','materials'] loop
  select coalesce(jsonb_agg(value order by ordinality),'[]') into visible from jsonb_array_elements(coalesce(result->section,'[]')) with ordinality
   where owners->section->>ordinality::text=auth.uid()::text;
  result:=jsonb_set(result,array[section],visible);
 end loop;
 if r.created_by is distinct from auth.uid() then result:=jsonb_set(result,'{summary}','"Gezamenlijk rapport. Je ziet hier de opdrachtresultaten en je eigen bijdrage."');end if;
 -- Old versions without captured ownership remain intact for backoffice/customer;
 -- private individual contributions are not guessed or reconstructed for staff.
 return result;
end $$;
revoke all on function private.report_snapshot_for_actor(public.work_order_report_versions) from public,anon,authenticated,service_role;

create or replace function private.report_delivery(r public.work_order_report_versions)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',private.report_snapshot_for_actor(r),
 'contentHash',r.content_hash,'projection',case when private.report_backoffice(r.tenant_id) then 'original' when private.is_work_order_assignee(r.tenant_id,r.work_order_id) then 'own_contribution' else 'customer_copy' end,
 'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,
 'employeeVerified',exists(select 1 from public.signatures s where s.tenant_id=r.tenant_id and s.report_id=r.id and s.signature_kind='employee' and s.revoked_at is null),
 'waiver',(select jsonb_build_object('reason',case when private.report_backoffice(r.tenant_id) then x.reason else 'Klantondertekening door bevoegd beheer vrijgesteld' end,'at',x.created_at) from public.work_order_signature_waivers x where x.report_id=r.id),
 'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'capacity',s.signer_capacity,
 'capturedBy',case when private.report_backoffice(r.tenant_id) or s.captured_by=auth.uid() then coalesce(s.captured_by_name,p.full_name,'Medewerker') end,
 'signedAt',s.signed_at,'channel',s.channel,'kind',s.signature_kind) order by s.signed_at,s.id)
 from public.signatures s left join public.personnel p on p.tenant_id=s.tenant_id and p.user_id=s.captured_by
 where s.tenant_id=r.tenant_id and s.report_id=r.id and s.revoked_at is null
 and (s.signature_kind='customer' or private.report_backoffice(r.tenant_id) or (private.is_work_order_assignee(r.tenant_id,r.work_order_id) and s.captured_by=auth.uid()))),'[]'))
$$;
revoke all on function private.report_delivery(public.work_order_report_versions) from public,anon,authenticated,service_role;

create or replace function private.checklist_question_states(c public.work_order_checklists)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('questionId',q->>'id',
 'visible',not(q ? 'condition') or exists(select 1 from public.work_order_checklist_answers gate where gate.tenant_id=c.tenant_id and gate.checklist_id=c.id and gate.question_id=q->'condition'->>'questionId' and gate.value=q->'condition'->'equals'),
 'answered',a.id is not null,'editable',a.id is null or a.updated_by=auth.uid() or private.planning_access(c.tenant_id)) order by n),'[]')
 from jsonb_array_elements(c.definition->'questions') with ordinality questions(q,n)
 left join public.work_order_checklist_answers a on a.tenant_id=c.tenant_id and a.checklist_id=c.id and a.question_id=q->>'id'
$$;
revoke all on function private.checklist_question_states(public.work_order_checklists) from public,anon,authenticated,service_role;

create or replace function public.work_order_report(target_work_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.work_orders;can_review boolean;can_execute boolean;policy jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.can_access_work_order(w.tenant_id,w.id) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen rapporttoegang' using errcode='42501';end if;
 can_review:=private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]);
 can_execute:=private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 policy:=private.work_order_signature_policy(w);
 return jsonb_build_object('orderId',w.id,'orderVersion',w.version,'number',w.work_order_number,'state',w.report_state,'policy',policy,'canReview',can_review,
 'canEditPolicy',private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) and w.status not in ('cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction'),'configuredMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,
 'canSubmit',can_execute and w.status not in ('cancelled','approved','invoice_ready','invoiced') and (w.lead_personnel_id is null or exists(select 1 from public.personnel p where p.id=w.lead_personnel_id and p.user_id=auth.uid())),
 'canCapture',can_execute,'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id and (private.report_backoffice(w.tenant_id) or a.updated_by=auth.uid())),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(private.report_delivery(r) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null and (private.report_backoffice(w.tenant_id) or s.captured_by=auth.uid())),'[]'));
end $$;
revoke all on function public.work_order_report(uuid) from public,anon,service_role;
grant execute on function public.work_order_report(uuid) to authenticated;

create or replace function public.work_order_report_file(target_report_id uuid,asset_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.work_order_report_versions;w public.work_orders;signed_record public.signatures;a public.attachments;allowed boolean;backoffice boolean;staff boolean;
begin
 select * into r from public.work_order_report_versions where id=target_report_id;
 select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id;
 backoffice:=private.report_backoffice(w.tenant_id);staff:=private.is_work_order_assignee(w.tenant_id,w.id);
 allowed:=backoffice or staff or(r.state='approved' and exists(select 1 from public.object_customer_bindings b where b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=auth.uid() and b.active));
 if r.id is null or not private.object_session_active() or not allowed or not private.service_enabled(w.tenant_id,'rapportage') or not exists(select 1 from public.tenants t where t.id=w.tenant_id and t.status='active') then raise exception 'Rapportbestand niet beschikbaar' using errcode='42501';end if;
 if asset_id is not null then
  select * into signed_record from public.signatures where tenant_id=r.tenant_id and report_id=r.id and id=asset_id and revoked_at is null;
  if found then
   if signed_record.signature_kind<>'customer' and not(backoffice or(staff and signed_record.captured_by=auth.uid())) then raise exception 'Ondertekening niet beschikbaar' using errcode='42501';end if;
   return jsonb_build_object('bucket','signatures','path',signed_record.storage_path,'name','handtekening.png','mime','image/png','sha256',signed_record.sha256,'scope',jsonb_build_array(r.tenant_id,w.id));
  end if;
  select * into a from public.attachments where tenant_id=r.tenant_id and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(private.report_snapshot_for_actor(r)->'attachments') x where x->>'id'=a.id::text and x->>'sha256'=a.sha256) then raise exception 'Bijlage niet beschikbaar in deze rapportweergave' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256,
   'scope',case when array_length(string_to_array(a.storage_path,'/'),1)=3 then jsonb_build_array(r.tenant_id,w.id)
     when a.storage_path like r.tenant_id::text||'/'||w.id::text||'/communication/%' then jsonb_build_array(r.tenant_id,w.id,'communication')
     else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end);
 end if;
 return private.report_delivery(r);
end $$;
revoke all on function public.work_order_report_file(uuid,uuid) from public,anon,service_role;
grant execute on function public.work_order_report_file(uuid,uuid) to authenticated;

drop policy if exists report_version_audience_boundary on public.work_order_report_versions;
create policy report_version_audience_boundary on public.work_order_report_versions as restrictive for select to authenticated using(private.report_backoffice(tenant_id));
drop policy if exists signature_audience_boundary on public.signatures;
create policy signature_audience_boundary on public.signatures as restrictive for select to authenticated
 using(private.report_backoffice(tenant_id) or (captured_by=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)));

do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 if position('s.captured_by=auth.uid()' in definition)=0 then
  definition:=replace(definition,'s.work_order_id=any(ids))','s.work_order_id=any(ids) and s.captured_by=auth.uid())');
  if position('s.captured_by=auth.uid()' in definition)=0 then raise exception 'Signature workspace contract changed';end if;
  execute definition;
 end if;
end $$;

-- Source: scripts/sql/release-realtime-boundary.sql
-- Postgres Changes cannot apply row authorization after DELETE. Even a primary
-- key is a private resource identifier. Never publish deletes or truncates from
-- this application publication; keep authorized INSERT/UPDATE delivery intact.
-- Staff views already refresh every 20 seconds/on focus and after mutations.
alter publication supabase_realtime set (publish = 'insert, update');

-- Source: scripts/sql/release-mail-files.sql
-- A deferred mail job is not authority over an arbitrary Storage path. Resolve
-- the frozen attachment against its current source and intended recipient.
create or replace function public.notification_mail_attachment(target_tenant uuid,target_mail_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.mail_deliveries;i public.invoices;q public.quotes;path text;scope text[];bucket text;digest text;code text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into m from public.mail_deliveries where tenant_id=target_tenant and id=target_mail_id;
 code:=case m.template when 'invoice' then 'invoice.available' when 'quote' then 'quote.available' when 'quote_reminder' then 'quote.reminder' end;
 if code is null or not private.notification_mail_source_allowed(m.id,m.recipient,code) then raise exception 'Maildocument niet beschikbaar' using errcode='42501';end if;
 path:=m.render_snapshot#>>'{delivery,attachmentPath}';
 if m.template='invoice' then
  select * into i from public.invoices where tenant_id=m.tenant_id and id=(m.render_snapshot->>'invoice_id')::uuid;
  if i.id is null or path is distinct from i.pdf_storage_path or i.pdf_sha256 is null then raise exception 'Vast factuurdocument niet beschikbaar' using errcode='42501';end if;
  scope:=array[m.tenant_id::text,i.id::text];bucket:='invoices';digest:=i.pdf_sha256;
 else
  select * into q from public.quotes where tenant_id=m.tenant_id and id=(m.render_snapshot->>'quote_id')::uuid;
  if q.id is null or path is distinct from q.pdf_path then raise exception 'Vast offertedocument niet beschikbaar' using errcode='42501';end if;
  scope:=array[m.tenant_id::text,'quote',q.id::text];bucket:='commercial-documents';
 end if;
 if not coalesce(private.document_path_matches(path,scope),false) then raise exception 'Document valt buiten de bronregistratie' using errcode='42501';end if;
 return jsonb_build_object('bucket',bucket,'path',path,'scope',to_jsonb(scope),'sha256',digest,'mime','application/pdf','name',coalesce(m.render_snapshot#>>'{delivery,attachmentFilename}','document.pdf'));
end $$;
revoke all on function public.notification_mail_attachment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_mail_attachment(uuid,uuid) to service_role;

commit;

-- Query-first mail centre. Capture in a CLI-created migration after verification.
begin;
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
commit;

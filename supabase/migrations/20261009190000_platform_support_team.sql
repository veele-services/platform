begin;

create table private.platform_support_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 2 and 160),
 status text not null default 'active' check(status in ('active','revoked')),
 all_tenants boolean not null,
 tenant_ids uuid[] not null default '{}',
 revision integer not null default 1 check(revision>0),
 invited_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((all_tenants and cardinality(tenant_ids)=0) or (not all_tenants and cardinality(tenant_ids) between 1 and 100))
);
create table private.platform_support_receipts (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, fingerprint text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
create table private.platform_support_invitations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references private.platform_support_members(user_id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 recipient text not null, member_revision integer not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain','suppressed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index platform_support_invitation_member on private.platform_support_invitations(user_id,created_at desc);
create table private.platform_support_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 user_id uuid, action text not null, created_at timestamptz not null default now()
);
create index platform_support_audit_created on private.platform_support_audit(created_at desc,id desc);
alter table private.platform_support_members enable row level security;
alter table private.platform_support_members force row level security;
alter table private.platform_support_receipts enable row level security;
alter table private.platform_support_receipts force row level security;
alter table private.platform_support_invitations enable row level security;
alter table private.platform_support_invitations force row level security;
alter table private.platform_support_audit enable row level security;
alter table private.platform_support_audit force row level security;
revoke all on private.platform_support_members,private.platform_support_receipts,private.platform_support_invitations,private.platform_support_audit from public,anon,authenticated,service_role;

create function private.platform_team_assert(fresh boolean default false) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 or not exists(select 1 from public.platform_admins where user_id=auth.uid()) then
  raise exception 'Alleen actueel platformbeheer heeft toegang.' using errcode='42501';
 end if;
 if fresh and not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and s.created_at>now()-interval '15 minutes' and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='otp')) then
  raise exception 'Log opnieuw in met een inlogcode om het supportteam te wijzigen.' using errcode='42501';
 end if;
end $$;

create function public.platform_workspace_access() returns boolean
language sql stable security definer set search_path='' as $$
 select private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and (exists(select 1 from public.platform_admins where user_id=auth.uid())
 or exists(select 1 from public.permission_grants g where g.user_id=auth.uid() and g.tenant_id is null and g.enabled
 and (g.capability like 'platform.notifications.%' or
 (g.capability like 'platform.support.%' and not exists(select 1 from private.platform_support_members m where m.user_id=g.user_id and m.status='revoked')))
 and (g.scope->>'all'='true' or g.scope->>'assigned_only'='true'
 or exists(select 1 from public.tenants t where t.status='active' and g.scope->'tenant_ids' ? t.id::text)
 or exists(select 1 from public.ticket_categories c where c.route='platform_support' and g.scope->'category_ids' ? c.id::text))))
$$;

create function public.platform_team_query() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.platform_team_assert();
 return jsonb_build_object(
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'email',u.email,'status',m.status,'allTenants',m.all_tenants,'tenantIds',to_jsonb(m.tenant_ids),'version',m.revision,'invitedAt',m.invited_at,'lastSignInAt',u.last_sign_in_at,
 'deliveryStatus',coalesce((select i.status from private.platform_support_invitations i where i.user_id=m.user_id order by i.created_at desc,i.id desc limit 1),'pending')) order by lower(m.display_name)) from private.platform_support_members m join auth.users u on u.id=m.user_id where u.deleted_at is null),'[]'),
 'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name) from public.tenants t join public.tenant_settings s on s.tenant_id=t.id where t.status='active' and 'tickets'=any(s.enabled_services)),'[]'),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'name',coalesce(m.display_name,'Voormalige medewerker'),'createdAt',a.created_at)) from (select * from private.platform_support_audit order by created_at desc,id desc limit 50) a left join private.platform_support_members m on m.user_id=a.user_id),'[]'));
end $$;

create function public.platform_team_command(command text,input jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p jsonb:=input; uid uuid; m private.platform_support_members; i private.platform_support_invitations;
 ids uuid[]; scope jsonb; fp text; cached private.platform_support_receipts; result jsonb; mail text; d uuid; v integer;
begin
 perform private.platform_team_assert(true);
 if request_id is null or p is null or jsonb_typeof(p)<>'object' or length(p::text)>20000 or command not in ('prepare_invite','invite','update','revoke','resend','claim_delivery','finish_delivery') then raise exception 'Ongeldige supportteamopdracht.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-team-admin:'||actor::text,0));
 fp:=encode(extensions.digest(command||':'||p::text,'sha256'),'hex');
 select * into cached from private.platform_support_receipts r where r.actor_id=actor and r.request_id=platform_team_command.request_id;
 if found then
  if cached.fingerprint<>fp then raise exception 'Het verzoek is gewijzigd; vernieuw het scherm.' using errcode='40001';end if;
  return cached.result;
 end if;
 if command in ('prepare_invite','invite','update') then
  if length(btrim(coalesce(p->>'name',''))) not between 2 and 160 or jsonb_typeof(p->'allTenants')<>'boolean' or jsonb_typeof(p->'tenantIds')<>'array' then raise exception 'Vul naam en supportbereik in.' using errcode='23514';end if;
  select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p->'tenantIds');
  if ((p->>'allTenants')::boolean and cardinality(ids)<>0) or (not (p->>'allTenants')::boolean and cardinality(ids) not between 1 and 100) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.tenants t join public.tenant_settings s on s.tenant_id=t.id where t.id=x and t.status='active' and 'tickets'=any(s.enabled_services))) then raise exception 'Kies actieve organisaties met de ticketmodule.' using errcode='23514';end if;
  if command in ('prepare_invite','invite') then
   mail:=lower(btrim(coalesce(p->>'email','')));
   if length(mail)>320 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Vul een geldig e-mailadres in.' using errcode='23514';end if;
   if exists(select 1 from auth.users u join public.platform_admins a on a.user_id=u.id where lower(u.email)=mail) then raise exception 'Dit account is al platformbeheerder.' using errcode='23514';end if;
  end if;
 end if;
 if command='prepare_invite' then return jsonb_build_object('authorized',true);end if;
 if command in ('claim_delivery','finish_delivery') then
  select * into i from private.platform_support_invitations where id=(p->>'deliveryId')::uuid for update;
  if i.id is null or i.actor_id is distinct from actor then raise exception 'Geen toegang tot deze uitnodiging.' using errcode='42501';end if;
  if command='claim_delivery' then
   select * into m from private.platform_support_members where user_id=i.user_id for update;
   if i.status<>'pending' or m.status<>'active' or m.revision<>i.member_revision or not exists(select 1 from auth.users u where u.id=m.user_id and lower(u.email)=i.recipient and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then return jsonb_build_object('allowed',false);end if;
   update private.platform_support_invitations set status='sending',updated_at=now() where id=i.id;
   return jsonb_build_object('allowed',true,'email',i.recipient,'name',m.display_name,'deliveryId',i.id);
  end if;
  if i.status<>'sending' or p->>'status' not in ('sent','failed','uncertain','suppressed') then raise exception 'Ongeldige verzenduitkomst.' using errcode='23514';end if;
  update private.platform_support_invitations set status=p->>'status',updated_at=now() where id=i.id;
  return jsonb_build_object('ok',true);
 end if;
 uid:=(p->>'userId')::uuid;
 if uid is null or uid=actor or exists(select 1 from public.platform_admins where user_id=uid) then raise exception 'Wijzig een afzonderlijk supportaccount.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-team-member:'||uid::text,0));
 select * into m from private.platform_support_members where user_id=uid for update;
 v:=(p->>'version')::integer;
 if v is null or (m.user_id is null and v<>0) or (m.user_id is not null and v<>m.revision) then raise exception 'Het supportprofiel is gewijzigd; vernieuw het scherm.' using errcode='40001';end if;
 if command='invite' then
  if m.user_id is not null then raise exception 'Dit supportaccount bestaat al; gebruik Bewerken of Opnieuw uitnodigen.' using errcode='23514';end if;
  if exists(select 1 from public.permission_grants where user_id=uid and tenant_id is null and capability like 'platform.support.%') then raise exception 'Dit account heeft al afzonderlijke supportrechten. Beheer deze via Supportinstellingen.' using errcode='23514';end if;
  if not exists(select 1 from auth.users u where u.id=uid and lower(u.email)=mail and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false)) then raise exception 'Het OTP-account is niet beschikbaar.' using errcode='42501';end if;
  insert into private.platform_support_members(user_id,display_name,all_tenants,tenant_ids) values(uid,btrim(p->>'name'),(p->>'allTenants')::boolean,ids) returning * into m;
 elsif command='update' then
  if m.user_id is null or p->>'status' not in ('active','revoked') then raise exception 'Onbekend supportprofiel.' using errcode='23514';end if;
  update private.platform_support_members set display_name=btrim(p->>'name'),all_tenants=(p->>'allTenants')::boolean,tenant_ids=ids,status=p->>'status',revision=revision+1,updated_at=now() where user_id=uid returning * into m;
 elsif command='revoke' then
  if m.user_id is null then raise exception 'Onbekend supportprofiel.' using errcode='23514';end if;
  update private.platform_support_members set status='revoked',revision=revision+1,updated_at=now() where user_id=uid returning * into m;
 elsif command='resend' then
  if m.status is distinct from 'active' then raise exception 'Activeer het supportprofiel voordat je uitnodigt.' using errcode='42501';end if;
  if exists(select 1 from private.platform_support_invitations where user_id=uid and (status in ('pending','sending','uncertain') or created_at>now()-interval '60 seconds')) then raise exception 'Deze uitnodiging is nog in behandeling of de provideruitkomst is onzeker. Controleer de verzendstatus.' using errcode='23514';end if;
 end if;
 if command in ('invite','update','revoke') then
  scope:=case when m.all_tenants then '{"all":true}'::jsonb else jsonb_build_object('tenant_ids',to_jsonb(m.tenant_ids)) end;
  insert into public.permission_grants(user_id,capability,scope,source,created_by,enabled)
  select uid,cap,scope,'support_team',actor,m.status='active' from unnest(array['platform.support.read','platform.support.reply','platform.support.note','platform.support.manage']) cap
  on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set scope=excluded.scope,enabled=excluded.enabled,revision=permission_grants.revision+1,updated_at=now();
 end if;
 if command in ('invite','resend') then
  select lower(email) into mail from auth.users where id=uid;
  insert into private.platform_support_invitations(user_id,actor_id,recipient,member_revision) values(uid,actor,mail,m.revision) returning id into d;
 end if;
 insert into private.platform_support_audit(actor_id,user_id,action) values(actor,uid,command);
 result:=jsonb_build_object('userId',uid,'name',m.display_name,'email',mail,'version',m.revision,'deliveryId',d);
 insert into private.platform_support_receipts(actor_id,request_id,fingerprint,result) values(actor,request_id,fp,result);
 return result;
end $$;
revoke all on function private.platform_team_assert(boolean) from public,anon,authenticated,service_role;
revoke all on function public.platform_workspace_access(),public.platform_team_query(),public.platform_team_command(text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.platform_workspace_access(),public.platform_team_query(),public.platform_team_command(text,jsonb,uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.ticket_has_cap(t uuid, actor uuid, cap text, category uuid DEFAULT NULL::uuid, person uuid DEFAULT NULL::uuid, obj uuid DEFAULT NULL::uuid, customer uuid DEFAULT NULL::uuid, assigned uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if cap like 'platform.support.%' and exists(select 1 from private.platform_support_members m where m.user_id=actor and m.status='revoked') then return false;end if;
 if private.management_is_managed(t,actor) and exists(select 1 from public.permission_catalog where key=cap and domain='tenant') then
  if not private.management_has(t,actor,cap) then return false;end if;
  -- Existing scoped grants and explicit disabled grants remain an additional
  -- boundary. HR always needs its independently delegated exact record scope.
  if cap<>'tickets.internal.hr' and not exists(select 1 from public.permission_grants g where g.tenant_id=t and g.user_id=actor and g.capability=cap) then return true;end if;
 end if;
return (select exists(select 1 from public.permission_grants g join public.permission_catalog c on c.key=g.capability
 left join public.tenant_memberships m on m.id=g.membership_id and m.tenant_id=g.tenant_id and m.user_id=g.user_id
 where g.user_id=actor and g.capability=cap and g.enabled and ((c.domain='platform' and g.tenant_id is null) or (c.domain='tenant' and g.tenant_id=t and m.status='active'))
 and (not(g.scope?'tenant_ids') or g.scope->'tenant_ids' ? t::text)
 and (not(g.scope?'category_ids') or g.scope->'category_ids' ? category::text)
 and (not(g.scope?'personnel_ids') or g.scope->'personnel_ids' ? person::text)
 and (not(g.scope?'object_ids') or g.scope->'object_ids' ? obj::text)
 and (not(g.scope?'customer_ids') or g.scope->'customer_ids' ? customer::text)
 and (not coalesce((g.scope->>'assigned_only')::boolean,false) or assigned=actor)
 and (g.scope->>'all'='true' or g.scope ?| array['tenant_ids','category_ids','personnel_ids','object_ids','customer_ids','assigned_only'])));
end;
$function$
;

create or replace function private.ticket_dto(tid uuid,ctx text,actor uuid,detail boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;c public.ticket_categories;rev bigint;aud text;result jsonb; perms jsonb; action_name text; messages jsonb; events jsonb; assignee text; shared jsonb;
begin
 if not private.ticket_allowed(tid,ctx,'read',actor) then raise exception 'Geen toegang tot melding' using errcode='42501';end if;
 select * into strict t from public.tickets where id=tid;select * into c from public.ticket_categories where id=t.category_id;
 aud:=private.ticket_view_audience(tid,ctx,actor);rev:=(t.audience_revisions->>aud)::bigint;
 perms:=jsonb_build_object('reply',private.ticket_allowed(tid,ctx,'reply',actor),'note',private.ticket_allowed(tid,ctx,'note',actor),'manage',private.ticket_allowed(tid,ctx,'manage',actor),'assign',private.ticket_allowed(tid,ctx,'assign',actor),'close',private.ticket_allowed(tid,ctx,'close',actor),'share',ctx='tenant' and not c.confidential and private.ticket_allowed(tid,ctx,'share',actor) and exists(select 1 from public.ticket_categories sc where sc.route='platform_support' and private.ticket_create_allowed(t.tenant_id,sc.id,'support',actor)),'priority',private.ticket_allowed(tid,ctx,'manage',actor),'transfer',private.ticket_allowed(tid,ctx,'manage',actor),'archive',private.ticket_allowed(tid,ctx,'manage',actor),'redact',ctx<>'staff' and private.ticket_has_cap(t.tenant_id,actor,case when ctx='platform' then 'platform.support.redact' else 'tickets.redact' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id),'reopen',private.ticket_allowed(tid,ctx,'close',actor));
 perms:=perms||jsonb_build_object('critical',ctx<>'staff' and t.archived_at is null and t.status not in ('resolved','closed','cancelled') and private.ticket_allowed(tid,ctx,'manage',actor) and private.ticket_has_cap(t.tenant_id,actor,case ctx when 'tenant' then 'tickets.internal.critical' when 'support' then 'tickets.support.critical' else 'platform.support.critical' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id),'resolve',ctx<>'staff' and t.archived_at is null and t.status not in ('resolved','closed','cancelled') and private.ticket_allowed(tid,ctx,'close',actor),'reopen',t.archived_at is null and t.status in ('resolved','closed') and private.ticket_allowed(tid,ctx,'close',actor),'close',t.archived_at is null and t.status='resolved' and private.ticket_allowed(tid,ctx,'close',actor),'archive',t.archived_at is null and t.status in ('closed','cancelled') and private.ticket_allowed(tid,ctx,'manage',actor));
 perms:=perms||jsonb_build_object('cancel',t.archived_at is null and t.status in ('new','in_progress','waiting_reporter','waiting_external') and private.ticket_allowed(tid,ctx,'close',actor));
 foreach action_name in array array['reply','note','manage','assign','priority','transfer','share'] loop
  perms:=jsonb_set(perms,array[action_name],to_jsonb(coalesce((perms->>action_name)::boolean,false) and t.archived_at is null and t.status not in ('closed','cancelled') and (action_name in ('reply','note') or t.status<>'resolved') and (action_name<>'share' or c.can_escalate) and (action_name<>'assign' or ctx<>'support')));
 end loop;
 select p.full_name into assignee from public.personnel p where p.tenant_id=t.tenant_id and p.user_id=t.assigned_user_id and p.status='active' limit 1;
 result:=jsonb_build_object('id',t.id,'tenant_id',t.tenant_id,'number',t.number,'route',t.route,'title',t.title,'module',t.module,'technical_context',t.technical_context,'status',t.status,'priority',t.priority,'needed_before',t.needed_before,
  'category',jsonb_build_object('id',c.id,'name',c.name,'confidential',c.confidential),'reporter',jsonb_build_object('id',case when ctx='platform' then null else t.reporter_user_id end,'name',case when ctx='platform' then 'Tenantcontact' else t.reporter_name end),
  'assigned_user',case when t.assigned_user_id is not null then jsonb_build_object('id',t.assigned_user_id,'name',coalesce(case when ctx='platform' then (select display_name from private.platform_support_members where user_id=t.assigned_user_id and status='active') end,assignee,case when t.route='platform_support' then 'Fieldgrid-support' else 'Behandelaar' end)) end,
  'assigned_group_id',t.assigned_group_id,'assigned_group_name',(select g.name from public.ticket_groups g where g.id=t.assigned_group_id and g.tenant_id is not distinct from case when t.route='platform_support' then null else t.tenant_id end),
  'timezone',(select cfg.settings->>'timezone' from private.ticket_config cfg where cfg.scope_key=case when t.route='platform_support' then 'platform' else t.tenant_id::text end),
  'created_at',t.created_at,'updated_at',coalesce((t.audience_activity->>aud)::timestamptz,t.created_at),'revision',rev,
  'unread',coalesce((select r.revision<rev from private.ticket_reads r where r.ticket_id=tid and r.user_id=actor and r.context=ctx),true),
  'first_response_due_at',t.first_response_due_at,'resolution_due_at',t.resolution_due_at,'deadline_at',case when t.first_response_at is null then t.first_response_due_at else t.resolution_due_at end,
  'next_actor',case when t.status in ('waiting_reporter','resolved') then 'reporter' when t.status='waiting_external' then 'external' when t.status in ('closed','cancelled') then null else 'handler' end,
  'next_step',coalesce(case when not exists(select 1 from private.ticket_redactions rd where rd.message_id=t.next_step_message_id) then t.next_step end,case when t.status='waiting_reporter' then 'Reactie van melder nodig' when t.status='resolved' then 'Bevestig de oplossing' when t.status='waiting_external' then 'Wachten op externe partij' when t.status in ('closed','cancelled') then 'Afgehandeld' else 'Behandeling door bevoegde behandelaar' end),
  'context_links',private.ticket_context_links(tid,ctx,actor),'permissions',perms,'archived',t.archived_at is not null,'closed_at',t.closed_at,'resolution',(select case when exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) then 'Bericht afgeschermd' else m.body end from public.ticket_messages m where m.id=t.resolution_message_id and private.ticket_message_allowed(m.id,ctx,actor)),'auto_close_at',case when t.resolved_at is not null and c.auto_close_days>0 then t.resolved_at+c.auto_close_days*interval '1 day' end);
 if ctx='platform' then result:=result||jsonb_build_object('tenant_name',(select name from public.tenants where id=t.tenant_id));end if;
 if detail then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'audience',m.audience,'body',case when exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id) then 'Bericht afgeschermd' else m.body end,'redacted',exists(select 1 from private.ticket_redactions rd where rd.message_id=m.id),'author_name',case when ctx='platform' and m.author_user_id=t.reporter_user_id then 'Tenantcontact' else m.author_name end,'is_own',m.author_user_id=actor,'created_at',m.created_at,'attachments',private.ticket_message_files(m.id)) order by m.created_at,m.id),'[]') into messages from public.ticket_messages m where m.ticket_id=tid and private.ticket_message_allowed(m.id,ctx,actor);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'label',e.label,'audience',e.audience,'actor_name',case when e.actor_user_id=actor then 'U' when e.actor_user_id is null then 'Systeem' else 'Behandelaar' end,'created_at',e.created_at) order by e.created_at,e.id),'[]') into events from public.ticket_events e where e.ticket_id=tid and private.ticket_event_allowed(e.id,ctx,actor);
  result:=result||jsonb_build_object('messages',messages,'events',events,'handlers',case when (perms->>'assign')::boolean then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',case when a.context='platform' then coalesce((select display_name from private.platform_support_members where user_id=a.user_id and status='active'),'Fieldgrid-support') else coalesce((select p.full_name from public.personnel p where p.tenant_id=t.tenant_id and p.user_id=a.user_id limit 1),'Behandelaar') end)) from private.ticket_notification_candidates(tid,'reporter') a where a.context=ctx and private.ticket_allowed(tid,ctx,'reply',a.user_id)),'[]') else '[]'::jsonb end);
  if ctx='tenant' then
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'number',s.number,'status',s.status) order by l.created_at desc),'[]') into shared from private.ticket_links l join public.tickets s on s.id=l.support_ticket_id where l.source_ticket_id=tid and private.ticket_allowed(s.id,'support','read',actor);
   result:=result||jsonb_build_object('linked_support',shared->0,'share_options',case when (perms->>'share')::boolean then coalesce((select jsonb_agg(f) from public.ticket_messages m cross join lateral jsonb_array_elements(private.ticket_message_files(m.id)) f where m.ticket_id=tid and m.audience='reporter'),'[]'::jsonb) else '[]'::jsonb end);
  end if;
  if ctx='support' then result:=result||jsonb_build_object('source_ticket',(select jsonb_build_object('id',s.id,'number',s.number) from private.ticket_links l join public.tickets s on s.id=l.source_ticket_id where l.support_ticket_id=tid and private.ticket_allowed(s.id,'tenant','read',actor)));end if;
 end if;
 return result;
end$$;

commit;

-- Customer is a fifth, own-reporter workspace on the canonical ticket tables.
-- No raw-table privilege or general support/HR capability is granted.
alter table public.ticket_categories add column customer_visible boolean not null default false;
create table private.customer_ticket_bindings (
 ticket_id uuid primary key references public.tickets(id),
 tenant_id uuid not null references public.tenants(id),
 account_id uuid not null,
 foreign key(tenant_id,account_id) references public.customer_portal_accounts(tenant_id,id)
);
alter table private.customer_ticket_bindings enable row level security;
alter table private.customer_ticket_bindings force row level security;
revoke all on private.customer_ticket_bindings from public,anon,authenticated,service_role;
create function private.customer_ticket_seed(t uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.ticket_categories(tenant_id,route,code,name,description,customer_visible)
 values(t,'internal','customer_service','Klantvragen','Planning, dienstverlening en facturen',true) on conflict do nothing;
end $$;
select private.customer_ticket_seed(id) from public.tenants;
insert into public.ticket_categories(tenant_id,route,code,name,description,customer_visible)
values(null,'platform_support','customer_portal','Klantportaal','Technische vragen over het klantportaal',true) on conflict do nothing;
create function private.customer_ticket_seed_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.customer_ticket_seed(new.id);return new;end $$;
create trigger customer_ticket_seed after insert on public.tenants for each row execute function private.customer_ticket_seed_trigger();
create function private.customer_ticket_identity(t uuid,a uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.customer_portal_accounts p
 join auth.users u on u.id=p.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null
 join public.tenants tn on tn.id=p.tenant_id and tn.status='active'
 join public.tenant_settings s on s.tenant_id=p.tenant_id and 'tickets'=any(s.enabled_services)
 join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id and c.status not in('inactive','archived','draft')
 left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
 where p.tenant_id=t and p.id=a and p.user_id=actor and p.active and nullif(btrim(u.email),'') is not null
 and(p.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(clock_timestamp() at time zone tn.timezone)::date) and(ct.active_until is null or ct.active_until>=(clock_timestamp() at time zone tn.timezone)::date))))
$$;
create function private.customer_ticket_access(tid uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.customer_ticket_bindings b
 join public.tickets t on t.tenant_id=b.tenant_id and t.id=b.ticket_id and t.reporter_user_id=actor
 join public.ticket_categories c on c.id=t.category_id and c.customer_visible and not c.confidential
 join public.customer_portal_accounts a on a.tenant_id=b.tenant_id and a.id=b.account_id and a.customer_id=t.customer_id
 where b.ticket_id=tid and private.customer_ticket_identity(b.tenant_id,b.account_id,actor)
 and(t.object_id is null or exists(select 1 from public.objects o join public.object_customer_bindings ob on ob.tenant_id=o.tenant_id and ob.object_id=o.id and ob.active and ob.user_id=actor where o.tenant_id=t.tenant_id and o.id=t.object_id and o.customer_id=a.customer_id)))
$$;

create or replace function private.ticket_actor_active(t uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when ctx='customer' then exists(select 1 from public.customer_portal_accounts a where a.tenant_id=t and a.user_id=actor and private.customer_ticket_identity(t,a.id,actor)) else coalesce(actor is not null and ctx in ('staff','tenant','support','platform') and exists(select 1 from auth.users u where u.id=actor and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false))
 and ((ctx='platform' and (t is null or exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'tickets'=any(s.enabled_services))))
 or (ctx<>'platform' and exists(select 1 from public.tenant_memberships m join public.tenants x on x.id=m.tenant_id join public.tenant_settings s on s.tenant_id=x.id where m.tenant_id=t and m.user_id=actor and m.status='active' and x.status='active' and 'tickets'=any(s.enabled_services))
 and (ctx<>'staff' or exists(select 1 from public.personnel p where p.tenant_id=t and p.user_id=actor and p.status='active')))),false) end
$$;
create or replace function private.ticket_allowed(tid uuid,ctx text,action text,actor uuid default auth.uid()) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.tickets; c public.ticket_categories; cap text;
begin
 if ctx='customer' then return action in('read','reply','close') and private.customer_ticket_access(tid,actor);end if;
 select * into t from public.tickets where id=tid;if not found or not private.ticket_actor_active(t.tenant_id,ctx,actor) then return false;end if;
 select * into c from public.ticket_categories where id=t.category_id;
 if ctx='staff' then return t.route='internal' and t.reporter_user_id=actor and exists(select 1 from public.personnel p where p.id=t.reporter_personnel_id and p.tenant_id=t.tenant_id and p.user_id=actor and p.status='active') and action in ('read','reply','close');end if;
 if ctx='tenant' and t.route='internal' then
  if c.confidential and not private.ticket_has_cap(t.tenant_id,actor,'tickets.internal.hr',t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id) then return false;end if;
  cap:='tickets.internal.'||action;
 elsif ctx='support' and t.route='platform_support' then cap:='tickets.support.'||case when action in ('assign','close') then 'manage' else action end;
 elsif ctx='platform' and t.route='platform_support' then cap:='platform.support.'||case when action in ('assign','close') then 'manage' else action end;
 else return false;end if;
 return private.ticket_has_cap(t.tenant_id,actor,cap,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id)
 and (action='read' or private.ticket_has_cap(t.tenant_id,actor,case when ctx='tenant' then 'tickets.internal.read' when ctx='support' then 'tickets.support.read' else 'platform.support.read' end,t.category_id,t.personnel_id,t.object_id,t.customer_id,t.assigned_user_id));
end$$;
create or replace function private.ticket_create_allowed(t uuid,category uuid,ctx text,actor uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c public.ticket_categories;
begin
 if not private.ticket_actor_active(t,ctx,actor) then return false;end if;
 select * into c from public.ticket_categories where id=category and archived_at is null;if not found then return false;end if;
 if ctx='customer' then return c.customer_visible and not c.confidential and (c.tenant_id=t or(c.tenant_id is null and c.route='platform_support'));end if;
 if ctx='staff' then return c.route='internal' and c.tenant_id=t;end if;
 if ctx='support' then return c.route='platform_support' and private.ticket_has_cap(t,actor,'tickets.support.create',category);end if;
 return false;
end$$;
alter table public.ticket_files drop constraint ticket_files_workspace_check;
alter table public.ticket_files add constraint ticket_files_workspace_check check(workspace in('staff','tenant','support','platform','customer'));
create or replace function public.ticket_file_command(target_tenant uuid,actor_context text,command text,input jsonb,request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;f public.ticket_files;t public.tickets;sid uuid;file_size bigint;
begin
 if not private.ticket_session_active(actor,session) or actor_context not in ('staff','tenant','support','platform','customer') then raise exception 'Geen toegang' using errcode='42501';end if;
 if command='init' then
  if target_tenant is null or request_id is null then raise exception 'Ongeldige upload' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('ticket-upload:'||actor::text,0));
  sid:=nullif(input->>'ticketId','')::uuid;
  if sid is not null then
   select * into t from public.tickets where id=sid and tenant_id=target_tenant;
   if t.id is null or not private.ticket_allowed(t.id,actor_context,case when input->>'audience'='reporter' then 'reply' else 'note' end,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
  elsif input->>'audience'<>'reporter' or not private.ticket_create_allowed(target_tenant,(input->>'categoryId')::uuid,actor_context,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
  if (input->>'audience'='tenant' and actor_context not in ('tenant','support')) or (input->>'audience'='platform' and actor_context<>'platform') then raise exception 'Geen toegang' using errcode='42501';end if;
  select * into f from public.ticket_files where id=request_id;
  if found then
   if not private.ticket_file_write_allowed(f,actor,actor_context,session) or f.tenant_id<>target_tenant or f.draft_id<>(input->>'draftId')::uuid or f.ticket_id is distinct from sid or f.mime_type<>input->>'mime' or f.upload_size_bytes<>(input->>'size')::bigint or f.original_name<>input->>'name' or f.audience<>input->>'audience' or f.category_id<>coalesce(t.category_id,(input->>'categoryId')::uuid) then raise exception 'Uploadverzoek is gewijzigd' using errcode='40001';end if;
   return private.ticket_file_dto(f);
  end if;
  if (select count(*) from public.ticket_files where uploader_id=actor and draft_id=(input->>'draftId')::uuid and deleted_at is null)>=5 then raise exception 'Maximaal vijf bestanden per bericht' using errcode='23514';end if;
  if (select count(*) from public.ticket_files where uploader_id=actor and created_at>now()-interval '1 hour')>=30 or (select coalesce(sum(size_bytes),0) from public.ticket_files where tenant_id=target_tenant and created_at>now()-interval '1 day')>1073741824 then raise exception 'Uploadlimiet bereikt; probeer later opnieuw' using errcode='54000';end if;
  file_size:=(input->>'size')::bigint;
  if file_size not between 1 and 10485760 or input->>'name' is null or input->>'name'~'[[:cntrl:]/\\]' then raise exception 'Ongeldig bestand' using errcode='23514';end if;
  insert into public.ticket_files(id,tenant_id,ticket_id,category_id,uploader_id,uploader_session_id,workspace,audience,draft_id,original_name,mime_type,size_bytes,upload_size_bytes,quarantine_path)
  values(request_id,target_tenant,sid,coalesce(t.category_id,(input->>'categoryId')::uuid),actor,session,actor_context,input->>'audience',(input->>'draftId')::uuid,input->>'name',input->>'mime',file_size,file_size,target_tenant::text||'/quarantine/'||request_id::text)
  returning * into f;
  return private.ticket_file_dto(f);
 end if;
 select * into f from public.ticket_files where id=(input->>'id')::uuid and (target_tenant is null or tenant_id=target_tenant) for update;
 if f.id is null then raise exception 'Bestand niet beschikbaar' using errcode='42501';end if;
 if command='discard' then
  -- Own unbound drafts only. Retain a running scan lease until it expires so
  -- cleanup cannot race a scanner that is still writing its quarantined bytes.
  f.deleted_at:=null;
  if not private.ticket_file_write_allowed(f,actor,actor_context,session) then raise exception 'Geen toegang' using errcode='42501';end if;
  update public.ticket_files set deleted_at=coalesce(deleted_at,now()) where id=f.id;
  return jsonb_build_object('id',f.id,'removed',true);
 end if;
 if f.deleted_at is not null then raise exception 'Bestand niet beschikbaar' using errcode='42501';end if;
 if command in ('status','upload_context') then
  if not private.ticket_file_write_allowed(f,actor,actor_context,session) then raise exception 'Geen toegang' using errcode='42501';end if;
  if command='upload_context' then
   if f.expires_at<now() or f.scan_status not in ('uploading','pending','scanning','clean','error') then raise exception 'Uploadverzoek verlopen' using errcode='23514';end if;
   return private.ticket_file_dto(f)||jsonb_build_object('tenantId',f.tenant_id,'path',f.quarantine_path,'sha256',f.upload_sha256,'size',f.upload_size_bytes);
  end if;
  return private.ticket_file_dto(f);
 elsif command='download' then
  if f.message_id is null or f.scan_status<>'clean' or exists(select 1 from private.ticket_redactions r where r.message_id=f.message_id) or not private.ticket_message_allowed(f.message_id,actor_context,actor) then raise exception 'Bestand niet beschikbaar' using errcode='42501';end if;
  return private.ticket_file_dto(f)||jsonb_build_object('tenantId',f.tenant_id,'path',f.storage_path,'sha256',f.sha256);
 else raise exception 'Onbekende bestandactie' using errcode='23514';end if;
end $$;
revoke all on function private.customer_ticket_seed(uuid),private.customer_ticket_seed_trigger(),private.customer_ticket_identity(uuid,uuid,uuid),private.customer_ticket_access(uuid,uuid) from public,anon,authenticated,service_role;

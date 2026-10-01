-- Verified query-first companion to tickets_support. No fake-clean path; service-only
-- finalization records the actual scanner outcome for the exact stored hash.
begin;
create table public.ticket_files (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 ticket_id uuid, message_id uuid, category_id uuid not null references public.ticket_categories(id),
 uploader_id uuid not null references auth.users(id), uploader_session_id uuid,
 workspace text not null check(workspace in ('staff','tenant','support','platform')),
 audience text not null check(audience in ('reporter','tenant','platform')),
 draft_id uuid not null, original_name text not null check(length(original_name) between 1 and 180),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760), upload_size_bytes bigint check(upload_size_bytes between 1 and 10485760),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), upload_sha256 text check(upload_sha256 ~ '^[a-f0-9]{64}$'),
 quarantine_path text not null unique, storage_path text unique,
 scan_status text not null default 'uploading' check(scan_status in ('uploading','pending','scanning','clean','rejected','error')),
 scanner_engine text, scanner_database text, scanned_at timestamptz,
 scan_attempts integer not null default 0, scan_available_at timestamptz not null default now(),
 scan_lease uuid, scan_locked_until timestamptz, error_code text,
 source_file_id uuid, source_sha256 text, copied_by uuid,
 expires_at timestamptz not null default now()+interval '15 minutes',
 created_at timestamptz not null default now(), deleted_at timestamptz, storage_deleted_at timestamptz,
 unique(tenant_id,id),
 foreign key(tenant_id,ticket_id) references public.tickets(tenant_id,id),
 foreign key(tenant_id,message_id) references public.ticket_messages(tenant_id,id),
 foreign key(tenant_id,source_file_id) references public.ticket_files(tenant_id,id),
 check(message_id is null or ticket_id is not null),
 check(scan_status<>'clean' or (sha256 is not null and storage_path is not null and scanner_engine is not null and scanned_at is not null))
);
create index ticket_files_message_idx on public.ticket_files(tenant_id,message_id);
create unique index ticket_message_parent_key on public.ticket_messages(tenant_id,ticket_id,id);
alter table public.ticket_files add constraint ticket_files_message_parent_fk foreign key(tenant_id,ticket_id,message_id) references public.ticket_messages(tenant_id,ticket_id,id);
create index ticket_files_upload_idx on public.ticket_files(uploader_id,draft_id,created_at);
create index ticket_files_scan_idx on public.ticket_files(scan_available_at,created_at) where scan_status in ('pending','error','scanning') and deleted_at is null;
alter table public.ticket_files enable row level security;
alter table public.ticket_files force row level security;
revoke all on public.ticket_files from public,anon,authenticated;
grant all on public.ticket_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ticket-files','ticket-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
-- No browser Storage policies. Only the bounded server upload/download paths
-- can use this bucket; existing bucket helpers return false for this name.

create or replace function private.ticket_file_dto(f public.ticket_files) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',f.id,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes,
 'status',f.scan_status,'scanState',case f.scan_status when 'uploading' then 'pending' when 'scanning' then 'processing' else f.scan_status end,'createdAt',f.created_at)
$$;
create or replace function private.ticket_file_write_allowed(f public.ticket_files,actor uuid,context text,session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select f.uploader_id=actor and f.uploader_session_id=session and f.workspace=context and f.message_id is null and f.deleted_at is null
 and private.ticket_session_active(actor,session)
 and case when f.ticket_id is null then private.ticket_create_allowed(f.tenant_id,f.category_id,context,actor)
 else private.ticket_allowed(f.ticket_id,context,case when f.audience='reporter' then 'reply' else 'note' end,actor) end
$$;
create or replace function public.ticket_file_command(target_tenant uuid,actor_context text,command text,input jsonb,request_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;f public.ticket_files;t public.tickets;sid uuid;file_size bigint;
begin
 if not private.ticket_session_active(actor,session) or actor_context not in ('staff','tenant','support','platform') then raise exception 'Geen toegang' using errcode='42501';end if;
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
revoke all on function public.ticket_file_command(uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.ticket_file_command(uuid,text,text,jsonb,uuid) to authenticated;

create or replace function public.ticket_file_server_finalize(file_id uuid,actor_id uuid,session_id uuid,content_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.ticket_files;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into f from public.ticket_files where id=file_id for update;
 if f.id is null or not private.ticket_file_write_allowed(f,actor_id,f.workspace,session_id) or f.expires_at<now() or content_hash!~'^[a-f0-9]{64}$' then raise exception 'Upload kan niet worden bevestigd' using errcode='42501';end if;
 if f.scan_status<>'uploading' then
  if f.upload_sha256<>content_hash then raise exception 'Uploadinhoud gewijzigd' using errcode='40001';end if;
  return private.ticket_file_dto(f);
 end if;
 if not exists(select 1 from storage.objects where bucket_id='ticket-files' and name=f.quarantine_path and metadata->>'mimetype'=f.mime_type and (metadata->>'size')::bigint=f.upload_size_bytes) then raise exception 'Upload is onvolledig' using errcode='23514';end if;
 update public.ticket_files set scan_status='pending',sha256=content_hash,upload_sha256=content_hash where id=f.id returning * into f;
 return private.ticket_file_dto(f);
end $$;
revoke all on function public.ticket_file_server_finalize(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ticket_file_server_finalize(uuid,uuid,uuid,text) to service_role;

create or replace function private.ticket_attach_to_message(tid uuid,mid uuid,ids uuid[],actor uuid,ctx text)
returns void language plpgsql security definer set search_path='' as $$
declare context alias for $5;t public.tickets;m public.ticket_messages;f public.ticket_files;fid uuid;session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if cardinality(coalesce(ids,'{}'))>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Maximaal vijf unieke bestanden' using errcode='23514';end if;
 select * into t from public.tickets where id=tid;
 select * into m from public.ticket_messages where id=mid and ticket_id=tid and tenant_id=t.tenant_id;
 if m.id is null or m.author_user_id<>actor or not private.ticket_message_allowed(mid,context,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
 foreach fid in array coalesce(ids,'{}') loop
  select * into f from public.ticket_files where id=fid for update;
  if f.id is null or f.tenant_id<>t.tenant_id or f.category_id<>t.category_id or f.audience<>m.audience or f.scan_status<>'clean' or f.created_at<now()-interval '24 hours' or not private.ticket_file_write_allowed(f,actor,context,session) or (f.ticket_id is not null and f.ticket_id<>tid) then raise exception 'Bijlage is niet vrijgegeven voor dit bericht' using errcode='42501';end if;
  update public.ticket_files set ticket_id=tid,message_id=mid where id=f.id;
 end loop;
end $$;
create or replace function private.ticket_message_files(mid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.ticket_file_dto(f) order by f.created_at),'[]') from public.ticket_files f where f.message_id=mid and f.deleted_at is null and not exists(select 1 from private.ticket_redactions r where r.message_id=mid)
$$;

create or replace function private.ticket_copy_files(src uuid,dst uuid,mid uuid,ids uuid[],actor uuid,ctx text)
returns void language plpgsql security definer set search_path='' as $$
declare source alias for $1;dest alias for $2;destmessage alias for $3;context alias for $6;s public.tickets;d public.tickets;m public.ticket_messages;f public.ticket_files;fid uuid;new_id uuid;
begin
 if cardinality(coalesce(ids,'{}'))>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Maximaal vijf unieke bijlagen' using errcode='23514';end if;
 select * into s from public.tickets where id=source;select * into d from public.tickets where id=dest;
 select * into m from public.ticket_messages where id=destmessage and ticket_id=dest and tenant_id=d.tenant_id;
 if context<>'tenant' or s.tenant_id<>d.tenant_id or s.route<>'internal' or d.route<>'platform_support' or m.audience<>'reporter' or not private.ticket_allowed(source,context,'share',actor) or not private.ticket_allowed(dest,'support','read',actor) or exists(select 1 from public.ticket_categories where id=s.category_id and (confidential or not can_escalate)) then raise exception 'Delen niet toegestaan' using errcode='42501';end if;
 foreach fid in array coalesce(ids,'{}') loop
  select * into f from public.ticket_files where id=fid and ticket_id=source for update;
  if f.id is null or f.audience<>'reporter' or f.scan_status<>'clean' or f.deleted_at is not null or exists(select 1 from private.ticket_redactions r where r.message_id=f.message_id) or not private.ticket_message_allowed(f.message_id,context,actor) then raise exception 'Bijlage niet deelbaar' using errcode='42501';end if;
  new_id:=gen_random_uuid();
  insert into public.ticket_files(id,tenant_id,ticket_id,message_id,category_id,uploader_id,uploader_session_id,workspace,audience,draft_id,original_name,mime_type,size_bytes,quarantine_path,scan_status,source_file_id,source_sha256,copied_by)
  values(new_id,d.tenant_id,d.id,m.id,d.category_id,actor,nullif(auth.jwt()->>'session_id','')::uuid,'support','reporter',m.id,f.original_name,f.mime_type,f.size_bytes,d.tenant_id::text||'/quarantine/'||new_id::text,'pending',f.id,f.sha256,actor);
 end loop;
end $$;

create or replace function private.ticket_copy_release_allowed(f public.ticket_files) returns boolean language sql stable security definer set search_path='' as $$
 select f.source_file_id is not null and f.copied_by is not null and private.ticket_session_active(f.copied_by,f.uploader_session_id)
 and private.ticket_allowed(f.ticket_id,'support','read',f.copied_by)
 and exists(select 1 from public.ticket_files s join public.ticket_messages m on m.id=s.message_id and m.ticket_id=s.ticket_id
 join public.tickets t on t.id=s.ticket_id join public.ticket_categories c on c.id=t.category_id
 where s.id=f.source_file_id and s.tenant_id=f.tenant_id and s.scan_status='clean' and s.sha256=f.source_sha256 and s.deleted_at is null
 and s.audience='reporter' and m.audience='reporter' and not c.confidential and c.can_escalate
 and not exists(select 1 from private.ticket_redactions r where r.message_id=m.id)
 and private.ticket_allowed(t.id,'tenant','share',f.copied_by) and private.ticket_message_allowed(m.id,'tenant',f.copied_by))
$$;
revoke all on function private.ticket_copy_release_allowed(public.ticket_files) from public,anon,authenticated;

create or replace function public.ticket_scan_claim(batch_size integer default 2,target_file uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 with chosen as(select id from public.ticket_files where deleted_at is null and scan_attempts<12 and (target_file is null or id=target_file)
 and (scan_status in ('pending','error') or (scan_status='scanning' and scan_locked_until<now())) and scan_available_at<=now()
 and (message_id is not null or created_at>now()-interval '24 hours') order by created_at for update skip locked limit greatest(1,least(batch_size,2))),
 updated as(update public.ticket_files f set scan_status='scanning',scan_attempts=scan_attempts+1,scan_lease=gen_random_uuid(),scan_locked_until=now()+interval '3 minutes' from chosen c where c.id=f.id returning f.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'tenantId',u.tenant_id,'path',u.quarantine_path,'mime',u.mime_type,'size',u.size_bytes,'sha256',u.sha256,'lease',u.scan_lease,
 'source',case when s.id is not null and private.ticket_copy_release_allowed(u) then jsonb_build_object('path',s.storage_path,'sha256',s.sha256) else null end,'copy',u.source_file_id is not null)),'[]') into result
 from updated u left join public.ticket_files s on s.id=u.source_file_id and s.tenant_id=u.tenant_id;
 return result;
end $$;
create or replace function public.ticket_scan_finish(file_id uuid,lease_id uuid,outcome text,result jsonb default '{}')
returns boolean language plpgsql security definer set search_path='' as $$
declare f public.ticket_files;path text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into f from public.ticket_files where id=file_id and scan_lease=lease_id and scan_status='scanning' and scan_locked_until>now() and deleted_at is null for update;
 if f.id is null then return false;end if;
 if f.source_file_id is not null and not private.ticket_copy_release_allowed(f) then
  update public.ticket_files set scan_status='rejected',scan_lease=null,scan_locked_until=null,error_code='share_access_changed' where id=f.id;return false;
 end if;
 if outcome not in ('clean','rejected','error') then raise exception 'Ongeldige scanuitslag' using errcode='23514';end if;
 if outcome='clean' then
  path:=f.tenant_id::text||'/released/'||f.id::text||'/'||(result->>'sha256');
  if f.source_file_id is not null and result->>'sha256' is distinct from f.source_sha256 then raise exception 'De gedeelde kopie wijkt af van de gekozen versie' using errcode='23514';end if;
  if result->>'engine' not like 'ClamAV %' or result->>'sha256'!~'^[a-f0-9]{64}$' or (result->>'size')::bigint not between 1 and 10485760 or not exists(select 1 from storage.objects where bucket_id='ticket-files' and name=path and metadata->>'mimetype'=f.mime_type and (metadata->>'size')::bigint=(result->>'size')::bigint) then raise exception 'Geen aantoonbare vrijgave' using errcode='23514';end if;
  update public.ticket_files set scan_status='clean',storage_path=path,sha256=result->>'sha256',size_bytes=(result->>'size')::bigint,scanner_engine=result->>'engine',scanner_database=result->>'databaseVersion',scanned_at=now(),scan_lease=null,scan_locked_until=null,error_code=null where id=f.id;
 else
  update public.ticket_files set scan_status=outcome,scan_lease=null,scan_locked_until=null,error_code=case when outcome='rejected' then 'rejected' else 'scanner_unavailable' end,scan_available_at=now()+make_interval(secs=>least(3600,30*power(2,least(f.scan_attempts,6))::integer)) where id=f.id;
 end if;
 return true;
end $$;
revoke all on function public.ticket_scan_claim(integer,uuid),public.ticket_scan_finish(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ticket_scan_claim(integer,uuid),public.ticket_scan_finish(uuid,uuid,text,jsonb) to service_role;

drop function if exists public.ticket_file_cleanup(integer);
create or replace function public.ticket_file_cleanup(batch_size integer default 25,target_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 -- Only unattached staging artifacts; this is not a retention/purge policy.
 with chosen as(select id from public.ticket_files where (target_tenant is null or tenant_id=target_tenant) and message_id is null and storage_deleted_at is null and (deleted_at is not null or created_at<now()-interval '24 hours') and (scan_locked_until is null or scan_locked_until<now()) order by created_at for update skip locked limit least(greatest(batch_size,1),100)),
 updated as(update public.ticket_files f set deleted_at=coalesce(deleted_at,now()) from chosen c where c.id=f.id returning f.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prefix',tenant_id::text||'/released/'||id::text,'paths',jsonb_build_array(quarantine_path,storage_path))),'[]') into result from updated;
 return result;
end $$;
revoke all on function public.ticket_file_cleanup(integer,uuid) from public,anon,authenticated;
grant execute on function public.ticket_file_cleanup(integer,uuid) to service_role;
create or replace function public.ticket_file_cleanup_done(file_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 update public.ticket_files set storage_deleted_at=now() where id=file_id and message_id is null and deleted_at is not null;
end $$;
revoke all on function public.ticket_file_cleanup_done(uuid) from public,anon,authenticated;
grant execute on function public.ticket_file_cleanup_done(uuid) to service_role;

-- Private helpers are not browser RPCs. Core functions call them as owner.
revoke all on function private.ticket_file_dto(public.ticket_files),private.ticket_file_write_allowed(public.ticket_files,uuid,text,uuid),private.ticket_attach_to_message(uuid,uuid,uuid[],uuid,text),private.ticket_message_files(uuid),private.ticket_copy_files(uuid,uuid,uuid,uuid[],uuid,text) from public,anon,authenticated;
create table public.ticket_notification_preferences (
 id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),user_id uuid not null references auth.users(id),
 context text not null check(context in ('staff','tenant','support','platform')),
 in_app boolean not null default true,push boolean not null default true,email boolean not null default true,
 check((context='platform')=(tenant_id is null))
);
create unique index ticket_preferences_scope_key on public.ticket_notification_preferences(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,context);
create table private.ticket_deliveries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 ticket_id uuid not null,event_id uuid not null,outbox_id uuid not null,
 recipient_id uuid not null references auth.users(id),context text not null,
 channel text not null check(channel in ('in_app','email','push')),subscription_id uuid,
 status text not null default 'queued' check(status in ('queued','claimed','sending','sent','failed','uncertain','cancelled')),
 lease uuid,locked_until timestamptz,available_at timestamptz not null default now(),attempts integer not null default 0,
 provider_id text,error_code text,created_at timestamptz not null default now(),sent_at timestamptz,
 foreign key(tenant_id,ticket_id) references public.tickets(tenant_id,id),
 foreign key(tenant_id,outbox_id) references public.outbox_events(tenant_id,id)
);
create unique index ticket_deliveries_unique on private.ticket_deliveries(event_id,recipient_id,channel,coalesce(subscription_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index ticket_deliveries_claim_idx on private.ticket_deliveries(available_at,created_at) where status in ('queued','failed','claimed','sending');
alter table public.ticket_notification_preferences enable row level security;
alter table public.ticket_notification_preferences force row level security;
alter table private.ticket_deliveries enable row level security;
alter table private.ticket_deliveries force row level security;
revoke all on public.ticket_notification_preferences,private.ticket_deliveries from public,anon,authenticated;
grant all on public.ticket_notification_preferences,private.ticket_deliveries to service_role;

create or replace function private.ticket_preferences_save(t uuid,ctx text,actor uuid,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=case when ctx='platform' then null else t end;p public.ticket_notification_preferences;
begin
 if not private.ticket_actor_active(tenant,ctx,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
 if input ? 'email' or input ? 'push' then
  insert into public.ticket_notification_preferences(tenant_id,user_id,context,push,email)
  values(tenant,actor,ctx,coalesce((input->>'push')::boolean,true),coalesce((input->>'email')::boolean,true))
  on conflict((coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid)),user_id,context) do update set push=coalesce((input->>'push')::boolean,ticket_notification_preferences.push),email=coalesce((input->>'email')::boolean,ticket_notification_preferences.email);
 end if;
 select * into p from public.ticket_notification_preferences where tenant_id is not distinct from tenant and user_id=actor and ticket_notification_preferences.context=ctx;
 return jsonb_build_object('inApp',coalesce(p.in_app,true),'push',coalesce(p.push,true),'email',coalesce(p.email,true));
end $$;
-- A browser subscription on the platform origin is not a tenant membership.
-- Global subscriptions are reused only after each event's current scoped grant
-- check; new authorized organizations require no per-ticket registration.
alter table public.push_subscriptions alter column tenant_id drop not null;
create unique index push_subscriptions_platform_endpoint_key on public.push_subscriptions(user_id,endpoint) where tenant_id is null;
alter policy push_subscriptions_self on public.push_subscriptions
 using (tenant_id is not null and user_id=(select auth.uid()) and (select private.is_member(tenant_id)))
 with check (tenant_id is not null and user_id=(select auth.uid()) and (select private.is_member(tenant_id)));
create or replace function public.ticket_push_subscription(ctx text,targettenant uuid,action text,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();session uuid:=nullif(auth.jwt()->>'session_id','')::uuid;ep text:=input->>'endpoint';key text;subscription uuid;
begin
 if not private.ticket_session_active(actor,session) or ctx is null or ctx not in ('staff','tenant','support','platform') or (ctx='platform') is distinct from (targettenant is null) then raise exception 'Geen toegang' using errcode='42501';end if;
 if action is null or action not in ('subscribe','unsubscribe') or jsonb_typeof(input) is distinct from 'object' or ep is null or length(ep)>4096 or ep~'[[:space:]#\\]' or ep!~'^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9-]+([.][a-z0-9-]+)*[.]push[.]apple[.]com|[a-z0-9-]+([.][a-z0-9-]+)*[.]notify[.]windows[.]com)(:443)?/[^[:space:]#]*$' or exists(select 1 from jsonb_object_keys(input) k where k not in ('endpoint','keys')) then raise exception 'Ongeldige pushregistratie' using errcode='23514';end if;
 if action='unsubscribe' then
  -- Revoking one's own device is safe even if its former read grant was removed.
  update public.push_subscriptions set revoked_at=now() where tenant_id is not distinct from targettenant and user_id=actor and endpoint=ep;
  return jsonb_build_object('active',false);
 end if;
 if not private.ticket_actor_active(targettenant,ctx,actor) then raise exception 'Geen toegang' using errcode='42501';end if;
 key:=case ctx when 'platform' then 'platform.support.read' when 'support' then 'tickets.support.read' else 'tickets.internal.read' end;
 if ctx<>'staff' and not exists(select 1 from public.permission_grants g left join public.tenant_memberships m on m.id=g.membership_id and m.user_id=g.user_id and m.tenant_id=g.tenant_id
  where g.user_id=actor and g.tenant_id is not distinct from targettenant and g.capability=key and g.enabled and (ctx='platform' or m.status='active')) then raise exception 'Geen toegang' using errcode='42501';end if;
 if jsonb_typeof(input->'keys') is distinct from 'object' or (input#>>'{keys,p256dh}') is null or (input#>>'{keys,p256dh}')!~'^[A-Za-z0-9_-]{87}=?$' or (input#>>'{keys,auth}') is null or (input#>>'{keys,auth}')!~'^[A-Za-z0-9_-]{22}(==)?$' or exists(select 1 from jsonb_object_keys(input->'keys') k where k not in ('p256dh','auth')) then raise exception 'Ongeldige pushsleutels' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('ticket-push:'||actor::text,0));
 if (select count(*) from public.push_subscriptions where user_id=actor and revoked_at is null and endpoint<>ep)>=20 then raise exception 'Maximaal twintig actieve pushapparaten' using errcode='54000';end if;
 if ctx='platform' then
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_secret) values(actor,ep,input#>>'{keys,p256dh}',input#>>'{keys,auth}')
  on conflict(user_id,endpoint) where tenant_id is null do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,revoked_at=null returning id into subscription;
 else
  insert into public.push_subscriptions(tenant_id,user_id,endpoint,p256dh,auth_secret) values(targettenant,actor,ep,input#>>'{keys,p256dh}',input#>>'{keys,auth}')
  on conflict(tenant_id,user_id,endpoint) do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,revoked_at=null returning id into subscription;
 end if;
 return jsonb_build_object('active',true,'id',subscription);
end $$;
revoke all on function public.ticket_push_subscription(text,uuid,text,jsonb) from public,anon;
grant execute on function public.ticket_push_subscription(text,uuid,text,jsonb) to authenticated;

create or replace function private.ticket_delivery_allowed(d private.ticket_deliveries)
returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_actor_active(d.tenant_id,d.context,d.recipient_id)
 and private.ticket_event_allowed(d.event_id,d.context,d.recipient_id)
 and coalesce((select case d.channel when 'email' then p.email when 'push' then p.push else p.in_app end from public.ticket_notification_preferences p where p.tenant_id is not distinct from case when d.context='platform' then null else d.tenant_id end and p.user_id=d.recipient_id and p.context=d.context),true)
 and (d.channel<>'push' or exists(select 1 from public.push_subscriptions s where s.id=d.subscription_id and s.tenant_id is not distinct from case when d.context='platform' then null else d.tenant_id end and s.user_id=d.recipient_id and s.revoked_at is null))
$$;
create or replace function public.ticket_outbox_prepare(target_event uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare e public.outbox_events;te public.ticket_events;c record;p public.ticket_notification_preferences;created integer:=0;n integer;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into e from public.outbox_events where id=target_event and event_type='ticket.changed' for update;
 if e.id is null then raise exception 'Onbekend ticketevent' using errcode='23514';end if;
 select * into te from public.ticket_events where id=(e.payload->>'event_id')::uuid and tenant_id=e.tenant_id and ticket_id=e.aggregate_id;
 if te.id is null then raise exception 'Ticketevent ontbreekt' using errcode='23514';end if;
 for c in select distinct on (x.user_id) x.user_id,x.context from private.ticket_notification_candidates(te.ticket_id,te.audience) x
 where x.user_id is distinct from te.actor_user_id and private.ticket_event_allowed(te.id,x.context,x.user_id)
 order by x.user_id,case x.context when 'staff' then 0 when 'support' then 1 when 'tenant' then 2 else 3 end loop
  select * into p from public.ticket_notification_preferences where tenant_id is not distinct from case when c.context='platform' then null else e.tenant_id end and user_id=c.user_id and context=c.context;
  if coalesce(p.in_app,true) then
   insert into private.ticket_deliveries(tenant_id,ticket_id,event_id,outbox_id,recipient_id,context,channel) values(e.tenant_id,te.ticket_id,te.id,e.id,c.user_id,c.context,'in_app') on conflict do nothing;
   get diagnostics n=row_count;created:=created+n;
  end if;
  if coalesce(p.email,true) then
   insert into private.ticket_deliveries(tenant_id,ticket_id,event_id,outbox_id,recipient_id,context,channel) values(e.tenant_id,te.ticket_id,te.id,e.id,c.user_id,c.context,'email') on conflict do nothing;
   get diagnostics n=row_count;created:=created+n;
  end if;
  if coalesce(p.push,true) then
   insert into private.ticket_deliveries(tenant_id,ticket_id,event_id,outbox_id,recipient_id,context,channel,subscription_id)
   select e.tenant_id,te.ticket_id,te.id,e.id,c.user_id,c.context,'push',s.id from public.push_subscriptions s where s.tenant_id is not distinct from case when c.context='platform' then null else e.tenant_id end and s.user_id=c.user_id and s.revoked_at is null on conflict do nothing;
   get diagnostics n=row_count;created:=created+n;
  end if;
 end loop;
 -- Outbox success means durable fan-out, not provider acceptance.
 update public.outbox_events set status='sent',processed_at=now(),locked_until=null,last_error=null where id=e.id;
 return created;
end $$;
drop function if exists public.ticket_delivery_claim(integer);
create or replace function public.ticket_delivery_claim(batch_size integer default 20,target_tenant uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 -- A crash after provider submission has unknown outcome. Never retry automatically.
 update private.ticket_deliveries set status='uncertain',error_code='interrupted_send',lease=null,locked_until=null where (target_tenant is null or tenant_id=target_tenant) and status='sending' and locked_until<now();
 with chosen as(select id from private.ticket_deliveries where (target_tenant is null or tenant_id=target_tenant) and attempts<8 and available_at<=now() and (status in ('queued','failed') or (status='claimed' and locked_until<now())) order by created_at for update skip locked limit least(greatest(batch_size,1),25)),
 updated as(update private.ticket_deliveries d set status='claimed',lease=gen_random_uuid(),locked_until=now()+interval '10 minutes',attempts=attempts+1 from chosen c where d.id=c.id returning d.id,d.lease)
 select coalesce(jsonb_agg(to_jsonb(updated)),'[]') into result from updated;
 return result;
end $$;
create or replace function public.ticket_delivery_begin(delivery_id uuid,lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.ticket_deliveries;t public.tickets;b public.tenant_branding;org public.tenants;s public.push_subscriptions;recipient text;path text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into d from private.ticket_deliveries where id=delivery_id and lease=lease_id and status='claimed' and locked_until>now() for update;
 if d.id is null then return null;end if;
 if not private.ticket_delivery_allowed(d) then update private.ticket_deliveries set status='cancelled',lease=null,locked_until=null where id=d.id;return null;end if;
 select * into t from public.tickets where id=d.ticket_id and tenant_id=d.tenant_id;
 path:=case d.context when 'staff' then '/staff/meldingen/' when 'tenant' then '/app/meldingen/' when 'support' then '/app/support/' else '/platform/support/' end||t.id::text;
 if d.channel='in_app' then
  insert into public.notifications(id,tenant_id,user_id,outbox_event_id,channel,title,body,target_path,status,sent_at)
  values(d.id,d.tenant_id,d.recipient_id,d.outbox_id,'in_app','Nieuwe ticketmelding','Er staat een update klaar. Open de beveiligde omgeving om deze te bekijken.',path,'sent',now()) on conflict do nothing;
  update private.ticket_deliveries set status='sent',sent_at=now(),lease=null,locked_until=null where id=d.id;return null;
 end if;
 select email into recipient from auth.users where id=d.recipient_id and deleted_at is null;
 if recipient is null then update private.ticket_deliveries set status='cancelled',lease=null,locked_until=null where id=d.id;return null;end if;
 select * into org from public.tenants where id=d.tenant_id;
 select * into b from public.tenant_branding where tenant_id=d.tenant_id;
 if d.channel='push' then select * into s from public.push_subscriptions where id=d.subscription_id;end if;
 update private.ticket_deliveries set status='sending',locked_until=now()+interval '2 minutes' where id=d.id;
 if d.channel='email' then
  insert into public.mail_deliveries(id,tenant_id,outbox_event_id,recipient,template,idempotency_key,status,attempts)
  values(d.id,d.tenant_id,d.outbox_id,recipient,'ticket_event','ticket-'||d.id::text,'processing',d.attempts)
  on conflict(id) do update set status='processing',attempts=d.attempts;
 end if;
 return jsonb_build_object('id',d.id,'tenantId',d.tenant_id,'channel',d.channel,'context',d.context,'route',t.route,'recipient',recipient,'path',path,'slug',org.slug,
 'brand',jsonb_build_object('company',org.name,'primary',b.primary_color,'accent',b.accent_color,'logoPath',b.logo_path),
 'subscription',case when s.id is not null then jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret)) else null end);
end $$;
create or replace function public.ticket_delivery_finish(delivery_id uuid,lease_id uuid,outcome text,provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d private.ticket_deliveries;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if outcome not in ('sent','failed','uncertain','cancelled') then raise exception 'Ongeldige bezorgstatus' using errcode='23514';end if;
 select * into d from private.ticket_deliveries where id=delivery_id and lease=lease_id and status in ('sending','claimed') for update;
 if d.id is null then return false;end if;
 update private.ticket_deliveries set status=outcome,provider_id=ticket_delivery_finish.provider_id,sent_at=case when outcome='sent' then now() else null end,error_code=case when outcome='sent' then null else 'delivery_'||outcome end,lease=null,locked_until=null,available_at=now()+make_interval(secs=>least(3600,30*power(2,least(d.attempts,6))::integer)) where id=d.id;
 if d.channel='email' then update public.mail_deliveries set status=case when outcome='sent' then 'sent'::public.delivery_status when outcome='failed' then 'failed'::public.delivery_status else 'processing'::public.delivery_status end,provider_message_id=ticket_delivery_finish.provider_id,sent_at=case when outcome='sent' then now() else null end,last_error=case when outcome='sent' then null else 'Ticketbezorging '||outcome||'; geen berichtinhoud opgeslagen.' end where id=d.id;end if;
 if outcome='cancelled' and d.channel='push' then update public.push_subscriptions set revoked_at=now() where id=d.subscription_id;end if;
 return true;
end $$;
revoke all on function public.ticket_outbox_prepare(uuid),public.ticket_delivery_claim(integer,uuid),public.ticket_delivery_begin(uuid,uuid),public.ticket_delivery_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ticket_outbox_prepare(uuid),public.ticket_delivery_claim(integer,uuid),public.ticket_delivery_begin(uuid,uuid),public.ticket_delivery_finish(uuid,uuid,text,text) to service_role;

create or replace function private.ticket_notification_visible(notification_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.ticket_deliveries d where d.id=notification_id) or (private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) and exists(select 1 from private.ticket_deliveries d where d.id=notification_id and d.recipient_id=auth.uid() and private.ticket_delivery_allowed(d)))
$$;
create or replace function private.ticket_platform_notification_visible(notification_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ticket_deliveries d where d.id=notification_id and d.recipient_id=auth.uid() and d.context='platform' and private.ticket_delivery_allowed(d))
$$;
create policy ticket_notifications_live on public.notifications as restrictive for select to authenticated using(private.ticket_notification_visible(id));
alter policy notifications_self_read on public.notifications using((user_id=(select auth.uid()) and (select private.is_member(tenant_id))) or private.ticket_platform_notification_visible(id));
revoke all on function private.ticket_preferences_save(uuid,text,uuid,jsonb),private.ticket_delivery_allowed(private.ticket_deliveries),private.ticket_notification_visible(uuid),private.ticket_platform_notification_visible(uuid) from public,anon,authenticated;
grant execute on function private.ticket_notification_visible(uuid),private.ticket_platform_notification_visible(uuid) to authenticated;

create or replace function private.ticket_notification_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role'='authenticated' and exists(select 1 from private.ticket_deliveries where id=old.id) then
  if not private.ticket_notification_visible(old.id) or (to_jsonb(new)-'read_at') is distinct from (to_jsonb(old)-'read_at') then raise exception 'Alleen eigen leesstatus mag worden gewijzigd' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger ticket_notification_write_guard before update on public.notifications for each row execute function private.ticket_notification_write_guard();
revoke all on function private.ticket_notification_write_guard() from public,anon,authenticated;

-- Recover only ticket fan-out: its unique recipient delivery keys make replay
-- safe. Legacy providers retain their existing contract, not a blind repeat send.
create index outbox_ticket_recovery_idx on public.outbox_events(locked_until) where status='processing' and event_type='ticket.changed';
drop function if exists public.claim_outbox(integer,integer);
drop function if exists public.claim_outbox(integer,integer,boolean);
create or replace function public.claim_outbox(batch_size integer default 25,lock_seconds integer default 60,include_tickets boolean default false,target_tenant uuid default null)
returns setof public.outbox_events language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('request.jwt.claim.role',true),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 return query with selected as(select e.id from public.outbox_events e
 where (target_tenant is null or e.tenant_id=target_tenant) and (e.event_type<>'ticket.changed' or include_tickets is true)
 and (e.status in ('queued','failed') or (include_tickets is true and e.status='processing' and e.event_type='ticket.changed' and e.locked_until<clock_timestamp()))
 and e.available_at<=clock_timestamp() and (e.locked_until is null or e.locked_until<clock_timestamp())
 order by e.created_at for update skip locked limit greatest(1,least(batch_size,100)))
 update public.outbox_events e set status='processing',locked_until=clock_timestamp()+make_interval(secs=>greatest(10,least(lock_seconds,600))),attempts=e.attempts+1 from selected s where e.id=s.id returning e.*;
end $$;
revoke all on function public.claim_outbox(integer,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.claim_outbox(integer,integer,boolean,uuid) to service_role;
commit;

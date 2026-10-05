-- Scope and current-offer guards precede receipts. Delegation retains the
-- canonical request reply/quote decision, not a parallel commercial workflow.
create function public.customer_portal_commercial_command(target_tenant uuid,target_account uuid,command_id uuid,command text,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;r public.requests;q public.quotes;receipt private.customer_portal_commands;h text;result jsonb;row_version integer;row_status text;target_id uuid;
begin
 if command_id is null or not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot deze klantactie' using errcode='42501';end if;
 if command not in('reply','decide') or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>18000
  or jsonb_typeof(input->'id') is distinct from 'string' or input->>'id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or jsonb_typeof(input->'version') is distinct from 'number' or input->>'version'!~'^[1-9][0-9]*$'
  or exists(select 1 from jsonb_object_keys(input)key where key not in('id','version','body','revision','decision','name','evidence','confirmed'))
 then raise exception 'Ongeldige klantactie' using errcode='23514';end if;
 if command='reply' and (exists(select 1 from jsonb_object_keys(input)key where key not in('id','version','body'))
  or jsonb_typeof(input->'body') is distinct from 'string' or length(btrim(input->>'body')) not between 3 and 5000)
 then raise exception 'Controleer je aanvullende informatie' using errcode='23514';end if;
 if command='decide' and (input?'body' or jsonb_typeof(input->'decision') is distinct from 'string' or input->>'decision' not in('accepted','rejected','change_requested')
  or jsonb_typeof(input->'name') is distinct from 'string' or length(btrim(input->>'name')) not between 2 and 180
  or jsonb_typeof(input->'revision') is distinct from 'number' or input->>'revision'!~'^[1-9][0-9]*$'
  or jsonb_typeof(input->'evidence') is distinct from 'string' or length(input->>'evidence')>3000
  or (input->>'decision'<>'accepted' and length(btrim(input->>'evidence'))<3)
  or jsonb_typeof(input->'confirmed') is distinct from 'boolean' or (input->>'confirmed')::boolean is not true)
 then raise exception 'Controleer de offerteversie, je besluit en de bevestiging' using errcode='23514';end if;
 target_id:=(input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||command_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for share;
 perform 1 from public.customer_contacts where tenant_id=target_tenant and id=a.contact_id for share;
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Je klanttoegang is gewijzigd' using errcode='42501';end if;
 if command='reply' then
  select * into r from public.requests where tenant_id=target_tenant and id=target_id and customer_id=a.customer_id for update;
  if r.id is null or not private.commercial_customer_scope(target_tenant,r.customer_id,r.object_id,r.created_by)
  then raise exception 'Geen toegang tot deze klantaanvraag' using errcode='42501';end if;
  if r.archived_at is not null or r.status in('rejected','withdrawn') then raise exception 'Deze aanvraag is afgesloten' using errcode='23514';end if;
  row_version:=r.version;row_status:=r.status;
 else
  select * into q from public.quotes where tenant_id=target_tenant and id=target_id and customer_id=a.customer_id for update;
  if q.id is null or not private.commercial_customer_scope(target_tenant,q.customer_id,q.object_id)
  then raise exception 'Geen toegang tot deze klantofferte' using errcode='42501';end if;
  -- These checks apply even to a retry whose old legacy receipt exists.
  if q.published_at is null or q.revision<>(input->>'revision')::integer or q.expires_at is null or q.expires_at<=clock_timestamp()
   or q.superseded_at is not null or q.archived_at is not null
   or exists(select 1 from public.quotes newer where newer.tenant_id=target_tenant and newer.series_id=q.series_id and newer.revision>q.revision and newer.published_at is not null)
  then raise exception 'Deze offerteversie is verlopen of vervangen. Controleer de actuele versie.' using errcode='23514';end if;
  row_version:=q.version;row_status:=q.status;
 end if;
 perform 1 from public.object_customer_bindings where tenant_id=target_tenant and user_id=auth.uid() and active and object_id=coalesce(r.object_id,q.object_id) for share;
 if not private.customer_account_access(target_tenant,target_account) or not private.commercial_customer_scope(target_tenant,a.customer_id,coalesce(r.object_id,q.object_id),case when command='reply' then r.created_by else null end)
 then raise exception 'Je actuele klanttoegang is gewijzigd' using errcode='42501';end if;
 h:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=command_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'commercial:'||command or receipt.input_hash<>h
  then raise exception 'Deze opdrachtsleutel hoort bij een andere klantactie' using errcode='23505';end if;
  return receipt.result;
 end if;
 if exists(select 1 from private.commercial_commands where tenant_id=target_tenant and id=command_id)
 then raise exception 'Gebruik een nieuwe opdrachtsleutel voor deze klantactie' using errcode='23505';end if;
 if row_version<>(input->>'version')::integer then raise exception 'Deze aanvraag of offerte is gewijzigd. Controleer de actuele versie.' using errcode='40001';end if;
 if command='decide' and row_status not in('awaiting_acceptance','sent') then raise exception 'Deze offerte is al behandeld' using errcode='23514';end if;
 if(select count(*) from private.customer_portal_commands cp where cp.actor_id=auth.uid() and cp.command like 'commercial:%' and cp.created_at>clock_timestamp()-interval '1 hour')>=120
 then raise exception 'Te veel klantacties. Probeer later opnieuw.' using errcode='54000';end if;
 perform public.commercial_customer_action(target_tenant,command_id,command,input-'version');
 if command='reply' then select version,status into row_version,row_status from public.requests where tenant_id=target_tenant and id=target_id;
 else select version,status::text into row_version,row_status from public.quotes where tenant_id=target_tenant and id=target_id;end if;
 result:=jsonb_build_object('id',target_id,'version',row_version,'status',row_status);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)values(command_id,target_tenant,target_account,auth.uid(),'commercial:'||command,h,result);
 return result;
end $$;
revoke all on function public.customer_portal_commercial_command(uuid,uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.customer_portal_commercial_command(uuid,uuid,uuid,text,jsonb) to authenticated;

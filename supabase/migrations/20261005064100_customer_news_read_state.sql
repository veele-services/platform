-- Read/ack state stays in central notifications. The selected live customer
-- and original exact campaign audience are checked before any receipt replay.
create function public.customer_portal_news_mark(target_tenant uuid,target_account uuid,target_notification uuid,expected_version bigint,operation text,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.customer_portal_commands;n public.notifications;h text;central jsonb;result jsonb;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account)
 then raise exception 'Geen toegang tot klantnieuws' using errcode='42501';end if;
 if operation is null or operation not in('read','ack') or expected_version is null or expected_version<1
 then raise exception 'Ongeldige leesopdracht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 perform 1 from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for share;
 if not private.customer_news_access(target_tenant,target_account,target_notification)
 then raise exception 'Dit klantbericht is niet meer toegankelijk' using errcode='42501';end if;
 select * into n from public.notifications where tenant_id=target_tenant and id=target_notification and user_id=auth.uid() for update;
 h:=encode(extensions.digest(jsonb_build_object('notificationId',target_notification,'version',expected_version,'operation',operation)::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'news_mark' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if n.revision<>expected_version then raise exception 'Dit bericht is gewijzigd. Controleer de actuele versie.' using errcode='40001';end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=120
 then raise exception 'Te veel acties. Probeer het later opnieuw.' using errcode='54000';end if;
 central:=public.notification_command(target_tenant,'customer',case operation when 'read' then 'inbox_read' else 'inbox_ack' end,
  jsonb_build_object('id',target_notification,'expected_revision',expected_version),gen_random_uuid());
 result:=jsonb_build_object('notificationId',target_notification,'version',(central->>'revision')::bigint);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'news_mark',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_news_mark(uuid,uuid,uuid,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_news_mark(uuid,uuid,uuid,bigint,text,uuid) to authenticated;

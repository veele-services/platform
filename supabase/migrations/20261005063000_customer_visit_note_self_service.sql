-- An append-only ordinary appointment note is an existing concrete visit
-- request, not a second instruction engine or confirmed additional work.
create function public.customer_portal_visit_note_add(target_tenant uuid,target_account uuid,target_visit uuid,expected_version bigint,input_body text,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;w public.work_orders;receipt private.customer_portal_commands;h text;result jsonb;rv bigint;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account)
 then raise exception 'Geen toegang tot deze klantafspraak' using errcode='42501';end if;
 if input_body is null or length(btrim(input_body)) not between 2 and 10000 or expected_version is null or expected_version<1
 then raise exception 'Vul een gewone afspraakinstructie in' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for share;
 perform 1 from public.customer_contacts where tenant_id=target_tenant and id=a.contact_id for share;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_visit and customer_id=a.customer_id for update;
 if not private.customer_account_access(target_tenant,target_account) or w.id is null
  or not exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=w.object_id and o.customer_id=a.customer_id)
  or not private.customer_visit_access(target_tenant,w.object_id,w.id)
 then raise exception 'Geen actuele toegang tot deze klantafspraak' using errcode='42501';end if;
 perform 1 from public.object_customer_bindings where tenant_id=target_tenant and object_id=w.object_id and user_id=auth.uid() and active for share;
 if w.status not in('planned','released','seen','travelling','in_progress')
 then raise exception 'Deze afspraak is afgesloten. Neem contact op voor een vervolg.' using errcode='23514';end if;
 h:=encode(extensions.digest(jsonb_build_object('visitId',target_visit,'version',expected_version,'body',btrim(input_body))::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'visit_note_add' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if w.version<>expected_version then raise exception 'Deze afspraak is gewijzigd. Controleer de actuele afspraak.' using errcode='40001';end if;
 if exists(select 1 from public.object_visit_requests where id=request_id)
 then raise exception 'Deze referentie hoort al bij een ander verzoek' using errcode='23505';end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
 then raise exception 'Te veel wijzigingen. Probeer het later opnieuw.' using errcode='54000';end if;
 perform public.submit_object_visit_request(target_tenant,w.object_id,w.id,request_id,
  jsonb_build_object('title','Instructie voor deze afspraak','body',btrim(input_body),'kind','attention','priority','normal','feedback','','nodeId',''));
 select version into rv from public.object_visit_requests where tenant_id=target_tenant and id=request_id and created_by=auth.uid();
 result:=jsonb_build_object('requestId',request_id,'version',rv);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'visit_note_add',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_visit_note_add(uuid,uuid,uuid,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_visit_note_add(uuid,uuid,uuid,bigint,text,uuid) to authenticated;

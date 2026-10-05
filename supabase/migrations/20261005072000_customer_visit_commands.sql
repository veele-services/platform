-- Preserve the complete Object 360 request workflow inside the selected
-- customer account. Existing commands remain the canonical domain engine.
create function public.customer_portal_visit_command(target_tenant uuid,target_account uuid,target_visit uuid,request_id uuid,operation text,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;w public.work_orders;r public.object_visit_requests;p public.object_request_proposals;
 receipt private.customer_portal_commands;h text;result jsonb;document_id uuid;fields jsonb;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account)
 then raise exception 'Geen toegang tot deze klantafspraak' using errcode='42501';end if;
 if operation is null or operation not in('create','update','withdraw','read','accept','attachment') or jsonb_typeof(input) is distinct from 'object'
 then raise exception 'Ongeldige bezoekactie' using errcode='23514';end if;
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
 if operation<>'create' then
  select * into r from public.object_visit_requests where tenant_id=target_tenant and id=(input->>'requestId')::uuid
   and object_id=w.object_id and work_order_id=w.id and created_by=auth.uid() for update;
  if r.id is null then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 end if;
 h:=encode(extensions.digest(jsonb_build_array(target_visit,operation,input)::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid()
   or receipt.command<>'visit_'||operation or receipt.input_hash<>h then raise exception 'Opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if operation<>'read' and w.status not in('planned','released','seen','travelling','in_progress')
 then raise exception 'Deze afspraak is afgesloten' using errcode='23514';end if;
 if operation<>'create' and r.version is distinct from (input->>'version')::bigint
 then raise exception 'Dit verzoek is gewijzigd' using errcode='40001';end if;
 if (select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
 then raise exception 'Te veel wijzigingen' using errcode='54000';end if;
 if operation in('create','update') then
  fields:=input->'fields';
  if jsonb_typeof(fields) is distinct from 'object' or length(btrim(coalesce(fields->>'title',''))) not between 2 and 180
   or length(btrim(coalesce(fields->>'body',''))) not between 2 and 10000 or coalesce(fields->>'kind','') not in('attention','change','problem','extra')
   or coalesce(fields->>'priority','') not in('normal','high','urgent') or length(coalesce(fields->>'feedback',''))>1000
   or (nullif(fields->>'nodeId','') is not null and not exists(select 1 from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=w.object_id and n.id=(fields->>'nodeId')::uuid and n.active))
  then raise exception 'Controleer de verzoekgegevens' using errcode='23514';end if;
  if operation='create' then
   if w.version is distinct from (input->>'visitVersion')::bigint then raise exception 'Deze afspraak is gewijzigd' using errcode='40001';end if;
   if exists(select 1 from public.object_visit_requests where id=request_id) then raise exception 'Verzoekreferentie bestaat al' using errcode='23505';end if;
   perform public.submit_object_visit_request(target_tenant,w.object_id,w.id,request_id,fields);r.id:=request_id;
  else
   if r.work_order_task_id is not null or r.state in('withdrawn','rejected','completed','partial','not_done','closed') then raise exception 'Verzoek is afgesloten' using errcode='23514';end if;
   perform public.update_object_visit_request(target_tenant,r.id,r.version,fields);
  end if;
 elsif operation='withdraw' then
  if r.state in('withdrawn','completed','partial','not_done','closed') or length(btrim(coalesce(input->>'reason',''))) not between 2 and 1000 then raise exception 'Controleer het verzoek en de reden' using errcode='23514';end if;
  perform public.withdraw_object_request(target_tenant,r.id,r.version,input->>'reason');
 elsif operation='read' then
  perform public.acknowledge_object_request(target_tenant,r.id,r.version);
 elsif operation='accept' then
  select proposal.* into p from public.object_request_proposals proposal where proposal.tenant_id=target_tenant and proposal.id=(input->>'proposalId')::uuid and proposal.request_id=r.id and proposal.object_id=w.object_id for update;
  if p.id is null then raise exception 'Geen toegang tot dit voorstel' using errcode='42501';end if;
  if p.version is distinct from (input->>'proposalVersion')::bigint or input->'confirmed' is distinct from 'true'::jsonb then raise exception 'Bevestig de actuele voorstelversie' using errcode='40001';end if;
  perform public.accept_object_proposal(target_tenant,p.id);
 else
  if r.state in('withdrawn','rejected','completed','partial','not_done','closed') or r.work_order_task_id is not null
   or length(btrim(coalesce(input->>'title',''))) not between 2 and 180
   or coalesce(input->>'path','') !~ ('^'||target_tenant::text||'/'||w.object_id::text||'/'||r.id::text||'-[a-f0-9-]{36}\.(pdf|jpg|png)$')
   or coalesce(input->>'mime','') not in('application/pdf','image/jpeg','image/png') or coalesce((input->>'size')::bigint,0) not between 1 and 10485760
  then raise exception 'Bijlage hoort niet bij dit actuele verzoek' using errcode='23514';end if;
  document_id:=public.register_visit_attachment(target_tenant,r.id,input);
 end if;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=r.id;
 result:=jsonb_build_object('requestId',r.id,'version',r.version,'documentId',document_id);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'visit_'||operation,h,result);
 return result;
end $$;
revoke all on function public.customer_portal_visit_command(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.customer_portal_visit_command(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;

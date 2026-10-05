-- Public customer payloads are allowlists over the same ticket conversations.
create function private.customer_ticket_dto(tid uuid,a uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;result jsonb;
begin
 select * into t from public.tickets where id=tid;
 if not private.customer_ticket_access(tid,auth.uid()) or not exists(select 1 from private.customer_ticket_bindings b where b.ticket_id=tid and b.account_id=a) then raise exception 'Geen toegang tot klantticket' using errcode='42501';end if;
 result:=jsonb_build_object('id',t.id,'number',t.number,'subject',t.title,'route',case t.route when 'internal' then 'tenant' else 'platform' end,'status',t.status,
  'categoryId',t.category_id,'version',private.ticket_view_revision(tid,'customer',auth.uid()),'objectId',t.object_id,
  'updatedAt',coalesce((t.audience_activity->>'reporter')::timestamptz,t.created_at),
  'canReply',t.archived_at is null and t.status not in('closed','cancelled'),
  'canClose',t.archived_at is null and t.status='resolved','canReopen',t.archived_at is null and t.status in('resolved','closed'),
  'canCancel',t.archived_at is null and t.status in('new','in_progress','waiting_reporter','waiting_external'),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',case when exists(select 1 from private.ticket_redactions r where r.message_id=m.id) then 'Bericht afgeschermd' else m.body end,
   'own',m.author_user_id=auth.uid(),'author',case when m.author_user_id=auth.uid() then t.reporter_name when m.author_context='platform' then 'Fieldgrid' else (select name from public.tenants where id=t.tenant_id) end,
   'at',m.created_at,'files',private.ticket_message_files(m.id)) order by m.created_at,m.id) from public.ticket_messages m where m.ticket_id=tid and m.audience='reporter'),'[]'));
 return result;
end $$;
create function private.customer_ticket_query(t uuid,op text,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=(p->>'account')::uuid;result jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 or op is null or op not in('list','options','detail') or exists(select 1 from jsonb_object_keys(p)key where key not in('account','ticket_id')) then raise exception 'Ongeldige klantticketquery' using errcode='23514';end if;
 if not private.customer_account_access(t,a) then raise exception 'Geen toegang tot klanttickets' using errcode='42501';end if;
 if not private.service_enabled(t,'tickets') then
  if op='list' then return '[]';end if;raise exception 'Tickets zijn niet beschikbaar' using errcode='42501';
 end if;
 if op='options' then return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'route',case c.route when 'internal' then 'tenant' else 'platform' end) order by c.sort_order,c.name) from public.ticket_categories c where private.ticket_create_allowed(t,c.id,'customer',auth.uid())),'[]');
 elsif op='detail' then return private.customer_ticket_dto((p->>'ticket_id')::uuid,a);
 elsif op='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.number,'subject',q.title,'route',case q.route when 'internal' then 'tenant' else 'platform' end,'status',q.status,
   'lastMessage',coalesce((select case when exists(select 1 from private.ticket_redactions r where r.message_id=m.id) then 'Bericht afgeschermd' else left(m.body,180) end from public.ticket_messages m where m.ticket_id=q.id and m.audience='reporter' order by m.created_at desc,m.id desc limit 1),''),
   'updatedAt',coalesce((q.audience_activity->>'reporter')::timestamptz,q.created_at)) order by coalesce((q.audience_activity->>'reporter')::timestamptz,q.created_at) desc),'[]') into result
  from(select tt.* from public.tickets tt join private.customer_ticket_bindings b on b.ticket_id=tt.id and b.tenant_id=t and b.account_id=a where private.customer_ticket_access(tt.id,auth.uid()) order by coalesce((tt.audience_activity->>'reporter')::timestamptz,tt.created_at) desc limit 200)q;
  return result;
 end if;
 raise exception 'Ongeldige klantticketquery' using errcode='23514';
end $$;
create function private.customer_ticket_command(target_tenant uuid,cmd text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<customer_command>>
declare a public.customer_portal_accounts;account uuid:=(p->>'account')::uuid;t public.tickets;c public.ticket_categories;receipt private.ticket_receipts;tid uuid;mid uuid;seq bigint;cfg jsonb;label_name text;body text:=btrim(coalesce(p->>'body',''));nextstatus text;fileids uuid[];stamp timestamptz:=clock_timestamp();result jsonb;
begin
 if request_id is null or cmd is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>60000 or cmd not in('create','reply','status','read') or not private.customer_account_access(target_tenant,account) or not private.service_enabled(target_tenant,'tickets')
 then raise exception 'Geen toegang tot klantticket' using errcode='42501';end if;
 if exists(select 1 from jsonb_object_keys(p)key where key not in('account','ticket_id','expected_revision','category_id','title','body','object_id','attachment_ids','status','reason'))
 then raise exception 'Ongeldige klantticketvelden' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('ticket-command:'||auth.uid()::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=account for share;
 if not private.customer_account_access(target_tenant,account) then raise exception 'Klanttoegang is gewijzigd' using errcode='42501';end if;
 select * into receipt from private.ticket_receipts r where r.request_id=$4;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.tenant_id<>target_tenant or receipt.context<>'customer' or receipt.command<>cmd or receipt.payload<>p then raise exception 'Opdrachtsleutel is al gebruikt' using errcode='23505';end if;
  return private.customer_ticket_dto((receipt.result->>'id')::uuid,account);
 end if;
 if(select count(*) from private.ticket_receipts where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=60 or(cmd='create' and(select count(*) from private.ticket_receipts where actor_id=auth.uid() and command='create' and created_at>now()-interval '1 hour')>=20) then raise exception 'Te veel ticketacties' using errcode='54000';end if;
 select coalesce(ct.full_name,cu.name) into label_name from public.customers cu left join public.customer_contacts ct on ct.tenant_id=cu.tenant_id and ct.id=a.contact_id where cu.tenant_id=target_tenant and cu.id=a.customer_id;
 select coalesce(array_agg(value::uuid),'{}') into fileids from jsonb_array_elements_text(coalesce(p->'attachment_ids','[]'));
 if cmd='create' then
  if not private.ticket_create_allowed(target_tenant,(p->>'category_id')::uuid,'customer',auth.uid()) then raise exception 'Geen toegang tot ticketcategorie' using errcode='42501';end if;
  if length(btrim(coalesce(p->>'title',''))) not between 3 and 180 or length(body) not between 3 and 20000 then raise exception 'Controleer onderwerp en bericht' using errcode='23514';end if;
  if nullif(p->>'object_id','') is not null and not exists(select 1 from public.objects o join public.object_customer_bindings b on b.tenant_id=o.tenant_id and b.object_id=o.id and b.user_id=auth.uid() and b.active where o.tenant_id=target_tenant and o.id=(p->>'object_id')::uuid and o.customer_id=a.customer_id) then raise exception 'Geen toegang tot ticketobject' using errcode='42501';end if;
  select * into c from public.ticket_categories where id=(p->>'category_id')::uuid;
  insert into private.ticket_counters(tenant_id,route,value) values(target_tenant,c.route,1) on conflict(tenant_id,route) do update set value=ticket_counters.value+1 returning value into seq;
  select settings into cfg from private.ticket_config where scope_key=case c.route when 'platform_support' then 'platform' else target_tenant::text end;
  tid:=gen_random_uuid();
  insert into public.tickets(id,tenant_id,number,route,category_id,reporter_user_id,reporter_name,title,object_id,customer_id,first_response_due_at,resolution_due_at,audience_activity)
  values(tid,target_tenant,case c.route when 'internal' then 'M-' else 'S-' end||lpad(seq::text,6,'0'),c.route,c.id,auth.uid(),label_name,btrim(p->>'title'),nullif(p->>'object_id','')::uuid,a.customer_id,private.ticket_business_due(stamp,c.first_response_minutes,cfg),private.ticket_business_due(stamp,c.resolution_minutes,cfg),jsonb_build_object('reporter',stamp,'tenant',stamp,'platform',stamp));
  insert into private.customer_ticket_bindings(ticket_id,tenant_id,account_id)values(tid,target_tenant,account);
  insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body)values(target_tenant,tid,auth.uid(),label_name,'customer','reporter',body)returning id into mid;
  perform private.ticket_attach_to_message(tid,mid,fileids,auth.uid(),'customer');
  perform private.ticket_route_assignment(tid);perform private.ticket_emit(tid,'reporter','created','Klantticket aangemaakt',auth.uid());
 else
  tid:=(p->>'ticket_id')::uuid;
  select * into t from public.tickets where id=tid and tenant_id=target_tenant for update;
  perform private.customer_ticket_dto(tid,account);
  if (p->>'expected_revision')::bigint is distinct from private.ticket_view_revision(tid,'customer',auth.uid()) then raise exception 'Ticket is gewijzigd; controleer de actuele versie' using errcode='40001';end if;
  if cmd='read' then
   insert into private.ticket_reads(ticket_id,user_id,context,revision)values(tid,auth.uid(),'customer',private.ticket_view_revision(tid,'customer',auth.uid()))on conflict(ticket_id,user_id,context)do update set revision=excluded.revision,read_at=now();
  elsif cmd='reply' then
   if t.archived_at is not null or t.status in('closed','cancelled') or length(body) not between 3 and 20000 then raise exception 'Reactie is niet toegestaan' using errcode='23514';end if;
   insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body)values(target_tenant,tid,auth.uid(),label_name,'customer','reporter',body)returning id into mid;
   perform private.ticket_attach_to_message(tid,mid,fileids,auth.uid(),'customer');
   if t.status in('waiting_reporter','resolved') then perform private.ticket_wait_deadlines(tid,'in_progress');update public.tickets set status='in_progress',resolved_at=null,wait_started_at=null,next_step=null,resolution_message_id=null where id=tid;end if;
   perform private.ticket_emit(tid,'reporter','reply','Nieuwe reactie',auth.uid());
  else
   nextstatus:=p->>'status';body:=btrim(coalesce(p->>'reason',''));
   if t.archived_at is not null or not((nextstatus='cancelled' and t.status in('new','in_progress','waiting_reporter','waiting_external') and length(body)>=3)or(nextstatus='closed' and t.status='resolved')or(nextstatus='in_progress' and t.status in('resolved','closed') and length(body)>=3))then raise exception 'Statuswijziging niet toegestaan' using errcode='23514';end if;
   if length(body)>2000 then raise exception 'Toelichting is te lang' using errcode='23514';end if;
   if length(body)>0 then insert into public.ticket_messages(tenant_id,ticket_id,author_user_id,author_name,author_context,audience,body)values(target_tenant,tid,auth.uid(),label_name,'customer','reporter',body);end if;
   perform private.ticket_wait_deadlines(tid,nextstatus);
   update public.tickets set status=nextstatus,closed_at=case when nextstatus in('closed','cancelled')then now()else null end,resolved_at=case when nextstatus='in_progress'then null else resolved_at end,next_step=null,next_step_message_id=null,resolution_message_id=case when nextstatus='in_progress'then null else resolution_message_id end,wait_started_at=null where id=tid;
   perform private.ticket_emit(tid,'reporter','status',case nextstatus when 'closed' then 'Oplossing bevestigd' when 'cancelled' then 'Ticket ingetrokken' else 'Ticket heropend' end,auth.uid());
  end if;
 end if;
 result:=private.customer_ticket_dto(tid,account);
 if cmd<>'read' then insert into private.ticket_audit(tenant_id,actor_id,action,target_id,detail)values(target_tenant,auth.uid(),'ticket.'||cmd,tid,jsonb_build_object('context','customer'));end if;
 insert into private.ticket_receipts(request_id,actor_id,tenant_id,context,command,payload,result)values($4,auth.uid(),target_tenant,'customer',cmd,p,jsonb_build_object('id',tid));
 return result;
end $$;
revoke all on function private.customer_ticket_dto(uuid,uuid),private.customer_ticket_query(uuid,text,jsonb),private.customer_ticket_command(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

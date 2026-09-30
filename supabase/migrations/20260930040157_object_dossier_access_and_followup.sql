SET local check_function_bodies = off;

CREATE TABLE "public"."object_request_receipts" (
  "tenant_id"  uuid                     NOT NULL,
  "object_id"  uuid                     NOT NULL,
  "request_id" uuid                     NOT NULL,
  "version"    bigint                   NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "read_at"    timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "object_request_receipts_pkey" PRIMARY KEY (request_id, VERSION, user_id)
);

ALTER TABLE "public"."object_request_receipts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."object_request_receipts"
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_request_receipts" FROM "anon";

CREATE OR REPLACE FUNCTION private.object_followup_task_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;p public.object_request_proposals;
begin
 select * into r from public.object_visit_requests where tenant_id=new.tenant_id and work_order_task_id=new.id;
 if r.id is null then return new;end if;
 if new.completed_at is distinct from old.completed_at and new.completed_at is not null and r.needs_review then raise exception 'Laat het gewijzigde verzoek eerst beoordelen' using errcode='23514';end if;
 select * into p from public.object_request_proposals where request_id=r.id and accepted_at is not null order by version desc limit 1;
 if p.id is not null and (new.unit_price_cents,new.quantity,new.task_revision_id,new.task_name,new.is_extra_work) is distinct from (old.unit_price_cents,old.quantity,old.task_revision_id,old.task_name,old.is_extra_work) then raise exception 'Wijzig geen geaccepteerde scope of prijs. Maak een nieuw voorstel voor vervolgwerk.' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_manage (
  t uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and private.has_role(t,array['tenant_admin','management','planner']::public.app_role[])
 and exists(select 1 from public.tenants x join public.tenant_settings s on s.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(s.enabled_services));
$function$;

CREATE OR REPLACE FUNCTION private.object_new_work_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not exists(select 1 from public.objects o where o.tenant_id=new.tenant_id and o.id=new.object_id and o.active and o.dossier_status='active') then raise exception 'Activeer het object voordat je nieuwe uitvoering plant' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_session_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<clock_timestamp()));
$function$;

CREATE OR REPLACE FUNCTION private.object_vault_context (
  t uuid,
  u uuid,
  s uuid,
  o uuid,
  w uuid,
  i uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare a public.work_order_assignments;ord public.work_orders;item private.object_secret_items;ext private.object_access_extensions;
 mail text;manager boolean;bound boolean;binding_revision bigint;scope_revision bigint;vault_revision bigint;end_at timestamptz;config jsonb;before_minutes integer;otp_minutes integer;view_minutes integer;
begin
 -- Even a cryptographically valid access token is insufficient after logout/revocation.
 perform 1 from public.objects where tenant_id=t and id=o for share; perform 1 from public.tenants where id=t for share; perform 1 from public.tenant_settings where tenant_id=t for share; select au.email into mail from auth.users au join auth.sessions sess on sess.user_id=au.id where au.id=u and sess.id=s and au.deleted_at is null and au.email_confirmed_at is not null and (au.banned_until is null or au.banned_until<clock_timestamp()) and (sess.not_after is null or sess.not_after>clock_timestamp()) for share of au,sess;
 if mail is null or not exists(select 1 from public.tenants x join public.tenant_settings ts on ts.tenant_id=x.id where x.id=t and x.status='active' and 'planning'=any(ts.enabled_services)) or not exists(select 1 from public.objects x where x.tenant_id=t and x.id=o and x.dossier_status in ('draft','active','paused')) then return null;end if;
 perform 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=u for share; perform 1 from public.personnel p where p.tenant_id=t and p.user_id=u for share; perform 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u for share; select exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=u and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]) into manager;
 select b.version into binding_revision from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u and b.active and b.manage_secrets;
 bound:=binding_revision is not null;
 select coalesce(settings->'objectVault','{}') into config from public.tenant_settings where tenant_id=t;
 before_minutes:=least(120,greatest(0,coalesce((config->>'beforeMinutes')::integer,60)));
 otp_minutes:=least(5,greatest(1,coalesce((config->>'otpMinutes')::integer,5)));
 view_minutes:=least(10,greatest(1,coalesce((config->>'viewMinutes')::integer,10)));
 select revision into vault_revision from private.object_vault_state where object_id=o;
 if i is not null then
  select * into item from private.object_secret_items where tenant_id=t and object_id=o and id=i and active and (manager or bound or (valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp())));
  if item.id is null then return null;end if;
 elsif not manager and not bound then return null;
 end if;
 end_at:=clock_timestamp()+make_interval(mins=>view_minutes);
 if not manager and not bound then
  select aa.* into a from public.work_order_assignments aa join public.personnel p on p.tenant_id=aa.tenant_id and p.id=aa.personnel_id join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
  where aa.tenant_id=t and aa.work_order_id=w and p.user_id=u and p.status='active' and m.status='active' and aa.status in ('released','seen','travelling','in_progress')
   and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=aa.id and d.revoked_at is null);
  select * into ord from public.work_orders where tenant_id=t and id=w and object_id=o and status in ('released','seen','travelling','in_progress');
  if a.id is null or ord.id is null or a.projected_start_at is null or a.projected_end_at is null then return null;end if;
  select revision into scope_revision from private.object_secret_scopes sc where sc.assignment_id=a.id and sc.item_id=i and sc.active;
  if scope_revision is null then return null;end if;
  select * into ext from private.object_access_extensions where assignment_id=a.id;
  end_at:=greatest(a.projected_end_at,coalesce(ext.ends_at,a.projected_end_at));
  if clock_timestamp()<a.projected_start_at-make_interval(mins=>before_minutes) or clock_timestamp()>=end_at then return null;end if;
 end if;
 if not manager and not bound then end_at:=least(end_at,coalesce(item.valid_until,end_at));end if;
 return jsonb_build_object('email',mail,'canManage',manager or bound,'windowEnd',end_at,'otpMinutes',otp_minutes,'viewMinutes',view_minutes,'assignmentId',a.id,
 'fingerprint',md5(concat_ws(':',t,u,s,o,w,i,coalesce(vault_revision,0),item.version,manager,binding_revision,a.id,a.version,ord.version,scope_revision,ext.revision)));
end $function$;

CREATE OR REPLACE FUNCTION private.object_visit_access (
  t uuid,
  o uuid,
  w uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.object_session_active() and exists(select 1 from public.tenants x where x.id=t and x.status='active') and
 (private.object_manage(t) or exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active)
 or exists(select 1 from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
 join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id
 join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
 where a.tenant_id=t and wo.object_id=o and wo.id=w and p.user_id=auth.uid() and p.status='active' and m.status='active'
 and a.status not in ('cancelled','returned') and wo.status<>'cancelled' and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)))
 and (w is null or exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.object_id=o));
$function$;

CREATE OR REPLACE FUNCTION public.acknowledge_object_request (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) then raise exception 'Geen toegang' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Dit verzoek is gewijzigd. Lees de actuele versie.' using errcode='40001';end if;
 insert into public.object_request_receipts(tenant_id,object_id,request_id,version,user_id) values(target_tenant,r.object_id,r.id,r.version,auth.uid()) on conflict do nothing;
end $function$;

REVOKE ALL ON FUNCTION "public"."acknowledge_object_request"(uuid, uuid, bigint) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.bind_object_customer (
  target_tenant uuid,
  target_object uuid,
  email_address text,
  is_active     boolean,
  allow_secrets boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare u uuid;
begin
 if not private.object_manage(target_tenant) or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) or not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object) then raise exception 'Geen toegang' using errcode='42501';end if;
 select id into u from auth.users where lower(email)=lower(btrim(email_address)) and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<clock_timestamp());
 if u is null then raise exception 'Geen gecontroleerd account beschikbaar' using errcode='23514';end if;
 insert into public.object_customer_bindings(tenant_id,object_id,user_id,active,manage_secrets) values(target_tenant,target_object,u,is_active,allow_secrets)
 on conflict(tenant_id,object_id,user_id) do update set active=excluded.active,manage_secrets=excluded.manage_secrets;
end $function$;

REVOKE ALL ON FUNCTION "public"."bind_object_customer"(uuid, uuid, text, boolean, boolean) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.customer_object_visits (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.object_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'manageSecrets',b.manage_secrets,'visits',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) order by w.projected_start_at desc nulls last) from public.work_orders w where w.tenant_id=target_tenant and w.object_id=o.id),'[]')) order by o.name)
 from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id where b.tenant_id=target_tenant and b.user_id=auth.uid() and b.active),'[]');
end $function$;

CREATE OR REPLACE FUNCTION public.get_object_document (
  target_tenant   uuid,
  target_document uuid,
  target_order    uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare d public.object_documents;manager boolean;
begin if not private.object_session_active() then return null;end if;
 select * into d from public.object_documents where tenant_id=target_tenant and id=target_document;
 manager:=private.object_manage(target_tenant);
 if d.id is null then return null;end if;
 if d.category='security' then
  if not manager or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then return null;end if;
 elsif not manager then
  if d.work_order_id is not null and d.work_order_id is distinct from target_order then return null;end if;
  if not private.object_visit_access(target_tenant,d.object_id,target_order) then return null;end if;
  -- Customers can only download shared request attachments, never the internal dossier.
  if exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=d.object_id and b.user_id=auth.uid() and b.active) and d.request_id is null then return null;end if;
 end if;
 return jsonb_build_object('path',d.storage_path,'name',d.file_name,'mime',d.mime_type,'title',d.title);
end $function$;

CREATE OR REPLACE FUNCTION public.object_customer_accounts (
  target_tenant uuid,
  target_object uuid
)
  RETURNS TABLE (
    user_id uuid,
    email   text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select u.id,u.email::text from public.object_customer_bindings b join auth.users u on u.id=b.user_id where b.tenant_id=target_tenant and b.object_id=target_object and private.object_manage(target_tenant) and private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]);
$function$;

REVOKE ALL ON FUNCTION "public"."object_customer_accounts"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.object_vault_operation (
  target_tenant uuid,
  actor         uuid,
  session_id    uuid,
  target_object uuid,
  target_order  uuid,
  target_item   uuid,
  operation     text,
  input         jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ctx jsonb;ch private.object_otp_challenges;g private.object_access_grants;item private.object_secret_items;pepper text;k uuid;v uuid;cid uuid;gid uuid;expiry timestamptz;n integer;val text;items jsonb;manager boolean;a public.work_order_assignments;
begin
 -- Service-only. Actor/session originate from verified server auth, not request JSON.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp:'||actor::text,0));
 ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,target_item);
 manager:=exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=actor and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]);
 if operation='metadata' and target_item is null and ctx is null then
  -- Enumerate only items explicitly granted to this concrete current assignment.
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version)),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
  if jsonb_array_length(items)>0 then ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,(items->0->>'id')::uuid);end if; return jsonb_build_object('ok',true,'items',items,'canManage',false,'email',case when ctx is not null then left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2) else null end);
 end if;
 if ctx is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Toegang niet beschikbaar. Controleer je actuele toewijzing of neem contact op met je leidinggevende.');
 end if;
 if operation='metadata' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version,'validFrom',x.valid_from,'validUntil',x.valid_until) order by x.name),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and x.active;
  return jsonb_build_object('ok',true,'items',items,'canManage',(ctx->>'canManage')::boolean,'email',left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2));
 elsif operation='request' then
  if coalesce(input->>'code','')!~'^[0-9]{6}$' then return jsonb_build_object('ok',false,'error','Verificatie niet beschikbaar.');end if;
  select count(*) into n from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '1 hour';
  if n>=5 or (select count(*) from private.object_access_audit where tenant_id=target_tenant and object_id=target_object and event='requested' and created_at>clock_timestamp()-interval '1 hour')>=100 or exists(select 1 from private.object_access_audit where actor_id=actor and event='requested' and created_at>clock_timestamp()-interval '60 seconds') or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then return jsonb_build_object('ok',false,'error','Te veel pogingen. Wacht voordat je opnieuw een code aanvraagt.');end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp-key',0));
  select vault_id into k from private.object_otp_key where id;
  if k is null then
   k:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'fieldgrid_object_otp_pepper','Keyed verification; never expose');
   insert into private.object_otp_key(id,vault_id) values(true,k);
  end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where id=k;
  cid:=gen_random_uuid();expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'otpMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  update private.object_otp_challenges c set consumed_at=clock_timestamp() where c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.object_id=target_object and c.consumed_at is null;
  insert into private.object_otp_challenges(id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,code_hmac,expires_at)
  values(cid,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',extensions.hmac(cid::text||':'||(input->>'code'),pepper,'sha256'),expiry);
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'requested');
  return jsonb_build_object('ok',true,'challengeId',cid,'email',ctx->>'email','expiresAt',expiry);
 elsif operation in ('delivered','delivery_failed') then
  update private.object_otp_challenges c set delivered=operation='delivered',consumed_at=case when operation='delivery_failed' then clock_timestamp() else consumed_at end where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.fingerprint=ctx->>'fingerprint';
  return jsonb_build_object('ok',true);
 elsif operation='verify' then
  select * into ch from private.object_otp_challenges c where c.id=(input->>'challengeId')::uuid and c.actor_id=actor and c.session_id=object_vault_operation.session_id and c.tenant_id=target_tenant and c.object_id=target_object for update;
  select d.decrypted_secret into pepper from private.object_otp_key k join vault.decrypted_secrets d on d.id=k.vault_id;
  if ch.id is null or not ch.delivered or ch.consumed_at is not null or ch.expires_at<=clock_timestamp() or ch.fingerprint<>ctx->>'fingerprint' or ch.code_hmac<>extensions.hmac(ch.id::text||':'||coalesce(input->>'code',''),pepper,'sha256')
   or (select count(*) from private.object_access_audit where actor_id=actor and event='verify_failed' and created_at>clock_timestamp()-interval '1 hour')>=10 then
   insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verify_failed');
   return jsonb_build_object('ok',false,'error','De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.');
  end if;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where id=ch.id;
  expiry:=least(clock_timestamp()+make_interval(mins=>(ctx->>'viewMinutes')::integer),(ctx->>'windowEnd')::timestamptz);
  insert into private.object_access_grants(challenge_id,tenant_id,actor_id,session_id,object_id,order_id,item_id,fingerprint,expires_at) values(ch.id,target_tenant,actor,session_id,target_object,target_order,target_item,ctx->>'fingerprint',expiry) returning id into gid;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'verified');
  return jsonb_build_object('ok',true,'grantId',gid,'expiresAt',expiry);
 end if;
 select * into g from private.object_access_grants ag where ag.id=(input->>'grantId')::uuid and ag.tenant_id=target_tenant and ag.actor_id=actor and ag.session_id=object_vault_operation.session_id and ag.object_id=target_object and ag.fingerprint=ctx->>'fingerprint' and ag.revoked_at is null and ag.expires_at>clock_timestamp() for update;
 if g.id is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Bevestig je toegang opnieuw met een e-mailcode.');
 end if;
 if operation='hide' then update private.object_access_grants set revoked_at=clock_timestamp() where id=g.id;return jsonb_build_object('ok',true);
 elsif operation='check' then return jsonb_build_object('ok',true,'expiresAt',g.expires_at);
 elsif operation='read' and target_item is not null then
  select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object;
  select ds.decrypted_secret into val from private.object_secret_versions sv join vault.decrypted_secrets ds on ds.id=sv.vault_id where sv.item_id=item.id and sv.version=item.version;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'read');
  return jsonb_build_object('ok',true,'value',val,'expiresAt',g.expires_at);
 elsif operation='save' and (ctx->>'canManage')::boolean then
  if length(coalesce(input->>'value','')) not between 1 and 4000 then return jsonb_build_object('ok',false,'error','Vul een geldige beveiligde waarde in.');end if;
  if target_item is not null then
   select * into item from private.object_secret_items where id=target_item and tenant_id=target_tenant and object_id=target_object for update;
   if item.version<>(input->>'version')::bigint or coalesce((input->>'externalChanged')::boolean,false)=false then return jsonb_build_object('ok',false,'error','Controleer de versie en bevestig dat de externe code werkelijk is gewijzigd.');end if;
   update private.object_secret_items set version=version+1,name=input->>'name',kind=input->>'kind',node_id=nullif(input->>'nodeId','')::uuid,valid_from=clock_timestamp(),valid_until=nullif(input->>'validUntil','')::timestamptz where id=item.id returning * into item;
  else
   insert into private.object_secret_items(tenant_id,object_id,node_id,name,kind,owner_user_id,valid_until) values(target_tenant,target_object,nullif(input->>'nodeId','')::uuid,input->>'name',input->>'kind',actor,nullif(input->>'validUntil','')::timestamptz) returning * into item;
  end if;
  v:=vault.create_secret(input->>'value',null,'Fieldgrid private object value');
  insert into private.object_secret_versions values(item.id,item.version,v,actor,coalesce((input->>'externalChanged')::boolean,false),clock_timestamp());
  insert into private.object_vault_state values(target_object,1) on conflict(object_id) do update set revision=private.object_vault_state.revision+1;
  update private.object_access_grants set revoked_at=clock_timestamp() where object_id=target_object;
  update private.object_otp_challenges set consumed_at=clock_timestamp() where object_id=target_object and consumed_at is null;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,item.id,'rotated');
  return jsonb_build_object('ok',true);
 elsif operation='scope' and manager and target_item is not null then
  select aa.* into a from public.work_order_assignments aa join public.work_orders wo on wo.tenant_id=aa.tenant_id and wo.id=aa.work_order_id where aa.tenant_id=target_tenant and aa.id=(input->>'assignmentId')::uuid and wo.object_id=target_object and aa.status not in ('completed','returned','cancelled');
  if a.id is null then return jsonb_build_object('ok',false,'error','Kies een actuele toewijzing bij dit object.');end if;
  insert into private.object_secret_scopes values(a.id,target_item,actor,1,coalesce((input->>'active')::boolean,true)) on conflict(assignment_id,item_id) do update set active=excluded.active,revision=private.object_secret_scopes.revision+1,created_by=actor;
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,a.work_order_id,target_item,'scope_changed');
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','Deze actie is niet beschikbaar.');
end $function$;

CREATE OR REPLACE FUNCTION public.object_visit_context (
  target_tenant uuid,
  target_object uuid,
  target_order  uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;w public.work_orders;result jsonb;manager boolean;customer boolean;
begin
 if not private.object_visit_access(target_tenant,target_object,target_order) then raise exception 'Geen toegang tot deze uitvoering' using errcode='42501';end if;
 manager:=private.object_manage(target_tenant);
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active);
 select * into o from public.objects where tenant_id=target_tenant and id=target_object;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=o.id;
 result:=jsonb_build_object('object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'instructions',o.access_instructions,'status',o.dossier_status),
 'order',case when w.id is null then null else jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) end,
 'customer',customer,'manager',manager,'userId',auth.uid());
 return result||jsonb_build_object(
 'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind) order by n.position,n.name) from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=o.id and n.active),'[]'),
 'instructions',case when customer and not manager then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_instruction_receipts rc where rc.record_id=r.id and rc.record_version=r.version and rc.work_order_id=w.id and rc.user_id=auth.uid()))) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id and r.kind='instruction' and r.state='active' and (r.service='' or r.service=w.discipline) and (r.work_order_id is null or r.work_order_id=w.id) and r.starts_at<=coalesce(w.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(w.projected_start_at,clock_timestamp()))),'[]') end,
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_request_receipts rc where rc.request_id=r.id and rc.version=r.version and rc.user_id=auth.uid()),'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'mime',d.mime_type)) from public.object_documents d where d.request_id=r.id and d.tenant_id=target_tenant and d.category<>'security'),'[]'),'proposals',coalesce((select jsonb_agg(to_jsonb(p) order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]'))) from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=o.id and (w.id is null or r.work_order_id=w.id)),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.object_visit_signals (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;c jsonb;
begin
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if w.id is null or not private.object_visit_access(target_tenant,w.object_id,w.id) then return null;end if;
 c:=public.object_visit_context(target_tenant,w.object_id,w.id);
 return jsonb_build_object('instructions',(select count(*) from jsonb_array_elements(c->'instructions') r where not (r->>'read')::boolean),'requests',(select count(*) from jsonb_array_elements(c->'requests') r where not (r->>'read')::boolean),'review',(select count(*) from jsonb_array_elements(c->'requests') r where (r->>'needs_review')::boolean));
end $function$;

REVOKE ALL ON FUNCTION "public"."object_visit_signals"(uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.process_object_reminders()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r record;u record;k text;n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-object-reminders',0));
 for r in select o.tenant_id,o.id as object_id,t.timezone from public.objects o join public.tenants t on t.id=o.tenant_id join public.tenant_settings settings on settings.tenant_id=t.id
 where t.status='active' and 'planning'=any(settings.enabled_services) and o.dossier_status<>'archived' and (
 exists(select 1 from private.object_secret_items si where si.tenant_id=o.tenant_id and si.object_id=o.id and si.active and si.valid_until<clock_timestamp()+interval '7 days')
 or exists(select 1 from public.work_orders wo join public.work_order_assignments a on a.tenant_id=wo.tenant_id and a.work_order_id=wo.id cross join lateral private.assignment_requirements(a.tenant_id,a.personnel_id,wo.id,a.projected_start_at,a.projected_end_at) req where wo.tenant_id=o.tenant_id and wo.object_id=o.id and a.status in ('planned','released','seen','travelling','in_progress') and a.projected_end_at>clock_timestamp() and not private.qualified_for_period(a.tenant_id,a.personnel_id,req.code,a.projected_start_at,a.projected_end_at))
 or exists(select 1 from public.object_visit_requests vr where vr.tenant_id=o.tenant_id and vr.object_id=o.id and vr.needs_review)
 or exists(select 1 from public.object_records rec where rec.tenant_id=o.tenant_id and rec.object_id=o.id and rec.state in ('open','progress') and (rec.due_on<=(clock_timestamp() at time zone t.timezone)::date or rec.kind='material' and rec.details->>'category' in ('tekort','defect','aanvulling')))) loop
  for u in select m.user_id from public.object_reminder_recipients recipients join public.tenant_memberships m on m.tenant_id=recipients.tenant_id and m.user_id=recipients.user_id where recipients.tenant_id=r.tenant_id and recipients.object_id=r.object_id and recipients.active and m.status='active' and m.roles && array['tenant_admin','management','planner']::public.app_role[] loop
   k:='object-reminder:'||r.object_id::text||':'||(clock_timestamp() at time zone r.timezone)::date::text;
   if not exists(select 1 from private.object_notification_keys nk where nk.tenant_id=r.tenant_id and nk.user_id=u.user_id and nk.event_key=k) then
    insert into public.notifications(tenant_id,user_id,channel,title,body,target_path,status,sent_at) values(r.tenant_id,u.user_id,'in_app','Objectopvolging vraagt aandacht','Bekijk de open acties in het beveiligde objectdossier.','/app/objecten/'||r.object_id::text,'sent',clock_timestamp());
    insert into private.object_notification_keys values(r.tenant_id,u.user_id,k,clock_timestamp());n:=n+1;
   end if;
  end loop;
 end loop;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION public.update_object_visit_request (
  target_tenant    uuid,
  target_request   uuid,
  expected_version bigint,
  input            jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request for update;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) or (r.created_by<>auth.uid() and not private.object_manage(target_tenant)) then raise exception 'Geen toegang' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Dit verzoek is intussen gewijzigd' using errcode='40001';end if;
 if r.work_order_task_id is not null then raise exception 'Er is al een uitvoeringstaak. Maak een afzonderlijk vervolgverzoek voor gewijzigde scope.' using errcode='23514';end if;
 update public.object_visit_requests set title=input->>'title',body=input->>'body',node_id=nullif(input->>'nodeId','')::uuid,kind=input->>'kind',priority=coalesce(input->>'priority','normal'),feedback=coalesce(input->>'feedback',''),needs_review=true,state='review',review_note='Het verzoek is gewijzigd; beoordeel de nieuwe versie.' where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'request-version:'||r.id::text||':'||(r.version+1)::text);
end $function$;

REVOKE ALL ON FUNCTION "public"."update_object_visit_request"(uuid, uuid, bigint, jsonb) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "public"."object_request_receipts"
  ADD CONSTRAINT "object_request_receipts_tenant_id_object_id_request_id_fkey" FOREIGN KEY (tenant_id, object_id, request_id)
    REFERENCES public.object_visit_requests(tenant_id, object_id, id) ON DELETE CASCADE;

ALTER TABLE "public"."object_request_receipts"
  ADD CONSTRAINT "object_request_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE TRIGGER object360_followup_task_guard
  BEFORE UPDATE ON public.work_order_tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.object_followup_task_guard();

CREATE TRIGGER object360_new_work
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.object_new_work_guard();

CREATE POLICY "object_request_receipts_read" ON "public"."object_request_receipts"
  FOR SELECT
  TO "authenticated"
  USING ((private.object_manage(tenant_id) OR (user_id = auth.uid())));

REVOKE ALL ON FUNCTION "private"."object_followup_task_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_followup_task_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_new_work_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_new_work_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_session_active"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_session_active"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."acknowledge_object_request"(uuid, uuid, bigint) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."bind_object_customer"(uuid, uuid, text, boolean, boolean) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."object_customer_accounts"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."object_visit_signals"(uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_object_visit_request"(uuid, uuid, bigint, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON TABLE "public"."object_request_receipts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."object_request_receipts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_request_receipts" TO "postgres";

REVOKE ALL ON TABLE "public"."object_request_receipts" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_request_receipts" TO "service_role";

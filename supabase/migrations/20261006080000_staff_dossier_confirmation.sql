-- Owner-requested bounded inline dossier confirmation. Preserve existing scope/rate/identity guards.
CREATE OR REPLACE FUNCTION private.object_vault_context(t uuid, u uuid, s uuid, o uuid, w uuid, i uuid)
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
 otp_minutes:=least(2,greatest(1,coalesce((config->>'otpMinutes')::integer,2)));
 view_minutes:=least(5,greatest(1,coalesce((config->>'viewMinutes')::integer,5)));
 select revision into vault_revision from private.object_vault_state where object_id=o;
 if i is not null then
  select * into item from private.object_secret_items where tenant_id=t and object_id=o and id=i and active and (manager or bound or (valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp())));
  if item.id is null then return null;end if;
 
 end if;
 end_at:=clock_timestamp()+make_interval(mins=>view_minutes);
 if not manager and not bound then
  select aa.* into a from public.work_order_assignments aa join public.personnel p on p.tenant_id=aa.tenant_id and p.id=aa.personnel_id join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
  where aa.tenant_id=t and aa.work_order_id=w and p.user_id=u and p.status='active' and m.status='active' and 'staff'=any(m.roles) and aa.status in ('released','seen','travelling','in_progress')
   and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=aa.id and d.revoked_at is null);
  select * into ord from public.work_orders where tenant_id=t and id=w and object_id=o and status in ('released','seen','travelling','in_progress');
  if a.id is null or ord.id is null or a.projected_start_at is null or a.projected_end_at is null then return null;end if;
  select revision into scope_revision from private.object_secret_scopes sc where sc.assignment_id=a.id and sc.item_id=i and sc.active;
  if i is not null and scope_revision is null then return null;end if;
  select * into ext from private.object_access_extensions where assignment_id=a.id;
  end_at:=greatest(a.projected_end_at,coalesce(ext.ends_at,a.projected_end_at));
  if clock_timestamp()<a.projected_start_at-make_interval(mins=>before_minutes) or clock_timestamp()>=end_at then return null;end if;
 end if;
 if not manager and not bound then end_at:=least(end_at,coalesce(item.valid_until,end_at));end if;
 return jsonb_build_object('email',mail,'canManage',manager or bound,'windowEnd',end_at,'otpMinutes',otp_minutes,'viewMinutes',view_minutes,'assignmentId',a.id,
 'fingerprint',md5(concat_ws(':',t,u,s,o,w,i,coalesce(vault_revision,0),item.version,manager,binding_revision,a.id,a.version,ord.version,scope_revision,ext.revision)));
end $function$;

CREATE OR REPLACE FUNCTION public.object_visit_context(target_tenant uuid, target_object uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;ctx jsonb;
begin
 if not private.object_manage(target_tenant)
 and not exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active) then
  ctx:=private.object_vault_context(target_tenant,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,target_object,target_order,null);
  if ctx is null or not exists(select 1 from private.object_access_grants g
    where g.tenant_id=target_tenant and g.actor_id=auth.uid() and g.session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and g.object_id=target_object and g.order_id=target_order and g.item_id is null
    and g.fingerprint=ctx->>'fingerprint' and g.revoked_at is null and g.expires_at>clock_timestamp()) then
   raise exception 'Bevestig dossierinzage met een e-mailcode' using errcode='42501';
  end if;
 end if;
 v:=private.object_visit_projection(target_tenant,target_object,target_order);
 if not(v->>'manager')::boolean then v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(r-'review_note') from jsonb_array_elements(v->'requests') r),'[]'));end if;
 if not(v->>'customer')::boolean and not private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]) then
 v:=jsonb_set(v,'{requests}',coalesce((select jsonb_agg(jsonb_set(r,'{proposals}',coalesce((select jsonb_agg(p-array['price_cents','vat_basis_points','total_cents']) from jsonb_array_elements(coalesce(r->'proposals','[]'))p),'[]'))) from jsonb_array_elements(v->'requests')r),'[]'));
 end if;return v;
end $function$;

CREATE OR REPLACE FUNCTION public.object_vault_operation(target_tenant uuid, actor uuid, session_id uuid, target_object uuid, target_order uuid, target_item uuid, operation text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb;ch private.object_otp_challenges;g private.object_access_grants;item private.object_secret_items;pepper text;k uuid;v uuid;cid uuid;gid uuid;expiry timestamptz;n integer;val text;items jsonb;manager boolean;a public.work_order_assignments;dossier_ctx jsonb;saved_claims text;
begin
 -- Service-only. Actor/session originate from verified server auth, not request JSON.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-otp:'||actor::text,0));
 ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,target_item);
 manager:=exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=actor and m.status='active' and m.roles && array['tenant_admin','management']::public.app_role[]);
 if operation='metadata' and target_item is null and (ctx is null or not (ctx->>'canManage')::boolean) then
  -- Enumerate only items explicitly granted to this concrete current assignment.
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version)),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
  if jsonb_array_length(items)>0 then ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,(items->0->>'id')::uuid);end if; return jsonb_build_object('ok',true,'items',items,'canManage',false,'email',case when ctx is not null then left(ctx->>'email',1)||'***@'||split_part(ctx->>'email','@',2) else null end);
 end if;
 if ctx is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Toegang niet beschikbaar. Controleer je actuele toewijzing of neem contact op met je leidinggevende.');
 end if;
 if operation='metadata' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'kind',x.kind,'nodeId',x.node_id,'version',x.version,'validFrom',x.valid_from,'validUntil',x.valid_until) order by x.name),'[]') into items from private.object_secret_items x where x.tenant_id=target_tenant and x.object_id=target_object and x.active and private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,x.id) is not null;
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
 if g.id is null and target_order is not null and target_item is not null and not (ctx->>'canManage')::boolean then
  dossier_ctx:=private.object_vault_context(target_tenant,actor,session_id,target_object,target_order,null);
  select * into g from private.object_access_grants ag where ag.id=(input->>'grantId')::uuid
   and ag.tenant_id=target_tenant and ag.actor_id=actor and ag.session_id=object_vault_operation.session_id
   and ag.object_id=target_object and ag.order_id=target_order and ag.item_id is null
   and ag.fingerprint=dossier_ctx->>'fingerprint' and ag.revoked_at is null and ag.expires_at>clock_timestamp() for update;
 end if;
 if g.id is null then
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,item_id,event) values(target_tenant,actor,session_id,target_object,target_order,target_item,'denied');
  return jsonb_build_object('ok',false,'error','Bevestig je toegang opnieuw met een e-mailcode.');
 end if;
 if operation='hide' then update private.object_access_grants set revoked_at=clock_timestamp() where id=g.id;return jsonb_build_object('ok',true);
 elsif operation='check' then return jsonb_build_object('ok',true,'expiresAt',g.expires_at);
 elsif operation='dossier' and target_item is null and target_order is not null and not (ctx->>'canManage')::boolean then
  saved_claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated')::text,true);
  begin
   items:=public.object_visit_context(target_tenant,target_object,target_order);
  exception when others then
   perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);raise;
  end;
  perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
  insert into private.object_access_audit(tenant_id,actor_id,session_id,object_id,order_id,event)
   values(target_tenant,actor,session_id,target_object,target_order,'read');
  return jsonb_build_object('ok',true,'context',items,'expiresAt',g.expires_at);
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

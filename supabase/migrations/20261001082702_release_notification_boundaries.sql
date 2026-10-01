begin;
SET local check_function_bodies = off;

DROP POLICY "announcement_reads_insert_self" ON "public"."announcement_reads";

DROP POLICY "announcement_reads_self" ON "public"."announcement_reads";

DROP POLICY "announcement_reads_update_self" ON "public"."announcement_reads";

DROP POLICY "reminders_read" ON "public"."reminders";

CREATE OR REPLACE FUNCTION private.announcement_read_allowed (
  t            uuid,
  announcement uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select private.is_member(t) and private.service_enabled(t,'personeel') and exists(
  select 1 from public.announcements a where a.tenant_id=t and a.id=announcement
  and (private.has_role(t,array['tenant_admin','management']::public.app_role[])
   or (a.withdrawn_at is null and a.published_at is not null and a.published_at<=now()
       and private.member_roles(t)&&a.audience_roles))
 );
$function$;

CREATE OR REPLACE FUNCTION private.announcement_read_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if (new.id,new.tenant_id,new.announcement_id,new.user_id) is distinct from
    (old.id,old.tenant_id,old.announcement_id,old.user_id) then
  raise exception 'Een leesbevestiging blijft bij dezelfde gebruiker en hetzelfde nieuwsbericht' using errcode='23514';
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.customer_audit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare prior jsonb;current_row jsonb:=to_jsonb(new);before_meta jsonb;after_meta jsonb;changed jsonb;
begin
 if auth.uid() is not null then
  if tg_op='UPDATE' then prior:=to_jsonb(old);end if;
  select coalesce(jsonb_agg(key order by key),'[]'::jsonb) into changed
   from jsonb_each(current_row) where prior->key is distinct from value;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into after_meta
   from jsonb_each(current_row) where key in ('id','customer_id','status','state','active','archived','version','edit_version','metadata_version');
  if prior is not null then
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into before_meta
    from jsonb_each(prior) where key in ('id','customer_id','status','state','active','archived','version','edit_version','metadata_version');
  end if;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
   values(new.tenant_id,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,tg_table_name,new.id,
    before_meta,after_meta||jsonb_build_object('changed_fields',changed));
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.notification_permission_validate (
  t     uuid,
  ctx   text,
  actor uuid,
  cmd   text,
  p     jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare parent_scope jsonb;requested_scope jsonb;cap text;uid uuid;c public.permission_catalog;g public.permission_grants;dep text;expected bigint;
begin
 parent_scope:=private.notification_delegation_scope(t,ctx,actor);
 if parent_scope is null or ctx not in ('platform','backoffice') or cmd not in ('grant_save','grant_revoke') or jsonb_typeof(p)<>'object' or length(btrim(coalesce(p->>'reason','')))<3 or length(coalesce(p->>'reason',''))>2000 then raise exception 'Geen notificatiedelegatierecht of ongeldige wijziging' using errcode='42501';end if;
 expected:=(p->>'expected_revision')::bigint;if expected is null or expected<0 then raise exception 'Revisie vereist' using errcode='23514';end if;
 if cmd='grant_save' then
  uid:=(p->>'user_id')::uuid;cap:=p->>'capability';requested_scope:=p->'scope';
  if uid is null or uid=actor then raise exception 'Geen eigen uitbreiding van notificatierechten' using errcode='42501';end if;
  select * into c from public.permission_catalog where key=cap and module='notifications' and domain=case ctx when 'platform' then 'platform' else 'tenant' end and key like case ctx when 'platform' then 'platform.notifications.%' else 'notifications.%' end;
  if not found then raise exception 'Onbekend notificatierecht voor deze omgeving' using errcode='23514';end if;
  if exists(select 1 from jsonb_object_keys(requested_scope)k where k not in ('all','personnel_ids','object_ids','customer_ids','tenant_ids')) then raise exception 'Onbekend notificatiebereik' using errcode='23514';end if;
  perform private.ticket_scope_validate(t,requested_scope,c.domain);
  if not private.ticket_scope_contains(parent_scope,requested_scope) then raise exception 'Bereik valt buiten uw delegatiebevoegdheid' using errcode='42501';end if;
  select * into g from public.permission_grants where user_id=uid and capability=cap and tenant_id is not distinct from t;
  if found and not private.ticket_scope_contains(parent_scope,g.scope) then raise exception 'Bestaand notificatierecht valt buiten uw delegatiebevoegdheid' using errcode='42501';end if;
  if ctx='backoffice' and not exists(select 1 from public.tenant_memberships m join auth.users u on u.id=m.user_id where m.tenant_id=t and m.user_id=uid and m.status='active' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Actief lidmaatschap nodig' using errcode='23514';end if;
  if ctx='platform' and not exists(select 1 from auth.users u where u.id=uid and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and (exists(select 1 from public.platform_admins a where a.user_id=u.id) or exists(select 1 from public.permission_grants pg where pg.user_id=u.id and pg.tenant_id is null and pg.enabled))) then raise exception 'Actief platformaccount nodig' using errcode='23514';end if;
  foreach dep in array c.dependencies loop
   if not exists(select 1 from public.permission_grants d where d.user_id=uid and d.tenant_id is not distinct from t and d.capability=dep and d.enabled and private.ticket_scope_contains(d.scope,requested_scope)) then raise exception 'Benodigd afhankelijk recht ontbreekt' using errcode='23514';end if;
  end loop;
 else
  select * into g from public.permission_grants where id=(p->>'grant_id')::uuid and tenant_id is not distinct from t;
  if not found or g.user_id=actor or not private.ticket_scope_contains(parent_scope,g.scope) or not exists(select 1 from public.permission_catalog where key=g.capability and module='notifications' and domain=case ctx when 'platform' then 'platform' else 'tenant' end) then raise exception 'Geen toegang tot dit notificatierecht' using errcode='42501';end if;
 end if;
end$function$;

CREATE OR REPLACE FUNCTION private.notification_permissions_command (
  t     uuid,
  ctx   text,
  actor uuid,
  cmd   text,
  p     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
<<notification_permissions_command>>
declare g public.permission_grants;uid uuid;cap text;mid uuid;expected bigint:=(p->>'expected_revision')::bigint;result_id uuid;revision_number integer;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele sessie vereist' using errcode='42501';end if;
 perform private.notification_permission_validate(t,ctx,actor,cmd,p);
 update private.notification_verifications v set consumed_at=now() where v.id=(p->>'verification_id')::uuid and v.actor_id=actor and v.tenant_id is not distinct from t and v.context=ctx and v.session_id=nullif(auth.jwt()->>'session_id','')::uuid and v.action=cmd and v.verified_at is not null and v.expires_at>now() and v.consumed_at is null and v.payload_hash=encode(extensions.digest((p-'verification_id')::text,'sha256'),'hex');
 if not found then raise exception 'Bevestig deze exacte notificatierechtenwijziging opnieuw' using errcode='42501';end if;
 if cmd='grant_save' then
  uid:=(p->>'user_id')::uuid;cap:=p->>'capability';
  perform pg_advisory_xact_lock(hashtextextended('notification-grant:'||coalesce(t::text,'platform')||':'||uid::text||':'||cap,0));
  select * into g from public.permission_grants pg where pg.user_id=uid and pg.capability=cap and pg.tenant_id is not distinct from t for update;
  if g.id is not null and not private.ticket_scope_contains(private.notification_delegation_scope(t,ctx,actor),g.scope) then raise exception 'Bestaand notificatierecht valt buiten uw delegatiebevoegdheid' using errcode='42501';end if;
  perform private.notification_permission_validate(t,ctx,actor,cmd,p);
  if expected is distinct from (case when g.id is not null then g.revision else 0 end) then raise exception 'Notificatierecht gewijzigd; vernieuw en verifieer opnieuw' using errcode='40001';end if;
  if g.id is null then
   if ctx='backoffice' then select m.id into mid from public.tenant_memberships m where m.tenant_id=t and m.user_id=uid and m.status='active';end if;
   insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope,created_by,source) values(t,uid,mid,cap,p->'scope',actor,'explicit') returning id,revision into result_id,revision_number;
  else update public.permission_grants set scope=p->'scope',enabled=true,revision=revision+1,updated_at=now(),created_by=actor,source='explicit' where id=g.id returning id,revision into result_id,revision_number;end if;
 else
  select * into g from public.permission_grants pg where pg.id=(p->>'grant_id')::uuid and pg.tenant_id is not distinct from t for update;
  perform private.notification_permission_validate(t,ctx,actor,cmd,p);
  if expected is distinct from g.revision then raise exception 'Notificatierecht gewijzigd; vernieuw en verifieer opnieuw' using errcode='40001';end if;
  update public.permission_grants set enabled=false,revision=revision+1,updated_at=now() where id=g.id returning id,revision into result_id,revision_number;
 end if;
 insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision,detail) values(t,actor,cmd,result_id,revision_number,jsonb_build_object('reason',left(p->>'reason',2000)));
 return jsonb_build_object('id',result_id,'revision',revision_number);
end$function$;

CREATE OR REPLACE FUNCTION private.notification_template_dto (
  t     uuid,
  ctx   text,
  actor uuid,
  id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r private.notification_templates;g private.notification_templates;c public.notification_catalog;d jsonb;def jsonb;editable boolean;draft_pending boolean;display_definition jsonb;
begin
 select * into r from private.notification_templates where notification_templates.id=notification_template_dto.id;
 select * into c from public.notification_catalog where code=r.type_code;
 if r.id is null or (ctx='platform' and r.tenant_id is not null) or(ctx<>'platform' and r.tenant_id is not null and r.tenant_id<>t) then return null;end if;
 select * into g from private.notification_templates where tenant_id is null and type_code=r.type_code and context=r.context and channel=r.channel;
 select definition into def from private.notification_template_versions where notification_template_versions.id=g.active_version_id;
 d:=private.notification_template(case when ctx='platform' then null else t end,r.type_code,r.context,r.channel);
 draft_pending:=(ctx='platform' or r.tenant_id=t) and r.revision>coalesce((select revision from private.notification_template_versions where notification_template_versions.id=r.active_version_id),0);display_definition:=case when draft_pending then d||r.draft else d end;
 if r.channel='push' then
  def:=private.notification_template(null,r.type_code,r.context,r.channel);
  if not private.notification_push_template_safe(display_definition) then display_definition:=d;end if;
  c.variables:=array['bedrijfsnaam'];
 end if;
 editable:=case when ctx='platform' then private.notification_cap(null,actor,'platform.notifications.templates.manage') else c.tenant_override and private.notification_cap(t,actor,'notifications.templates.override') end;
 return d||jsonb_build_object('id',r.id,'type_code',r.type_code,'context',r.context,'channel',r.channel,'name',c.name,'revision',case when ctx<>'platform' and r.tenant_id is null then (select revision from private.notification_template_versions where notification_template_versions.id=r.active_version_id) else r.revision end,'state',case when draft_pending then 'draft' else 'published' end,'title',display_definition->>'title','body',display_definition->>'body','cta_label',display_definition->>'cta_label','default_title',def->>'title','default_body',def->>'body','new_default_available',exists(select 1 from private.notification_template_versions v where v.id=r.active_version_id and v.base_version_id is not null and v.base_version_id<>g.active_version_id),'variables',(select jsonb_agg(jsonb_build_object('name',v,'required',false)) from unnest(c.variables)v),'permissions',jsonb_build_object('edit',editable,'publish',editable,'reset',editable and ctx<>'platform'),'history',(select coalesce(jsonb_agg(jsonb_build_object('revision',v.revision,'title',v.definition->>'title','body',v.definition->>'body','created_at',v.created_at) order by v.revision desc),'[]'::jsonb) from private.notification_template_versions v where v.template_id=r.id));
end$function$;

CREATE OR REPLACE FUNCTION public.notification_command (
  target_tenant uuid,
  actor_context text,
  command       text,
  payload       jsonb,
  request_id    uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
<<notification_command>>
declare actor uuid:=auth.uid();ctx text:=actor_context;cmd text:=command;p jsonb:=payload;a jsonb;result jsonb;receipt private.notification_receipts;input_hash text;id uuid;expected bigint;rec public.notifications;c private.notification_campaigns;preview jsonb;candidate record;rid uuid;chan text[];code text;pol private.notification_policies;scope_name text;scope_tenant uuid;active_count integer;pref private.notification_preferences;entry jsonb;tmpl private.notification_templates;global_tmpl private.notification_templates;def jsonb;vid uuid;fields text[];row_count integer;
begin
 if request_id is null or cmd is null or not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p) is distinct from 'object' or length(p::text)>60000 then raise exception 'Geen toegang of ongeldige opdracht' using errcode='42501';end if;
 a:=private.notification_access(target_tenant,ctx,actor);input_hash:=encode(extensions.digest(p::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('notification-command:'||request_id,0));
 select * into receipt from private.notification_receipts where notification_receipts.request_id=notification_command.request_id;
 if found then if receipt.actor_id<>actor or receipt.tenant_id is distinct from target_tenant or receipt.context<>ctx or receipt.command<>cmd or receipt.input_hash<>input_hash then raise exception 'Opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;return receipt.result;end if;
 if (select count(*) from private.notification_receipts where actor_id=actor and created_at>now()-interval '1 minute')>=120 then raise exception 'Te veel acties; probeer later opnieuw' using errcode='54000';end if;
 expected:=nullif(p->>'expected_revision','')::bigint;id:=nullif(coalesce(p->>'id',p->>'notification_id'),'')::uuid;
 if cmd='inbox_read_all' then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  update public.notifications set read_at=clock_timestamp(),revision=revision+1 where tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' and read_at is null and archived_at is null;
  get diagnostics row_count=row_count;result:=jsonb_build_object('ok',true,'count',row_count);
 elsif cmd in ('inbox_read','inbox_unread','inbox_archive','inbox_unarchive','inbox_ack') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  select * into rec from public.notifications where notifications.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app' for update;
  if not found then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;
  if expected is not null and expected<>rec.revision then raise exception 'Bericht is gewijzigd' using errcode='40001';end if;
  if cmd='inbox_ack' and (not rec.ack_required or rec.withdrawn_at is not null or not private.notification_source_allowed(rec.tenant_id,coalesce(rec.type_code,''),rec.source_kind,rec.source_id,rec.source_revision,actor,ctx)) then raise exception 'Bevestiging niet mogelijk' using errcode='23514';end if;
  update public.notifications set read_at=case when cmd='inbox_read' then coalesce(read_at,clock_timestamp()) when cmd='inbox_unread' then null else read_at end,archived_at=case when cmd='inbox_archive' then coalesce(archived_at,clock_timestamp()) when cmd='inbox_unarchive' then null else archived_at end,acknowledged_at=case when cmd='inbox_ack' then coalesce(acknowledged_at,clock_timestamp()) else acknowledged_at end,revision=revision+1 where notifications.id=rec.id returning revision into expected;
  result:=jsonb_build_object('id',rec.id,'revision',expected);
 elsif cmd='policy_save' then
  scope_name:=p->>'scope';scope_tenant:=nullif(p->>'tenant_id','')::uuid;
  if scope_name is null or scope_name not in ('platform','tenant') or p->>'mode' is null or p->>'mode' not in ('inherit','on','off') or length(btrim(coalesce(p->>'reason','')))<3 or expected is null then raise exception 'Ongeldige beleidswijziging' using errcode='23514';end if;
  if ctx='platform' then
   if scope_name<>'platform' or not private.notification_cap(scope_tenant,actor,case when scope_tenant is null then 'platform.notifications.manage_global' else 'platform.notifications.manage_tenant' end) then raise exception 'Geen beleidsrecht' using errcode='42501';end if;
  elsif ctx<>'backoffice' or scope_name<>'tenant' or scope_tenant is distinct from target_tenant or not private.notification_cap(target_tenant,actor,'notifications.settings.manage') then raise exception 'Geen beleidsrecht' using errcode='42501';end if;
  if p->>'context'='platform' and ctx<>'platform' then raise exception 'Geen platforminstellingenrecht' using errcode='42501';end if;
  if p?'bundle_seconds' and p->'bundle_seconds'<>'null'::jsonb and(p->>'type_code' is distinct from 'work_order.rescheduled' or p->>'channel' is not null or jsonb_typeof(p->'bundle_seconds') is distinct from 'number' or(p->>'bundle_seconds')!~'^[0-9]{1,3}$' or(p->>'bundle_seconds')::integer not between 0 and 300) then raise exception 'Bundeling is 0–300 seconden en geldt alleen voor planningswijzigingen zonder kanaalfilter' using errcode='23514';end if;
  if scope_tenant is not null and not exists(select 1 from public.tenants where tenants.id=scope_tenant and status='active') then raise exception 'Organisatie niet beschikbaar' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
  select * into pol from private.notification_policies where scope=scope_name and tenant_id is not distinct from scope_tenant and context is not distinct from (p->>'context') and type_code is not distinct from(p->>'type_code') and channel is not distinct from(p->>'channel') for update;
  if id is not null and pol.id is distinct from id then raise exception 'Beleidsdimensie is onveranderlijk' using errcode='23514';end if;
  if expected<>coalesce(pol.revision,0) then raise exception 'Beleid is gewijzigd' using errcode='40001';end if;
  if pol.id is null then insert into private.notification_policies(scope,tenant_id,context,type_code,channel,mode,updated_by) values(scope_name,scope_tenant,p->>'context',p->>'type_code',p->>'channel',p->>'mode',actor) returning * into pol;
  else update private.notification_policies set mode=p->>'mode',revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where notification_policies.id=pol.id returning * into pol;end if;
  if p?'bundle_seconds' then update private.notification_policies set settings=case when p->'bundle_seconds'='null'::jsonb then settings-'bundle_seconds' else jsonb_set(settings,'{bundle_seconds}',p->'bundle_seconds') end where notification_policies.id=pol.id returning * into pol;end if;
  update private.notification_state set revision=revision+1,updated_at=clock_timestamp() where singleton;
  perform private.notification_suppress_requests();perform private.notification_suppress_pending();perform private.notification_suppress_deferred_mail();
  select count(*) into active_count from private.notification_provider_permits where state='admitted' and(scope_tenant is null or tenant_id=scope_tenant) and(pol.context is null or context=pol.context) and(pol.type_code is null or type_code=pol.type_code) and(pol.channel is null or channel=pol.channel);
  result:=jsonb_build_object('id',pol.id,'revision',pol.revision,'active_permits',active_count,'stopped',pol.mode='off' and active_count=0);
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision,detail) values(scope_tenant,actor,cmd,pol.id,pol.revision,jsonb_build_object('scope',pol.scope,'context',pol.context,'type_code',pol.type_code,'channel',pol.channel,'mode',pol.mode,'bundle_seconds',pol.settings->'bundle_seconds','reason',left(p->>'reason',2000)));
 elsif cmd='preferences_save' then
  if expected is null or jsonb_typeof(p->'email') is distinct from 'boolean' or jsonb_typeof(p->'push') is distinct from 'boolean' or not exists(select 1 from pg_timezone_names where name=p->>'timezone') or jsonb_typeof(p->'types') is distinct from 'array' or jsonb_array_length(p->'types')>200 then raise exception 'Ongeldige voorkeuren' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
  perform pg_advisory_xact_lock(hashtextextended('notification-preference:'||actor||':'||coalesce(target_tenant::text,'')||':'||ctx,0));
  select * into pref from private.notification_preferences where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code is null for update;
  if expected<>coalesce(pref.revision,0) then raise exception 'Voorkeuren zijn gewijzigd' using errcode='40001';end if;
  if pref.id is null then insert into private.notification_preferences(tenant_id,user_id,context,revision) values(target_tenant,actor,ctx,0) returning * into pref;end if;
  update private.notification_preferences set email=(p->>'email')::boolean,push=(p->>'push')::boolean,timezone=p->>'timezone',quiet_start=case when coalesce((p->>'quiet_enabled')::boolean,false) then(p->>'quiet_start')::time end,quiet_end=case when coalesce((p->>'quiet_enabled')::boolean,false) then(p->>'quiet_end')::time end,revision=revision+1,updated_at=clock_timestamp() where notification_preferences.id=pref.id returning revision into expected;
  for entry in select value from jsonb_array_elements(p->'types') loop
   if not exists(select 1 from public.notification_catalog where notification_catalog.code=entry->>'code' and ctx=any(contexts)) or jsonb_typeof(entry->'email') is distinct from 'boolean' or jsonb_typeof(entry->'push') is distinct from 'boolean' then raise exception 'Ongeldige typevoorkeur' using errcode='23514';end if;
   insert into private.notification_preferences(tenant_id,user_id,context,type_code,email,push) values(target_tenant,actor,ctx,entry->>'code',(entry->>'email')::boolean,(entry->>'push')::boolean) on conflict do nothing;
   update private.notification_preferences set email=(entry->>'email')::boolean,push=(entry->>'push')::boolean,revision=revision+1 where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code=entry->>'code';
  end loop;
  update private.notification_requests nr set payload=jsonb_set(nr.payload,'{suppressed_routes}',coalesce(nr.payload->'suppressed_routes','[]'::jsonb)||(select coalesce(jsonb_agg(ctx||':'||v),'[]'::jsonb) from unnest(array['push','email'])v where not coalesce((private.notification_policy(nr.tenant_id,nr.type_code,ctx,v,actor)->>'allowed')::boolean,false))) where nr.prepared_at is null and nr.tenant_id is not distinct from target_tenant and nr.payload->>'context'=ctx and nr.payload->>'recipient_user_id'=actor::text;
  perform private.notification_suppress_pending();perform private.notification_suppress_deferred_mail();result:=jsonb_build_object('id',pref.id,'revision',expected);
 elsif cmd in ('template_save','template_publish','template_reset') then
  select * into tmpl from private.notification_templates where notification_templates.id=notification_command.id for update;
  if tmpl.id is null or expected is null or (ctx='platform' and (tmpl.tenant_id is not null or not private.notification_cap(null,actor,'platform.notifications.templates.manage'))) or(ctx<>'platform' and (ctx<>'backoffice' or tmpl.tenant_id is not null and tmpl.tenant_id<>target_tenant or not private.notification_cap(target_tenant,actor,'notifications.templates.override') or not exists(select 1 from public.notification_catalog where notification_catalog.code=tmpl.type_code and tenant_override))) then raise exception 'Geen templaterecht' using errcode='42501';end if;
  if (case when ctx<>'platform' and tmpl.tenant_id is null then (select revision from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id) else tmpl.revision end) is distinct from expected then raise exception 'Template is gewijzigd' using errcode='40001';end if;
  select * into global_tmpl from private.notification_templates where tenant_id is null and type_code=tmpl.type_code and context=tmpl.context and channel=tmpl.channel;
  if ctx<>'platform' and tmpl.tenant_id is null then
   insert into private.notification_templates(tenant_id,type_code,context,channel,revision,draft) values(target_tenant,tmpl.type_code,tmpl.context,tmpl.channel,expected,(select definition from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id)) on conflict do nothing;
   if not found then raise exception 'Er is inmiddels een eigen template; vernieuw' using errcode='40001';end if;
   select * into tmpl from private.notification_templates where tenant_id=target_tenant and type_code=tmpl.type_code and context=tmpl.context and channel=tmpl.channel for update;
  end if;
  def:=tmpl.draft;
  if cmd='template_reset' then
   if ctx='platform' then raise exception 'Platformdefault kan niet worden gereset' using errcode='23514';end if;
   select definition into def from private.notification_template_versions where notification_template_versions.id=global_tmpl.active_version_id;fields:=array[]::text[];
  else
   if p?'title' then def:=jsonb_set(def,'{title}',p->'title');end if;if p?'body' then def:=jsonb_set(def,'{body}',p->'body');end if;if p?'cta_label' then def:=jsonb_set(def,'{cta_label}',p->'cta_label');end if;
   if not private.notification_template_valid(tmpl.type_code,def) or(tmpl.channel='push' and not private.notification_push_template_safe(def)) then raise exception 'Gebruik geldige tekst en uitsluitend toegestane variabelen; push bevat maximaal 80/160 tekens en uitsluitend bedrijfsnaam' using errcode='23514';end if;
   select array_agg(k) into fields from unnest(array['title','body','cta_label'])k where def->k is distinct from(select definition->k from private.notification_template_versions where notification_template_versions.id=global_tmpl.active_version_id);
   fields:=coalesce(fields,array[]::text[]);
  end if;
  update private.notification_templates set draft=def,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where notification_templates.id=tmpl.id returning revision into expected;
  if cmd<>'template_save' then
   insert into private.notification_template_versions(template_id,revision,definition,base_version_id,actor_id) values(tmpl.id,expected,def,case when ctx<>'platform' then global_tmpl.active_version_id end,actor) returning notification_template_versions.id into vid;
   update private.notification_templates set active_version_id=vid,overridden_fields=case when ctx='platform' then array[]::text[] else fields end where notification_templates.id=tmpl.id;
  end if;
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision) values(case when ctx='platform' then null else target_tenant end,actor,cmd,tmpl.id,expected);
  result:=jsonb_build_object('id',tmpl.id,'revision',expected);
 elsif cmd like 'campaign_%' then
  if ctx not in ('platform','backoffice') or not(a->'permissions' @> '{"send_staff":true}' or a->'permissions' @> '{"send_customers":true}' or a->'permissions' @> '{"send_platform":true}') then raise exception 'Geen verzendrecht' using errcode='42501';end if;
  if id is not null then select * into c from private.notification_campaigns where notification_campaigns.id=notification_command.id and tenant_id is not distinct from target_tenant and context=ctx for update;if not found then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;end if;
  if expected is null or expected<>coalesce(c.revision,0) then raise exception 'Campagne is gewijzigd' using errcode='40001';end if;
  if c.id is not null and c.sender_id<>actor and cmd not in ('campaign_cancel','campaign_pause') then raise exception 'Alleen de afzender kan deze campagne wijzigen' using errcode='42501';end if;
  if cmd='campaign_save' then
   if c.id is not null and(c.state not in ('draft','scheduled','paused') or private.notification_campaign_started(c.id)) then raise exception 'Gestarte campagne is onveranderlijk; maak een nieuwe campagne' using errcode='23514';end if;
   if jsonb_typeof(p->'criteria') is distinct from 'object' or jsonb_typeof(p->'channels') is distinct from 'array' or length(btrim(coalesce(p->>'title',''))) not between 3 and 180 or length(btrim(coalesce(p->>'body',''))) not between 3 and 10000 or p->>'priority' is null or p->>'priority' not in ('normal','urgent') or not exists(select 1 from pg_timezone_names where name=p->>'timezone') or length(coalesce(p->>'action_label',''))>80 then raise exception 'Ongeldige campagne-invoer' using errcode='23514';end if;
   chan:=array(select distinct jsonb_array_elements_text(p->'channels'));if cardinality(chan)=0 or not chan<@array['in_app','push','email']::text[] then raise exception 'Kies geldige kanalen' using errcode='23514';end if;
   if p->>'scheduled_at' is not null and (not coalesce((a->'permissions'->>'schedule')::boolean,false) or(p->>'scheduled_at')::timestamptz<now()) then raise exception 'Kies een toekomstig verzendmoment met planningsrecht' using errcode='23514';end if;
   if p->>'expires_at' is not null and(p->>'expires_at')::timestamptz<=coalesce((p->>'scheduled_at')::timestamptz,now()) then raise exception 'Vervaldatum moet na verzending liggen' using errcode='23514';end if;
   if (p->>'source_kind' is null) is distinct from(p->>'source_id' is null) then raise exception 'Volledige bronrelatie vereist' using errcode='23514';end if;
   if p->>'source_kind' is not null and not((p->>'source_kind'='work_order' and exists(select 1 from public.work_orders w join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where w.id=(p->>'source_id')::uuid and w.tenant_id=target_tenant and w.archive_at is null and(private.notification_cap(target_tenant,actor,'notifications.send_staff',null,o.id,o.customer_id) or private.notification_cap(target_tenant,actor,'notifications.send_customers',null,o.id,o.customer_id)))) or(p->>'source_kind'='object' and exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=(p->>'source_id')::uuid and o.dossier_status<>'archived' and(private.notification_cap(target_tenant,actor,'notifications.send_staff',null,o.id,o.customer_id) or private.notification_cap(target_tenant,actor,'notifications.send_customers',null,o.id,o.customer_id))))) then raise exception 'Bron niet beschikbaar voor deze verzendopdracht' using errcode='42501';end if;
   if c.id is null then insert into private.notification_campaigns(tenant_id,context,sender_id,title,body) values(target_tenant,ctx,actor,btrim(p->>'title'),btrim(p->>'body')) returning * into c;end if;
   update private.notification_campaigns set title=btrim(p->>'title'),body=btrim(p->>'body'),priority=p->>'priority',criteria=p->'criteria',channels=chan,scheduled_at=(p->>'scheduled_at')::timestamptz,expires_at=(p->>'expires_at')::timestamptz,timezone=p->>'timezone',ack_required=coalesce((p->>'ack_required')::boolean,false),action_label=nullif(btrim(p->>'action_label'),''),source_kind=p->>'source_kind',source_id=(p->>'source_id')::uuid,state='draft',confirmed_at=null,confirmed_revision=null,selection_token=null,revision=case when expected=0 then 1 else revision+1 end,updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
  elsif cmd='campaign_publish' then
   if c.id is null or c.state<>'draft' then raise exception 'Alleen een concept kan worden bevestigd' using errcode='23514';end if;
   preview:=private.notification_recipients(target_tenant,ctx,actor,jsonb_build_object('criteria',c.criteria,'channels',c.channels));
   if p->>'selection_token' is null or p->>'selection_token' is distinct from preview->>'selection_token' then raise exception 'Ontvangers of beleid zijn gewijzigd; controleer de selectie opnieuw' using errcode='40001';end if;
   if coalesce((preview->'counts'->>'total')::integer,0)=0 then raise exception 'Geen bevoegde ontvangers geselecteerd' using errcode='23514';end if;
   if coalesce((preview->'counts'->>'reachable')::integer,0)=0 then raise exception 'Geen ontvanger bereikbaar via de gekozen kanalen; niets verzonden' using errcode='23514';end if;
   if (preview->'counts'->>'total')::integer>1 and ctx<>'platform' and not private.notification_cap(target_tenant,actor,'notifications.send_bulk') then raise exception 'Expliciet bulkverzendrecht vereist' using errcode='42501';end if;
   update private.notification_campaigns set state=case when scheduled_at>now() then 'scheduled' else 'processing' end,confirmed_at=clock_timestamp(),revision=revision+1,confirmed_revision=revision+1,selection_token=p->>'selection_token',updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
   code:=case when ctx='platform' then 'manual.platform' else 'manual.tenant' end;
   for candidate in select distinct on(tenant_id,recipient_key,context) * from private.notification_candidates(target_tenant,ctx,actor,c.criteria) order by tenant_id,recipient_key,context,contact_id nulls first loop
    insert into private.notification_campaign_recipients(campaign_id,tenant_id,user_id,contact_id,recipient_key,context,label,channels,source_context) values(c.id,candidate.tenant_id,candidate.user_id,candidate.contact_id,candidate.recipient_key,candidate.context,candidate.label,array(select unnest(c.channels) intersect select unnest(candidate.channels)),candidate.source_context) on conflict(campaign_id,tenant_id,recipient_key,context) do update set user_id=excluded.user_id,contact_id=excluded.contact_id,label=excluded.label,channels=excluded.channels,source_context=excluded.source_context,confirmed_at=clock_timestamp() returning notification_campaign_recipients.id into rid;
    perform private.notification_enqueue(candidate.tenant_id,code,'campaign',rid,c.confirmed_revision::text,'campaign:'||c.id||':'||c.confirmed_revision||':'||rid,jsonb_build_object('campaign_id',c.id,'campaign_recipient_id',rid,'recipient_user_id',candidate.user_id,'contact_id',candidate.contact_id,'context',candidate.context,'channels',to_jsonb(array(select unnest(c.channels) intersect select unnest(candidate.channels))),'scheduled_at',c.scheduled_at,'expires_at',c.expires_at,'source_context',candidate.source_context,'path',private.notification_campaign_path(c,candidate.user_id,candidate.context,candidate.tenant_id)));
   end loop;
  elsif cmd='campaign_duplicate' then
   if c.id is null then raise exception 'Campagne ontbreekt' using errcode='23514';end if;
   insert into private.notification_campaigns(tenant_id,context,sender_id,title,body,priority,criteria,channels,timezone,ack_required,action_label,source_kind,source_id) values(c.tenant_id,c.context,actor,c.title,c.body,c.priority,c.criteria,c.channels,c.timezone,c.ack_required,c.action_label,c.source_kind,c.source_id) returning * into c;
  elsif cmd in ('campaign_pause','campaign_cancel','campaign_resume') then
   if c.id is null or not private.notification_campaign_allowed(c,actor,'cancel') then raise exception 'Geen intrekkingsrecht' using errcode='42501';end if;
   if(cmd='campaign_pause' and c.state not in ('scheduled','processing')) or(cmd='campaign_resume' and c.state<>'paused') or(cmd='campaign_cancel' and c.state in ('cancelled','expired')) then raise exception 'Ongeldige campagnestatus' using errcode='23514';end if;
   update private.notification_campaigns set state=case cmd when 'campaign_pause' then 'paused' when 'campaign_cancel' then 'cancelled' else case when scheduled_at>now() then 'scheduled' else 'processing' end end,revision=revision+1,updated_at=clock_timestamp() where notification_campaigns.id=c.id returning * into c;
   if cmd='campaign_cancel' then update public.notifications set withdrawn_at=clock_timestamp(),revision=revision+1 where campaign_id=c.id and withdrawn_at is null;end if;
  else raise exception 'Onbekende campagneactie' using errcode='23514';end if;
  insert into private.notification_audit(tenant_id,actor_id,action,resource_id,revision) values(target_tenant,actor,cmd,c.id,c.revision);result:=jsonb_build_object('id',c.id,'revision',c.revision);
 elsif cmd in ('grant_save','grant_revoke') then result:=private.notification_permissions_command(target_tenant,ctx,actor,cmd,p);
 elsif cmd='delivery_retry' then
  if not coalesce((a->'permissions'->>'delivery_retry')::boolean,false) then raise exception 'Geen herstelrecht' using errcode='42501';end if;result:=private.notification_delivery_command(target_tenant,ctx,actor,cmd,p);
 else raise exception 'Onbekende notificatieactie' using errcode='23514';end if;
 insert into private.notification_receipts(request_id,actor_id,tenant_id,context,command,input_hash,result) values(request_id,actor,target_tenant,ctx,cmd,input_hash,result);
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.staff_workspace (
  target_tenant uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ids uuid[];pid uuid;result jsonb;
begin
 -- module-scoped staff workspace
 if not private.object_session_active() or not private.has_role(target_tenant,array['staff']::public.app_role[]) or not private.service_enabled(target_tenant,'personeel') then raise exception 'Personeelstoegang vereist' using errcode='42501';end if;
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 select coalesce(array_agg(w.id),'{}') into ids from public.work_orders w where w.tenant_id=target_tenant and private.service_enabled(target_tenant,'planning') and private.is_work_order_assignee(target_tenant,w.id);
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name)) from public.customers c where c.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.customer_id=c.id)),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'name',o.name,'address',o.address)) from public.objects o where o.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.object_id=o.id)),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'user_id',p.user_id,'employee_number',p.employee_number,'full_name',p.full_name,'status',p.status)) from public.personnel p where p.tenant_id=target_tenant and p.id=pid),'[]'),
 'workOrders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'tenant_id',w.tenant_id,'customer_id',w.customer_id,'object_id',w.object_id,'work_order_number',w.work_order_number,'discipline',w.discipline,'title',w.title,'status',w.status,'version',w.version,'report_version',w.report_version,'report_state',w.report_state,'signature_required',w.signature_required,'day_instructions',w.day_instructions,'projected_start_at',w.projected_start_at,'projected_end_at',w.projected_end_at,'actual_start_at',w.actual_start_at,'actual_end_at',w.actual_end_at)) from public.work_orders w where w.id=any(ids)),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'qualification_snapshot') from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.personnel_id=pid),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(private.staff_task_dto(t)) from public.work_order_tasks t where t.tenant_id=target_tenant and t.work_order_id=any(ids)),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(c)) from public.task_catalog c where private.service_enabled(target_tenant,'planning') and c.tenant_id=target_tenant),'[]'),
 'taskRevisions',coalesce((select jsonb_agg(to_jsonb(r)-array['price_cents','vat_basis_points']) from public.task_revisions r where private.service_enabled(target_tenant,'planning') and r.tenant_id=target_tenant),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(e)) from public.report_entries e where private.service_enabled(target_tenant,'rapportage') and e.tenant_id=target_tenant and e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-array['storage_path','storage_bucket']) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null),'[]'),
 'signatures',coalesce((select jsonb_agg(to_jsonb(s)-array['storage_path']) from public.signatures s where private.service_enabled(target_tenant,'rapportage') and s.tenant_id=target_tenant and s.work_order_id=any(ids) and s.captured_by=auth.uid()),'[]'),
 'timeEntries',coalesce((select jsonb_agg(to_jsonb(e)) from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=pid),'[]'),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcements a where a.tenant_id=target_tenant and a.published_at<=clock_timestamp() and a.withdrawn_at is null and 'staff'=any(a.audience_roles)),'[]'),
 'announcementReads',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid() and private.announcement_read_allowed(a.tenant_id,a.announcement_id)),'[]'),
 'openShifts',coalesce((select jsonb_agg(to_jsonb(a)) from public.open_shifts a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and a.status='open'),'[]'),
 'shiftInterests',coalesce((select jsonb_agg(to_jsonb(a)) from public.shift_interests a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and a.personnel_id=pid),'[]'),
 'personnelDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'personnel_id',a.personnel_id,'title',a.title,'file_name',a.file_name,'version',a.version,'visible_to_employee',a.visible_to_employee)) from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee and not a.dossier_managed),'[]'),
 'extraWorkRules',coalesce((select jsonb_agg(to_jsonb(a)) from public.extra_work_rules a where private.service_enabled(target_tenant,'planning') and private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.active),'[]'),
 'allowedExtraWork',coalesce((select jsonb_agg(to_jsonb(a)) from public.work_order_allowed_extra_work a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids)),'[]'),
 'travelLegs',coalesce((select jsonb_agg(to_jsonb(l)-array['origin_address','destination_address']) from public.travel_legs l join public.work_order_assignments a on a.id=l.assignment_id and a.tenant_id=l.tenant_id where a.tenant_id=target_tenant and a.personnel_id=pid and a.work_order_id=any(ids)),'[]')) into result;
 return result;
end $function$;

CREATE TRIGGER announcement_read_identity
  BEFORE UPDATE ON public.announcement_reads
  FOR EACH ROW
  EXECUTE FUNCTION private.announcement_read_identity();

CREATE POLICY "announcement_reads_insert_self" ON "public"."announcement_reads"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.announcement_read_allowed(tenant_id, announcement_id)));

CREATE POLICY "announcement_reads_self" ON "public"."announcement_reads"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.announcement_read_allowed(tenant_id, announcement_id)));

CREATE POLICY "announcement_reads_update_self" ON "public"."announcement_reads"
  FOR UPDATE
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.announcement_read_allowed(tenant_id, announcement_id)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.announcement_read_allowed(tenant_id, announcement_id)));

CREATE POLICY "reminders_read" ON "public"."reminders"
  FOR SELECT
  TO "authenticated"
  USING
    ((private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'hr'::public.app_role]) OR (private.is_member(tenant_id) AND
    (assigned_user_id = ( SELECT auth.uid() AS uid)) AND ((personnel_id IS NULL) OR (personnel_id = private.current_personnel_id(tenant_id))))));

REVOKE ALL ON FUNCTION "private"."announcement_read_allowed"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."announcement_read_allowed"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."announcement_read_identity"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."announcement_read_identity"() TO "postgres";

notify pgrst,'reload schema';
commit;

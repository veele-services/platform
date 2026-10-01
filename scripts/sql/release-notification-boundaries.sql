-- Query-first local repair; generate the release migration from the verified DB.
do $release$
begin
do $patch$
declare original text;revised text;needle text;replacement text;
begin
 original:=pg_get_functiondef('private.notification_permission_validate(uuid,text,uuid,text,jsonb)'::regprocedure);
 needle:='  if ctx=''backoffice'' and not exists(select 1 from public.tenant_memberships m join auth.users u';
 replacement:='  select * into g from public.permission_grants where user_id=uid and capability=cap and tenant_id is not distinct from t;
  if found and not private.ticket_scope_contains(parent_scope,g.scope) then raise exception ''Bestaand notificatierecht valt buiten uw delegatiebevoegdheid'' using errcode=''42501'';end if;
'||needle;
 revised:=replace(original,needle,replacement);
 if revised=original then raise exception 'Review notification grant validation boundary';end if;
 execute revised;

 original:=pg_get_functiondef('private.notification_permissions_command(uuid,text,uuid,text,jsonb)'::regprocedure);
 -- Recheck AFTER the target row lock: a predicted next revision is not authority.
 needle:='  if expected is distinct from (case when found then g.revision else 0 end) then';
 replacement:='  if g.id is not null and not private.ticket_scope_contains(private.notification_delegation_scope(t,ctx,actor),g.scope) then raise exception ''Bestaand notificatierecht valt buiten uw delegatiebevoegdheid'' using errcode=''42501'';end if;
  perform private.notification_permission_validate(t,ctx,actor,cmd,p);
'||needle;
 -- FOUND is deliberately captured by g.id rather than changed by PERFORM.
 replacement:=replace(replacement,'case when found then g.revision else 0 end','case when g.id is not null then g.revision else 0 end');
 revised:=replace(original,needle,replacement);
 if revised=original then raise exception 'Review notification grant locked scope';end if;
 original:=revised;
 needle:='  if expected is distinct from g.revision then';
 replacement:='  perform private.notification_permission_validate(t,ctx,actor,cmd,p);
'||needle;
 revised:=replace(original,needle,replacement);
 if revised=original then raise exception 'Review notification revoke locked scope';end if;
 execute revised;

 original:=pg_get_functiondef('private.notification_template_dto(uuid,text,uuid,uuid)'::regprocedure);
 revised:=replace(original,'draft_pending:=r.revision>', 'draft_pending:=(ctx=''platform'' or r.tenant_id=t) and r.revision>');
 if revised=original then raise exception 'Review notification draft projection';end if;
 original:=revised;
 revised:=replace(original,'''revision'',r.revision,''state''','''revision'',case when ctx<>''platform'' and r.tenant_id is null then (select revision from private.notification_template_versions where notification_template_versions.id=r.active_version_id) else r.revision end,''state''');
 if revised=original then raise exception 'Review published template revision projection';end if;
 execute revised;

 original:=pg_get_functiondef('public.notification_command(uuid,text,text,jsonb,uuid)'::regprocedure);
 revised:=replace(original,'if tmpl.revision<>expected then','if (case when ctx<>''platform'' and tmpl.tenant_id is null then (select revision from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id) else tmpl.revision end) is distinct from expected then');
 if revised=original then raise exception 'Review published template CAS';end if;
 original:=revised;
 revised:=replace(original,'values(target_tenant,tmpl.type_code,tmpl.context,tmpl.channel,tmpl.revision,tmpl.draft)',
  'values(target_tenant,tmpl.type_code,tmpl.context,tmpl.channel,expected,(select definition from private.notification_template_versions where notification_template_versions.id=tmpl.active_version_id))');
 if revised=original then raise exception 'Review first tenant template inheritance';end if;
 execute revised;
end $patch$;

create or replace function private.announcement_read_allowed(t uuid,announcement uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(t) and private.service_enabled(t,'personeel') and exists(
  select 1 from public.announcements a where a.tenant_id=t and a.id=announcement
  and (private.has_role(t,array['tenant_admin','management']::public.app_role[])
   or (a.withdrawn_at is null and a.published_at is not null and a.published_at<=now()
       and private.member_roles(t)&&a.audience_roles))
 );
$$;
revoke all on function private.announcement_read_allowed(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.announcement_read_allowed(uuid,uuid) to authenticated;

alter policy announcement_reads_self on public.announcement_reads
using(user_id=(select auth.uid()) and private.announcement_read_allowed(tenant_id,announcement_id));
alter policy announcement_reads_insert_self on public.announcement_reads
with check(user_id=(select auth.uid()) and private.announcement_read_allowed(tenant_id,announcement_id));
alter policy announcement_reads_update_self on public.announcement_reads
using(user_id=(select auth.uid()) and private.announcement_read_allowed(tenant_id,announcement_id))
with check(user_id=(select auth.uid()) and private.announcement_read_allowed(tenant_id,announcement_id));

create or replace function private.announcement_read_identity()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.tenant_id,new.announcement_id,new.user_id) is distinct from
    (old.id,old.tenant_id,old.announcement_id,old.user_id) then
  raise exception 'Een leesbevestiging blijft bij dezelfde gebruiker en hetzelfde nieuwsbericht' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.announcement_read_identity() from public,anon,authenticated,service_role;
create trigger announcement_read_identity before update on public.announcement_reads
for each row execute function private.announcement_read_identity();

do $patch$
declare original text;revised text;
begin
 original:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 revised:=replace(original,'from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid()',
  'from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid() and private.announcement_read_allowed(a.tenant_id,a.announcement_id)');
 if revised=original then raise exception 'Review staff receipt projection';end if;
 execute revised;
end $patch$;

alter policy reminders_read on public.reminders using(
 private.has_role(tenant_id,array['tenant_admin','management','hr']::public.app_role[])
 or (private.is_member(tenant_id) and assigned_user_id=(select auth.uid())
     and (personnel_id is null or personnel_id=private.current_personnel_id(tenant_id)))
);

-- New audit entries retain relationships and event metadata, not dossier copies.
-- Historical entries are preserved pending an explicit retention/redaction plan.
create or replace function private.customer_audit()
returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
end $release$;

SET local check_function_bodies = off;

ALTER TABLE "public"."object_history"
  DROP CONSTRAINT "object_history_tenant_id_object_id_fkey";

CREATE TABLE "public"."object_reminder_recipients" (
  "tenant_id"  uuid    NOT NULL,
  "object_id"  uuid    NOT NULL,
  "user_id"    uuid    NOT NULL,
  "active"     boolean NOT NULL DEFAULT true,
  CONSTRAINT "object_reminder_recipients_pkey" PRIMARY KEY (tenant_id, object_id, user_id),
  "created_by" uuid    NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."object_reminder_recipients"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."object_reminder_recipients" FROM "anon";

ALTER TABLE "public"."work_orders"
  ADD COLUMN "object_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION private.object_binding_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if tg_op='UPDATE' then
  if new.tenant_id<>old.tenant_id or new.object_id<>old.object_id or new.user_id<>old.user_id then raise exception 'Maak een nieuwe binding voor een andere gebruiker of object' using errcode='23514';end if;
  new.version:=old.version+1;
 end if;
 update private.object_access_grants set revoked_at=clock_timestamp() where actor_id=new.user_id and object_id=new.object_id;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_document_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if new.storage_path not like new.tenant_id::text||'/'||new.object_id::text||'/%' or new.mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'Ongeldige documentregistratie' using errcode='23514';end if;
 if new.work_order_id is not null and not exists(select 1 from public.work_orders where tenant_id=new.tenant_id and object_id=new.object_id and id=new.work_order_id) then raise exception 'De afspraak hoort niet bij het object' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.tenant_id,new.object_id,new.storage_path,new.previous_id,new.version,new.category='security') is distinct from (old.tenant_id,old.object_id,old.storage_path,old.previous_id,old.version,old.category='security') then raise exception 'Bewaar dit bestand als afzonderlijke nieuwe versie' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_execution_snapshot()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare obj public.objects;nodes jsonb;programmes jsonb;
begin
 if tg_op='UPDATE' then
  if old.status<>'planned' then new.object_snapshot:=old.object_snapshot;return new;end if;
 end if;
 select * into obj from public.objects where tenant_id=new.tenant_id and id=new.object_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind,'code',n.code,'version',n.version,'address',n.details->>'address')),'[]') into nodes from public.object_nodes n where n.tenant_id=new.tenant_id and n.object_id=new.object_id and n.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'taskRevisionId',r.task_revision_id,'service',r.service)),'[]') into programmes from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=new.object_id and r.kind='programme' and r.state='active';
 new.object_snapshot:=jsonb_build_object('objectId',obj.id,'name',obj.name,'number',obj.object_number,'address',obj.address,'version',obj.version,'nodes',nodes,'programmes',programmes,'capturedAt',clock_timestamp());
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare obj public.objects;ord public.work_orders;p public.object_nodes;lvl integer;parentlvl integer;node uuid;seen uuid[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='UPDATE' then
  if new.id<>old.id or new.tenant_id<>old.tenant_id then raise exception 'De bronrelatie kan niet worden gewijzigd' using errcode='23514';end if;
  if tg_table_name<>'objects' then if new.object_id<>old.object_id then raise exception 'De objectrelatie kan niet worden gewijzigd' using errcode='23514';end if;end if;
  new.version:=old.version+1;
 end if;
 if tg_table_name='objects' then
  if tg_op='UPDATE' and new.customer_id<>old.customer_id and exists(select 1 from public.work_orders where tenant_id=new.tenant_id and object_id=new.id) then raise exception 'Een object met uitvoering kan niet naar een andere klant worden verplaatst' using errcode='23514';end if;
  if tg_op='UPDATE' and new.active is distinct from old.active and new.dossier_status=old.dossier_status then new.dossier_status:=case when new.active then 'active' else 'archived' end;end if;
  new.active:=new.dossier_status='active';return new;
 end if;
 select * into obj from public.objects where tenant_id=new.tenant_id and id=new.object_id;
 if obj.id is null then raise exception 'Object niet gevonden' using errcode='23514';end if;
 if tg_table_name='object_nodes' then
  lvl:=array_position(array['building','floor','zone','room','component'],new.kind);
  node:=new.parent_id;
  while node is not null loop
   if node=new.id or node=any(seen) then raise exception 'Een locatieonderdeel kan niet onder zichzelf vallen' using errcode='23514';end if;
   seen:=array_append(seen,node);
   select * into p from public.object_nodes where tenant_id=new.tenant_id and object_id=new.object_id and id=node;
   if p.id is null or not p.active then raise exception 'Kies een actief onderdeel van dit object' using errcode='23514';end if;
   parentlvl:=array_position(array['building','floor','zone','room','component'],p.kind);
   if parentlvl>=lvl then raise exception 'De locatievolgorde klopt niet' using errcode='23514';end if;
   lvl:=parentlvl;node:=p.parent_id;
  end loop;
  if tg_op='UPDATE' and new.kind<>old.kind and exists(select 1 from public.object_nodes n where n.parent_id=new.id and array_position(array['building','floor','zone','room','component'],n.kind)<=array_position(array['building','floor','zone','room','component'],new.kind)) then raise exception 'Het type past niet boven de gekoppelde onderdelen' using errcode='23514';end if;
  return new;
 end if;
 if new.work_order_id is not null then
  select * into ord from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id and object_id=new.object_id;
  if ord.id is null then raise exception 'De afspraak hoort niet bij dit object' using errcode='23514';end if;
 end if;
 if tg_table_name='object_records' then
  if new.contact_id is not null and not exists(select 1 from public.customer_contacts c where c.tenant_id=new.tenant_id and c.customer_id=obj.customer_id and c.id=new.contact_id) then raise exception 'Contactpersoon hoort niet bij deze klant' using errcode='23514';end if;
  if new.owner_user_id is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=new.tenant_id and m.user_id=new.owner_user_id and m.status='active') then raise exception 'Kies een actieve verantwoordelijke' using errcode='23514';end if;
  if new.personnel_asset_id is not null and not exists(select 1 from public.personnel_dossier_items a where a.tenant_id=new.tenant_id and a.id=new.personnel_asset_id and a.kind='asset') then raise exception 'Uitgifte niet gevonden' using errcode='23514';end if;
  if new.state in ('partial','not_done','completed') and new.kind='task' and length(coalesce(new.details->>'evidence',''))<2 then raise exception 'Leg het resultaat of de reden vast' using errcode='23514';end if;
 end if;
 if tg_table_name in ('object_records','object_visit_requests') then
  if tg_op='UPDATE' and old.work_order_id is not null and (new.work_order_id is distinct from old.work_order_id) then raise exception 'Een registratie blijft gekoppeld aan het oorspronkelijke bezoek' using errcode='23514';end if;
  if ord.status in ('completed','returned','under_review','approved','invoice_ready','invoiced','cancelled') and tg_op='UPDATE' then raise exception 'Deze uitvoering is afgesloten. Voeg een afzonderlijke opvolging toe.' using errcode='23514';end if;
  new.updated_at:=clock_timestamp();new.updated_by:=coalesce(auth.uid(),new.updated_by);
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_history_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare oid uuid;v bigint;
begin
 if tg_table_name='objects' then oid:=new.id;else oid:=new.object_id;end if;v:=new.version;
 insert into public.object_history(tenant_id,object_id,source_table,source_id,version,actor_user_id,event,snapshot)
 values(new.tenant_id,oid,tg_table_name,new.id,v,auth.uid(),case when tg_op='INSERT' then 'created' else 'updated' end,to_jsonb(new));
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.object_instruction_completion_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;uid uuid;
begin
 if new.status='completed' and old.status<>'completed' then
  select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select user_id into uid from public.personnel where tenant_id=new.tenant_id and id=new.personnel_id;
  if exists(select 1 from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=w.object_id and r.kind='instruction' and r.state='active' and coalesce((r.details->>'acknowledgement')::boolean,false)
    and r.starts_at<=new.projected_end_at and (r.ends_at is null or r.ends_at>=new.projected_start_at) and (r.work_order_id is null or r.work_order_id=w.id) and (r.service='' or r.service=w.discipline)
    and not exists(select 1 from public.object_instruction_receipts rc where rc.tenant_id=new.tenant_id and rc.record_id=r.id and rc.record_version=r.version and rc.user_id=uid and rc.work_order_id=w.id)) then
   raise exception 'Lees en bevestig eerst de actuele verplichte objectinstructies' using errcode='23514';
  end if;
 end if;
 return new;
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
begin
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

REVOKE ALL ON FUNCTION "public"."get_object_document"(uuid, uuid, uuid) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.object_dossier_owners (
  target_tenant uuid
)
  RETURNS TABLE (
    id    uuid,
    label text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 select m.user_id,coalesce(p.full_name,u.email,'Beheerder') from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id
 where private.object_manage(target_tenant) and m.tenant_id=target_tenant and m.status='active' and m.roles && array['tenant_admin','management','planner']::public.app_role[];
$function$;

REVOKE ALL ON FUNCTION "public"."object_dossier_owners"(uuid) FROM PUBLIC, "anon", "service_role";

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
 exists(select 1 from public.object_visit_requests vr where vr.tenant_id=o.tenant_id and vr.object_id=o.id and vr.needs_review)
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

REVOKE ALL ON FUNCTION "public"."process_object_reminders"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.register_visit_attachment (
  target_tenant  uuid,
  target_request uuid,
  input          jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r public.object_visit_requests;id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and object_visit_requests.id=target_request;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id) or not exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=r.work_order_id and w.status in ('planned','released','seen','travelling','in_progress')) then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 insert into public.object_documents(tenant_id,object_id,work_order_id,request_id,title,category,storage_path,mime_type,file_name,size_bytes)
 values(target_tenant,r.object_id,r.work_order_id,r.id,input->>'title','photo',input->>'path',input->>'mime',input->>'fileName',(input->>'size')::bigint) returning object_documents.id into id;
 return id;
end $function$;

REVOKE ALL ON FUNCTION "public"."register_visit_attachment"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.save_object_dossier (
  target_tenant uuid,
  input         jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare o public.objects;v bigint;line text;
begin
 if not private.object_manage(target_tenant) then raise exception 'Geen toegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=(input->>'customerId')::uuid and status<>'inactive') then raise exception 'Kies een actieve klant binnen je organisatie' using errcode='23514';end if;
 select * into o from public.objects where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
 v:=(input->>'version')::bigint;
 if v=0 then
  if o.id is not null then return o.id;end if;
  insert into public.objects(id,tenant_id,customer_id,object_number,name,object_type,address,latitude,longitude,location_description,access_instructions,dossier_status)
  values((input->>'id')::uuid,target_tenant,(input->>'customerId')::uuid,'OBJ-'||upper(substr(replace(input->>'id','-',''),1,10)),input->>'name',input->>'type',jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city'),nullif(input->>'latitude','')::numeric,nullif(input->>'longitude','')::numeric,input->>'locationDescription',input->>'instructions',input->>'status') returning * into o;
  for line in select btrim(x) from unnest(string_to_array(coalesce(input->>'structure',''),E'\n'))x where btrim(x)<>'' loop
   insert into public.object_nodes(tenant_id,object_id,name,kind) values(target_tenant,o.id,line,'room');
  end loop;
  if length(coalesce(input->>'contact',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'contact','Contact en bereikbaarheid',input->>'contact','active');end if;
  if length(coalesce(input->>'programme',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state) values(target_tenant,o.id,'programme','Werkprogramma',input->>'programme','draft');end if;
  if length(coalesce(input->>'safety',''))>0 then insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,details) values(target_tenant,o.id,'instruction','Veilig werken',input->>'safety','active','fixed',clock_timestamp(),'{"acknowledgement":true}');end if;
 else
  if o.id is null or o.version<>v then raise exception 'Het object is intussen gewijzigd. Vernieuw de pagina.' using errcode='40001';end if;
  update public.objects set customer_id=(input->>'customerId')::uuid,name=input->>'name',object_type=input->>'type',address=jsonb_build_object('street',input->>'street','postal_code',input->>'postalCode','city',input->>'city'),latitude=nullif(input->>'latitude','')::numeric,longitude=nullif(input->>'longitude','')::numeric,location_description=input->>'locationDescription',access_instructions=input->>'instructions',dossier_status=input->>'status' where id=o.id;
 end if;
 return o.id;
end $function$;

REVOKE ALL ON FUNCTION "public"."save_object_dossier"(uuid, jsonb) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "public"."object_history"
  ADD CONSTRAINT "object_history_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE "public"."object_reminder_recipients"
  ADD CONSTRAINT "object_reminder_recipients_tenant_id_object_id_fkey" FOREIGN KEY (tenant_id, object_id) REFERENCES public.objects(tenant_id, id);

ALTER TABLE "public"."object_reminder_recipients"
  ADD CONSTRAINT "object_reminder_recipients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE TRIGGER object360_binding_version
  BEFORE INSERT OR UPDATE ON public.object_customer_bindings
  FOR EACH ROW
  EXECUTE FUNCTION private.object_binding_version();

CREATE TRIGGER object360_document_guard
  BEFORE INSERT OR UPDATE ON public.object_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.object_document_guard();

CREATE TRIGGER object360_instruction_completion
  BEFORE UPDATE ON public.work_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.object_instruction_completion_guard();

CREATE TRIGGER object360_snapshot
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.object_execution_snapshot();

CREATE POLICY "object_reminders_manage" ON "public"."object_reminder_recipients"
  FOR ALL
  TO "authenticated"
  USING (private.object_manage(tenant_id))
  WITH CHECK ((private.object_manage(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.tenant_memberships m
  WHERE
    ((m.tenant_id = object_reminder_recipients.tenant_id) AND (m.user_id = object_reminder_recipients.user_id) AND (m.status = 'active'::public.membership_status) AND (m.roles &&
    ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'planner'::public.app_role]))))));

REVOKE ALL ON FUNCTION "private"."object_binding_version"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_binding_version"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_document_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_document_guard"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_execution_snapshot"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_execution_snapshot"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."object_instruction_completion_guard"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."object_instruction_completion_guard"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_object_document"(uuid, uuid, uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."object_dossier_owners"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_object_reminders"() TO "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."register_visit_attachment"(uuid, uuid, jsonb) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_object_dossier"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON TABLE "public"."object_reminder_recipients" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."object_reminder_recipients" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."object_reminder_recipients" TO "postgres";

REVOKE ALL ON TABLE "public"."object_reminder_recipients" FROM "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."object_reminder_recipients" TO "service_role";

ALTER TABLE "public"."object_reminder_recipients"
  ADD CONSTRAINT "object_reminder_recipients_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- Data operations are not emitted by schema diff. Preserve existing inactive
-- objects and configure a new private bucket; never import legacy data.
update public.objects set dossier_status='archived' where not active and dossier_status='active';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('object-documents','object-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;

do $$ declare t text;begin
 foreach t in array array['object_customer_bindings','object_nodes','object_records','object_history','object_instruction_receipts','object_visit_requests','object_request_proposals','object_documents','object_reminder_recipients'] loop
  execute format('alter table public.%I force row level security',t);
 end loop;
end $$;

SET local check_function_bodies = off;

DROP POLICY "object360_read" ON "public"."object_documents";

DROP POLICY "object360_write" ON "public"."object_documents";

CREATE OR REPLACE FUNCTION private.object_document_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare previous public.object_documents;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='INSERT' then
  if new.previous_id is null then new.version:=1;
  else
   select * into previous from public.object_documents where tenant_id=new.tenant_id and object_id=new.object_id and id=new.previous_id for update;
   if previous.id is null or exists(select 1 from public.object_documents where previous_id=previous.id) or (previous.category='security' and new.category<>'security') then raise exception 'Kies de actuele documentversie en behoud de beveiligingsclassificatie' using errcode='23514';end if;
   new.version:=previous.version+1;
  end if;
 end if;
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
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'taskRevisionId',r.task_revision_id,'service',r.service)),'[]') into programmes from public.object_records r where r.tenant_id=new.tenant_id and r.object_id=new.object_id and r.kind='programme' and r.state='active' and r.starts_at<=coalesce(new.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(new.projected_start_at,clock_timestamp()));
 new.object_snapshot:=jsonb_build_object('objectId',obj.id,'name',obj.name,'number',obj.object_number,'address',obj.address,'version',obj.version,'nodes',nodes,'programmes',programmes,'capturedAt',clock_timestamp());
 return new;
end $function$;

CREATE UNIQUE INDEX object_documents_successor_idx ON public.object_documents USING btree (previous_id)
  WHERE (previous_id IS NOT NULL);

CREATE POLICY "object360_document_read" ON "public"."object_documents"
  FOR SELECT
  TO "authenticated"
  USING
    ((private.object_manage(tenant_id) AND ((category <> 'security'::text) OR private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role]))));

CREATE POLICY "object360_document_write" ON "public"."object_documents"
  FOR ALL
  TO "authenticated"
  USING
    ((private.object_manage(tenant_id) AND ((category <> 'security'::text) OR private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role]))))
  WITH
    CHECK
    ((private.object_manage(tenant_id) AND ((category <> 'security'::text) OR private.has_role(tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role]))));

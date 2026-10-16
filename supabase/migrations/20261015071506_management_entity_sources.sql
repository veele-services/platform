SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.cockpit_entity_access (
  t    uuid,
  kind text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare module text;documents text;today date;begin
 module:=case kind when 'customer' then 'customers' when 'object' then 'objects' when 'personnel' then 'personnel' end;
 documents:=case kind when 'customer' then 'customer_documents' when 'object' then 'object_documents' when 'personnel' then 'personnel_documents' end;
 if module is null then raise exception 'Onbekend dossier.' using errcode='22023';end if;
 perform private.cockpit_assert(t,'backoffice.'||module||'.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_entity_query');
 if not private.service_enabled(t,case kind when 'personnel' then 'personeel' else 'planning' end) then raise exception 'Deze module is niet actief.' using errcode='42501';end if;
 select (now() at time zone timezone)::date into today from public.tenants where id=t;
 return jsonb_build_object('today',today,'work',private.work_order_access(t,false) and private.management_allowed(t,'backoffice.work_orders.read') and private.management_allowed(t,'backoffice.functions.work_order_operational_rows') and (kind<>'personnel' or private.management_allowed(t,'backoffice.functions.work_order_dossier')),
 'source',private.management_allowed(t,'backoffice.work_orders.read') and private.management_allowed(t,'backoffice.functions.work_order_dossier'),
 'documents',private.management_table_allowed(t,documents,false) and (kind<>'personnel' or private.has_role(t,array['tenant_admin','management','hr']::public.app_role[])),
 'followup',private.cockpit_access(t,'backoffice.followup.read') and private.management_allowed(t,'backoffice.functions.cockpit_followup'),
 'edit',(kind<>'personnel' or private.has_role(t,array['tenant_admin','management','hr']::public.app_role[])) and private.management_allowed(t,'backoffice.'||module||'.write') and private.management_table_allowed(t,module,true));
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_customer_cards (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb;cards jsonb;begin
 perform private.cockpit_entity_access(target_tenant,'customer');perform private.management_assert(target_tenant,'backoffice.functions.cockpit_customer_cards');
 if jsonb_typeof(filters) is distinct from 'object' then raise exception 'Ongeldige lijstselectie.' using errcode='22023';end if;
 result:=public.customer_list(target_tenant,filters);
 if (result->>'page')::integer>greatest(1,ceil((result->>'total')::numeric/(result->>'pageSize')::integer)::integer) then
  result:=public.customer_list(target_tenant,jsonb_set(filters,'{page}',to_jsonb(greatest(1,ceil((result->>'total')::numeric/(result->>'pageSize')::integer)::integer)),true));
 end if;
 select coalesce(jsonb_agg(r.x||jsonb_build_object('email',coalesce((select cc.email from public.customer_contacts cc where cc.tenant_id=target_tenant and cc.customer_id=c.id and cc.active and(cc.active_from is null or cc.active_from<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) and(cc.active_until is null or cc.active_until>=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1),c.email),'address',c.billing_address,'phone',c.phone) order by r.ord),'[]') into cards from jsonb_array_elements(result->'rows') with ordinality r(x,ord) join public.customers c on c.tenant_id=target_tenant and c.id=(r.x->>'id')::uuid;
 if jsonb_array_length(cards)<>jsonb_array_length(result->'rows') then raise exception 'Geen toegang tot de volledige lijstselectie.' using errcode='42501';end if;
 return result||jsonb_build_object('rows',cards);
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_entity_query (
  target_tenant uuid,
  source_kind   text,
  source_id     uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare a jsonb;profile jsonb;docs jsonb:='[]';orders jsonb:='[]';raw jsonb;item jsonb;record record;total integer;begin
 a:=private.cockpit_entity_access(target_tenant,source_kind);
 case source_kind
 when 'customer' then
  select jsonb_build_object('id',c.id,'kind','customer','number',c.customer_number,'name',c.name,'status',c.status,'contact',(select cc.full_name from public.customer_contacts cc where cc.tenant_id=target_tenant and cc.customer_id=c.id and cc.active and(cc.active_from is null or cc.active_from<=(a->>'today')::date) and(cc.active_until is null or cc.active_until>=(a->>'today')::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1),'email',c.email,'phone',c.phone,'address',c.billing_address,'customer','','function','','note',c.preferences,'version',c.version,'editing',case when(a->>'edit')::boolean then to_jsonb(c) else null end) into profile from public.customers c where c.tenant_id=target_tenant and c.id=source_id;
 when 'object' then
  select jsonb_build_object('id',o.id,'kind','object','number',o.object_number,'name',o.name,'status',o.dossier_status,'contact',(select cc.full_name from public.customer_contacts cc where cc.tenant_id=target_tenant and cc.customer_id=o.customer_id and cc.active and(cc.active_from is null or cc.active_from<=(a->>'today')::date) and(cc.active_until is null or cc.active_until>=(a->>'today')::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1),'email',(select c.email from public.customers c where c.tenant_id=target_tenant and c.id=o.customer_id),'phone','','address',o.address,'customer',(select c.name from public.customers c where c.tenant_id=target_tenant and c.id=o.customer_id),'function','','note',o.location_description,'version',o.version,'editing',case when(a->>'edit')::boolean then to_jsonb(o) else null end) into profile from public.objects o where o.tenant_id=target_tenant and o.id=source_id;
 when 'personnel' then
  select jsonb_build_object('id',p.id,'kind','personnel','number',p.employee_number,'name',p.full_name,'status',p.status,'contact',p.phone,'email',p.email,'phone',p.phone,'address','{}'::jsonb,'customer','','function',(select string_agg(f.name,', ' order by f.name) from public.personnel_functions pf join public.function_catalog f on f.tenant_id=pf.tenant_id and f.id=pf.function_id where pf.tenant_id=target_tenant and pf.personnel_id=p.id),'note','','version',p.version,'editing',null) into profile from public.personnel p where p.tenant_id=target_tenant and p.id=source_id;
 end case;
 if profile is null then raise exception 'Geen toegankelijk dossier.' using errcode='42501';end if;
 if(a->>'documents')::boolean then
  case source_kind
  when 'customer' then select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'file',d.file_name,'version',d.version,'date',d.created_at) order by d.created_at desc,d.id),'[]') into docs from(select * from public.customer_documents where tenant_id=target_tenant and customer_id=source_id and not archived order by created_at desc,id limit 21)d;
  when 'object' then select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'file',d.file_name,'version',d.version,'date',d.created_at) order by d.created_at desc,d.id),'[]') into docs from(select * from public.object_documents where tenant_id=target_tenant and object_id=source_id order by created_at desc,id limit 21)d;
  when 'personnel' then select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'file',d.file_name,'version',d.version,'date',d.created_at) order by d.created_at desc,d.id),'[]') into docs from(select * from public.personnel_documents where tenant_id=target_tenant and personnel_id=source_id and replaced_by is null order by created_at desc,id limit 21)d;
  end case;
 end if;
 if(a->>'work')::boolean then
  if source_kind='personnel' then
   for record in select w.work_order_id,max(w.projected_start_at) start from public.work_order_assignments w where w.tenant_id=target_tenant and w.personnel_id=source_id group by w.work_order_id order by max(w.projected_start_at) desc nulls last,w.work_order_id limit 21 loop
    item:=public.work_order_dossier(target_tenant,record.work_order_id)->'order';
    orders:=orders||jsonb_build_array(jsonb_build_object('id',item->'id','number',item->'number','title',item->'title','date',item->'start','status',item->'status'));
   end loop;
  else
   raw:=public.work_order_operational_rows(target_tenant,case when source_kind='customer' then source_id end,case when source_kind='object' then source_id end,0,21,false);
   select coalesce(jsonb_agg(jsonb_build_object('id',r->'id','number',r->'work_order_number','title',r->'title','date',r->'projected_start_at','status',r->'status') order by ord),'[]') into orders from jsonb_array_elements(raw) with ordinality x(r,ord);
  end if;
 end if;
 return jsonb_build_object('profile',profile,'access',a,'documents',docs,'orders',orders,'followup',case when(a->>'followup')::boolean then public.cockpit_followup(target_tenant) else null end,'asOf',now());
end$function$;

REVOKE ALL ON FUNCTION "private"."cockpit_entity_access"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_entity_access"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_customer_cards"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_customer_cards"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_entity_query"(uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_entity_query"(uuid, text, uuid) TO "authenticated", "postgres";


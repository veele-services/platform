-- Customer-only, selected-account projection. The frozen offered snapshot is
-- rebuilt recursively as a public allowlist, never serialized as a raw record.
create function public.customer_portal_request_detail(target_tenant uuid,target_account uuid,target_request uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;r public.requests;result jsonb;author_name text;
begin
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot deze klantaanvraag' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 select * into r from public.requests where tenant_id=target_tenant and id=target_request and customer_id=a.customer_id;
 if r.id is null or not private.commercial_customer_scope(target_tenant,r.customer_id,r.object_id,r.created_by)
 then raise exception 'Geen toegang tot deze klantaanvraag' using errcode='42501';end if;
 select coalesce(ct.full_name,c.name) into author_name from public.customers c left join public.customer_contacts ct on ct.tenant_id=c.tenant_id and ct.id=a.contact_id where c.tenant_id=target_tenant and c.id=a.customer_id;
 select jsonb_build_object('request',jsonb_build_object('id',r.id,'number',r.request_number,'subject',r.subject,'description',r.description,'status',r.status,
   'version',r.version,'objectId',r.object_id,'createdAt',r.created_at,'canReply',r.archived_at is null and r.status not in('rejected','withdrawn')),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'body',e.body,'at',e.created_at,
   'author',case when e.actor_id=auth.uid() then author_name else (select name from public.tenants where id=target_tenant) end) order by e.created_at,e.id),'[]')
   from public.commercial_events e where e.tenant_id=target_tenant and e.request_id=r.id and e.visibility='customer' and nullif(btrim(e.body),'') is not null),
  'quotes',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.quote_number,'revision',q.revision,'version',q.version,
   'status',case when q.status in('awaiting_acceptance','sent') and q.expires_at<=clock_timestamp() then 'expired' when q.status='sent' then 'awaiting_acceptance' else q.status::text end,
   'expiresAt',q.expires_at,'supersededAt',q.superseded_at,'archivedAt',q.archived_at,'hasPdf',q.pdf_path is not null,
   'canDecide',q.status in('awaiting_acceptance','sent') and q.expires_at>clock_timestamp() and q.superseded_at is null and q.archived_at is null
    and not exists(select 1 from public.quotes newer where newer.tenant_id=target_tenant and newer.series_id=q.series_id and newer.revision>q.revision and newer.published_at is not null),
   'snapshot',case when q.snapshot->>'schema'='1' then jsonb_build_object(
    'number',q.snapshot->>'quote_number','revision',(q.snapshot->>'revision')::integer,'subject',q.snapshot->>'subject',
    'workKind',q.snapshot->>'work_kind','priceBasis',q.snapshot->>'price_basis','expiresAt',q.snapshot->>'expires_at',
    'subtotal',(q.snapshot->>'subtotal_cents')::bigint,'vat',(q.snapshot->>'vat_cents')::bigint,'total',(q.snapshot->>'total_cents')::bigint,
    'terms',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(q.snapshot->'terms') where key in('introduction','scope','included','excluded','preparation','conditions','frequency','starts_on','ends_on','pricing_method','discipline') and jsonb_typeof(value)='string'),
    'customer',jsonb_build_object('name',q.snapshot#>>'{customer,name}','number',q.snapshot#>>'{customer,number}',
     'address',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(q.snapshot#>'{customer,billing_address}') where key in('street','postal_code','city','country') and jsonb_typeof(value)='string')),
    'contact',coalesce(q.snapshot#>>'{contact,name}',''),
    'object',jsonb_build_object('id',q.object_id,'name',coalesce(q.snapshot#>>'{object,name}',''),'number',coalesce(q.snapshot#>>'{object,number}',''),
     'address',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(q.snapshot#>'{object,address}','{}')) where key in('street','postal_code','city','country') and jsonb_typeof(value)='string')),
    'supplier',jsonb_build_object('name',q.snapshot#>>'{brand,name}','primary',q.snapshot#>>'{brand,primary}','accent',q.snapshot#>>'{brand,accent}',
     'footer',coalesce(q.snapshot#>>'{brand,footer}',''),'whiteLabel',coalesce((q.snapshot#>>'{brand,white_label}')::boolean,false),'hasLogo',q.logo_path is not null,
     'business',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(q.snapshot#>'{brand,business}','{}')) where key in('legal_name','address','postal_code','city','country','kvk','vat_number','iban','website','phone') and jsonb_typeof(value)='string')),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('description',line->>'description','quantity',(line->>'quantity')::numeric,'unit',line->>'unit',
     'price',(line->>'price_cents')::bigint,'discount',(line->>'discount_basis_points')::integer,'vat',(line->>'vat_basis_points')::integer,'net',(line->>'net_cents')::bigint) order by ordinal),'[]') from jsonb_array_elements(q.snapshot->'lines') with ordinality as source(line,ordinal)),
    'taxes',(select coalesce(jsonb_agg(jsonb_build_object('rate',(tax->>'basis_points')::integer,'base',(tax->>'base_cents')::bigint,'tax',(tax->>'tax_cents')::bigint)),'[]') from jsonb_array_elements(q.snapshot->'taxes')tax),
    'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',attachment->>'id','title',attachment->>'title','mime',attachment->>'mime_type')),'[]') from jsonb_array_elements(coalesce(q.snapshot->'attachments','[]'))attachment)
   )else null end) order by q.created_at,q.id),'[]')
   from public.quotes q where q.tenant_id=target_tenant and q.request_id=r.id and q.customer_id=a.customer_id and q.published_at is not null
    and private.commercial_customer_scope(target_tenant,q.customer_id,q.object_id))) into result;
 return result;
end $$;
revoke all on function public.customer_portal_request_detail(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_request_detail(uuid,uuid,uuid) to authenticated;

-- Shared editorial knowledge. No tenant records or credentials in article content.
create extension if not exists pg_trgm with schema extensions;
create function private.knowledge_content_valid(c jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(c)='object' and length(btrim(c->>'title')) between 5 and 180 and length(btrim(c->>'summary')) between 30 and 600 and length(btrim(c->>'body')) between 100 and 60000 and length(btrim(c->>'category')) between 2 and 80
 and jsonb_typeof(c->'audiences')='array' and jsonb_array_length(c->'audiences') between 1 and 4
 and not exists(select 1 from jsonb_array_elements_text(c->'audiences') v where v not in('platform','backoffice','staff','customer'))
 and (select count(distinct v) from jsonb_array_elements_text(c->'audiences') v)=jsonb_array_length(c->'audiences')
 and jsonb_typeof(c->'tags')='array' and jsonb_array_length(c->'tags')<=20 and not exists(select 1 from jsonb_array_elements_text(c->'tags') v where length(btrim(v)) not between 2 and 60)
 and jsonb_typeof(c->'related')='array' and jsonb_array_length(c->'related')<=12 and not exists(select 1 from jsonb_array_elements_text(c->'related') v where v !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v)>120),false)
$$;
create function private.knowledge_vector(c jsonb) returns tsvector language sql immutable set search_path='' as $$
 select setweight(to_tsvector('dutch'::regconfig,coalesce(c->>'title','')),'A') || setweight(to_tsvector('dutch'::regconfig,coalesce((c->'tags')::text,'')),'A') || setweight(to_tsvector('dutch'::regconfig,coalesce(c->>'summary','')),'B') || setweight(to_tsvector('dutch'::regconfig,coalesce(c->>'body','')),'C')
$$;
create table private.knowledge_articles (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=120),
 draft jsonb not null check(private.knowledge_content_valid(draft)), published jsonb check(published is null or private.knowledge_content_valid(published)),
 publication text not null default 'draft' check(publication in('draft','published','archived')), revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(), published_at timestamptz,
 search_vector tsvector generated always as(private.knowledge_vector(published)) stored,
 check(publication<>'published' or published is not null)
);
create index knowledge_search_idx on private.knowledge_articles using gin(search_vector);
create index knowledge_publication_idx on private.knowledge_articles(publication,slug);
create table private.knowledge_versions (
 article_id uuid not null references private.knowledge_articles(id), revision integer not null,
 content jsonb not null, action text not null check(action in('seed','save','publish','archive','restore')),
 actor_id uuid references auth.users(id), created_at timestamptz not null default clock_timestamp(), primary key(article_id,revision)
);
create table private.knowledge_receipts (
 actor_id uuid not null references auth.users(id),request_id uuid not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(), primary key(actor_id,request_id)
);
alter table private.knowledge_articles enable row level security;
alter table private.knowledge_articles force row level security;
alter table private.knowledge_versions enable row level security;
alter table private.knowledge_versions force row level security;
alter table private.knowledge_receipts enable row level security;
alter table private.knowledge_receipts force row level security;
revoke all on private.knowledge_articles,private.knowledge_versions,private.knowledge_receipts from public,anon,authenticated,service_role;

create function private.knowledge_actor(t uuid,ctx text,a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_session_active() and private.notification_actor_active(t,ctx,a) and case ctx
 when 'platform' then t is null and public.platform_workspace_access()
 when 'backoffice' then case when private.management_is_managed(t,a) then private.management_has(t,a,'backoffice.access') else exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=a and status='active' and roles&&array['tenant_admin','management','planner','finance','hr']::public.app_role[]) end
 when 'staff' then exists(select 1 from public.tenant_settings where tenant_id=t and 'personeel'=any(enabled_services)) and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=a and status='active' and 'staff'=any(roles))
 when 'customer' then exists(select 1 from public.tenant_settings where tenant_id=t and 'klantportaal'=any(enabled_services))
 else false end,false)
$$;
create function private.knowledge_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.actor_session_active() and private.product_platform(auth.uid())
$$;
create function private.knowledge_card(a private.knowledge_articles,c jsonb) returns jsonb language sql immutable set search_path='' as $$
 select (c-'body'-'related')||jsonb_build_object('slug',a.slug,'revision',a.revision,'updatedAt',coalesce(a.published_at,a.updated_at),'publication',a.publication,'excerpt',left(regexp_replace(c->>'body','[#*_`]','','g'),240),'readingMinutes',greatest(1,ceil(length(c->>'body')/1200.0)::integer))
$$;
create function private.knowledge_article_dto(a private.knowledge_articles,ctx text,admin boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select private.knowledge_card(a,c)||jsonb_build_object('updatedAt',case when admin then a.updated_at else coalesce(a.published_at,a.updated_at) end,'body',c->>'body','related',coalesce((select jsonb_agg(d order by explicit desc,score desc,slug) from (select private.knowledge_card(r,case when admin then r.draft else r.published end) d,r.slug,
 (c->'related')?r.slug explicit, (case when (case when admin then r.draft else r.published end)->>'category'=c->>'category' then 5 else 0 end)+(select count(*) from jsonb_array_elements_text(c->'tags') tag where (case when admin then r.draft else r.published end)->'tags' ? tag) score
 from private.knowledge_articles r where r.id<>a.id and (admin or (r.publication='published' and r.published->'audiences' ? ctx)) and ((c->'related')?r.slug or (case when admin then r.draft else r.published end)->>'category'=c->>'category' or exists(select 1 from jsonb_array_elements_text(c->'tags') tag where (case when admin then r.draft else r.published end)->'tags' ? tag)) order by explicit desc,score desc,r.slug limit 6) related),'[]'::jsonb))
 || case when admin then jsonb_build_object('relatedSlugs',c->'related','history',coalesce((select jsonb_agg(jsonb_build_object('revision',v.revision,'action',v.action,'createdAt',v.created_at) order by v.revision desc) from private.knowledge_versions v where v.article_id=a.id),'[]'::jsonb)) else '{}'::jsonb end
 from (select case when admin then a.draft else a.published end c) content
$$;
create function private.knowledge_results(ctx text,admin boolean,p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=btrim(coalesce(p->>'search',''));cat text:=coalesce(p->>'category','');portal text:=coalesce(p->>'portal','');state text:=coalesce(p->>'publication','');page integer:=coalesce((p->>'page')::integer,1);size integer:=coalesce((p->>'pageSize')::integer,12);result jsonb;
begin
 if length(q)>160 or length(cat)>80 or page not between 1 and 100000 or size not between 5 and 100 or portal not in('','platform','backoffice','staff','customer') or state not in('','draft','published','archived') then raise exception 'Ongeldige zoekopdracht.' using errcode='22023';end if;
 with visible as materialized(select a.*,case when admin then a.draft else a.published end c from private.knowledge_articles a where (admin or(a.publication='published' and a.published->'audiences' ? ctx))),
 scored as(select v.*,ts_rank_cd(private.knowledge_vector(c),websearch_to_tsquery('dutch'::regconfig,q))+extensions.word_similarity(lower(q),lower(c->>'title')) score from visible v where (portal='' or c->'audiences' ? portal) and(state='' or publication=state) and(q='' or private.knowledge_vector(c)@@websearch_to_tsquery('dutch'::regconfig,q) or strpos(lower((c->>'title')||' '||(c->>'summary')||' '||(c->'tags')::text),lower(q))>0 or(length(q)>=3 and extensions.word_similarity(lower(q),lower((c->>'title')||' '||(c->'tags')::text))>=0.45))),
 filtered as(select * from scored where cat='' or c->>'category'=cat),
 numbered as(select *,row_number() over(order by case when q<>'' then score else 0 end desc,c->>'title',slug) n from filtered)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.knowledge_card(a,n.c) order by n.n) from numbered n join private.knowledge_articles a on a.id=n.id where n.n>(page-1)*size and n.n<=page*size),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',page,'pageSize',size,'canManage',admin,'categories',coalesce((select jsonb_agg(jsonb_build_object('name',name,'count',amount) order by name) from(select c->>'category' name,count(*) amount from scored group by c->>'category') cats),'[]'::jsonb)) into result;
 return result;
end$$;
create function public.knowledge_query(target_tenant uuid,actor_context text,operation text,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin boolean; a private.knowledge_articles;
begin
 if actor_context is null or not private.knowledge_actor(target_tenant,actor_context,auth.uid()) or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Geen toegang.' using errcode='42501';end if;
 admin:=actor_context='platform' and private.knowledge_admin();
 if operation='list' then return private.knowledge_results(actor_context,admin,payload);end if;
 if operation='article' then
  select * into a from private.knowledge_articles where slug=payload->>'slug' and(admin or(publication='published' and published->'audiences' ? actor_context));
  if not found then raise exception 'Artikel niet beschikbaar.' using errcode='P0002';end if;
  return private.knowledge_article_dto(a,actor_context,admin);
 end if;
 raise exception 'Ongeldige opdracht.' using errcode='22023';
end$$;
create function public.knowledge_command(command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.knowledge_articles;actor uuid:=auth.uid();input_hash text;receipt private.knowledge_receipts;c jsonb;result jsonb;
begin
 if not private.knowledge_admin() then raise exception 'Alleen platformbeheer kan artikelen aanpassen.' using errcode='42501';end if;
 if request_id is null or command is null or command not in('save','publish','archive','restore') or jsonb_typeof(payload) is distinct from 'object' or payload->>'slug' is null then raise exception 'Ongeldige opdracht.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,0));
 input_hash:=md5(command||payload::text);
 select * into receipt from private.knowledge_receipts where actor_id=actor and knowledge_receipts.request_id=knowledge_command.request_id;
 if found then if receipt.input_hash<>input_hash then raise exception 'Aanvraag gewijzigd.' using errcode='23514';end if;return receipt.result;end if;
 select * into a from private.knowledge_articles where slug=payload->>'slug' for update;
 if not found then
  if command<>'save' or (payload->>'revision')::integer is distinct from 0 then raise exception 'Artikel niet beschikbaar.' using errcode='P0002';end if;
  insert into private.knowledge_articles(slug,draft) values(payload->>'slug',payload->'content') returning * into a;
 else
  if (payload->>'revision')::integer is distinct from a.revision then raise exception 'Artikel gewijzigd.' using errcode='40001';end if;
  if command='restore' then select content into c from private.knowledge_versions where article_id=a.id and revision=(payload->>'sourceRevision')::integer;if not found then raise exception 'Versie niet beschikbaar.' using errcode='P0002';end if;end if;
  update private.knowledge_articles set draft=case command when 'save' then payload->'content' when 'restore' then c else draft end,
   published=case when command='publish' then draft else published end, publication=case command when 'publish' then 'published' when 'archive' then 'archived' else publication end,
   revision=revision+1,updated_at=clock_timestamp(),published_at=case when command='publish' then clock_timestamp() else published_at end where id=a.id returning * into a;
 end if;
 insert into private.knowledge_versions(article_id,revision,content,action,actor_id) values(a.id,a.revision,a.draft,command,actor);
 result:=jsonb_build_object('slug',a.slug);
 insert into private.knowledge_receipts(actor_id,request_id,input_hash,result) values(actor,request_id,input_hash,result);
 return result;
end$$;
create function public.knowledge_ticket_search(target_tenant uuid,actor_context text,ticket_id uuid,message_audience text,search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;ctx text;result jsonb;
begin
 if actor_context is null or actor_context not in('tenant','support','platform') or message_audience is null or message_audience not in('reporter','tenant','platform') or not private.actor_session_active() or length(search)>160 then raise exception 'Geen toegang.' using errcode='42501';end if;
 select * into t from public.tickets where id=ticket_id;
 if not found or (actor_context='platform' and target_tenant is not null) or(actor_context<>'platform' and target_tenant is distinct from t.tenant_id) or not private.ticket_allowed(t.id,actor_context,'read') or not private.ticket_allowed(t.id,actor_context,case when message_audience='reporter' then 'reply' else 'note' end) or(message_audience='platform' and actor_context<>'platform') or(message_audience='tenant' and actor_context='platform') then raise exception 'Geen toegang tot dit gesprek.' using errcode='42501';end if;
 ctx:=case when message_audience='platform' then 'platform' when message_audience='tenant' then 'backoffice' when actor_context='support' then 'platform' when exists(select 1 from private.customer_ticket_bindings where customer_ticket_bindings.ticket_id=t.id) then 'customer' when t.route='internal' then 'staff' else 'backoffice' end;
 result:=private.knowledge_results(ctx,false,jsonb_build_object('search',coalesce(search,''),'pageSize',5));
 return jsonb_build_object('portal',ctx,'tenantSlug',(select slug from public.tenants where id=t.tenant_id),'items',coalesce((select jsonb_agg(private.knowledge_article_dto(a,ctx,false) order by card.position) from jsonb_array_elements(result->'items') with ordinality card(value,position) join private.knowledge_articles a on a.slug=card.value->>'slug'),'[]'::jsonb));
end$$;
revoke all on function private.knowledge_content_valid(jsonb),private.knowledge_vector(jsonb),private.knowledge_actor(uuid,text,uuid),private.knowledge_admin(),private.knowledge_card(private.knowledge_articles,jsonb),private.knowledge_article_dto(private.knowledge_articles,text,boolean),private.knowledge_results(text,boolean,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.knowledge_query(uuid,text,text,jsonb),public.knowledge_command(text,jsonb,uuid),public.knowledge_ticket_search(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.knowledge_query(uuid,text,text,jsonb),public.knowledge_command(text,jsonb,uuid),public.knowledge_ticket_search(uuid,text,uuid,text,text) to authenticated;

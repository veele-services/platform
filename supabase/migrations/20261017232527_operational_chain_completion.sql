-- Operational chain completion. New state remains closed by default: no
-- legacy availability, material price, agreement text or payment attempt is
-- promoted into an approved/active record by this migration.
set local check_function_bodies = off;

-- -------------------------------------------------------------------------
-- Payment bundles and merchant-bound external checkout
-- -------------------------------------------------------------------------

create table private.payment_bundle_receipts (
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  fingerprint text not null,
  invoice_group_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, actor_id, request_id),
  foreign key (tenant_id, invoice_group_id)
    references public.invoice_groups(tenant_id, id) on delete restrict
);
alter table private.payment_bundle_receipts enable row level security;
alter table private.payment_bundle_receipts force row level security;
revoke all on private.payment_bundle_receipts from public, anon, authenticated, service_role;

create or replace function public.create_payment_bundle(
  target_tenant uuid,
  invoice_ids uuid[],
  request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ids uuid[];
  customer uuid;
  group_id uuid;
  expires timestamptz;
  raw_token text;
  fingerprint text;
  receipt private.payment_bundle_receipts;
begin
  perform private.management_assert(target_tenant, 'backoffice.functions.create_payment_bundle');
  if actor is null or request_id is null or invoice_ids is null
    or cardinality(invoice_ids) not between 1 and 50
    or array_position(invoice_ids, null) is not null then
    raise exception 'Selecteer geldige facturen.' using errcode = '22023';
  end if;
  select array_agg(distinct value order by value) into ids from unnest(invoice_ids) value;
  if cardinality(ids) <> cardinality(invoice_ids) then
    raise exception 'Selecteer iedere factuur één keer.' using errcode = '23514';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_array(ids)::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'payment-bundle:' || target_tenant::text || ':' || actor::text || ':' || request_id::text, 0
  ));
  perform private.management_assert(target_tenant, 'backoffice.functions.create_payment_bundle');
  select * into receipt from private.payment_bundle_receipts r
   where r.tenant_id = target_tenant and r.actor_id = actor and r.request_id = create_payment_bundle.request_id;
  if found then
    if receipt.fingerprint <> fingerprint then
      raise exception 'De herhaalsleutel hoort bij een andere factuurselectie.' using errcode = '23514';
    end if;
    group_id := receipt.invoice_group_id;
    select expires_at into expires from public.invoice_groups
     where tenant_id = target_tenant and id = group_id and purpose = 'payment_bundle' and status = 'open'
     for update;
    if not found then raise exception 'De eerdere betaalbatch is niet meer open.' using errcode = '23514'; end if;
  else
    perform 1 from public.invoices i
     where i.tenant_id = target_tenant and i.id = any(ids)
     order by i.id for update;
    perform private.management_assert(target_tenant, 'backoffice.functions.create_payment_bundle');
    if (select count(*) from public.invoices i where i.tenant_id = target_tenant and i.id = any(ids)) <> cardinality(ids)
      or exists(select 1 from public.invoices i where i.tenant_id = target_tenant and i.id = any(ids)
        and (i.status not in ('final','sent','partially_paid','overdue') or i.total_cents <= i.paid_cents)) then
      raise exception 'Selecteer uitsluitend definitieve openstaande facturen.' using errcode = '23514';
    end if;
    select i.customer_id into customer from public.invoices i
     where i.tenant_id = target_tenant and i.id = any(ids) order by i.id limit 1;
    if exists(select 1 from public.invoices i where i.tenant_id = target_tenant and i.id = any(ids) and i.customer_id <> customer) then
      raise exception 'Een betaalbatch kan alleen facturen van één klant bevatten.' using errcode = '23514';
    end if;
    if exists(
      select 1 from public.payment_allocations a
      join public.payment_attempts p on p.tenant_id = a.tenant_id and p.id = a.payment_attempt_id
      where a.tenant_id = target_tenant and a.invoice_id = any(ids) and p.status in ('open','pending')
    ) then raise exception 'Een betaling voor deze facturen wordt al verwerkt.' using errcode = '23514'; end if;
    expires := clock_timestamp() + interval '30 days';
    insert into public.invoice_groups(tenant_id, customer_id, purpose, created_by, expires_at)
      values(target_tenant, customer, 'payment_bundle', actor, expires) returning id into group_id;
    insert into public.invoice_group_items(tenant_id, invoice_group_id, invoice_id)
      select target_tenant, group_id, value from unnest(ids) value;
    insert into private.payment_bundle_receipts(tenant_id, actor_id, request_id, fingerprint, invoice_group_id)
      values(target_tenant, actor, request_id, fingerprint, group_id);
  end if;

  -- A replay deliberately rotates the bearer secret. Only one active token is
  -- left behind, while the token itself is never persisted in plaintext.
  update public.external_action_tokens set revoked_at = coalesce(revoked_at, clock_timestamp())
   where tenant_id = target_tenant and purpose = 'payment' and subject_id = group_id
     and consumed_at is null and revoked_at is null;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.external_action_tokens(tenant_id, purpose, subject_id, token_hash, expires_at)
    values(target_tenant, 'payment', group_id,
      encode(extensions.digest(raw_token, 'sha256'), 'hex'), expires);
  return jsonb_build_object('groupId', group_id, 'token', raw_token, 'expiresAt', expires);
end $$;
revoke all on function public.create_payment_bundle(uuid, uuid[], uuid) from public, anon, service_role;
grant execute on function public.create_payment_bundle(uuid, uuid[], uuid) to authenticated;

drop function if exists public.prepare_provider_payment(text, text);
create function public.prepare_provider_payment(
  payment_token_hash text,
  expected_mode text,
  expected_profile text
) returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability public.external_action_tokens;
  bundle public.invoice_groups;
  attempt public.payment_attempts;
  total bigint;
  allocation_count integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'service_role'
    or expected_mode not in ('test','live') or expected_profile is null
    or expected_profile !~ '^pfl_[A-Za-z0-9]+$' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into capability from public.external_action_tokens e
   where e.token_hash = payment_token_hash and e.purpose = 'payment'
     and e.revoked_at is null and e.consumed_at is null and e.expires_at > clock_timestamp()
   for share;
  if not found then raise exception 'Betaallink niet beschikbaar' using errcode = '42501'; end if;
  if not exists(select 1 from public.tenant_provider_connections c
    where c.tenant_id = capability.tenant_id and c.provider = 'mollie' and c.active
      and c.verified_at is not null and c.mode = expected_mode and c.secret_reference = 'MOLLIE_API_KEY'
      and c.public_config->>'profile_id' = expected_profile) then
    raise exception 'Betaalverbinding niet beschikbaar' using errcode = '42501';
  end if;
  select * into bundle from public.invoice_groups g
   where g.tenant_id = capability.tenant_id and g.id = capability.subject_id for update;
  if not found or bundle.status <> 'open' or bundle.expires_at is null or bundle.expires_at <= clock_timestamp()
    or not exists(select 1 from public.tenants t join public.tenant_settings s on s.tenant_id = t.id
      where t.id = bundle.tenant_id and t.status = 'active' and 'finance' = any(s.enabled_services)) then
    raise exception 'Betaalbatch niet beschikbaar' using errcode = '42501';
  end if;
  perform 1 from public.payment_attempts p where p.tenant_id = bundle.tenant_id
    and p.invoice_group_id = bundle.id order by p.id for update;
  perform 1 from public.invoices i join public.invoice_group_items gi
    on gi.tenant_id = i.tenant_id and gi.invoice_id = i.id
    where gi.tenant_id = bundle.tenant_id and gi.invoice_group_id = bundle.id
    order by i.id for update of i;
  if not exists(select 1 from public.tenant_provider_connections c
    where c.tenant_id = bundle.tenant_id and c.provider = 'mollie' and c.active
      and c.verified_at is not null and c.mode = expected_mode and c.secret_reference = 'MOLLIE_API_KEY'
      and c.public_config->>'profile_id' = expected_profile) then
    raise exception 'Betaalverbinding is gewijzigd' using errcode = '42501';
  end if;
  if not exists(select 1 from public.invoice_group_items gi where gi.tenant_id = bundle.tenant_id and gi.invoice_group_id = bundle.id)
    or exists(select 1 from public.invoice_group_items gi join public.invoices i
      on i.id = gi.invoice_id and i.tenant_id = gi.tenant_id
      where gi.tenant_id = bundle.tenant_id and gi.invoice_group_id = bundle.id
        and (i.customer_id <> bundle.customer_id or i.status in ('draft','void','credited'))) then
    raise exception 'Ongeldige facturen' using errcode = '23514';
  end if;
  if exists(
    select 1 from public.invoice_group_items gi
    join public.payment_allocations a on a.tenant_id=gi.tenant_id and a.invoice_id=gi.invoice_id
    join public.payment_attempts p on p.tenant_id=a.tenant_id and p.id=a.payment_attempt_id
    where gi.tenant_id=bundle.tenant_id and gi.invoice_group_id=bundle.id
      and p.invoice_group_id<>bundle.id and p.status in('open','pending')
  ) then raise exception 'Een betaling voor deze facturen wordt al verwerkt.' using errcode='23514';end if;
  select sum(greatest(i.total_cents - i.paid_cents, 0)) into total
   from public.invoices i join public.invoice_group_items gi
    on gi.tenant_id = i.tenant_id and gi.invoice_id = i.id
   where gi.tenant_id = bundle.tenant_id and gi.invoice_group_id = bundle.id;
  if total is null or total <= 0 then raise exception 'Facturen al betaald' using errcode = '23514'; end if;
  select * into attempt from public.payment_attempts p
   where p.tenant_id = bundle.tenant_id and p.invoice_group_id = bundle.id
     and p.status in ('open','pending') order by p.created_at desc, p.id desc limit 1 for update;
  if found then
    if attempt.provider <> 'mollie' or attempt.provider_mode <> expected_mode
      or attempt.merchant_profile_id is distinct from expected_profile
      or attempt.currency <> 'EUR' or attempt.amount_cents <> total then
      raise exception 'Bestaande betaalpoging vereist reconciliatie' using errcode = '23514';
    end if;
  else
    attempt.id := extensions.gen_random_uuid();
    insert into public.payment_attempts(id, tenant_id, invoice_group_id, provider, provider_mode,
      status, amount_cents, currency, idempotency_key, merchant_profile_id)
    values(attempt.id, bundle.tenant_id, bundle.id, 'mollie', expected_mode, 'open', total, 'EUR',
      'mollie-' || bundle.id || '-' || attempt.id, expected_profile) returning * into attempt;
  end if;
  select count(*) into allocation_count from public.payment_allocations a
   where a.tenant_id = attempt.tenant_id and a.payment_attempt_id = attempt.id;
  if allocation_count = 0 and attempt.provider_payment_id is null and attempt.checkout_url is null and attempt.status = 'open' then
    insert into public.payment_allocations(tenant_id, payment_attempt_id, invoice_id, amount_cents)
      select attempt.tenant_id, attempt.id, i.id, i.total_cents - i.paid_cents
      from public.invoices i join public.invoice_group_items gi
        on gi.tenant_id = i.tenant_id and gi.invoice_id = i.id
      where gi.tenant_id = bundle.tenant_id and gi.invoice_group_id = bundle.id and i.total_cents > i.paid_cents;
  end if;
  if (select coalesce(sum(a.amount_cents), 0) from public.payment_allocations a
       where a.tenant_id = attempt.tenant_id and a.payment_attempt_id = attempt.id) <> total
    or exists(select 1 from public.payment_allocations a left join public.invoices i
      on i.id = a.invoice_id and i.tenant_id = a.tenant_id
      where a.tenant_id = attempt.tenant_id and a.payment_attempt_id = attempt.id
        and (i.id is null or i.customer_id <> bundle.customer_id
          or a.amount_cents <> i.total_cents - i.paid_cents
          or not exists(select 1 from public.invoice_group_items gi where gi.tenant_id = bundle.tenant_id
            and gi.invoice_group_id = bundle.id and gi.invoice_id = i.id))) then
    raise exception 'Betaalverdeling niet beschikbaar' using errcode = '23514';
  end if;
  return attempt;
end $$;
revoke all on function public.prepare_provider_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_provider_payment(text, text, text) to postgres, service_role;

-- -------------------------------------------------------------------------
-- One personnel-fit resolver for availability, function and qualifications
-- -------------------------------------------------------------------------

alter table public.work_orders add column required_function_id uuid;
alter table public.work_orders add constraint work_orders_required_function_fk
  foreign key (tenant_id, required_function_id) references public.function_catalog(tenant_id, id) on delete restrict;
create index work_orders_required_function_idx on public.work_orders(tenant_id, required_function_id)
  where required_function_id is not null;

alter table public.work_order_assignments
  add column availability_state text not null default 'unknown'
    check (availability_state in ('known_available','preference_available','unknown','outside_preference')),
  add column availability_override_reason text,
  add constraint assignment_availability_override_reason_length
    check (availability_override_reason is null or length(btrim(availability_override_reason)) between 3 and 1000);

-- Fit evidence belongs to the assignment audit but does not change the
-- schedule itself. Keep the aggregate CAS version stable for these two
-- metadata-only fields while retaining the existing bump for every planning
-- mutation.
create or replace function private.planning_assignment_version()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and
    (to_jsonb(new)-array['availability_state','availability_override_reason']) =
    (to_jsonb(old)-array['availability_state','availability_override_reason']) then
    return new;
  end if;
  update public.work_orders set version=version+1
   where tenant_id=coalesce(new.tenant_id,old.tenant_id) and id=coalesce(new.work_order_id,old.work_order_id);
  return coalesce(new,old);
end $$;
revoke all on function private.planning_assignment_version() from public,anon,authenticated,service_role;
grant execute on function private.planning_assignment_version() to postgres;

alter table public.qualification_requirements drop constraint qualification_requirements_scope_check;
alter table public.qualification_requirements add constraint qualification_requirements_scope_check
  check (scope in ('function','customer','object','work_order','service','task_revision'));

alter table public.qualification_types
  add column evidence_kind text not null default 'certificate'
    check (evidence_kind in ('certificate','diploma','training','skill','object_knowledge')),
  add column level_label text,
  add constraint qualification_level_label_length check(level_label is null or length(btrim(level_label)) between 1 and 80);

create or replace function private.check_qualification_scope() returns trigger
language plpgsql set search_path = '' as $$
declare ok boolean; table_name text;
begin
  if new.scope = 'service' then
    if nullif(btrim(new.service_name), '') is null then raise exception 'Service is required' using errcode='23514'; end if;
  else
    table_name := case new.scope when 'function' then 'function_catalog' when 'customer' then 'customers'
      when 'object' then 'objects' when 'task_revision' then 'task_revisions' else 'work_orders' end;
    execute format('select exists(select 1 from public.%I where tenant_id=$1 and id=$2)', table_name)
      into ok using new.tenant_id, new.subject_id;
    if not ok then raise exception 'Requirement target not in tenant' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create or replace function private.qualified_for_period(t uuid,p uuid,c text,s timestamptz,e timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when exists(select 1 from public.certificates b where b.tenant_id=t and b.personnel_id=p and b.code=c and b.dossier_managed)
  then exists(select 1 from public.certificates b join public.tenants tenant on tenant.id=t
    where b.tenant_id=t and b.personnel_id=p and b.code=c and b.dossier_managed and b.dossier_status='approved'
      and b.verified_at is not null
      and (b.valid_from is null or b.valid_from <= (s at time zone tenant.timezone)::date)
      and (b.expires_on is null or b.expires_on >= ((e-interval '1 microsecond') at time zone tenant.timezone)::date))
  else exists(select 1 from public.qualifications b join public.tenants tenant on tenant.id=t
    where b.tenant_id=t and b.personnel_id=p and b.code=c and b.verified_at is not null
      and (b.issued_at is null or b.issued_at <= (s at time zone tenant.timezone)::date)
      and (b.valid_until is null or b.valid_until >= ((e-interval '1 microsecond') at time zone tenant.timezone)::date)) end;
$$;

create or replace function private.assignment_requirements(t uuid,p uuid,w uuid,s timestamptz,e timestamptz)
returns table(code text, hard_requirement boolean)
language sql stable security definer set search_path = '' as $$
  with context as (
    select wo.*,wo.required_function_id as function_id from public.work_orders wo where wo.tenant_id=t and wo.id=w
  ), requirements as (
    select q.code,q.hard_requirement from public.qualification_requirements q cross join context wo
     where q.tenant_id=t and q.active and (
       (q.scope='customer' and q.subject_id=wo.customer_id) or
       (q.scope='object' and q.subject_id=wo.object_id) or
       (q.scope='work_order' and q.subject_id=w) or
       (q.scope='service' and q.service_name=wo.discipline) or
       (q.scope='function' and q.subject_id=wo.function_id) or
       (q.scope='task_revision' and exists(select 1 from public.work_order_tasks task
          where task.tenant_id=t and task.work_order_id=w and task.task_revision_id=q.subject_id))
     )
    union all
    select unnest(f.required_certificate_codes),true from public.function_catalog f cross join context wo
     where f.tenant_id=t and f.id=wo.function_id
  ) select r.code,bool_or(r.hard_requirement) from requirements r group by r.code;
$$;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.qualification_catalogue_command','tenant','Kwalificatiecatalogus beheren','Type en optionele inzetvoorwaarde atomair vastleggen.','personnel','write',array['tenant'],array['backoffice.personnel.write'])
on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,'backoffice.functions.qualification_catalogue_command' from private.management_roles r
where exists(select 1 from private.management_role_permissions p where p.tenant_id=r.tenant_id and p.role_id=r.id and p.capability='backoffice.personnel.write')
on conflict do nothing;

create function public.qualification_catalogue_command(target_tenant uuid,request_id uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt private.cockpit_receipts;fingerprint text;qualification public.qualification_types;requirement public.qualification_requirements;scope text:=nullif(input->>'scope','');result jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.personnel.write');
  perform private.management_assert(target_tenant,'backoffice.functions.qualification_catalogue_command');
  if request_id is null or jsonb_typeof(input)<>'object' or coalesce(input->>'evidenceKind','') not in('certificate','diploma','training','skill','object_knowledge') then
    raise exception 'Controleer het kwalificatietype.' using errcode='22023';end if;
  fingerprint:=encode(extensions.digest(input::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('qualification-catalogue:'||target_tenant||':'||request_id,0));
  select * into receipt from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=auth.uid() and r.request_id=qualification_catalogue_command.request_id;
  if found then if receipt.fingerprint<>fingerprint then raise exception 'Herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return receipt.result;end if;
  insert into public.qualification_types(tenant_id,code,name,reminder_days,active,evidence_kind,level_label)
    values(target_tenant,upper(btrim(input->>'code')),btrim(input->>'name'),
      array(select value::integer from jsonb_array_elements_text(input->'reminderDays')),coalesce((input->>'active')::boolean,true),
      input->>'evidenceKind',nullif(btrim(input->>'levelLabel'),''))
  on conflict(tenant_id,code) do update set name=excluded.name,reminder_days=excluded.reminder_days,active=excluded.active,
    evidence_kind=excluded.evidence_kind,level_label=excluded.level_label returning * into qualification;
  if scope is not null then
    if scope not in('function','customer','object','work_order','service','task_revision') then raise exception 'Kies een geldige eiscontext.' using errcode='22023';end if;
    select * into requirement from public.qualification_requirements q where q.tenant_id=target_tenant and q.code=qualification.code
      and q.scope=scope and q.subject_id is not distinct from nullif(input->>'subjectId','')::uuid
      and q.service_name is not distinct from nullif(btrim(input->>'service'),'') for update;
    if found then update public.qualification_requirements set hard_requirement=coalesce((input->>'hard')::boolean,true),active=true
      where id=requirement.id returning * into requirement;
    else insert into public.qualification_requirements(tenant_id,code,scope,subject_id,service_name,hard_requirement)
      values(target_tenant,qualification.code,scope,nullif(input->>'subjectId','')::uuid,nullif(btrim(input->>'service'),''),coalesce((input->>'hard')::boolean,true)) returning * into requirement;end if;
  end if;
  result:=jsonb_build_object('id',qualification.id,'code',qualification.code,'requirementId',requirement.id);
  insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,auth.uid(),request_id,fingerprint,result);
  return result;
end $$;
revoke all on function public.qualification_catalogue_command(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.qualification_catalogue_command(uuid,uuid,jsonb) to authenticated;

create or replace function private.personnel_fit(
  target_tenant uuid,
  target_personnel uuid,
  target_start timestamptz,
  target_end timestamptz,
  target_work_order uuid default null,
  target_function uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  person public.personnel;
  timezone_name text;
  preferences jsonb;
  required_function uuid := target_function;
  hard jsonb := '[]';
  warnings jsonb := '[]';
  qualification_issues jsonb := '[]';
  availability_state text := 'unknown';
  local_day date;
  last_day date;
  day_name text;
  day_settings jsonb;
  segment_start timestamptz;
  segment_end timestamptz;
  preference_covers boolean := true;
  requirement record;
begin
  if target_start is null or target_end is null or target_end<=target_start or not isfinite(target_start) or not isfinite(target_end) then
    return jsonb_build_object('eligible',false,'hardBlocks',jsonb_build_array('invalid-period'),'warnings','[]'::jsonb,
      'qualificationIssues','[]'::jsonb,'availabilityState','unknown');
  end if;
  select p.* into person from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;
  select t.timezone into timezone_name from public.tenants t where t.id=target_tenant and t.status='active';
  if person.id is null or timezone_name is null then hard:=hard||jsonb_build_array('personnel-unavailable');
  else
    preferences:=person.availability_preferences;
    if person.status<>'active' or (person.start_date is not null and person.start_date>(target_start at time zone timezone_name)::date)
      or (person.end_date is not null and person.end_date<((target_end-interval '1 microsecond') at time zone timezone_name)::date) then
      hard:=hard||jsonb_build_array('inactive-period');
    end if;
    if exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel)
      and not exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel and c.active
        and c.starts_on<=((target_end-interval '1 microsecond') at time zone timezone_name)::date
        and (c.ends_on is null or c.ends_on>=(target_start at time zone timezone_name)::date)) then
      hard:=hard||jsonb_build_array('outside-engagement');
    end if;
    if exists(select 1 from public.availability a where a.tenant_id=target_tenant and a.personnel_id=target_personnel
      and a.kind in('unavailable','leave','sick') and a.starts_at<target_end and a.ends_at>target_start) then
      hard:=hard||jsonb_build_array('hard-absence');
    end if;
    if exists(select 1 from public.work_order_assignments a join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id
      where a.tenant_id=target_tenant and a.personnel_id=target_personnel and a.status not in('completed','returned','cancelled')
        and w.status<>'cancelled' and (target_work_order is null or a.work_order_id<>target_work_order)
        and a.projected_start_at<target_end and a.projected_end_at>target_start) then
      hard:=hard||jsonb_build_array('assignment-overlap');
    end if;
    if required_function is null and target_work_order is not null then
      select w.required_function_id into required_function from public.work_orders w where w.tenant_id=target_tenant and w.id=target_work_order;
    end if;
    if required_function is not null and not exists(select 1 from public.personnel_functions pf
      where pf.tenant_id=target_tenant and pf.personnel_id=target_personnel and pf.function_id=required_function)
      and not exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel
        and c.function_id=required_function and c.active and c.starts_on<=((target_end-interval '1 microsecond') at time zone timezone_name)::date
        and (c.ends_on is null or c.ends_on>=(target_start at time zone timezone_name)::date)) then
      hard:=hard||jsonb_build_array('required-function');
    end if;
    if exists(select 1 from public.availability a where a.tenant_id=target_tenant and a.personnel_id=target_personnel
      and a.kind='available' and a.starts_at<=target_start and a.ends_at>=target_end) then
      availability_state:='known_available';
    elsif preferences is not null and preferences<>'{}'::jsonb then
      local_day:=(target_start at time zone timezone_name)::date;
      last_day:=((target_end-interval '1 microsecond') at time zone timezone_name)::date;
      while local_day<=last_day loop
        day_name:=case extract(isodow from local_day) when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
          when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday' else 'sunday' end;
        day_settings:=preferences->'week'->day_name;
        segment_start:=greatest(target_start,local_day::timestamp at time zone timezone_name);
        segment_end:=least(target_end,(local_day+1)::timestamp at time zone timezone_name);
        if coalesce((day_settings->>'enabled')::boolean,false)=false
          or segment_start < (local_day+(day_settings->>'start')::time) at time zone timezone_name
          or segment_end > (local_day+(day_settings->>'end')::time) at time zone timezone_name
          or extract(isodow from local_day) in(6,7) and coalesce((preferences->>'weekends')::boolean,false)=false then
          preference_covers:=false;
        end if;
        local_day:=local_day+1;
      end loop;
      if preference_covers then availability_state:='preference_available';
      else availability_state:='outside_preference'; warnings:=warnings||jsonb_build_array(jsonb_build_object(
        'key','availability:'||target_personnel,'message','Buiten de opgegeven vaste beschikbaarheid. Leg een reden vast om af te wijken.'));
      end if;
    else
      warnings:=warnings||jsonb_build_array(jsonb_build_object('key','availability:'||target_personnel,
        'message','Beschikbaarheid is onbekend. Leg een reden vast om deze inzet toch te plannen.'));
    end if;
    if target_work_order is not null then
      for requirement in select * from private.assignment_requirements(target_tenant,target_personnel,target_work_order,target_start,target_end) loop
        if not private.qualified_for_period(target_tenant,target_personnel,requirement.code,target_start,target_end) then
          qualification_issues:=qualification_issues||jsonb_build_array(jsonb_build_object('code',requirement.code,'hard',requirement.hard_requirement));
          if requirement.hard_requirement then hard:=hard||jsonb_build_array('qualification:'||requirement.code);
          else warnings:=warnings||jsonb_build_array(jsonb_build_object('key','qualification:'||target_personnel||':'||requirement.code,
            'message','Controleer de zachte kwalificatie-eis '||requirement.code||'.')); end if;
        end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('eligible',jsonb_array_length(hard)=0,'hardBlocks',hard,'warnings',warnings,
    'qualificationIssues',qualification_issues,'availabilityState',availability_state);
end $$;
revoke all on function private.personnel_fit(uuid,uuid,timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;

-- Qualification changes are re-evaluated against the same resolver that
-- protects planning writes. The queue keeps certificate saves cheap, while a
-- daily wildcard scan also catches evidence that expires without a row update.
create table private.qualification_followup_queue(
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  personnel_key text not null,
  personnel_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,code,personnel_key),
  check(personnel_key=coalesce(personnel_id::text,'*'))
);
create table private.qualification_followup_checks(
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  checked_on date not null,
  checked_at timestamptz not null default clock_timestamp(),
  primary key(tenant_id,code)
);
alter table private.qualification_followup_queue enable row level security;
alter table private.qualification_followup_queue force row level security;
alter table private.qualification_followup_checks enable row level security;
alter table private.qualification_followup_checks force row level security;
revoke all on private.qualification_followup_queue from public,anon,authenticated,service_role;
revoke all on private.qualification_followup_checks from public,anon,authenticated,service_role;
revoke all on sequence private.qualification_followup_queue_id_seq from public,anon,authenticated,service_role;
create index qualification_followup_queue_order on private.qualification_followup_queue(created_at,id);

create function private.queue_qualification_followup(t uuid,c text,p uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if t is null or nullif(btrim(c),'') is null then return;end if;
  insert into private.qualification_followup_queue(tenant_id,code,personnel_key,personnel_id)
  values(t,upper(btrim(c)),coalesce(p::text,'*'),p)
  on conflict(tenant_id,code,personnel_key) do update set created_at=least(private.qualification_followup_queue.created_at,excluded.created_at);
end $$;
revoke all on function private.queue_qualification_followup(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.qualification_followup_enqueue() returns trigger
language plpgsql security definer set search_path='' as $$
declare t uuid;c text;p uuid;
begin
  if tg_op='DELETE' then t:=old.tenant_id;c:=old.code;
    if tg_table_name in('certificates','qualifications') then p:=old.personnel_id;end if;
  else t:=new.tenant_id;c:=new.code;
    if tg_table_name in('certificates','qualifications') then p:=new.personnel_id;end if;
  end if;
  perform private.queue_qualification_followup(t,c,p);
  if tg_op='UPDATE' and(old.tenant_id,old.code) is distinct from(new.tenant_id,new.code) then
    perform private.queue_qualification_followup(old.tenant_id,old.code,case when tg_table_name in('certificates','qualifications') then old.personnel_id else null end);
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.qualification_followup_enqueue() from public,anon,authenticated,service_role;
create trigger qualification_followup_certificate after insert or update or delete on public.certificates for each row execute function private.qualification_followup_enqueue();
create trigger qualification_followup_legacy after insert or update or delete on public.qualifications for each row execute function private.qualification_followup_enqueue();
create trigger qualification_followup_requirement after insert or update or delete on public.qualification_requirements for each row execute function private.qualification_followup_enqueue();

create function private.sync_qualification_followup(t uuid,c text,p uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare assignment record;fit jsonb;current_action private.cockpit_actions;changed integer:=0;closed_count integer:=0;today date;
begin
  select (clock_timestamp() at time zone tenant.timezone)::date into today from public.tenants tenant where tenant.id=t;
  for assignment in
    select a.id assignment_id,a.personnel_id,a.work_order_id,w.work_order_number,w.created_by,person.full_name,a.projected_start_at,a.projected_end_at
    from public.work_order_assignments a
    join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id
    join public.personnel person on person.tenant_id=a.tenant_id and person.id=a.personnel_id
    where a.tenant_id=t and(p is null or a.personnel_id=p)
      and a.status not in('completed','returned','cancelled') and w.status<>'cancelled'
      and a.projected_end_at>clock_timestamp()
  loop
    fit:=private.personnel_fit(t,assignment.personnel_id,assignment.projected_start_at,assignment.projected_end_at,assignment.work_order_id,null);
    select * into current_action from private.cockpit_actions action
      where action.tenant_id=t and action.source_kind='work_order' and action.source_id=assignment.work_order_id
        and action.trigger_key='qualification:'||assignment.assignment_id::text||':'||c for update;
    if exists(select 1 from jsonb_array_elements(coalesce(fit->'qualificationIssues','[]')) issue where issue->>'code'=c) then
      if current_action.id is null then
        insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,automatic,trigger_key,created_by,note)
        values(t,'work_order',assignment.work_order_id,left('Kwalificatie controleren · '||assignment.full_name||' · '||c,180),'personnel',today,today,true,
          'qualification:'||assignment.assignment_id::text||':'||c,assignment.created_by,
          'De inzet op werkbon '||assignment.work_order_number||' voldoet niet meer aantoonbaar aan kwalificatie '||c||'. Beoordeel de toekomstige inzet opnieuw.')
        returning * into current_action;
        insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details)
        values(t,'action:manual',current_action.id,null,'create',current_action.revision,jsonb_build_object('workOrderId',assignment.work_order_id,'assignmentId',assignment.assignment_id,'qualification',c));
        changed:=changed+1;
      elsif current_action.state<>'open' then
        update private.cockpit_actions set state='open',snoozed_until=null,revision=revision+1,updated_at=clock_timestamp()
          where id=current_action.id returning * into current_action;
        insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details)
        values(t,'action:manual',current_action.id,null,'reopen',current_action.revision,jsonb_build_object('workOrderId',assignment.work_order_id,'assignmentId',assignment.assignment_id,'qualification',c));
        changed:=changed+1;
      end if;
    elsif current_action.id is not null and current_action.state<>'done' then
      update private.cockpit_actions set state='done',snoozed_until=null,revision=revision+1,updated_at=clock_timestamp()
        where id=current_action.id returning * into current_action;
      insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details)
      values(t,'action:manual',current_action.id,null,'complete',current_action.revision,jsonb_build_object('workOrderId',assignment.work_order_id,'assignmentId',assignment.assignment_id,'qualification',c,'automatic',true));
      changed:=changed+1;
    end if;
  end loop;
  update private.cockpit_actions action set state='done',snoozed_until=null,revision=revision+1,updated_at=clock_timestamp()
    where action.tenant_id=t and action.state='open' and split_part(action.trigger_key,':',1)='qualification' and split_part(action.trigger_key,':',3)=c
      and(p is null or exists(select 1 from public.work_order_assignments targeted
        where targeted.tenant_id=t and targeted.id=split_part(action.trigger_key,':',2)::uuid and targeted.personnel_id=p))
      and not exists(select 1 from public.work_order_assignments a where a.tenant_id=t and a.id=split_part(action.trigger_key,':',2)::uuid
        and(p is null or a.personnel_id=p) and a.status not in('completed','returned','cancelled') and a.projected_end_at>clock_timestamp());
  get diagnostics closed_count=row_count;
  changed:=changed+closed_count;
  return changed;
end $$;
revoke all on function private.sync_qualification_followup(uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.process_qualification_followup(batch_size integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item record;processed integer:=0;changed integer:=0;business_day date;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' or batch_size not between 1 and 100 then
    raise exception 'Service role required.' using errcode='42501';end if;
  insert into private.qualification_followup_queue(tenant_id,code,personnel_key,personnel_id)
  select candidates.tenant_id,candidates.code,'*',null from(
    select r.tenant_id,r.code from public.qualification_requirements r join public.tenants t on t.id=r.tenant_id and t.status='active' where r.active
    union select f.tenant_id,unnest(f.required_certificate_codes) from public.function_catalog f join public.tenants t on t.id=f.tenant_id and t.status='active' where f.active
  )candidates join public.tenants tenant on tenant.id=candidates.tenant_id
  left join private.qualification_followup_checks checks on checks.tenant_id=candidates.tenant_id and checks.code=candidates.code
  where checks.checked_on is null or checks.checked_on<(clock_timestamp() at time zone tenant.timezone)::date
  on conflict(tenant_id,code,personnel_key) do nothing;
  for item in select q.* from private.qualification_followup_queue q order by q.created_at,q.id for update skip locked limit batch_size loop
    changed:=changed+private.sync_qualification_followup(item.tenant_id,item.code,item.personnel_id);
    if item.personnel_id is null then
      select (clock_timestamp() at time zone timezone)::date into business_day from public.tenants where id=item.tenant_id;
      insert into private.qualification_followup_checks(tenant_id,code,checked_on) values(item.tenant_id,item.code,business_day)
      on conflict(tenant_id,code) do update set checked_on=excluded.checked_on,checked_at=clock_timestamp();
    end if;
    delete from private.qualification_followup_queue where id=item.id;
    processed:=processed+1;
  end loop;
  return jsonb_build_object('processed',processed,'changed',changed);
end $$;
revoke all on function public.process_qualification_followup(integer) from public,anon,authenticated;
grant execute on function public.process_qualification_followup(integer) to postgres,service_role;

create or replace function public.planning_candidates(target_tenant uuid,target_work_order uuid,target_start timestamptz,target_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.planning.read');
  perform private.management_assert(target_tenant,'backoffice.functions.get_planboard');
  if not exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=target_work_order) then
    raise exception 'Werkbon niet beschikbaar' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('personnelId',p.id,'name',p.full_name,'number',p.employee_number,
    'fit',fit.result) order by (fit.result->>'eligible')::boolean desc,
      case fit.result->>'availabilityState' when 'known_available' then 0 when 'preference_available' then 1 when 'unknown' then 2 else 3 end,
      p.full_name,p.id),'[]') into result
  from public.personnel p cross join lateral (select private.personnel_fit(target_tenant,p.id,target_start,target_end,target_work_order,null) result) fit
  where p.tenant_id=target_tenant and p.status in('active','inactive');
  return result;
end $$;
revoke all on function public.planning_candidates(uuid,uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.planning_candidates(uuid,uuid,timestamptz,timestamptz) to authenticated;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.planning_capacity','tenant','Capaciteit bekijken','Concrete vraag, geplande dekking en potentiële kandidaten.','planning','read',array['tenant'],array['backoffice.planning.read'])
on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,'backoffice.functions.planning_capacity' from private.management_roles r
where exists(select 1 from private.management_role_permissions p where p.tenant_id=r.tenant_id and p.role_id=r.id and p.capability='backoffice.planning.read')
on conflict do nothing;

create function public.planning_capacity(target_tenant uuid,target_start timestamptz,target_end timestamptz,
  target_discipline text default null,target_function uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.planning.read');
  perform private.management_assert(target_tenant,'backoffice.functions.planning_capacity');
  if target_start is null or target_end is null or target_end<=target_start or target_end-target_start>interval '8 days' then
    raise exception 'Kies een dag of week.' using errcode='22023';end if;
  with demand as materialized(
    select w.id,w.work_order_number,w.title,w.discipline,w.required_function_id,w.required_personnel,
      greatest(coalesce(w.projected_start_at,w.planned_start_at),target_start) starts_at,
      least(coalesce(w.projected_end_at,w.planned_end_at),target_end) ends_at
    from public.work_orders w where w.tenant_id=target_tenant and w.status<>'cancelled' and w.archive_at is null
      and coalesce(w.projected_start_at,w.planned_start_at)<target_end and coalesce(w.projected_end_at,w.planned_end_at)>target_start
      and(target_discipline is null or target_discipline='' or w.discipline=target_discipline)
      and(target_function is null or w.required_function_id=target_function)
  ),coverage as(
    select d.*,round(extract(epoch from(d.ends_at-d.starts_at))/60*d.required_personnel)::bigint required_minutes,
      coalesce((select round(sum(extract(epoch from(least(a.projected_end_at,d.ends_at)-greatest(a.projected_start_at,d.starts_at)))/60))::bigint
        from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=d.id
          and a.status not in('cancelled','returned') and a.projected_start_at<d.ends_at and a.projected_end_at>d.starts_at),0) raw_scheduled_minutes
    from demand d
  ),fits as(
    select d.id,count(*) filter(where fit->>'eligible'='true' and fit->>'availabilityState' in('known_available','preference_available')) known,
      count(*) filter(where fit->>'eligible'='true' and fit->>'availabilityState'='unknown') unknown,
      count(*) filter(where fit->>'eligible'='true' and fit->>'availabilityState'='outside_preference') attention
    from demand d cross join lateral(select private.personnel_fit(target_tenant,p.id,d.starts_at,d.ends_at,d.id,d.required_function_id) fit
      from public.personnel p where p.tenant_id=target_tenant and p.status='active') candidates group by d.id
  ),rows as(
    select c.*,least(c.required_minutes,c.raw_scheduled_minutes) scheduled_minutes,
      greatest(0,c.required_minutes-c.raw_scheduled_minutes) missing_minutes,
      coalesce(f.known,0) known_candidates,coalesce(f.unknown,0) unknown_candidates,coalesce(f.attention,0) attention_candidates
    from coverage c left join fits f on f.id=c.id
  )
  select jsonb_build_object('sourceAt',clock_timestamp(),'start',target_start,'end',target_end,
    'disciplines',coalesce((select jsonb_agg(x.discipline order by x.discipline) from(select distinct w.discipline from public.work_orders w
      where w.tenant_id=target_tenant and w.discipline is not null)x),'[]'),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name,f.id)
      from public.function_catalog f where f.tenant_id=target_tenant and f.active),'[]'),
    'requiredMinutes',coalesce(sum(required_minutes),0),'scheduledMinutes',coalesce(sum(scheduled_minutes),0),
    'missingMinutes',coalesce(sum(missing_minutes),0),'unknownCandidates',coalesce(sum(unknown_candidates),0),
    'rows',coalesce(jsonb_agg(jsonb_build_object('id',id,'number',work_order_number,'title',title,'discipline',discipline,
      'functionId',required_function_id,'startsAt',starts_at,'endsAt',ends_at,'requiredPersonnel',required_personnel,
      'requiredMinutes',required_minutes,'scheduledMinutes',scheduled_minutes,'missingMinutes',missing_minutes,
      'knownCandidates',known_candidates,'unknownCandidates',unknown_candidates,'attentionCandidates',attention_candidates,
      'state',case when missing_minutes=0 then 'covered' when known_candidates=0 and unknown_candidates=0 and attention_candidates=0 then 'shortage'
        else 'attention' end) order by starts_at,work_order_number),'[]')) into result from rows;
  return result;
end $$;
revoke all on function public.planning_capacity(uuid,timestamptz,timestamptz,text,uuid) from public,anon,service_role;
grant execute on function public.planning_capacity(uuid,timestamptz,timestamptz,text,uuid) to authenticated;

alter function public.change_work_order_planning(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb)
  rename to change_work_order_planning_legacy;
revoke all on function public.change_work_order_planning_legacy(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.change_work_order_planning_legacy(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb) to postgres;

create function public.change_work_order_planning(target_tenant uuid,target_work_order uuid,expected_version bigint,mutation_id uuid,
  target_start timestamptz,target_end timestamptz,target_assignments jsonb,confirmed_warnings text[] default '{}',
  undo_change uuid default null,appointment_data jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare assignment jsonb;fit jsonb;extra_warnings jsonb:='[]';result jsonb;reason text;state text;before_state jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.planning.write');
  perform private.management_assert(target_tenant,'backoffice.functions.change_work_order_planning');
  if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Actuele planningsbevoegdheid vereist.' using errcode='42501';
  end if;
  if exists(select 1 from public.planning_changes pc where pc.tenant_id=target_tenant and pc.work_order_id=target_work_order
    and pc.id=mutation_id and pc.actor_user_id=auth.uid()) then
    return public.change_work_order_planning_legacy(target_tenant,target_work_order,expected_version,mutation_id,target_start,target_end,
      target_assignments,confirmed_warnings,undo_change,appointment_data);
  end if;
  before_state:=private.planning_snapshot(target_work_order);
  if target_start is not null and target_assignments is not null and jsonb_typeof(target_assignments)='array' then
    for assignment in select value from jsonb_array_elements(target_assignments) loop
      fit:=private.personnel_fit(target_tenant,(assignment->>'personnelId')::uuid,
        (assignment->>'start')::timestamptz,(assignment->>'end')::timestamptz,target_work_order,null);
      if not coalesce((fit->>'eligible')::boolean,false) then
        if fit->'hardBlocks' ? 'personnel-unavailable' then
          raise exception 'Medewerker hoort niet bij deze organisatie.' using errcode='42501';
        elsif fit->'hardBlocks' ?| array['assignment-overlap','hard-absence'] then
          raise exception 'Medewerker is niet beschikbaar in dit tijdvak.' using errcode='23P01';
        else
          raise exception 'Medewerker is niet inzetbaar: %',array_to_string(array(select jsonb_array_elements_text(fit->'hardBlocks')),', ')
            using errcode='23514';
        end if;
      end if;
      extra_warnings:=extra_warnings||coalesce(fit->'warnings','[]'::jsonb);
      if jsonb_array_length(coalesce(fit->'warnings','[]'::jsonb))>0 then
        reason:=btrim(coalesce(assignment->>'overrideReason',''));
        if exists(select 1 from jsonb_array_elements(fit->'warnings') warning
          where not(coalesce(warning->>'key','')=any(coalesce(confirmed_warnings,'{}')))) then
          return jsonb_build_object('ok',false,'code','confirmation','warnings',extra_warnings,'before',before_state,'proposed',jsonb_build_object(
            'start',target_start,'end',target_end,'assignments',target_assignments));
        end if;
        if length(reason) not between 3 and 1000 then
          return jsonb_build_object('ok',false,'code','confirmation','warnings',extra_warnings||jsonb_build_array(jsonb_build_object(
            'key','reason:'||(assignment->>'personnelId'),'message','Geef een reden voor de beschikbaarheidsafwijking.')),
            'before',before_state,'proposed',jsonb_build_object('start',target_start,'end',target_end,'assignments',target_assignments));
        end if;
      end if;
    end loop;
  end if;
  result:=public.change_work_order_planning_legacy(target_tenant,target_work_order,expected_version,mutation_id,target_start,target_end,
    target_assignments,confirmed_warnings,undo_change,appointment_data);
  if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'replayed')::boolean,false) then
    for assignment in select value from jsonb_array_elements(coalesce(target_assignments,'[]')) loop
      fit:=private.personnel_fit(target_tenant,(assignment->>'personnelId')::uuid,(assignment->>'start')::timestamptz,
        (assignment->>'end')::timestamptz,target_work_order,null);
      state:=coalesce(fit->>'availabilityState','unknown');reason:=nullif(btrim(coalesce(assignment->>'overrideReason','')),'');
      update public.work_order_assignments set availability_state=state,availability_override_reason=reason
       where tenant_id=target_tenant and work_order_id=target_work_order and personnel_id=(assignment->>'personnelId')::uuid
         and status not in('cancelled','returned')
         and (availability_state is distinct from state or availability_override_reason is distinct from reason);
      if reason is not null then insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
        values(target_tenant,auth.uid(),'planning.availability_override','work_order',target_work_order,
          jsonb_build_object('personnelId',assignment->>'personnelId','reason',reason,'availabilityState',state,
            'start',assignment->>'start','end',assignment->>'end','mutationId',mutation_id)); end if;
    end loop;
    update public.planning_changes pc set
      confirmed_warnings=coalesce(pc.confirmed_warnings,'[]'::jsonb)||extra_warnings,
      after_data=jsonb_set(pc.after_data,'{version}',to_jsonb((select version from public.work_orders where tenant_id=target_tenant and id=target_work_order)))
      where pc.id=mutation_id;
    -- Assignment projection triggers can advance the aggregate after the
    -- legacy command composed its response. Return the authoritative version
    -- so the next compare-and-swap starts from the committed state.
    result:=result||jsonb_build_object('version',(select version from public.work_orders where tenant_id=target_tenant and id=target_work_order));
  end if;
  return result||case when coalesce((result->>'ok')::boolean,false) then jsonb_build_object('fitWarnings',extra_warnings) else '{}'::jsonb end;
end $$;
revoke all on function public.change_work_order_planning(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.change_work_order_planning(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb) to authenticated;

create function private.work_order_coverage_sufficient(target_tenant uuid,target_work_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with work as(
    select w.id,w.required_personnel,coalesce(w.projected_start_at,w.planned_start_at) starts_at,
      coalesce(w.projected_end_at,w.planned_end_at) ends_at
    from public.work_orders w where w.tenant_id=target_tenant and w.id=target_work_order
  ),active as(
    select greatest(a.projected_start_at,w.starts_at) starts_at,least(a.projected_end_at,w.ends_at) ends_at
    from public.work_order_assignments a join work w on w.id=a.work_order_id
    where a.tenant_id=target_tenant and a.status not in('cancelled','returned')
      and a.projected_start_at<w.ends_at and a.projected_end_at>w.starts_at
  ),bounds as(
    select starts_at moment from work union select ends_at from work
    union select starts_at from active union select ends_at from active
  ),segments as(
    select moment starts_at,lead(moment)over(order by moment) ends_at from bounds
  )
  select coalesce(not exists(
    select 1 from segments s cross join work w where s.ends_at>s.starts_at
      and(select count(*) from active a where a.starts_at<=s.starts_at and a.ends_at>=s.ends_at)<w.required_personnel
  ),false) from work;
$$;
revoke all on function private.work_order_coverage_sufficient(uuid,uuid) from public,anon,authenticated,service_role;

alter function public.mutate_work_order(uuid,jsonb) rename to mutate_work_order_legacy;
revoke all on function public.mutate_work_order_legacy(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_work_order_legacy(uuid,jsonb) to postgres;
create function public.mutate_work_order(target_tenant uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare work public.work_orders;assignment record;fit jsonb;result jsonb;
  explicit_coverage_override boolean:=input?'coverageOverrideReason' and nullif(btrim(coalesce(input->>'coverageOverrideReason','')),'') is not null;
  reason text:=btrim(coalesce(input->>'coverageOverrideReason',input->>'reason',''));
begin
  perform private.management_assert(target_tenant,'backoffice.work_orders.write');
  perform private.management_assert(target_tenant,'backoffice.functions.mutate_work_order');
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
  if exists(select 1 from private.work_order_commands command where command.id=(input->>'mutationId')::uuid) then
    return public.mutate_work_order_legacy(target_tenant,input);
  end if;
  if input->>'action'='publish' then
    select * into work from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
    if work.id is null then raise exception 'Werkbon niet beschikbaar.' using errcode='42501';end if;
    for assignment in select a.* from public.work_order_assignments a where a.tenant_id=target_tenant
      and a.work_order_id=work.id and a.status not in('cancelled','returned') loop
      fit:=private.personnel_fit(target_tenant,assignment.personnel_id,assignment.projected_start_at,
        assignment.projected_end_at,work.id,work.required_function_id);
      if not coalesce((fit->>'eligible')::boolean,false) then
        raise exception 'Vrijgeven geblokkeerd: een medewerker voldoet niet meer aan de harde inzetvoorwaarden.' using errcode='23514';
      end if;
      if jsonb_array_length(coalesce(fit->'warnings','[]'::jsonb))>0
        and length(btrim(coalesce(assignment.availability_override_reason,''))) not between 3 and 1000 then
        raise exception 'Vrijgeven geblokkeerd: bevestig de zachte inzetafwijking opnieuw en leg de reden vast.' using errcode='23514';
      end if;
    end loop;
    if not private.work_order_coverage_sufficient(target_tenant,work.id) then
      if not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) or length(reason) not between 3 and 1000 then
        raise exception 'De vereiste bezetting is niet gedurende het volledige tijdvak gedekt. Alleen management kan met een reden afwijken.' using errcode='23514';
      end if;
    elsif explicit_coverage_override then
      raise exception 'Een afwijkingsreden is alleen nodig bij aantoonbare onderbezetting.' using errcode='23514';
    end if;
  end if;
  result:=public.mutate_work_order_legacy(target_tenant,input);
  if input->>'action'='publish' and reason<>'' and coalesce((result->>'ok')::boolean,false) then
    insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(target_tenant,auth.uid(),'work_order.coverage_override','work_order',work.id,
      jsonb_build_object('reason',reason,'requiredPersonnel',work.required_personnel,'mutationId',input->>'mutationId'));
  end if;
  return result;
end $$;
revoke all on function public.mutate_work_order(uuid,jsonb) from public,anon,service_role;
grant execute on function public.mutate_work_order(uuid,jsonb) to authenticated;

create or replace function private.open_shift_eligible(t uuid,s uuid,p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.object_session_active() and private.has_role(t,array['staff']::public.app_role[])
    and private.service_enabled(t,'personeel') and private.service_enabled(t,'planning')
    and exists(select 1 from public.open_shifts shift join public.personnel person
      on person.tenant_id=shift.tenant_id and person.id=p and person.user_id=auth.uid()
      where shift.tenant_id=t and shift.id=s and shift.status='open'
        and coalesce((private.personnel_fit(t,p,shift.starts_at,shift.ends_at,shift.work_order_id,shift.function_id)->>'eligible')::boolean,false)
        and not exists(select 1 from unnest(shift.required_certificate_codes) code
          where not private.qualified_for_period(t,p,code,shift.starts_at,shift.ends_at)));
$$;

alter function public.confirm_shift_interest(uuid,uuid) rename to confirm_shift_interest_legacy;
revoke all on function public.confirm_shift_interest_legacy(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.confirm_shift_interest_legacy(uuid,uuid) to postgres;
create function public.confirm_shift_interest(target_shift_id uuid,target_personnel_id uuid)
returns public.open_shifts language plpgsql security definer set search_path = '' as $$
declare shift public.open_shifts;fit jsonb;
begin
  select * into shift from public.open_shifts where id=target_shift_id;
  perform private.management_assert(shift.tenant_id,'backoffice.planning.write');
  perform private.management_assert(shift.tenant_id,'backoffice.functions.confirm_shift_interest');
  fit:=private.personnel_fit(shift.tenant_id,target_personnel_id,shift.starts_at,shift.ends_at,shift.work_order_id,shift.function_id);
  if not coalesce((fit->>'eligible')::boolean,false)
    or exists(select 1 from unnest(shift.required_certificate_codes) code
      where not private.qualified_for_period(shift.tenant_id,target_personnel_id,code,shift.starts_at,shift.ends_at)) then
    raise exception 'Medewerker voldoet niet aan de actuele inzetvoorwaarden.' using errcode='23514';
  end if;
  return public.confirm_shift_interest_legacy(target_shift_id,target_personnel_id);
end $$;
revoke all on function public.confirm_shift_interest(uuid,uuid) from public,anon,service_role;
grant execute on function public.confirm_shift_interest(uuid,uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Material catalogue, commercial review and typed invoice sources
-- -------------------------------------------------------------------------

create table public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null check(length(btrim(name)) between 2 and 180),
  category text not null default 'Algemeen' check(length(btrim(category)) between 2 and 120),
  description text not null default '' check(length(description)<=1000),
  unit text not null check(length(btrim(unit)) between 1 and 40),
  default_cost_cents bigint check(default_cost_cents is null or default_cost_cents>=0),
  proposed_unit_price_cents bigint check(proposed_unit_price_cents is null or proposed_unit_price_cents>=0),
  proposed_vat_basis_points integer check(proposed_vat_basis_points is null or proposed_vat_basis_points between 0 and 10000),
  billable_default boolean not null default false,
  active boolean not null default true,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,id), unique(tenant_id,code)
);
alter table public.material_catalog enable row level security;
alter table public.material_catalog force row level security;
revoke all on public.material_catalog from public,anon,authenticated,service_role;
grant all on public.material_catalog to postgres;
create index material_catalog_active_idx on public.material_catalog(tenant_id,name,id) where active;

alter table public.work_order_material_usage
  add column material_id uuid,
  add column material_snapshot jsonb not null default '{}';
alter table public.work_order_material_usage add constraint work_order_material_catalog_fk
  foreign key(tenant_id,material_id) references public.material_catalog(tenant_id,id) on delete restrict;

create table private.work_order_material_commercial (
  tenant_id uuid not null,
  usage_id uuid not null,
  state text not null default 'unknown' check(state in('unknown','included','proposed','approved','rejected')),
  unit_price_cents bigint check(unit_price_cents is null or unit_price_cents>=0),
  vat_basis_points integer check(vat_basis_points is null or vat_basis_points between 0 and 10000),
  agreement_evidence text not null default '' check(length(agreement_evidence)<=2000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  version bigint not null default 1,
  primary key(tenant_id,usage_id),
  foreign key(tenant_id,usage_id) references public.work_order_material_usage(tenant_id,id) on delete cascade,
  constraint material_commercial_approval_complete check(
    state not in('approved','included') or reviewed_by is not null and reviewed_at is not null and length(btrim(agreement_evidence))>=3
  ),
  constraint material_commercial_price_state check(
    state<>'approved' or unit_price_cents is not null and unit_price_cents>0 and vat_basis_points is not null
  )
);
alter table private.work_order_material_commercial enable row level security;
alter table private.work_order_material_commercial force row level security;
revoke all on private.work_order_material_commercial from public,anon,authenticated,service_role;
grant all on private.work_order_material_commercial to postgres;

insert into private.work_order_material_commercial(tenant_id,usage_id,state,unit_price_cents)
select f.tenant_id,f.usage_id,case when f.unit_price_cents is null then 'unknown' else 'proposed' end,f.unit_price_cents
from private.work_order_material_finance f on conflict do nothing;

create function private.material_price_proposal_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.work_order_material_commercial(tenant_id,usage_id,state,unit_price_cents)
    values(new.tenant_id,new.usage_id,case when new.unit_price_cents is null then 'unknown' else 'proposed' end,new.unit_price_cents)
  on conflict(tenant_id,usage_id) do update set state=case when private.work_order_material_commercial.state in('unknown','proposed')
    then excluded.state else private.work_order_material_commercial.state end,
    unit_price_cents=case when private.work_order_material_commercial.state in('unknown','proposed')
      then excluded.unit_price_cents else private.work_order_material_commercial.unit_price_cents end,
    version=case when private.work_order_material_commercial.state in('unknown','proposed')
      then private.work_order_material_commercial.version+1 else private.work_order_material_commercial.version end;
  return new;
end $$;
revoke all on function private.material_price_proposal_sync() from public,anon,authenticated,service_role;
grant execute on function private.material_price_proposal_sync() to postgres;
create trigger material_price_proposal_sync after insert or update of unit_price_cents on private.work_order_material_finance
  for each row execute function private.material_price_proposal_sync();

insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values
 ('backoffice.functions.material_catalogue','tenant','Materiaalcatalogus bekijken','Actieve artikelen en commerciële voorstellen bekijken.','tasks','read',array['tenant'],array['backoffice.tasks.read']),
 ('backoffice.functions.material_catalogue_command','tenant','Materiaalcatalogus beheren','Artikelen beheren zonder historische verbruikssnapshots te wijzigen.','tasks','write',array['tenant'],array['backoffice.tasks.read','backoffice.tasks.write']),
 ('backoffice.functions.review_material_usage','tenant','Materiaaldoorbelasting beoordelen','Prijs, btw en afspraakbewijs afzonderlijk goedkeuren.','finance','write',array['tenant'],array['backoffice.finance.read','backoffice.finance.write'])
on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r join public.permission_catalog c on c.key in(
  'backoffice.functions.material_catalogue','backoffice.functions.material_catalogue_command','backoffice.functions.review_material_usage')
where r.code in('owner','management') or r.code='planning' and c.key='backoffice.functions.material_catalogue'
  or r.code='administration' and c.key in('backoffice.functions.material_catalogue','backoffice.functions.review_material_usage')
on conflict do nothing;

create function public.material_catalogue(target_tenant uuid,include_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.management_assert(target_tenant,'backoffice.tasks.read');
  perform private.management_assert(target_tenant,'backoffice.functions.material_catalogue');
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'category',m.category,'description',m.description,
    'unit',m.unit,'proposedUnitPriceCents',m.proposed_unit_price_cents,'proposedVatBasisPoints',m.proposed_vat_basis_points,
    'billableDefault',m.billable_default,'active',m.active,'version',m.version)||case when private.commercial_access(target_tenant)
      then jsonb_build_object('costCents',m.default_cost_cents) else '{}'::jsonb end order by m.active desc,m.name,m.id)
    from public.material_catalog m where m.tenant_id=target_tenant and (include_archived or m.active)),'[]');
end $$;
revoke all on function public.material_catalogue(uuid,boolean) from public,anon,service_role;
grant execute on function public.material_catalogue(uuid,boolean) to authenticated;

create function public.material_catalogue_command(target_tenant uuid,request_id uuid,command text,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.material_catalog;existing private.cockpit_receipts;fingerprint text;result jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.tasks.write');
  perform private.management_assert(target_tenant,'backoffice.functions.material_catalogue_command');
  if request_id is null or command not in('save','archive') or jsonb_typeof(input)<>'object' then raise exception 'Ongeldige materiaalopdracht.' using errcode='22023';end if;
  fingerprint:=encode(extensions.digest(command||input::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('material-catalogue:'||target_tenant||':'||auth.uid()||':'||request_id,0));
  select * into existing from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=auth.uid() and r.request_id=material_catalogue_command.request_id;
  if found then if existing.fingerprint<>fingerprint then raise exception 'Herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return existing.result;end if;
  if command='save' then
    if nullif(input->>'id','') is null then
      insert into public.material_catalog(tenant_id,code,name,category,description,unit,default_cost_cents,proposed_unit_price_cents,proposed_vat_basis_points,billable_default,created_by)
      values(target_tenant,upper(btrim(input->>'code')),btrim(input->>'name'),btrim(coalesce(input->>'category','Algemeen')),btrim(coalesce(input->>'description','')),btrim(input->>'unit'),
        nullif(input->>'costCents','')::bigint,nullif(input->>'unitPriceCents','')::bigint,nullif(input->>'vatBasisPoints','')::integer,
        coalesce((input->>'billableDefault')::boolean,false),auth.uid()) returning * into item;
    else
      update public.material_catalog set code=upper(btrim(input->>'code')),name=btrim(input->>'name'),category=btrim(coalesce(input->>'category','Algemeen')),
        description=btrim(coalesce(input->>'description','')),unit=btrim(input->>'unit'),
        default_cost_cents=case when input ? 'costCents' then nullif(input->>'costCents','')::bigint else default_cost_cents end,
        proposed_unit_price_cents=nullif(input->>'unitPriceCents','')::bigint,
        proposed_vat_basis_points=nullif(input->>'vatBasisPoints','')::integer,billable_default=coalesce((input->>'billableDefault')::boolean,false),
        version=version+1,updated_at=clock_timestamp()
      where tenant_id=target_tenant and id=(input->>'id')::uuid and version=(input->>'version')::bigint returning * into item;
      if not found then raise exception 'Artikel is intussen gewijzigd.' using errcode='40001';end if;
    end if;
  else
    update public.material_catalog set active=false,version=version+1,updated_at=clock_timestamp()
     where tenant_id=target_tenant and id=(input->>'id')::uuid and version=(input->>'version')::bigint returning * into item;
    if not found then raise exception 'Artikel is intussen gewijzigd.' using errcode='40001';end if;
  end if;
  result:=jsonb_build_object('id',item.id,'version',item.version);
  insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,auth.uid(),request_id,fingerprint,result);
  return result;
end $$;
revoke all on function public.material_catalogue_command(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.material_catalogue_command(uuid,uuid,text,jsonb) to authenticated;

create function public.review_material_usage(target_tenant uuid,target_usage uuid,expected_version bigint,input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare usage public.work_order_material_usage;review private.work_order_material_commercial;state text:=input->>'state';
begin
  perform private.management_assert(target_tenant,'backoffice.finance.write');
  perform private.management_assert(target_tenant,'backoffice.functions.review_material_usage');
  if state not in('included','approved','rejected') or length(btrim(coalesce(input->>'evidence',''))) not between 3 and 2000 then
    raise exception 'Kies een besluit en leg het prijsakkoord vast.' using errcode='22023';end if;
  select * into usage from public.work_order_material_usage where tenant_id=target_tenant and id=target_usage for update;
  if not found or not usage.customer_visible then raise exception 'Materiaal niet beschikbaar voor doorbelasting.' using errcode='42501';end if;
  if exists(
    select 1
      from public.invoice_lines line
     where line.tenant_id=target_tenant
       and line.material_usage_id=target_usage
  ) then
    raise exception 'Gefactureerde materiaalbron kan niet opnieuw commercieel worden beoordeeld.' using errcode='23514';
  end if;
  insert into private.work_order_material_commercial(tenant_id,usage_id,state,unit_price_cents,vat_basis_points,agreement_evidence,reviewed_by,reviewed_at)
  values(target_tenant,target_usage,state,case when state='approved' then (input->>'unitPriceCents')::bigint end,
    case when state='approved' then (input->>'vatBasisPoints')::integer end,btrim(input->>'evidence'),auth.uid(),clock_timestamp())
  on conflict(tenant_id,usage_id) do update set state=excluded.state,unit_price_cents=excluded.unit_price_cents,
    vat_basis_points=excluded.vat_basis_points,agreement_evidence=excluded.agreement_evidence,reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,version=private.work_order_material_commercial.version+1
  where private.work_order_material_commercial.version=expected_version returning * into review;
  if not found then raise exception 'Materiaalbeoordeling is intussen gewijzigd.' using errcode='40001';end if;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
   values(target_tenant,auth.uid(),'material.commercial_review','material_usage',target_usage,to_jsonb(review)-'agreement_evidence');
  return jsonb_build_object('id',review.usage_id,'version',review.version,'state',review.state);
end $$;
revoke all on function public.review_material_usage(uuid,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.review_material_usage(uuid,uuid,bigint,jsonb) to authenticated;

create function private.bind_material_catalogue(target_tenant uuid,target_usage uuid,target_material uuid) returns void
language plpgsql security definer set search_path='' as $$
declare item public.material_catalog;
begin
  select * into item from public.material_catalog where tenant_id=target_tenant and id=target_material and active for share;
  if item.id is null then raise exception 'Catalogusartikel niet beschikbaar.' using errcode='23514';end if;
  update public.work_order_material_usage set material_id=item.id,description=item.name,unit=item.unit,
    material_snapshot=jsonb_build_object('id',item.id,'code',item.code,'name',item.name,'category',item.category,
      'description',item.description,'unit',item.unit,'version',item.version,'proposedUnitPriceCents',item.proposed_unit_price_cents,
      'proposedVatBasisPoints',item.proposed_vat_basis_points,'billableDefault',item.billable_default)
    where tenant_id=target_tenant and id=target_usage and material_id is null;
  if not found then raise exception 'Materiaalregistratie is al aan een artikel gekoppeld.' using errcode='23514';end if;
  insert into private.work_order_material_finance(tenant_id,usage_id,cost_cents,unit_price_cents)
    values(target_tenant,target_usage,item.default_cost_cents,item.proposed_unit_price_cents)
  on conflict(tenant_id,usage_id) do update set cost_cents=excluded.cost_cents,unit_price_cents=excluded.unit_price_cents;
end $$;
revoke all on function private.bind_material_catalogue(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.material_usage_catalogue_immutable() returns trigger language plpgsql set search_path='' as $$
begin
  if old.material_id is not null and(new.material_id,new.material_snapshot) is distinct from(old.material_id,old.material_snapshot) then
    raise exception 'De vastgelegde materiaalsnapshot is onveranderlijk.' using errcode='23514';end if;
  return new;
end $$;
revoke all on function private.material_usage_catalogue_immutable() from public,anon,authenticated,service_role;
create trigger material_usage_catalogue_immutable before update of material_id,material_snapshot on public.work_order_material_usage
  for each row execute function private.material_usage_catalogue_immutable();

create function private.material_report_source_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;w uuid;visible boolean;changed boolean;
begin
  t:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
  w:=case when tg_op='DELETE' then old.work_order_id else new.work_order_id end;
  visible:=case when tg_op='INSERT' then new.customer_visible when tg_op='DELETE' then old.customer_visible else old.customer_visible or new.customer_visible end;
  changed:=case when tg_op='UPDATE' then
    (old.work_order_id,old.task_id,old.description,old.quantity,old.unit,old.customer_visible,old.material_id,old.material_snapshot)
      is distinct from(new.work_order_id,new.task_id,new.description,new.quantity,new.unit,new.customer_visible,new.material_id,new.material_snapshot)
    else true end;
  if visible and changed and exists(select 1 from public.work_order_report_versions report
    where report.tenant_id=t and report.work_order_id=w and report.state in('waiting_signature','review','approved')) then
    raise exception 'Vraag eerst een rapportcorrectie aan voordat klantzichtbaar materiaal wordt gewijzigd.' using errcode='23514';end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.material_report_source_guard() from public,anon,authenticated,service_role;
create trigger material_report_source_guard before insert or update or delete on public.work_order_material_usage
  for each row execute function private.material_report_source_guard();

create function public.staff_material_catalogue(target_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant,'planning') or not private.service_enabled(target_tenant,'rapportage') then
    raise exception 'Materiaalregistratie is niet beschikbaar.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'category',m.category,
    'description',m.description,'unit',m.unit,'proposedUnitPriceCents',m.proposed_unit_price_cents,
    'billableDefault',m.billable_default) order by m.category,m.name,m.id) from public.material_catalog m
    where m.tenant_id=target_tenant and m.active),'[]');
end $$;
revoke all on function public.staff_material_catalogue(uuid) from public,anon,service_role;
grant execute on function public.staff_material_catalogue(uuid) to authenticated;

alter function public.work_order_related_command(uuid,uuid,text,jsonb) rename to work_order_related_command_legacy;
revoke all on function public.work_order_related_command_legacy(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.work_order_related_command_legacy(uuid,uuid,text,jsonb) to postgres;
create function public.work_order_related_command(target_tenant uuid,command_id uuid,command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt private.work_order_related_receipts;result jsonb;usage_id uuid;
begin
  if command<>'material' or nullif(input->>'materialId','') is null then
    return public.work_order_related_command_legacy(target_tenant,command_id,command,input);
  end if;
  select * into receipt from private.work_order_related_receipts r where r.tenant_id=target_tenant and r.id=command_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then
      raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer.' using errcode='23514';end if;
    return receipt.result;
  end if;
  result:=public.work_order_related_command_legacy(target_tenant,command_id,command,input-'materialId');
  usage_id:=(result->>'id')::uuid;
  perform private.bind_material_catalogue(target_tenant,usage_id,(input->>'materialId')::uuid);
  update private.work_order_related_receipts set payload=input where tenant_id=target_tenant and id=command_id;
  return result;
end $$;
revoke all on function public.work_order_related_command(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.work_order_related_command(uuid,uuid,text,jsonb) to authenticated;

alter function public.staff_work_order_cost_command(uuid,text,jsonb,uuid) rename to staff_work_order_cost_command_legacy;
revoke all on function public.staff_work_order_cost_command_legacy(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_work_order_cost_command_legacy(uuid,text,jsonb,uuid) to postgres;
create function public.staff_work_order_cost_command(target_tenant uuid,command text,input jsonb,idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt private.staff_app_command_receipts;result jsonb;usage_id uuid;
begin
  if command not in('material.create','add_material') or nullif(input->>'materialId','') is null then
    return public.staff_work_order_cost_command_legacy(target_tenant,command,input,idempotency_key);
  end if;
  select * into receipt from private.staff_app_command_receipts r where r.tenant_id=target_tenant and r.id=idempotency_key;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.command<>'cost.'||command or receipt.payload<>input then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer.' using errcode='23514';end if;
    return receipt.result;
  end if;
  result:=public.staff_work_order_cost_command_legacy(target_tenant,command,input-'materialId',idempotency_key);
  usage_id:=(result#>>'{row,id}')::uuid;
  perform private.bind_material_catalogue(target_tenant,usage_id,(input->>'materialId')::uuid);
  update private.staff_app_command_receipts set payload=input where tenant_id=target_tenant and id=idempotency_key;
  return result;
end $$;
revoke all on function public.staff_work_order_cost_command(uuid,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.staff_work_order_cost_command(uuid,text,jsonb,uuid) to authenticated;

alter function private.work_order_report_snapshot(public.work_orders,text) rename to work_order_report_snapshot_legacy;
revoke all on function private.work_order_report_snapshot_legacy(public.work_orders,text) from public,anon,authenticated,service_role;
grant execute on function private.work_order_report_snapshot_legacy(public.work_orders,text) to postgres;
create function private.work_order_report_snapshot(w public.work_orders,summary text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;materials jsonb;
begin
  snapshot:=private.work_order_report_snapshot_legacy(w,summary);
  select coalesce(jsonb_agg(jsonb_build_object('description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id,
    'pricingState',coalesce(c.state,'unknown'),'unitPriceCents',case when c.state='approved' then c.unit_price_cents end)
    order by m.created_at,m.id),'[]') into materials
  from public.work_order_material_usage m left join private.work_order_material_commercial c
    on c.tenant_id=m.tenant_id and c.usage_id=m.id
  where m.tenant_id=w.tenant_id and m.work_order_id=w.id and m.customer_visible;
  return jsonb_set(jsonb_set(snapshot,'{schema}','2'::jsonb,true),'{materials}',materials,true);
end $$;
revoke all on function private.work_order_report_snapshot(public.work_orders,text) from public,anon,authenticated,service_role;
grant execute on function private.work_order_report_snapshot(public.work_orders,text) to postgres;

-- Schema 2 adds only the explicit commercial meaning of customer-visible
-- material. Schema 1 remains accepted verbatim for historical reports.
create or replace function private.customer_signature_snapshot(snapshot jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare allowed_keys text[]:=array['schema','number','title','summary','tenant','customer','object','executionDate','endedAt','timezone','tasks','notes','checklists','materials','expenses','attachments'];
begin
  if jsonb_typeof(snapshot)<>'object' or not(snapshot?&allowed_keys) or snapshot-allowed_keys<>'{}'::jsonb
    or snapshot->>'schema' not in('1','2')
    or jsonb_typeof(snapshot->'tenant')<>'object' or jsonb_typeof(snapshot->'customer')<>'object'
    or jsonb_typeof(snapshot->'object')<>'object' or jsonb_typeof(snapshot#>'{object,address}')<>'object'
    or jsonb_typeof(snapshot->'tasks')<>'array' or jsonb_typeof(snapshot->'notes')<>'array'
    or jsonb_typeof(snapshot->'checklists')<>'array' or jsonb_typeof(snapshot->'materials')<>'array'
    or jsonb_typeof(snapshot->'expenses')<>'array' or jsonb_typeof(snapshot->'attachments')<>'array'
    or(snapshot->'tenant')-array['name','primaryColor','accentColor']<>'{}'::jsonb
    or(snapshot->'customer')-array['name']<>'{}'::jsonb
    or(snapshot->'object')-array['name','address']<>'{}'::jsonb
    or(snapshot#>'{object,address}')-array['street','postal_code','city','country']<>'{}'::jsonb
    or exists(select 1 from jsonb_array_elements(snapshot->'tasks') item where jsonb_typeof(item)<>'object'
      or item-array['id','code','name','quantity','unit','executedQuantity','result','transferredQuantity','withdrawnQuantity','extraWork','extraUnitPriceCents']<>'{}'::jsonb)
    or exists(select 1 from jsonb_array_elements(snapshot->'notes') item where jsonb_typeof(item)<>'object'
      or item-array['id','body','createdAt']<>'{}'::jsonb)
    or exists(select 1 from jsonb_array_elements(snapshot->'checklists') item where jsonb_typeof(item)<>'object'
      or item-array['name','version','question','unit','type','value','notApplicable','reason','answerVersion','attachmentId']<>'{}'::jsonb)
    or exists(select 1 from jsonb_array_elements(snapshot->'materials') item where jsonb_typeof(item)<>'object'
      or(snapshot->>'schema'='1' and item-array['description','quantity','unit','taskId','unitPriceCents']<>'{}'::jsonb)
      or(snapshot->>'schema'='2' and(item-array['description','quantity','unit','taskId','unitPriceCents','pricingState']<>'{}'::jsonb
        or item->>'pricingState' not in('unknown','included','proposed','approved','rejected'))))
    or exists(select 1 from jsonb_array_elements(snapshot->'expenses') item where jsonb_typeof(item)<>'object'
      or item-array['id','description','amountCents']<>'{}'::jsonb)
    or exists(select 1 from jsonb_array_elements(snapshot->'attachments') item where jsonb_typeof(item)<>'object'
      or item-array['id','name','mime','sha256']<>'{}'::jsonb)
  then raise exception 'Deze rapportversie gebruikt een niet-ondersteund klantschema' using errcode='23514';end if;
  return snapshot;
end $$;
revoke all on function private.customer_signature_snapshot(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.customer_signature_snapshot(jsonb) to postgres;

alter table public.invoice_lines add column material_usage_id uuid;
alter table public.invoice_lines add constraint invoice_lines_material_usage_fk
  foreign key(tenant_id,material_usage_id) references public.work_order_material_usage(tenant_id,id) on delete restrict;
alter table public.invoice_lines add constraint invoice_lines_exactly_one_execution_source
  check((work_order_task_id is not null)::integer+(material_usage_id is not null)::integer=1) not valid;
-- Existing installations can contain deliberately blocked legacy lines without
-- a typed source. NOT VALID keeps those immutable rows while enforcing the
-- invariant for every new or changed line.
create index invoice_lines_material_usage_idx on public.invoice_lines(tenant_id,material_usage_id) where material_usage_id is not null;

create table private.execution_invoice_receipts(
 tenant_id uuid not null references public.tenants(id),request_id uuid not null,actor_id uuid not null references auth.users(id),
 fingerprint text not null,invoice_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,request_id),foreign key(tenant_id,invoice_id) references public.invoices(tenant_id,id) on delete restrict
);
alter table private.execution_invoice_receipts enable row level security;
alter table private.execution_invoice_receipts force row level security;
revoke all on private.execution_invoice_receipts from public,anon,authenticated,service_role;

create function private.execution_invoice_sources_v2(target_tenant uuid,target_order uuid default null)
returns table(source_type text,source_id uuid,work_order_id uuid,customer_id uuid,work_order_number text,title text,order_version bigint,
 report_version integer,updated_at timestamptz,created_at timestamptz,description text,quantity numeric,original_quantity numeric,
 allocated_quantity numeric,unit text,unit_price_cents bigint,vat_basis_points integer,subtotal_cents bigint,vat_cents bigint)
language sql stable security definer set search_path='' as $$
 with task_sources as(
  -- Preserve all existing task pricing, proposal-review and legacy-source
  -- guards by building the typed union on the authoritative projection.
  select 'task'::text,s.task_id,s.work_order_id,s.customer_id,s.work_order_number,s.title,s.order_version,s.report_version,
   s.updated_at,s.created_at,s.description,s.quantity,s.original_quantity,s.allocated_quantity,s.unit,s.unit_price_cents,
   s.vat_basis_points,s.subtotal_cents,s.vat_cents
  from private.execution_invoice_sources(target_tenant,target_order) s
 ),material_sources as(
  select 'material'::text,m.id,m.work_order_id,w.customer_id,w.work_order_number,w.title,w.version,w.report_version,w.updated_at,m.created_at,m.description,
   m.quantity-used.quantity,m.quantity,used.quantity,m.unit,c.unit_price_cents,c.vat_basis_points,
   round((m.quantity-used.quantity)*c.unit_price_cents)::bigint,
   round(round((m.quantity-used.quantity)*c.unit_price_cents)*c.vat_basis_points/10000.0)::bigint
  from public.work_order_material_usage m join public.work_orders w on w.tenant_id=m.tenant_id and w.id=m.work_order_id
  join private.work_order_material_commercial c on c.tenant_id=m.tenant_id and c.usage_id=m.id and c.state='approved'
  cross join lateral(select coalesce(sum(l.quantity),0) quantity from public.invoice_lines l where l.tenant_id=m.tenant_id and l.material_usage_id=m.id)used
  where m.tenant_id=target_tenant and(target_order is null or w.id=target_order) and m.customer_visible and w.status='invoice_ready'
   and w.report_state='approved' and w.archive_at is null and m.quantity>used.quantity
 ) select * from task_sources union all select * from material_sources;
$$;
revoke all on function private.execution_invoice_sources_v2(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.invoice_source_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare task public.work_order_tasks;usage public.work_order_material_usage;commercial private.work_order_material_commercial;
 order_row public.work_orders;invoice public.invoices;proposal public.object_request_proposals;period public.commercial_billing_periods;
 used numeric;available numeric;rate integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
  select * into invoice from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id for update;
  if invoice.id is null or invoice.status<>'draft' or (new.work_order_task_id is null)=(new.material_usage_id is null) then
    raise exception 'Koppel precies één gecontroleerde uitvoeringsbron.' using errcode='23514';end if;
  if new.work_order_task_id is not null then
    select * into task from public.work_order_tasks where tenant_id=new.tenant_id and id=new.work_order_task_id for update;
    select * into order_row from public.work_orders where tenant_id=new.tenant_id and id=task.work_order_id;
    if task.id is null or order_row.customer_id<>invoice.customer_id or new.work_order_id is distinct from task.work_order_id
      or order_row.status<>'invoice_ready' or task.completed_at is null
      or(task.is_extra_work and task.extra_work_status is distinct from 'approved') then
      raise exception 'De taakbron is nog niet gecontroleerd of hoort niet bij deze klant.' using errcode='23514';end if;
    if exists(select 1 from public.object_visit_requests r where r.tenant_id=new.tenant_id and r.work_order_task_id=task.id and r.needs_review) then
      raise exception 'Beoordeel het gewijzigde klantverzoek eerst.' using errcode='23514';end if;
    select p.* into proposal from public.object_request_proposals p join public.object_visit_requests r on r.id=p.request_id
      where r.tenant_id=new.tenant_id and r.work_order_task_id=task.id and p.accepted_at is not null order by p.version desc limit 1;
    if proposal.id is not null and(task.quantity<>proposal.quantity or task.unit_price_cents<>proposal.price_cents or task.task_revision_id<>proposal.task_revision_id) then
      raise exception 'De uitvoering wijkt af van de geaccepteerde voorstelversie.' using errcode='23514';end if;
    if exists(select 1 from public.invoice_lines old_line where old_line.tenant_id=new.tenant_id
      and old_line.work_order_id=task.work_order_id and old_line.work_order_task_id is null and old_line.material_usage_id is null
      and not exists(select 1 from public.work_order_tasks old_task where old_task.tenant_id=old_line.tenant_id
        and old_task.work_order_id=old_line.work_order_id and old_task.id::text=old_line.source_snapshot->>'work_order_task_id')) then
      raise exception 'Deze werkbon heeft historische factuurregels zonder controleerbare bron. Laat de financiële koppeling eerst controleren.' using errcode='23514';end if;
    available:=coalesce(task.executed_quantity,task.quantity);
    select coalesce(sum(line.quantity),0) into used from public.invoice_lines line where line.tenant_id=new.tenant_id
      and(line.work_order_task_id=task.id or line.source_snapshot->>'work_order_task_id'=task.id::text) and line.id<>new.id;
    if new.quantity>available-used or new.unit_price_cents<>task.unit_price_cents or new.vat_basis_points<>task.vat_basis_points or new.unit<>task.unit then
      raise exception 'Hoeveelheid of prijs wijkt af van de nog factureerbare taakbron.' using errcode='23514';end if;
    if task.commercial_snapshot?'quote_id' then
      if task.commercial_snapshot->>'price_basis' in('week','month') then
        select * into period from public.commercial_billing_periods where tenant_id=new.tenant_id and id=new.commercial_period_id;
        if period.id is null or period.invoice_id<>invoice.id or period.quote_id is distinct from order_row.quote_id
          or new.quantity<>(task.commercial_snapshot#>>'{line,quantity}')::numeric
          or(order_row.projected_start_at at time zone(select timezone from public.tenants where id=order_row.tenant_id))::date<period.starts_on
          or(order_row.projected_start_at at time zone(select timezone from public.tenants where id=order_row.tenant_id))::date>=period.ends_before then
          raise exception 'Gebruik expliciete periodefacturatie voor deze afspraak.' using errcode='23514';end if;
      end if;
      new.subtotal_cents:=round((used+new.quantity)*(task.commercial_snapshot#>>'{line,net_cents}')::numeric/(task.commercial_snapshot#>>'{line,quantity}')::numeric)
        -round(used*(task.commercial_snapshot#>>'{line,net_cents}')::numeric/(task.commercial_snapshot#>>'{line,quantity}')::numeric);
      new.description:=task.task_name||case when(task.commercial_snapshot#>>'{line,discount_basis_points}')::integer>0
        then ' (incl. '||((task.commercial_snapshot#>>'{line,discount_basis_points}')::numeric/100)::text||'% korting)' else '' end;
    else new.subtotal_cents:=round(new.quantity*new.unit_price_cents);end if;
    if new.commercial_period_id is not null and period.id is null then raise exception 'Periodebron komt niet overeen.' using errcode='23514';end if;
    if period.id is not null then new.description:=new.description||' · periode '||to_char(period.starts_on,'DD-MM-YYYY')||' t/m '||to_char(period.ends_before-1,'DD-MM-YYYY');end if;
    rate:=task.vat_basis_points;
    new.source_snapshot:=jsonb_build_object('work_order_task_id',task.id,
      'execution_version',task.execution_version,'executed_quantity',available,'object',order_row.object_snapshot,'agreement',task.commercial_snapshot,
      'work_order_number',order_row.work_order_number,'execution_date',coalesce(order_row.actual_start_at,order_row.projected_start_at,order_row.planned_start_at),
      'proposal_id',proposal.id,'proposal_version',proposal.version,'accepted_by',proposal.accepted_by,'accepted_at',proposal.accepted_at,
      'commercial_period_id',period.id,'period_start',period.starts_on,'period_end_exclusive',period.ends_before);
  else
    select * into usage from public.work_order_material_usage where tenant_id=new.tenant_id and id=new.material_usage_id for update;
    select * into commercial from private.work_order_material_commercial where tenant_id=new.tenant_id and usage_id=usage.id for update;
    select * into order_row from public.work_orders where tenant_id=new.tenant_id and id=usage.work_order_id;
    if usage.id is null or order_row.customer_id<>invoice.customer_id or new.work_order_id is distinct from usage.work_order_id
      or order_row.status<>'invoice_ready' or order_row.report_state<>'approved' or not usage.customer_visible
      or commercial.state<>'approved' or commercial.unit_price_cents is null or commercial.vat_basis_points is null then
      raise exception 'Materiaal is niet afzonderlijk commercieel goedgekeurd.' using errcode='23514';end if;
    select coalesce(sum(line.quantity),0) into used from public.invoice_lines line
      where line.tenant_id=new.tenant_id and line.material_usage_id=usage.id and line.id<>new.id;
    if new.quantity>usage.quantity-used or new.unit<>usage.unit or new.unit_price_cents<>commercial.unit_price_cents
      or new.vat_basis_points<>commercial.vat_basis_points then
      raise exception 'Hoeveelheid of prijs wijkt af van de goedgekeurde materiaalbron.' using errcode='23514';end if;
    new.description:=usage.description;new.subtotal_cents:=round(new.quantity*commercial.unit_price_cents);rate:=commercial.vat_basis_points;
    new.source_snapshot:=jsonb_build_object('source_type','material','source_id',usage.id,'material_usage_id',usage.id,
      'material',usage.material_snapshot,'commercial_version',commercial.version,'agreement_evidence',commercial.agreement_evidence,
      'reviewed_by',commercial.reviewed_by,'reviewed_at',commercial.reviewed_at,'registered_quantity',usage.quantity,
      'work_order_number',order_row.work_order_number,'execution_date',coalesce(order_row.actual_start_at,order_row.projected_start_at,order_row.planned_start_at),
      'object',order_row.object_snapshot);
  end if;
  select coalesce(sum(line.subtotal_cents),0) into used from public.invoice_lines line where line.invoice_id=new.invoice_id
    and line.tenant_id=new.tenant_id and line.id<>new.id and line.vat_basis_points=rate and(line.created_at,line.id)<(new.created_at,new.id);
  new.vat_cents:=round((used+new.subtotal_cents)*rate/10000.0)-round(used*rate/10000.0);
  new.total_cents:=new.subtotal_cents+new.vat_cents;
  return new;
end $$;

create or replace function public.execution_invoice_concepts(target_tenant uuid,target_order uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.finance.read');
  perform private.management_assert(target_tenant,'backoffice.functions.execution_invoice_concepts');
  if not private.object_session_active() or not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then
    raise exception 'Financiële toegang vereist' using errcode='42501';end if;
  if target_order is not null and not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order) then
    raise exception 'Concept niet beschikbaar' using errcode='P0002';end if;
  with candidates as(
    select s.work_order_id,s.customer_id,s.work_order_number,s.title,s.order_version,s.report_version,s.updated_at,
      sum(s.subtotal_cents)::bigint subtotal,sum(s.vat_cents)::bigint vat,sum(s.subtotal_cents+s.vat_cents)::bigint total,
      jsonb_agg(case when s.source_type='task' then jsonb_build_object('taskId',s.source_id,
        'description',s.description,'quantity',s.quantity,'unit',s.unit,'unitPriceCents',s.unit_price_cents,
        'vatBasisPoints',s.vat_basis_points,'subtotalCents',s.subtotal_cents,'vatCents',s.vat_cents,'totalCents',s.subtotal_cents+s.vat_cents)
      else jsonb_build_object('sourceType','material','sourceId',s.source_id,'taskId',null,'materialId',s.source_id,
        'description',s.description,'quantity',s.quantity,'unit',s.unit,'unitPriceCents',s.unit_price_cents,
        'vatBasisPoints',s.vat_basis_points,'subtotalCents',s.subtotal_cents,'vatCents',s.vat_cents,'totalCents',s.subtotal_cents+s.vat_cents)
      end order by s.created_at,s.source_type,s.source_id) lines
    from private.execution_invoice_sources_v2(target_tenant,target_order)s
    group by s.work_order_id,s.customer_id,s.work_order_number,s.title,s.order_version,s.report_version,s.updated_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',s.work_order_id,'customerId',s.customer_id,'number',s.work_order_number,
    'title',s.title,'version',s.order_version,'reportVersion',s.report_version,'updatedAt',s.updated_at,
    'issuedOn',(clock_timestamp() at time zone tenant.timezone)::date,
    'dueOn',(clock_timestamp() at time zone tenant.timezone)::date+coalesce(settings.payment_terms_days,14),
    'customer',jsonb_build_object('name',customer.name,'legalName',customer.legal_name,'companyNumber',customer.company_number,
      'vatNumber',customer.vat_number,'email',coalesce(customer.billing_email,customer.email),'phone',customer.phone,
      'billingAddress',customer.billing_address,'billingPreferences',customer.billing_preferences),
    'branding',jsonb_build_object('tenant_name',tenant.name,'primary_color',brand.primary_color,'accent_color',brand.accent_color,
      'logo_path',brand.logo_path,'sender_email',brand.sender_email,'pdf_footer',brand.pdf_footer),
    'lines',s.lines,'subtotalCents',s.subtotal,'vatCents',s.vat,'totalCents',s.total) order by s.updated_at desc,s.work_order_id),'[]') into result
  from candidates s join public.tenants tenant on tenant.id=target_tenant and tenant.status='active'
    left join public.tenant_settings settings on settings.tenant_id=tenant.id
    left join public.tenant_branding brand on brand.tenant_id=tenant.id
    join public.customers customer on customer.tenant_id=target_tenant and customer.id=s.customer_id;
  return result;
end $$;

create or replace function public.create_execution_invoice(target_tenant uuid,request_id uuid,sources jsonb)
returns public.invoices language plpgsql security definer set search_path='' as $$
declare invoice public.invoices;source jsonb;source_row record;customer uuid;quantity numeric;fingerprint text;receipt private.execution_invoice_receipts;
 normalized_sources jsonb;source_count integer;distinct_source_count integer;source_invalid boolean;
 selected_source_type text;selected_source_id uuid;
begin
  perform private.management_assert(target_tenant,'backoffice.finance.write');
  perform private.management_assert(target_tenant,'backoffice.functions.create_execution_invoice');
  if request_id is null or jsonb_typeof(sources)<>'array' or jsonb_array_length(sources) not between 1 and 500 then
    raise exception 'Selecteer gecontroleerde bronnen.' using errcode='23514';end if;
  with parsed as(
    select coalesce(value->>'sourceType',case when value?'taskId' then 'task' end) source_type,
      coalesce(nullif(value->>'sourceId',''),nullif(value->>'taskId',''),nullif(value->>'materialId',''))::uuid source_id,
      (value->>'quantity')::numeric quantity
      from jsonb_array_elements(sources)
  )
  select jsonb_agg(jsonb_build_object('sourceType',p.source_type,'sourceId',p.source_id,
      'quantity',p.quantity::numeric(20,3))
      order by case p.source_type when 'task' then 0 when 'material' then 1 else 2 end,p.source_id),
    count(*),count(distinct p.source_type||':'||p.source_id::text),
    bool_or(p.source_type is null or p.source_type not in('task','material') or p.source_id is null
      or p.quantity is null or p.quantity<=0 or p.quantity<>round(p.quantity,3))
    into normalized_sources,source_count,distinct_source_count,source_invalid
    from parsed p;
  if source_count<>distinct_source_count or source_invalid then
    raise exception 'Factuurbronnen moeten uniek zijn en een geldige hoeveelheid hebben.' using errcode='23514';
  end if;
  fingerprint:=encode(extensions.digest(normalized_sources::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant,0));
  select * into receipt from private.execution_invoice_receipts r where r.tenant_id=target_tenant and r.request_id=create_execution_invoice.request_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.fingerprint<>fingerprint then raise exception 'Herhaalsleutel hoort bij andere factuurbronnen.' using errcode='23514';end if;
    select * into invoice from public.invoices where tenant_id=target_tenant and id=receipt.invoice_id;return invoice;
  end if;
  if exists(select 1 from public.invoices where tenant_id=target_tenant and source_request_id=request_id) then
    raise exception 'Deze oudere factuuropdracht vereist controle voordat zij kan worden herhaald.' using errcode='23514';end if;
  for source in select value from jsonb_array_elements(normalized_sources) loop
    selected_source_type:=coalesce(source->>'sourceType',case when source?'taskId' then 'task' end);
    selected_source_id:=coalesce(nullif(source->>'sourceId',''),nullif(source->>'taskId',''),nullif(source->>'materialId',''))::uuid;
    quantity:=(source->>'quantity')::numeric;
    select * into source_row from private.execution_invoice_sources_v2(target_tenant,null) s
      where s.source_type=selected_source_type and s.source_id=selected_source_id;
    if not found or quantity<=0 or quantity>source_row.quantity or(customer is not null and customer<>source_row.customer_id) then
      raise exception 'Bron is gewijzigd, verbruikt of hoort bij een andere klant.' using errcode='23514';end if;
    if invoice.id is null then customer:=source_row.customer_id;insert into public.invoices(tenant_id,customer_id,created_by,source_request_id)
      values(target_tenant,customer,auth.uid(),request_id) returning * into invoice;end if;
    insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,material_usage_id,description,quantity,
      unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents,source_snapshot)
    values(target_tenant,invoice.id,source_row.work_order_id,case when selected_source_type='task' then selected_source_id end,
      case when selected_source_type='material' then selected_source_id end,source_row.description,quantity,source_row.unit,source_row.unit_price_cents,0,source_row.vat_basis_points,0,0,'{}');
  end loop;
  insert into private.execution_invoice_receipts(tenant_id,request_id,actor_id,fingerprint,invoice_id)
    values(target_tenant,request_id,auth.uid(),fingerprint,invoice.id);
  invoice:=public.finalize_invoice(invoice.id);
  update public.work_orders w set status='invoice_ready' where w.tenant_id=target_tenant
    and w.id in(select line.work_order_id from public.invoice_lines line where line.invoice_id=invoice.id)
    and(exists(select 1 from public.work_order_tasks task where task.tenant_id=target_tenant and task.work_order_id=w.id
      and task.completed_at is not null and task.unit_price_cents>0 and(not task.is_extra_work or task.extra_work_status='approved')
      and coalesce(task.executed_quantity,task.quantity)>(select coalesce(sum(line.quantity),0) from public.invoice_lines line
        where line.tenant_id=target_tenant and(line.work_order_task_id=task.id
          or(line.work_order_task_id is null and line.material_usage_id is null and line.work_order_id=task.work_order_id
            and line.source_snapshot->>'work_order_task_id'=task.id::text))))
    or exists(select 1 from public.work_order_material_usage usage join private.work_order_material_commercial commercial
      on commercial.tenant_id=usage.tenant_id and commercial.usage_id=usage.id and commercial.state='approved'
      where usage.tenant_id=target_tenant and usage.work_order_id=w.id and usage.customer_visible
        and usage.quantity>(select coalesce(sum(line.quantity),0) from public.invoice_lines line
          where line.tenant_id=target_tenant and line.material_usage_id=usage.id)));
  return invoice;
end $$;

-- -------------------------------------------------------------------------
-- Contract-controlled recurring work and date-effective indexation
-- -------------------------------------------------------------------------

alter table public.tenant_settings
  add column contract_planning_automation_enabled boolean not null default false;

alter table public.work_order_series
  add column agreement_line_id uuid,
  add column lifecycle_state text not null default 'manual'
    check(lifecycle_state in('manual','concept','active','paused','ended')),
  add column automation_enabled boolean not null default false,
  add column generation_horizon_weeks integer not null default 6
    check(generation_horizon_weeks between 1 and 26),
  add column preferred_personnel_ids uuid[] not null default '{}',
  add column lifecycle_reason text,
  add column last_generated_at timestamptz,
  add column last_generated_through date,
  add column last_generation_result jsonb not null default '{}';
alter table public.work_order_series add constraint work_order_series_agreement_line_fk
  foreign key(tenant_id,agreement_line_id) references public.customer_agreement_lines(tenant_id,id) on delete restrict;
create index work_order_series_automation_idx on public.work_order_series(lifecycle_state,last_generated_at,id)
  where automation_enabled and lifecycle_state='active';

create table private.contract_series_failures(
  tenant_id uuid not null references public.tenants(id),
  series_id uuid not null,
  occurrence_on date not null,
  error_code text not null,
  message text not null check(length(message) between 1 and 1000),
  attempts integer not null default 1 check(attempts>0),
  first_failed_at timestamptz not null default clock_timestamp(),
  last_failed_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  primary key(tenant_id,series_id,occurrence_on),
  foreign key(tenant_id,series_id) references public.work_order_series(tenant_id,id) on delete cascade
);
alter table private.contract_series_failures enable row level security;
alter table private.contract_series_failures force row level security;
revoke all on private.contract_series_failures from public,anon,authenticated,service_role;

-- The later indexation mapping is resolved before the existing agreement
-- guard snapshots the commercial source. Existing tasks remain immutable.
create function private.rebind_indexed_agreement_line() returns trigger
language plpgsql security definer set search_path='' as $$
declare order_row public.work_orders;effective_line uuid;line public.customer_agreement_lines;business_day date;timezone_name text;
begin
  if new.agreement_line_id is null then return new;end if;
  select w.* into order_row from public.work_orders w
    where w.tenant_id=new.tenant_id and w.id=new.work_order_id;
  if order_row.id is null then return new;end if;
  select t.timezone into timezone_name from public.tenants t where t.id=new.tenant_id;
  business_day:=(coalesce(order_row.projected_start_at,order_row.planned_start_at,clock_timestamp()) at time zone timezone_name)::date;
  effective_line:=private.cockpit_indexation_line(new.tenant_id,new.agreement_line_id,business_day);
  if effective_line is distinct from new.agreement_line_id then
    select * into line from public.customer_agreement_lines where tenant_id=new.tenant_id and id=effective_line;
    if line.id is null or line.object_id<>order_row.object_id or line.task_revision_id is distinct from new.task_revision_id then
      raise exception 'De geïndexeerde contractregel sluit niet eenduidig aan op deze uitvoering.' using errcode='23514';
    end if;
    new.agreement_line_id:=line.id;new.unit_price_cents:=line.price_cents;
    if line.vat_basis_points is not null then new.vat_basis_points:=line.vat_basis_points;end if;
  end if;
  return new;
end $$;
revoke all on function private.rebind_indexed_agreement_line() from public,anon,authenticated,service_role;
create trigger a_indexation_rebind before insert on public.work_order_tasks
  for each row execute function private.rebind_indexed_agreement_line();

create or replace function private.validate_work_order_recurrence(rule jsonb) returns void
language plpgsql set search_path='' as $$
declare anchor date;ending date;
begin
  anchor:=(rule->>'startsOn')::date;ending:=nullif(rule->>'endsOn','')::date;
  if anchor is null or not isfinite(anchor) or(ending is not null and(not isfinite(ending) or ending<anchor))
    or coalesce(rule->>'frequency','') not in('daily','weekly','monthly','yearly')
    or coalesce((rule->>'interval')::integer,0) not between 1 and 52
    or jsonb_typeof(rule->'weekdays') is distinct from 'array' or jsonb_array_length(rule->'weekdays') not between 1 and 7
    or exists(select 1 from jsonb_array_elements_text(rule->'weekdays') x where x::integer not between 1 and 7)
    or coalesce(rule->>'monthlyMode','') not in('date','weekday')
    or coalesce((rule->>'monthDay')::integer,0) not between 1 and 31
    or coalesce((rule->>'monthWeekday')::integer,0) not between 1 and 7
    or coalesce((rule->>'monthPosition')::integer,0) not in(-1,1,2,3,4,5)
    or coalesce(rule->>'startsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(rule->>'endsAt','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce((rule->>'requiredPersonnel')::integer,0) not between 1 and 100
  then raise exception 'Controleer patroon, looptijd, tijdvenster en bezetting' using errcode='23514';end if;
end $$;

create or replace function private.work_order_recurrence_matches(rule jsonb,day date) returns boolean
language plpgsql stable set search_path='' as $$
declare anchor date:=(rule->>'startsOn')::date;step integer:=(rule->>'interval')::integer;months integer;position integer;years integer;
begin
  if day<anchor or day>nullif(rule->>'endsOn','')::date then return false;end if;
  if rule->>'frequency'='daily' then return (day-anchor)%step=0;end if;
  if rule->>'frequency'='weekly' then return floor(((day-anchor)+extract(isodow from anchor)-1)/7)::integer%step=0
    and rule->'weekdays' @> to_jsonb(array[extract(isodow from day)::integer]);end if;
  if rule->>'frequency'='yearly' then
    years:=extract(year from day)::integer-extract(year from anchor)::integer;
    return years%step=0 and extract(month from day)=extract(month from anchor) and extract(day from day)=extract(day from anchor);
  end if;
  months:=(extract(year from day)::integer-extract(year from anchor)::integer)*12+extract(month from day)::integer-extract(month from anchor)::integer;
  if months%step<>0 then return false;end if;
  if rule->>'monthlyMode'='date' then return extract(day from day)::integer=(rule->>'monthDay')::integer;end if;
  if extract(isodow from day)::integer<>(rule->>'monthWeekday')::integer then return false;end if;
  position:=(rule->>'monthPosition')::integer;
  if position=-1 then return date_trunc('month',day+7)<>date_trunc('month',day);end if;
  return floor((extract(day from day)-1)/7)::integer+1=position;
end $$;

create function private.generate_series_occurrence(target_series uuid,day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare series public.work_order_series;source public.work_orders;created public.work_orders;task public.work_order_tasks;
 target uuid;start_at timestamptz;end_at timestamptz;end_day date;effective_line uuid;agreement public.customer_agreements;
begin
  select * into series from public.work_order_series where id=target_series for update;
  if series.id is null or series.lifecycle_state in('paused','ended') or not series.active then raise exception 'Reeks is niet actief.' using errcode='23514';end if;
  if not private.work_order_recurrence_matches(series.definition,day) then raise exception 'Datum valt niet binnen het reeksprofiel.' using errcode='23514';end if;
  if exists(select 1 from public.work_order_occurrences o where o.tenant_id=series.tenant_id and o.series_id=series.id and o.occurrence_on=day) then
    return jsonb_build_object('state','existing');end if;
  select * into source from public.work_orders where tenant_id=series.tenant_id and id=series.source_order_id;
  if source.id is null then raise exception 'Bronwerkbon ontbreekt.' using errcode='23514';end if;
  end_day:=day+case when(series.definition->>'endsAt')::time<=(series.definition->>'startsAt')::time then 1 else 0 end;
  start_at:=(day+(series.definition->>'startsAt')::time) at time zone series.timezone;
  end_at:=(end_day+(series.definition->>'endsAt')::time) at time zone series.timezone;
  if start_at at time zone series.timezone<>day+(series.definition->>'startsAt')::time
    or end_at at time zone series.timezone<>end_day+(series.definition->>'endsAt')::time then
    insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version)
      values(series.tenant_id,series.id,day,'skipped','Tijd bestaat niet door overgang naar zomertijd',series.version);
    return jsonb_build_object('state','skipped');
  end if;
  if series.agreement_line_id is not null then
    effective_line:=private.cockpit_indexation_line(series.tenant_id,series.agreement_line_id,day);
    select a.* into agreement from public.customer_agreement_lines l join public.customer_agreements a
      on a.tenant_id=l.tenant_id and a.id=l.agreement_id
      where l.tenant_id=series.tenant_id and l.id=effective_line and l.object_id=source.object_id;
    if agreement.id is null or agreement.state<>'active' or agreement.starts_on>day or agreement.ends_on<end_day then
      raise exception 'Geen eenduidige actieve contractversie voor deze datum.' using errcode='23514';end if;
  end if;
  if source.quote_id is not null then
    if coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb->>'role','')='service_role' then
      raise exception 'Geautomatiseerde contractplanning gebruikt geen offertebron.' using errcode='23514';end if;
    target:=public.commercial_next_visit(series.tenant_id,source.quote_id,day,extensions.gen_random_uuid());
    select * into created from public.work_orders where tenant_id=series.tenant_id and id=target;
  else
    insert into public.work_orders(tenant_id,work_order_number,customer_id,object_id,discipline,created_by,title,description,
      day_instructions,requested_date,source_kind,required_personnel,required_function_id,signature_required,signature_mode,
      employee_signature_required,template_snapshot,details,planning_state,planned_start_at,planned_end_at,projected_start_at,
      projected_end_at,commercial_terms)
    values(series.tenant_id,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(extensions.gen_random_uuid()::text,1,8)),
      source.customer_id,source.object_id,source.discipline,series.created_by,series.title,source.description,source.day_instructions,day,
      'recurrence',(series.definition->>'requiredPersonnel')::integer,source.required_function_id,source.signature_required,
      coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),source.employee_signature_required,
      source.template_snapshot,source.details||jsonb_build_object('personnel_suggestion',to_jsonb(series.preferred_personnel_ids),
        'contract_generation',jsonb_build_object('seriesId',series.id,'seriesVersion',series.version,'agreementLineId',effective_line,'occurrenceOn',day)),
      'unassigned',start_at,end_at,start_at,end_at,source.commercial_terms) returning * into created;
    target:=created.id;
    insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot)
      select series.tenant_id,target,c.contact_id,c.roles,c.snapshot from public.work_order_contacts c
      join public.customer_contacts contact on contact.tenant_id=c.tenant_id and contact.id=c.contact_id and contact.customer_id=source.customer_id
      where c.tenant_id=series.tenant_id and c.work_order_id=source.id;
    insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
      select series.tenant_id,target,template_revision_id,name,definition from public.work_order_checklists
      where tenant_id=series.tenant_id and work_order_id=source.id;
    for task in select * from public.work_order_tasks where tenant_id=series.tenant_id and work_order_id=source.id order by created_at,id loop
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,
        unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by)
      values(series.tenant_id,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,task.quantity,
        task.unit,task.unit_price_cents,task.vat_basis_points,task.agreement_line_id,series.created_by);
    end loop;
    update public.work_orders set planned_start_at=null,planned_end_at=null,projected_start_at=null,projected_end_at=null,
      details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',series.definition->>'startsAt',
        'endsAt',series.definition->>'endsAt','endsNextDay',end_day>day,'timezone',series.timezone,'start',start_at,'end',end_at),
        'preferred_personnel_match',coalesce((select jsonb_agg(jsonb_build_object('personnelId',candidate,
          'fit',private.personnel_fit(series.tenant_id,candidate,start_at,end_at,target,source.required_function_id)) order by candidate)
          from unnest(series.preferred_personnel_ids) candidate),'[]'::jsonb)),
      version=version+1 where tenant_id=series.tenant_id and id=target returning * into created;
  end if;
  insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,work_order_id,state,series_version,generated_order_version)
    values(series.tenant_id,series.id,day,target,'generated',series.version,created.version);
  insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by)
    values(series.tenant_id,source.id,target,'recurrence',day::text,series.created_by) on conflict(tenant_id,target_order_id) do nothing;
  return jsonb_build_object('state','generated','orderId',target);
end $$;
revoke all on function private.generate_series_occurrence(uuid,date) from public,anon,authenticated,service_role;

create function private.generate_series_range(target_series uuid,from_day date,until_day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare series public.work_order_series;day date;outcome jsonb;created integer:=0;skipped integer:=0;failed integer:=0;
begin
  select * into series from public.work_order_series where id=target_series for update;
  if series.id is null then raise exception 'Reeks ontbreekt.' using errcode='P0002';end if;
  for day in select d::date from generate_series(from_day::timestamp,until_day::timestamp,interval '1 day') d loop
    if not private.work_order_recurrence_matches(series.definition,day)
      or exists(select 1 from public.work_order_occurrences o where o.tenant_id=series.tenant_id and o.series_id=series.id and o.occurrence_on=day) then continue;end if;
    begin
      outcome:=private.generate_series_occurrence(series.id,day);
      if outcome->>'state'='generated' then created:=created+1;else skipped:=skipped+1;end if;
      update private.contract_series_failures set resolved_at=clock_timestamp()
        where tenant_id=series.tenant_id and series_id=series.id and occurrence_on=day and resolved_at is null;
    exception when others then
      failed:=failed+1;
      insert into private.contract_series_failures(tenant_id,series_id,occurrence_on,error_code,message)
        values(series.tenant_id,series.id,day,sqlstate,left(sqlerrm,1000))
      on conflict(tenant_id,series_id,occurrence_on) do update set error_code=excluded.error_code,message=excluded.message,
        attempts=private.contract_series_failures.attempts+1,last_failed_at=clock_timestamp(),resolved_at=null;
    end;
  end loop;
  outcome:=jsonb_build_object('id',series.id,'created',created,'skipped',skipped,'failed',failed,'until',until_day);
  update public.work_order_series set last_generated_at=clock_timestamp(),last_generated_through=until_day,
    last_generation_result=outcome where id=series.id;
  return outcome;
end $$;
revoke all on function private.generate_series_range(uuid,date,date) from public,anon,authenticated,service_role;

create function public.process_contract_planning(batch_size integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare series public.work_order_series;today date;until_day date;processed integer:=0;created integer:=0;failed integer:=0;result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb->>'role','')<>'service_role' or batch_size not between 1 and 100 then
    raise exception 'Service role required.' using errcode='42501';end if;
  for series in select s.* from public.work_order_series s join public.tenants t on t.id=s.tenant_id and t.status='active'
    join public.tenant_settings settings on settings.tenant_id=s.tenant_id and 'planning'=any(settings.enabled_services)
      and settings.contract_planning_automation_enabled
    where s.automation_enabled and s.lifecycle_state='active' and s.active
    order by s.last_generated_at nulls first,s.id for update skip locked limit batch_size loop
    today:=(clock_timestamp() at time zone series.timezone)::date;
    until_day:=today+series.generation_horizon_weeks*7-1;
    result:=private.generate_series_range(series.id,today,until_day);
    processed:=processed+1;created:=created+coalesce((result->>'created')::integer,0);failed:=failed+coalesce((result->>'failed')::integer,0);
  end loop;
  return jsonb_build_object('processed',processed,'created',created,'failed',failed);
end $$;
revoke all on function public.process_contract_planning(integer) from public,anon,authenticated;
grant execute on function public.process_contract_planning(integer) to postgres,service_role;

alter function public.work_order_series_command(uuid,uuid,text,jsonb) rename to work_order_series_command_legacy;
revoke all on function public.work_order_series_command_legacy(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.work_order_series_command_legacy(uuid,uuid,text,jsonb) to postgres;

create function public.work_order_series_command(target_tenant uuid,command_id uuid,command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<series_command>>
declare series public.work_order_series;line public.customer_agreement_lines;result jsonb;receipt private.work_order_related_receipts;
 serial_command text:='series.'||command;reason text:=btrim(coalesce(input->>'reason',''));personnel uuid[]:='{}';horizon integer;
begin
  perform private.management_assert(target_tenant,'backoffice.work_orders.write');
  perform private.management_assert(target_tenant,'backoffice.functions.work_order_series_command');
  if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot terugkerend werk.' using errcode='42501';end if;
  if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie is verplicht.' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
  select * into receipt from private.work_order_related_receipts r where r.tenant_id=target_tenant and r.id=command_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.command<>serial_command or receipt.payload<>input then
      raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer.' using errcode='23514';end if;
    return receipt.result;
  end if;
  if command='tenant_automation' then
    if coalesce((input->>'enabled')::boolean,false)=false and length(reason)<3 then
      raise exception 'Leg vast waarom contractautomatisering wordt uitgezet.' using errcode='23514';end if;
    update public.tenant_settings set contract_planning_automation_enabled=coalesce((input->>'enabled')::boolean,false)
      where tenant_id=target_tenant;
    if not found then raise exception 'Tenantinstellingen ontbreken.' using errcode='P0002';end if;
    result:=jsonb_build_object('enabled',coalesce((input->>'enabled')::boolean,false));
  elsif command in('activate','pause','resume','stop') then
    select * into series from public.work_order_series where tenant_id=target_tenant and id=(input->>'seriesId')::uuid for update;
    if series.id is null then raise exception 'Reeks niet beschikbaar.' using errcode='P0002';end if;
    if series.version is distinct from(input->>'version')::bigint then raise exception 'De reeks is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
    if command='activate' then
      if series.agreement_line_id is null then raise exception 'Koppel eerst een concrete contractregel.' using errcode='23514';end if;
      if not exists(select 1 from public.tenant_settings settings where settings.tenant_id=target_tenant
        and settings.contract_planning_automation_enabled) then
        raise exception 'Schakel contractautomatisering eerst expliciet in voor deze tenant.' using errcode='23514';end if;
      update public.work_order_series set lifecycle_state='active',automation_enabled=true,active=true,lifecycle_reason=null,version=version+1
        where id=series.id returning * into series;
    elsif command='pause' then
      if length(reason)<3 then raise exception 'Leg vast waarom de generatie wordt gepauzeerd.' using errcode='23514';end if;
      update public.work_order_series set lifecycle_state='paused',active=false,lifecycle_reason=reason,version=version+1
        where id=series.id returning * into series;
    elsif command='resume' then
      if not series.automation_enabled or series.lifecycle_state<>'paused' then raise exception 'Alleen een gepauzeerde contractreeks kan worden hervat.' using errcode='23514';end if;
      update public.work_order_series set lifecycle_state='active',active=true,lifecycle_reason=null,version=version+1
        where id=series.id returning * into series;
    else
      if length(reason)<3 then raise exception 'Leg vast waarom de reeks wordt beëindigd.' using errcode='23514';end if;
      update public.work_order_series set lifecycle_state='ended',automation_enabled=false,active=false,lifecycle_reason=reason,version=version+1
        where id=series.id returning * into series;
    end if;
    result:=jsonb_build_object('id',series.id,'version',series.version,'state',series.lifecycle_state);
  elsif command='generate' then
    select * into series from public.work_order_series where tenant_id=target_tenant and id=(input->>'seriesId')::uuid for update;
    if series.id is null then raise exception 'Reeks niet beschikbaar.' using errcode='P0002';end if;
    if series.version is distinct from(input->>'version')::bigint then raise exception 'De reeks is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
    result:=private.generate_series_range(series.id,(clock_timestamp() at time zone series.timezone)::date,
      (clock_timestamp() at time zone series.timezone)::date+series.generation_horizon_weeks*7-1);
  else
    result:=public.work_order_series_command_legacy(target_tenant,command_id,command,input);
    if command in('create','update') and(input?'agreementLineId' or input?'generationHorizonWeeks' or input?'preferredPersonnelIds') then
      select * into series from public.work_order_series where tenant_id=target_tenant and id=(result->>'id')::uuid for update;
      horizon:=coalesce(nullif(input->>'generationHorizonWeeks','')::integer,series.generation_horizon_weeks);
      if horizon not between 1 and 26 then raise exception 'De generatiehorizon ligt tussen 1 en 26 weken.' using errcode='23514';end if;
      if input?'preferredPersonnelIds' then
        if jsonb_typeof(input->'preferredPersonnelIds')<>'array' then raise exception 'Voorkeursmedewerkers zijn ongeldig.' using errcode='23514';end if;
        select coalesce(array_agg(value::uuid),'{}') into personnel from jsonb_array_elements_text(input->'preferredPersonnelIds');
        if exists(select 1 from unnest(personnel) p where not exists(select 1 from public.personnel x where x.tenant_id=target_tenant and x.id=p and x.status='active')) then
          raise exception 'Een voorkeursmedewerker is niet actief.' using errcode='23514';end if;
      else personnel:=series.preferred_personnel_ids;end if;
      if nullif(input->>'agreementLineId','') is not null then
        select l.* into line from public.customer_agreement_lines l join public.work_order_tasks task
          on task.tenant_id=l.tenant_id and task.agreement_line_id=l.id and task.work_order_id=series.source_order_id
          join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id and a.state='active'
          where l.tenant_id=target_tenant and l.id=(input->>'agreementLineId')::uuid;
        if line.id is null then raise exception 'Kies een actieve contractregel uit deze bronwerkbon.' using errcode='23514';end if;
      end if;
      update public.work_order_series set agreement_line_id=coalesce(line.id,agreement_line_id),
        lifecycle_state=case when coalesce(line.id,agreement_line_id) is null then 'manual' else case when lifecycle_state='manual' then 'concept' else lifecycle_state end end,
        generation_horizon_weeks=horizon,preferred_personnel_ids=personnel,version=version+1
        where id=series.id returning * into series;
      result:=result||jsonb_build_object('version',series.version,'state',series.lifecycle_state);
      -- The legacy command already persisted the same request receipt. Keep its
      -- idempotent response aligned with the post-bind lifecycle state.
      update private.work_order_related_receipts set result=series_command.result
        where tenant_id=target_tenant and id=command_id;
      return result;
    end if;
    return result;
  end if;
  insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(target_tenant,auth.uid(),'work_order.'||serial_command,
      case when command='tenant_automation' then 'tenant_settings' else 'work_order_series' end,
      case when command='tenant_automation' then target_tenant else series.id end,result);
  insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result)
    values(target_tenant,command_id,auth.uid(),serial_command,input,result);
  return result;
end $$;
revoke all on function public.work_order_series_command(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.work_order_series_command(uuid,uuid,text,jsonb) to authenticated;

alter function public.work_order_related_context(uuid,uuid) rename to work_order_related_context_legacy;
revoke all on function public.work_order_related_context_legacy(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.work_order_related_context_legacy(uuid,uuid) to postgres;

create function public.work_order_related_context(target_tenant uuid,target_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb;can_finance boolean;
begin
  base:=public.work_order_related_context_legacy(target_tenant,target_order);
  can_finance:=coalesce((base->>'canFinance')::boolean,false);
  return base||jsonb_build_object(
    'tenantAutomationEnabled',coalesce((select settings.contract_planning_automation_enabled
      from public.tenant_settings settings where settings.tenant_id=target_tenant),false),
    'agreementOptions',coalesce((select jsonb_agg(distinct jsonb_build_object('id',l.id,'agreement',a.title||' · v'||a.version,
      'scope',l.scope,'objectId',l.object_id) order by jsonb_build_object('id',l.id,'agreement',a.title||' · v'||a.version,
      'scope',l.scope,'objectId',l.object_id)) from public.work_order_tasks task join public.customer_agreement_lines l
      on l.tenant_id=task.tenant_id and l.id=task.agreement_line_id join public.customer_agreements a
      on a.tenant_id=l.tenant_id and a.id=l.agreement_id where task.tenant_id=target_tenant and task.work_order_id=target_order and a.state='active'),'[]'),
    'personnelOptions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id)
      from public.personnel p where p.tenant_id=target_tenant and p.status='active'),'[]'),
    'materialCatalogue',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'category',m.category,
      'description',m.description,'unit',m.unit,'proposedUnitPriceCents',m.proposed_unit_price_cents,
      'proposedVatBasisPoints',m.proposed_vat_basis_points,'billableDefault',m.billable_default,'version',m.version)
      order by m.category,m.name,m.id) from public.material_catalog m where m.tenant_id=target_tenant and m.active),'[]'),
    'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,
      'taskId',m.task_id,'createdAt',m.created_at,'customerVisible',m.customer_visible,'materialId',m.material_id,'materialSnapshot',m.material_snapshot)
      ||case when can_finance then jsonb_build_object('unitPriceCents',f.unit_price_cents,'costCents',f.cost_cents,
        'pricingState',coalesce(c.state,'unknown'),'commercialVersion',coalesce(c.version,1),'vatBasisPoints',c.vat_basis_points,
        'agreementEvidence',c.agreement_evidence) else '{}'::jsonb end order by m.created_at,m.id)
      from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id
      left join private.work_order_material_commercial c on c.tenant_id=m.tenant_id and c.usage_id=m.id
      where m.tenant_id=target_tenant and m.work_order_id=target_order),'[]'),
    'series',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'version',s.version,'definition',s.definition,
      'lifecycleState',s.lifecycle_state,'automationEnabled',s.automation_enabled,'agreementLineId',s.agreement_line_id,
      'generationHorizonWeeks',s.generation_horizon_weeks,'preferredPersonnelIds',to_jsonb(s.preferred_personnel_ids),
      'lifecycleReason',s.lifecycle_reason,'lastGeneratedAt',s.last_generated_at,'lastGeneratedThrough',s.last_generated_through,
      'lastGenerationResult',s.last_generation_result,'failures',coalesce((select jsonb_agg(jsonb_build_object('day',f.occurrence_on,
        'message',f.message,'attempts',f.attempts,'lastFailedAt',f.last_failed_at) order by f.occurrence_on)
        from private.contract_series_failures f where f.tenant_id=s.tenant_id and f.series_id=s.id and f.resolved_at is null),'[]'),
      'occurrences',coalesce((select jsonb_agg(jsonb_build_object('day',o.occurrence_on,'state',o.state,'reason',o.reason,
        'orderId',w.id,'number',w.work_order_number,'preferredMatches',coalesce(w.details->'preferred_personnel_match','[]'::jsonb)) order by o.occurrence_on) from public.work_order_occurrences o
        left join public.work_orders w on w.tenant_id=o.tenant_id and w.id=o.work_order_id
        where o.tenant_id=s.tenant_id and o.series_id=s.id),'[]')) order by s.created_at,s.id)
      from public.work_order_series s where s.tenant_id=target_tenant and(s.source_order_id=target_order or exists(select 1
        from public.work_order_occurrences o where o.tenant_id=s.tenant_id and o.series_id=s.id and o.work_order_id=target_order))),'[]'));
end $$;
revoke all on function public.work_order_related_context(uuid,uuid) from public,anon,service_role;
grant execute on function public.work_order_related_context(uuid,uuid) to authenticated;

-- The finance list filters the complete server-side source set before paging.
-- Materials use the same typed source projection as invoice finalisation.
create or replace function private.cockpit_invoice_list(t uuid,filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 v jsonb:=coalesce(filters,'{}'::jsonb);v_query text;v_status text;v_stage text;v_sort text;v_page integer;v_size integer;
 v_from date;v_through date;v_object uuid;v_agreement uuid;v_discipline text;v_filtering boolean;
 v_today date;v_sources boolean;result jsonb;
begin
 perform private.cockpit_assert(t,'backoffice.finance.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_invoice_list');
 if not private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]) or not private.service_enabled(t,'finance') or not private.management_table_allowed(t,'invoices',false) then
  raise exception 'Financiële leestoegang vereist.' using errcode='42501';end if;
 if jsonb_typeof(v)<>'object' or v-array['q','status','stage','sort','page','pageSize','from','through','objectId','agreementId','discipline']<>'{}'::jsonb then
  raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(v) e where e.key in('q','status','stage','sort','from','through','objectId','agreementId','discipline') and jsonb_typeof(e.value)<>'string')
 or exists(select 1 from jsonb_each(v) e where e.key in('page','pageSize') and(jsonb_typeof(e.value)<>'number' or e.value::text!~'^[0-9]{1,6}$')) then
  raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 v_query:=coalesce(v->>'q','');v_status:=coalesce(v->>'status','');v_stage:=coalesce(v->>'stage','unpaid');v_sort:=coalesce(v->>'sort','date_desc');
 v_page:=coalesce((v->>'page')::integer,1);v_size:=coalesce((v->>'pageSize')::integer,25);
 if coalesce(v->>'from','')<>'' then v_from:=(v->>'from')::date;end if;
 if coalesce(v->>'through','')<>'' then v_through:=(v->>'through')::date;end if;
 if coalesce(v->>'objectId','')<>'' then v_object:=(v->>'objectId')::uuid;end if;
 if coalesce(v->>'agreementId','')<>'' then v_agreement:=(v->>'agreementId')::uuid;end if;
 v_discipline:=nullif(btrim(coalesce(v->>'discipline','')),'');
 if length(v_query)>200 or length(coalesce(v_discipline,''))>120 or v_status not in('','draft','final','sent','partially_paid','paid','overdue','credited','void','concept')
  or v_stage not in('unpaid','all','concepts','paid') or v_sort not in('date','date_desc','number','customer','amount','amount_desc','status')
  or v_page not between 1 and 100000 or v_size not between 10 and 100 or(v_from is not null and v_through is not null and v_from>v_through) then
  raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 if v_object is not null and not exists(select 1 from public.objects o where o.tenant_id=t and o.id=v_object) then raise exception 'Ongeldige objectselectie.' using errcode='22023';end if;
 if v_agreement is not null and not exists(select 1 from public.customer_agreements a where a.tenant_id=t and a.id=v_agreement) then raise exception 'Ongeldige contractselectie.' using errcode='22023';end if;
 select (statement_timestamp() at time zone tenant.timezone)::date into v_today from public.tenants tenant where tenant.id=t and tenant.status='active';
 v_sources:=private.management_allowed(t,'backoffice.functions.execution_invoice_concepts') and private.commercial_access(t);
 if v_stage='concepts' and not v_sources then raise exception 'Geen actuele conceptbevoegdheid.' using errcode='42501';end if;
 v_filtering:=v_from is not null or v_through is not null or v_object is not null or v_agreement is not null or v_discipline is not null;
 with actual as materialized(
  select 'invoice'::text kind,i.id,i.customer_id,coalesce(i.customer_snapshot->>'name',c.name) customer,
   coalesce(i.invoice_number,'Concept') number,
   coalesce((select line.description from public.invoice_lines line where line.tenant_id=t and line.invoice_id=i.id order by line.created_at,line.id limit 1),'Factuur '||coalesce(i.invoice_number,'in concept')) title,
   coalesce(i.issued_on,(i.created_at at time zone tenant.timezone)::date) issued_on,i.updated_at,i.total_cents,i.paid_cents,i.version,
   i.status::text status,i.pdf_storage_path is not null pdf_available,
   i.finalized_at is not null and i.status in('final','sent','partially_paid','overdue') and i.total_cents>i.paid_cents unpaid,
   i.finalized_at is not null and i.status in('final','sent','partially_paid','overdue') and i.total_cents>i.paid_cents
     and(i.status='overdue' or i.due_on<v_today) overdue
  from public.invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id join public.tenants tenant on tenant.id=i.tenant_id
  where i.tenant_id=t and(not v_filtering or exists(
   select 1 from public.invoice_lines line join public.work_orders w on w.tenant_id=line.tenant_id and w.id=line.work_order_id
   where line.tenant_id=t and line.invoice_id=i.id
    and(v_from is null or(coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date>=v_from)
    and(v_through is null or(coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date<=v_through)
    and(v_object is null or w.object_id=v_object) and(v_discipline is null or w.discipline=v_discipline)
    and(v_agreement is null or exists(select 1 from public.work_order_tasks task join public.customer_agreement_lines agreement_line
      on agreement_line.tenant_id=task.tenant_id and agreement_line.id=task.agreement_line_id
      where task.tenant_id=w.tenant_id and task.work_order_id=w.id and agreement_line.agreement_id=v_agreement))
  ))
 ), source_rows as materialized(
  select s.* from private.execution_invoice_sources_v2(t,null) s join public.work_orders w on w.tenant_id=t and w.id=s.work_order_id
  join public.tenants tenant on tenant.id=t where v_sources
   and(v_from is null or(coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date>=v_from)
   and(v_through is null or(coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date<=v_through)
   and(v_object is null or w.object_id=v_object) and(v_discipline is null or w.discipline=v_discipline)
   and(v_agreement is null or exists(select 1 from public.work_order_tasks task join public.customer_agreement_lines agreement_line
     on agreement_line.tenant_id=task.tenant_id and agreement_line.id=task.agreement_line_id
     where task.tenant_id=w.tenant_id and task.work_order_id=w.id and agreement_line.agreement_id=v_agreement))
 ), concepts as(
  select 'concept'::text kind,s.work_order_id id,s.customer_id,c.name customer,s.work_order_number number,s.title,
   coalesce((coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date,v_today) issued_on,
   s.updated_at,sum(s.subtotal_cents+s.vat_cents)::bigint total_cents,0::bigint paid_cents,s.order_version version,
   'concept'::text status,true pdf_available,false unpaid,false overdue
  from source_rows s join public.customers c on c.tenant_id=t and c.id=s.customer_id join public.work_orders w on w.tenant_id=t and w.id=s.work_order_id
  join public.tenants tenant on tenant.id=t
  group by s.work_order_id,s.customer_id,c.name,s.work_order_number,s.title,s.updated_at,s.order_version,w.actual_start_at,w.projected_start_at,w.planned_start_at,tenant.timezone
 ), all_rows as materialized(select * from actual union all select * from concepts),
 selected as materialized(
  select s.* from all_rows s where(v_stage='all' or(v_stage='unpaid' and s.unpaid)or(v_stage='concepts' and s.kind='concept')or(v_stage='paid' and s.status='paid'))
   and(v_status='' or(v_status='overdue' and s.overdue)or(v_status='sent' and s.unpaid and not s.overdue)or(v_status not in('overdue','sent') and s.status=v_status))
   and(v_query='' or concat_ws(' ',s.number,s.title,s.customer) ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%')
 ), bounds as(select count(*) n,least(v_page,greatest(1,ceil(count(*)::numeric/v_size)::integer)) p from selected),
 paged as(select s.* from selected s order by case when v_sort='date' then s.issued_on end asc,case when v_sort='date_desc' then s.issued_on end desc,
   case when v_sort='amount' then s.total_cents end asc,case when v_sort='amount_desc' then s.total_cents end desc,
   case when v_sort='number' then s.number when v_sort='customer' then s.customer when v_sort='status' then s.status end asc,
   s.updated_at desc,s.kind,s.id limit v_size offset((select p from bounds)-1)*v_size),
 filter_objects as(select distinct o.id,o.object_number,o.name from public.work_orders w join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id
   where w.tenant_id=t and(exists(select 1 from public.invoice_lines l where l.tenant_id=t and l.work_order_id=w.id) or exists(select 1 from source_rows s where s.work_order_id=w.id))),
 filter_agreements as(select distinct a.id,a.title,a.version from public.work_order_tasks task join public.customer_agreement_lines line on line.tenant_id=task.tenant_id and line.id=task.agreement_line_id
   join public.customer_agreements a on a.tenant_id=line.tenant_id and a.id=line.agreement_id where task.tenant_id=t
   and(exists(select 1 from public.invoice_lines l where l.tenant_id=t and l.work_order_id=task.work_order_id) or exists(select 1 from source_rows s where s.work_order_id=task.work_order_id))),
 filter_disciplines as(select distinct w.discipline from public.work_orders w where w.tenant_id=t and nullif(btrim(w.discipline),'') is not null
   and(exists(select 1 from public.invoice_lines l where l.tenant_id=t and l.work_order_id=w.id) or exists(select 1 from source_rows s where s.work_order_id=w.id)))
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'number',p.number,'title',p.title,'customerId',p.customer_id,'customer',p.customer,'date',p.issued_on,'version',p.version,'status',p.status,'totalCents',p.total_cents,'paidCents',p.paid_cents,'outstandingCents',case when p.unpaid then p.total_cents-p.paid_cents else 0 end,'overdue',p.overdue,'pdfAvailable',p.pdf_available,'unpaid',p.unpaid)
  order by case when v_sort='date' then p.issued_on end asc,case when v_sort='date_desc' then p.issued_on end desc,case when v_sort='amount' then p.total_cents end asc,case when v_sort='amount_desc' then p.total_cents end desc,case when v_sort='number' then p.number when v_sort='customer' then p.customer when v_sort='status' then p.status end asc,p.updated_at desc,p.kind,p.id) from paged p),'[]'::jsonb),
  'total',b.n,'page',b.p,'pageSize',v_size,'today',v_today,'canSources',v_sources,
  'counts',jsonb_build_object('unpaid',coalesce((select sum(a.total_cents-a.paid_cents) from actual a where a.unpaid),0),'overdue',coalesce((select sum(a.total_cents-a.paid_cents) from actual a where a.overdue),0),'confirmed',case when v_sources then coalesce((select sum(s.subtotal_cents+s.vat_cents) from source_rows s),0)else null end),
  'filterOptions',jsonb_build_object(
    'objects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',object_number||' · '||name) order by object_number,id) from filter_objects),'[]'),
    'agreements',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',title||' · v'||version) order by title,version,id) from filter_agreements),'[]'),
    'disciplines',coalesce((select jsonb_agg(discipline order by discipline) from filter_disciplines),'[]'))
 ) into result from bounds b;
 return result;
end $$;
revoke all on function private.cockpit_invoice_list(uuid,jsonb) from public,anon,service_role;
grant execute on function private.cockpit_invoice_list(uuid,jsonb) to authenticated,postgres;

-- Customer invoice access already requires access to every source object. The
-- safe DTO can therefore expose a grouped visit reference without leaking
-- personnel, internal notes, prices outside the frozen invoice or storage.
create or replace function public.customer_portal_invoices(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;result jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantfacturen' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if not private.service_enabled(target_tenant,'finance') then return '[]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,
  'description',coalesce((select string_agg(l.description,' · ' order by l.created_at,l.id) from public.invoice_lines l where l.tenant_id=target_tenant and l.invoice_id=i.id),''),
  'objectIds',(select jsonb_agg(ids.object_id order by ids.object_id) from(select distinct w.object_id from public.invoice_lines l
   join public.work_orders w on w.tenant_id=l.tenant_id and w.id=l.work_order_id where l.tenant_id=target_tenant and l.invoice_id=i.id)ids),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('id',sources.id,'number',sources.number,'object',sources.object_name,
    'executionOn',sources.execution_on,'total',sources.total) order by sources.execution_on,sources.number,sources.id),'[]') from(
      select w.id,w.work_order_number number,o.name object_name,
        (coalesce(w.actual_start_at,w.projected_start_at,w.planned_start_at) at time zone tenant.timezone)::date execution_on,
        sum(line.total_cents)::bigint total
      from public.invoice_lines line join public.work_orders w on w.tenant_id=line.tenant_id and w.id=line.work_order_id
      join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id join public.tenants tenant on tenant.id=w.tenant_id
      where line.tenant_id=target_tenant and line.invoice_id=i.id group by w.id,w.work_order_number,o.name,tenant.timezone
    )sources),
  'issuedOn',i.issued_on,'dueOn',i.due_on,'total',i.total_cents,'paid',i.paid_cents,
  'credited',case when i.status='credited' then i.total_cents else 0 end,
  'balance',case when i.status='credited' then 0 else greatest(i.total_cents-i.paid_cents,0) end,
  'status',i.status,'hasPdf',i.pdf_storage_path is not null,
  'paymentInvoiceIds',(select jsonb_agg(own.invoice_id order by own.invoice_id)
   from public.payment_allocations own where own.tenant_id=target_tenant and own.payment_attempt_id=(
    select p.id from public.payment_attempts p join public.payment_allocations al on al.tenant_id=p.tenant_id and al.payment_attempt_id=p.id
    where p.tenant_id=target_tenant and al.invoice_id=i.id and p.status in('open','pending') and p.merchant_profile_id is not null
    and not exists(select 1 from public.payment_allocations other join public.invoices inv on inv.tenant_id=other.tenant_id and inv.id=other.invoice_id
     where other.tenant_id=target_tenant and other.payment_attempt_id=p.id
      and(inv.customer_id<>a.customer_id or not private.customer_invoice_access(target_tenant,inv.id)))
    order by p.created_at,p.id limit 1)),
  'paymentPending',exists(select 1 from public.invoice_group_items gi join public.payment_attempts p on p.tenant_id=gi.tenant_id and p.invoice_group_id=gi.invoice_group_id
   where gi.tenant_id=target_tenant and gi.invoice_id=i.id and p.status in('open','pending')))
  order by i.issued_on desc,i.id),'[]') into result from public.invoices i
 where i.tenant_id=target_tenant and i.customer_id=a.customer_id and private.customer_invoice_access(target_tenant,i.id);
 return result;
end $$;
revoke all on function public.customer_portal_invoices(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_invoices(uuid,uuid) to authenticated;

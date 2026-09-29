-- Per-tenant numbering with a durable counter; existing personnel are not renumbered.
-- Suggestions are read-only, allocation happens atomically in the insert transaction.
SET local check_function_bodies = off;

GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE "private"."personnel_number_counters" (
  "tenant_id"   uuid   NOT NULL,
  "prefix"      text   NOT NULL,
  "next_number" bigint NOT NULL,
  CONSTRAINT "personnel_number_counters_next_number_check" CHECK (((next_number >= 1) AND (next_number <= 1000000000))),
  CONSTRAINT "personnel_number_counters_pkey" PRIMARY KEY (tenant_id, prefix)
);

ALTER TABLE "private"."personnel_number_counters"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tenant_settings"
  ADD COLUMN "personnel_number_prefix" text NOT NULL DEFAULT 'P-'::text;

ALTER TABLE "public"."tenant_settings"
  ADD COLUMN "personnel_number_start" integer NOT NULL DEFAULT 1;

ALTER TABLE "public"."personnel"
  ALTER COLUMN "employee_number" SET DEFAULT ''::text;

CREATE OR REPLACE FUNCTION private.assign_personnel_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  config public.tenant_settings;
  candidate bigint;
  suffix text;
begin
  -- Automatic allocation and manual changes share the same short transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('personnel-number:' || new.tenant_id::text, 0));
  select * into config from public.tenant_settings where tenant_id = new.tenant_id;
  if nullif(btrim(new.employee_number), '') is null then
    if config.tenant_id is null then
      raise exception 'Instellingen voor personeelsnummering ontbreken' using errcode = '23514';
    end if;
    candidate := private.personnel_number_candidate(new.tenant_id, config.personnel_number_prefix, config.personnel_number_start);
    if candidate > 999999999 then
      raise exception 'Deze nummerreeks is vol. Kies een ander voorvoegsel in Instellingen.' using errcode = '22003';
    end if;
    new.employee_number := config.personnel_number_prefix || lpad(candidate::text, greatest(4, length(candidate::text)), '0');
  elsif config.tenant_id is not null and starts_with(new.employee_number, config.personnel_number_prefix) then
    suffix := substr(new.employee_number, length(config.personnel_number_prefix) + 1);
    if suffix ~ '^[0-9]{1,9}$' then candidate := suffix::bigint; end if;
  end if;
  if candidate is not null then
    insert into private.personnel_number_counters as counters (tenant_id, prefix, next_number)
      values (new.tenant_id, config.personnel_number_prefix, candidate + 1)
      on conflict (tenant_id, prefix) do update
        set next_number = greatest(counters.next_number, excluded.next_number);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.personnel_number_candidate (
  target_tenant_id uuid,
  prefix           text,
  start_number     integer
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select greatest(start_number::bigint,
    coalesce((select c.next_number from private.personnel_number_counters c
      where c.tenant_id = target_tenant_id and c.prefix = $2), 1),
    coalesce((select max(case when suffix ~ '^[0-9]{1,9}$' then suffix::bigint end) + 1
      from (select substr(p.employee_number, length($2) + 1) as suffix
        from public.personnel p where p.tenant_id = target_tenant_id
          and starts_with(p.employee_number, $2)) existing), 1));
$function$;

CREATE OR REPLACE FUNCTION public.suggest_personnel_number (
  target_tenant_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  config public.tenant_settings;
  candidate bigint;
begin
  if not private.has_role(target_tenant_id, array['tenant_admin','management','hr']::public.app_role[])
    or not private.service_enabled(target_tenant_id, 'personeel') then
    raise exception 'Onvoldoende rechten voor personeelsnummering' using errcode = '42501';
  end if;
  select * into strict config from public.tenant_settings where tenant_id = target_tenant_id;
  candidate := private.personnel_number_candidate(target_tenant_id, config.personnel_number_prefix, config.personnel_number_start);
  if candidate > 999999999 then
    raise exception 'Deze nummerreeks is vol. Kies een ander voorvoegsel in Instellingen.' using errcode = '22003';
  end if;
  return config.personnel_number_prefix || lpad(candidate::text, greatest(4, length(candidate::text)), '0');
end;
$function$;

REVOKE ALL ON FUNCTION "public"."suggest_personnel_number"(uuid) FROM PUBLIC, "anon", "service_role";

ALTER TABLE "private"."personnel_number_counters"
  ADD CONSTRAINT "personnel_number_counters_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."tenant_settings"
  ADD CONSTRAINT "tenant_settings_personnel_number_prefix_check" CHECK ((personnel_number_prefix ~ '^[A-Za-z0-9_-]{0,20}$'::text));

ALTER TABLE "public"."tenant_settings"
  ADD CONSTRAINT "tenant_settings_personnel_number_start_check" CHECK (((personnel_number_start >= 1) AND (personnel_number_start <= 999999999)));

CREATE TRIGGER personnel_assign_number
  BEFORE INSERT OR UPDATE OF employee_number, tenant_id ON public.personnel
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_personnel_number();

CREATE POLICY "personnel_number_counters_manage" ON "private"."personnel_number_counters"
  FOR ALL
  TO "authenticated"
  USING
    ((( SELECT private.has_role(personnel_number_counters.tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'hr'::public.app_role]) AS has_role) AND
    ( SELECT private.service_enabled(personnel_number_counters.tenant_id, 'personeel'::text) AS service_enabled)))
  WITH
    CHECK
    ((( SELECT private.has_role(personnel_number_counters.tenant_id, ARRAY['tenant_admin'::public.app_role, 'management'::public.app_role, 'hr'::public.app_role]) AS has_role) AND
    ( SELECT private.service_enabled(personnel_number_counters.tenant_id, 'personeel'::text) AS service_enabled)));

REVOKE ALL ON FUNCTION "private"."assign_personnel_number"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assign_personnel_number"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."personnel_number_candidate"(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."personnel_number_candidate"(uuid, text, integer) TO "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."suggest_personnel_number"(uuid) TO "authenticated", "postgres";

GRANT INSERT, SELECT, UPDATE ON TABLE "private"."personnel_number_counters" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."personnel_number_counters" TO "postgres", "service_role";

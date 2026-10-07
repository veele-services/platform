-- Staff onboarding/profile reuse the same verified structured address.
create or replace function private.staff_normalize_address(value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  street text;
  house_number text;
  postal_code text;
  city text;
  country text;
  compact_postcode text;
begin
  if value ? 'address' then return private.customer_input_address(value,value->'address');end if;
  if value ? 'street_name' and value ? 'status' then return private.normalize_changed_address(value,'{}');end if;
  if value is null
    or jsonb_typeof(value) <> 'object'
    or value - array['street','street_name','house_number','postal_code','postalCode','city','country'] <> '{}'::jsonb
  then
    return jsonb_build_object('__invalid', true);
  end if;
  street := regexp_replace(btrim(coalesce(value ->> 'street', value ->> 'street_name', '')), '\s+', ' ', 'g');
  house_number := regexp_replace(btrim(coalesce(value ->> 'house_number', '')), '\s+', ' ', 'g');
  postal_code := regexp_replace(btrim(coalesce(value ->> 'postal_code', value ->> 'postalCode', '')), '\s+', ' ', 'g');
  city := regexp_replace(btrim(coalesce(value ->> 'city', '')), '\s+', ' ', 'g');
  country := regexp_replace(btrim(coalesce(value ->> 'country', '')), '\s+', ' ', 'g');

  if lower(country) in ('nl','nederland','netherlands') then
    compact_postcode := upper(regexp_replace(postal_code, '\s+', '', 'g'));
    if compact_postcode !~ '^[0-9]{4}[A-Z]{2}$' then
      return jsonb_build_object('__invalid', true);
    end if;
    postal_code := substring(compact_postcode from 1 for 4) || ' ' || substring(compact_postcode from 5 for 2);
    country := 'NL';
  end if;

  if length(street) not between 1 and 200
    or length(house_number) > 30
    or length(postal_code) not between 1 and 20
    or length(city) not between 1 and 120
    or length(country) not between 1 and 80
  then
    return jsonb_build_object('__invalid', true);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'street', street,
    'house_number', nullif(house_number, ''),
    'postal_code', postal_code,
    'city', city,
    'country', country
  ));
end;
$$;

create or replace function private.staff_home_address_complete(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not (
    private.staff_normalize_address(
      value - array['street_name','house_letter','house_addition','formatted','latitude','longitude','status','source','source_id','bag_id','located_at']
    ) ? '__invalid'
  );
$$;


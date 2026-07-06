-- Customer contact e-mail belongs to the tenant boundary.
-- Portal access is authorized through customer_users, not by a global customers.contact_email match.

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_contact_email_unique;

DROP INDEX IF EXISTS public.customers_contact_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_contact_email_unique_idx
  ON public.customers (tenant_id, contact_email)
  WHERE contact_email IS NOT NULL;

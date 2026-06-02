# Applied Migrations Log

This file records which migrations have been applied to the Supabase database, with verification output.

---

## 021_customer_crm_schema.sql — Applied 2026-06-02

**Command:** `psql "$DATABASE_URL" -f migrations/021_customer_crm_schema.sql`

**Output:**
```
CREATE TABLE
INSERT 0 5
ALTER TABLE
UPDATE 0
CREATE TABLE
ALTER TABLE
ALTER TABLE
CREATE POLICY
CREATE POLICY
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
```

**Correction applied:** Migration originally seeded `Groothandel` instead of `Intern`. Fixed in the SQL file and corrected in the live database via `UPDATE customer_types SET name='Intern', slug='intern' WHERE slug='groothandel'`.

**Verification — `SELECT * FROM customer_types;` (after correction):**
```
                  id                  |    name     |    slug     | is_active
--------------------------------------+-------------+-------------+-----------
 0b50c998-5927-4656-9a3e-cafac1eb323c | Intern      | intern      | t
 c82286a5-59a5-4974-9b01-41327744e25f | Non-profit  | non-profit  | t
 842ed138-bd36-4116-8a22-023f43d8a5af | Overheid    | overheid    | t
 d9955e4a-6044-46b3-bf7e-67b2cdc2e35a | Particulier | particulier | t
 cd1078a1-5022-4931-a32f-3a33b4a866c1 | Zakelijk    | zakelijk    | t
(5 rows)
```

**Verification — RLS policies:**
```
 schemaname |     tablename     |               policyname               |  cmd
------------+-------------------+----------------------------------------+--------
 public     | customer_contacts | customer_contacts_select_authenticated | SELECT
 public     | customer_types    | customer_types_select_authenticated    | SELECT
(2 rows)
```

**Verification — New columns on `customers`:**
```
        column_name         |     data_type
----------------------------+-------------------
 account_manager_id         | uuid
 chamber_of_commerce_number | character varying
 customer_type_id           | uuid
 legal_entity               | character varying
 mobile                     | character varying
 status                     | character varying
 vat_number                 | character varying
 website                    | character varying
(8 rows)
```

**Status:** ✓ All DDL applied, RLS enabled, correct seed data (Zakelijk, Particulier, Overheid, Non-profit, Intern) present, all new customer columns confirmed.

/** Catalog contracts complement actor/resource tests; they do not prove RPC bodies safe. */
import assert from "node:assert/strict";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("release database catalog denies accidental public exposure", async t => {
  const db = await workOrderTestDatabase();
  try {
    await t.test("all application and storage tables have RLS; exposed application tables force it", async () => {
      const result = await db.query(`select c.oid::regclass::text name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private','storage') and c.relkind in ('r','p')
        and (not c.relrowsecurity or (n.nspname='public' and not c.relforcerowsecurity)) order by 1`);
      assert.deepEqual(result.rows, [], "Unprotected table: add scoped RLS, do not bypass this gate");
    });
    await t.test("anonymous and ordinary actors never inherit a bypass or administrative database role", async () => {
      assert.deepEqual((await db.query(`select rolname from pg_roles where rolname in ('anon','authenticated')
        and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)`)).rows, []);
      assert.deepEqual((await db.query(`select a.rolname actor,p.rolname privileged from pg_roles a cross join pg_roles p
        where a.rolname in ('anon','authenticated') and (p.rolsuper or p.rolbypassrls or p.rolcreaterole)
        and pg_has_role(a.oid,p.oid,'MEMBER')`)).rows, []);
    });
    await t.test("private grants remain the single scoped numbering counter exception", async () => {
      const grants = (await db.query(`select table_name,grantee,privilege_type from information_schema.table_privileges
        where table_schema='private' and grantee in ('anon','authenticated','PUBLIC') order by 1,2,3`)).rows;
      assert.deepEqual(grants, ["INSERT", "SELECT", "UPDATE"].map(privilege_type => ({ table_name: "personnel_number_counters", grantee: "authenticated", privilege_type })));
      const policies = (await db.query("select qual,with_check from pg_policies where schemaname='private' and tablename='personnel_number_counters'")).rows;
      assert.equal(policies.length, 1);
      for (const predicate of [policies[0].qual, policies[0].with_check]) {
        assert.match(predicate, /private\.has_role/);
        assert.match(predicate, /private\.service_enabled/);
      }
    });
    await t.test("application tables and non-trigger functions are unavailable to anonymous callers", async () => {
      assert.deepEqual((await db.query(`select c.oid::regclass::text name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p') and
        (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) order by 1`)).rows, []);
      assert.deepEqual((await db.query(`select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
        and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
        and has_function_privilege('anon',p.oid,'EXECUTE') order by 1`)).rows, []);
    });
    await t.test("definers use an empty search path and directly readable views cannot bypass RLS", async () => {
      assert.deepEqual((await db.query(`select p.oid::regprocedure::text name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false) order by 1`)).rows, []);
      assert.deepEqual((await db.query(`select c.oid::regclass::text name from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private') and c.relkind in ('v','m')
        and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))
        and (c.relkind='m' or not coalesce(c.reloptions @> array['security_invoker=true'],false)) order by 1`)).rows, []);
    });
    await t.test("privileged provider, file, capability and worker RPCs remain service-only", async () => {
      const names = [
        "apply_confirmed_provider_payment", "prepare_provider_payment", "book_appointment_slot", "claim_mail_delivery", "claim_outbox", "claim_personnel_dossier_deliveries",
        "commercial_external_decision", "commercial_mail_claim", "commercial_public_intake", "commercial_quote_mail_claim", "commercial_quote_mail_finish",
        "current_event_recipients", "email_auth_context", "email_auth_hook_receipt", "email_provider_event", "email_transport",
        "expired_work_order_signature_uploads", "file_scan_attest", "file_scan_state", "finalize_work_order_signature",
        "notification_deferred_mail", "notification_delivery_begin", "notification_delivery_claim", "notification_delivery_defer", "notification_delivery_finish",
        "notification_delivery_freeze", "notification_delivery_prepare", "notification_device_logout", "notification_mail_attachment", "notification_mail_snapshot",
        "notification_outbox_prepare", "notification_policy_check", "notification_prepare_dossier", "notification_provider_gate", "notification_push_device",
        "notification_template_resolve", "notification_verification", "object_vault_operation", "process_customer_reminders", "process_object_reminders",
        "process_ticket_deadlines", "provision_platform_tenant", "complete_platform_admin_invitation", "provision_tenant", "route_cache_claim", "route_cache_finish", "route_cache_read",
        "save_tenant_message_template", "store_travel_estimates", "ticket_delivery_begin", "ticket_delivery_claim", "ticket_delivery_defer", "ticket_delivery_finish",
        "ticket_file_cleanup", "ticket_file_cleanup_done", "ticket_file_server_finalize", "ticket_outbox_prepare", "ticket_scan_claim", "ticket_scan_finish",
        "ticket_verification", "travel_context",
      ];
      const rows = (await db.query(`select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1)`, [names])).rows;
      assert.deepEqual([...new Set(rows.map(row => row.proname))].sort(), [...names].sort(), "A critical RPC was removed or renamed: review its replacement");
      for (const row of rows) assert.deepEqual([row.anon, row.authenticated, row.service], [false, false, true], row.proname);
    });
    await t.test("the public commercial entitlement predicate is callable only inside trusted definers", async () => {
      const row = (await db.query(`select
        has_function_privilege('anon','private.public_commercial_enabled(uuid)','EXECUTE') anon,
        has_function_privilege('authenticated','private.public_commercial_enabled(uuid)','EXECUTE') authenticated,
        has_function_privilege('service_role','private.public_commercial_enabled(uuid)','EXECUTE') service`)).rows[0];
      assert.deepEqual(row, { anon: false, authenticated: false, service: false });
    });
    await t.test("private storage and the version-bound scan publication boundary remain enabled", async () => {
      assert.deepEqual((await db.query("select id from storage.buckets where public order by id")).rows, []);
      const policies = (await db.query("select policyname,cmd,permissive from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('scanned_files_read','scanned_files_insert','scanned_files_update','scanned_files_delete') order by cmd")).rows;
      assert.deepEqual(policies.map(({cmd,permissive}) => ({cmd,permissive})), ["DELETE", "INSERT", "SELECT", "UPDATE"].map(cmd => ({cmd,permissive:"RESTRICTIVE"})));
    });
  } finally { await db.end(); }
});

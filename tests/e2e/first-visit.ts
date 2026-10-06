import { test as base } from "@playwright/test";
import pg from "pg";
import { requireLocalDatabaseUrl } from "./local-target";

/** Visual cases exercise a first visit independently of file scheduling and
 * earlier cases. The ordinary account receipt behavior remains under test. */
export const test = base.extend<{ firstVisitReceipts: void }>({
  firstVisitReceipts: [async ({}, runCase) => {
    const db = new pg.Client({ connectionString: requireLocalDatabaseUrl().href });
    await db.connect();
    const users = (await db.query("select id from auth.users where email=any($1::text[])", [["platform-admin@fieldgrid.test", "field-worker@fieldgrid.test"]])).rows.map(row => row.id);
    const original = (await db.query("select user_id,guide_key,dismissed_at from public.account_guide_dismissals where user_id=any($1::uuid[])", [users])).rows;
    try {
      await db.query("delete from public.account_guide_dismissals where user_id=any($1::uuid[])", [users]);
      await runCase();
    } finally {
      try {
        await db.query("delete from public.account_guide_dismissals where user_id=any($1::uuid[])", [users]);
        for (const row of original) await db.query("insert into public.account_guide_dismissals(user_id,guide_key,dismissed_at) values($1,$2,$3)", [row.user_id, row.guide_key, row.dismissed_at]);
      } finally { await db.end(); }
    }
  }, { auto: true }],
});

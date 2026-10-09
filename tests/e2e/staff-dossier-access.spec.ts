import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { authenticateStaff } from "./staff-auth";
import { requireLocalDatabaseUrl } from "./local-target";

// One-use security codes and revealed dossier content must not enter artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });
test("dossier opens inline only after email confirmation and locks on loss of focus", async ({ page, request }) => {
  const db = new Client({ connectionString: requireLocalDatabaseUrl().href });
  await db.connect();
  const order = "e6000000-0000-4000-8000-000000000001", assignment = "e8000000-0000-4000-8000-000000000001";
  const fields = "planned_start_at,planned_end_at,projected_start_at,projected_end_at";
  const originalOrder = (await db.query(`select ${fields} from public.work_orders where id=$1`,[order])).rows[0];
  const originalAssignment = (await db.query(`select ${fields} from public.work_order_assignments where id=$1`,[assignment])).rows[0];
  try {
    // Keep the active assignment on the tenant's current planning day, including
    // the first ten minutes after midnight; the UI correctly defaults to today.
    const activeWindow = (await db.query(`select greatest(now()-interval '10 minutes',date_trunc('day',now() at time zone t.timezone) at time zone t.timezone) starts_at,now()+interval '90 minutes' ends_at from public.work_orders w join public.tenants t on t.id=w.tenant_id where w.id=$1`,[order])).rows[0];
    for(const table of ["work_orders","work_order_assignments"]) await db.query(`update public.${table} set planned_start_at=$2,planned_end_at=$3,projected_start_at=$2,projected_end_at=$3 where id=$1`,[table==="work_orders"?order:assignment,activeWindow.starts_at,activeWindow.ends_at]);
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticateStaff(page,"field-worker@fieldgrid.test");
    await page.getByRole("button",{name:/WB-2030-001/}).click();
    await page.getByRole("button",{name:"Beveiligde objecttoegang",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Beveiligde objecttoegang",exact:true});
    await expect(dialog.getByRole("heading",{name:"Bevestig je dossierinzage"})).toBeVisible();
    await expect(dialog.getByRole("heading",{name:"Voorbereiding & instructies"})).toHaveCount(0);
    await dialog.getByRole("button",{name:"Code per e-mail versturen"}).click();
    await expect(dialog.getByLabel("E-mailcode")).toBeVisible();
    // Opening the email app clears typed digits, while retaining the pending challenge.
    await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
    await expect(dialog.getByLabel("E-mailcode")).toBeVisible();
    let code="";
    await expect.poll(async()=>{
      const mails=await(await request.get("http://127.0.0.1:59329/messages?recipient=field-worker%40fieldgrid.test")).json() as Array<{subject:string;content:Array<{type:string;value:string}>}>;
      code=mails.filter(m=>m.subject.includes("verificatiecode")).at(-1)?.content.find(c=>c.type==="text/plain")?.value.match(/\b\d{6}\b/)?.[0]??"";
      return code.length;
    }).toBe(6);
    await dialog.getByLabel("E-mailcode").fill(code);code="";
    await dialog.getByRole("button",{name:"Dossier openen",exact:true}).click();
    await expect(dialog.getByRole("heading",{name:"Voorbereiding & instructies"})).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/staff");
    await expect(dialog.getByRole("timer").first()).toContainText("Inzage");
    const ttl=(await db.query("select extract(epoch from(expires_at-created_at)) seconds from private.object_access_grants where order_id=$1 and item_id is null order by created_at desc limit 1",[order])).rows[0];
    expect(Number(ttl.seconds)).toBeLessThanOrEqual(300);
    await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
    await expect(dialog.getByRole("heading",{name:"Bevestig je dossierinzage"})).toBeVisible();
    await expect(dialog.getByRole("heading",{name:"Voorbereiding & instructies"})).toHaveCount(0);
  } finally {
    await page.evaluate(()=>document.querySelectorAll<HTMLInputElement>('input[autocomplete="one-time-code"]').forEach(input=>{input.value="";})).catch(()=>{});
    for(const [table,id,original] of [["work_orders",order,originalOrder],["work_order_assignments",assignment,originalAssignment]] as const) await db.query(`update public.${table} set planned_start_at=$2,planned_end_at=$3,projected_start_at=$4,projected_end_at=$5 where id=$1`,[id,original.planned_start_at,original.planned_end_at,original.projected_start_at,original.projected_end_at]);
    await db.end();
  }
});

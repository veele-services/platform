import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI and deployed environments inject variables directly.
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.FIELDGRID_ADMIN_EMAIL;
const password = process.env.FIELDGRID_ADMIN_PASSWORD;
const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const forbiddenProjectRef = process.env.FORBIDDEN_SUPABASE_PROJECT_REF;

if (!url || !serviceKey || !email || !password || !expectedProjectRef || !forbiddenProjectRef) {
  throw new Error("Supabase-, projectref- en platformbeheerconfiguratie zijn vereist");
}
const supabaseUrl = url;
const supabaseServiceKey = serviceKey;
const adminEmail = email;
const adminPassword = password;

const actualProjectRef = new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
if (!actualProjectRef || actualProjectRef !== expectedProjectRef || actualProjectRef === forbiddenProjectRef || expectedProjectRef === forbiddenProjectRef) {
  throw new Error("Platformbeheerbootstrap weigert het geconfigureerde Supabaseproject");
}
if (password.length < 10) throw new Error("FIELDGRID_ADMIN_PASSWORD moet minimaal 10 tekens bevatten");

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let userId: string | undefined;

  for (let page = 1; page <= 100 && !userId; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    userId = data.users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase())?.id;
    if (data.users.length < 100) break;
  }

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error } = await supabase.from("platform_admins").upsert({ user_id: userId });
  if (error) throw error;
  process.stdout.write("Platformbeheerder gereed.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "onbekende fout";
  process.stderr.write(`Platformbeheerbootstrap mislukt: ${message}\n`);
  process.exitCode = 1;
});

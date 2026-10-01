// Loaded ONLY by Playwright's Next.js subprocess, never by normal dev/build/deploy.
const replay=/^\/tmp\/fieldgrid-release-migrations\.[A-Za-z0-9]+$/.test(process.env.FIELDGRID_LOCAL_REPLAY_DIR??"");
const expectedSupabase=replay?"http://127.0.0.1:60321":"http://127.0.0.1:59321";
if (process.env.FIELDGRID_TEST_SENDGRID !== "1" || process.env.DEPLOY_TARGET !== "local" || process.env.SUPABASE_URL !== expectedSupabase) {
  throw new Error("SendGrid test interception requires the local Fieldgrid test environment");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (["api.sendgrid.com", "api.eu.sendgrid.com"].includes(url.hostname)) {
    const headers = new Headers(init?.headers);
    if (headers.get("authorization") !== "Bearer SG.fieldgrid-local-e2e-placeholder") throw new Error("Real SendGrid credentials are not allowed in browser tests");
    return originalFetch(`http://127.0.0.1:59329${url.pathname}`, init);
  }
  return originalFetch(input, init);
};

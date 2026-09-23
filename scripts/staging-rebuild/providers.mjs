import { randomUUID } from 'node:crypto';
import { TENANT_ID, UUID, RebuildError, requireThat } from './contract.mjs';

async function checked(promise, code) {
  let response;
  try { response = await promise; } catch { throw new RebuildError(code); }
  requireThat(response && !response.error, code);
  return response.data;
}
export function stagingFetch(origin, fetcher = fetch) {
  return (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    requireThat(url.origin === origin && url.protocol === 'https:' && !url.username && !url.password,
      'PROVIDER_ORIGIN_ESCAPE');
    return fetcher(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  };
}
export function createProviders(config, keys, createClient, client, fetcher = fetch) {
  const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    global: { fetch: stagingFetch(config.origin, fetcher) } };
  const admin = createClient(config.origin, keys.service, options);
  let inventory;
  let owners;
  async function users() {
    const found = [];
    for (let page=1; page<=21; page++) {
      const data = await checked(admin.auth.admin.listUsers({ page, perPage:1000 }), 'AUTH_INVENTORY_FAILED');
      requireThat(Array.isArray(data?.users), 'AUTH_INVENTORY_INVALID');
      found.push(...data.users.map(user => user.id));
      requireThat(found.length <= 20000 && found.every(id => UUID.test(id)) &&
        new Set(found).size === found.length, 'AUTH_INVENTORY_BOUND');
      if (data.users.length < 1000) return found;
    }
    throw new RebuildError('AUTH_INVENTORY_BOUND');
  }
  async function inspect() {
    const buckets = await checked(admin.storage.listBuckets(), 'STORAGE_INVENTORY_FAILED');
    requireThat(Array.isArray(buckets) && buckets.length <= 256 &&
      buckets.every(item => typeof item.id === 'string' && item.id.length>0 && item.id.length<=256) &&
      new Set(buckets.map(item=>item.id)).size === buckets.length, 'STORAGE_INVENTORY_BOUND');
    const ids = await users();
    const sqlUsers = (await client.query('SELECT id FROM auth.users ORDER BY id')).rows.map(row=>row.id).sort();
    const sqlBuckets = (await client.query('SELECT id FROM storage.buckets ORDER BY id')).rows.map(row=>row.id).sort();
    requireThat(JSON.stringify([...ids].sort()) === JSON.stringify(sqlUsers) &&
      JSON.stringify(buckets.map(item=>item.id).sort()) === JSON.stringify(sqlBuckets), 'PROVIDER_DATABASE_IDENTITY_MISMATCH');
    inventory = { buckets:buckets.map(item=>item.id), users:ids };
  }
  async function clearStorage() {
    requireThat(inventory, 'PROVIDER_PREFLIGHT_REQUIRED');
    for (const bucket of inventory.buckets) {
      await checked(admin.storage.emptyBucket(bucket), 'STORAGE_EMPTY_FAILED');
    }
    // Some provider versions complete emptyBucket asynchronously. Never infer success from HTTP alone.
    for (let attempt=0; attempt<30; attempt++) {
      const count = (await client.query('SELECT count(*)::integer AS count FROM storage.objects')).rows[0]?.count;
      if (count === 0) return;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new RebuildError('STORAGE_OBJECTS_REMAIN');
  }
  async function clearAuth() {
    requireThat(inventory, 'PROVIDER_PREFLIGHT_REQUIRED');
    // Inventory is fixed before any mutation. A concurrent signup cannot silently enter the deletion set.
    const current = await users();
    requireThat(JSON.stringify(current.sort()) === JSON.stringify([...inventory.users].sort()), 'AUTH_INVENTORY_DRIFT');
    for (const id of inventory.users) await checked(admin.auth.admin.deleteUser(id,false), 'AUTH_DELETE_FAILED');
    requireThat((await users()).length === 0 &&
      (await client.query('SELECT count(*)::integer AS count FROM auth.users')).rows[0]?.count === 0, 'AUTH_USERS_REMAIN');
  }
  async function createOwners() {
    owners = {};
    for (const user of config.users) {
      const data = await checked(admin.auth.admin.createUser({ email:user.email, password:user.password,
        email_confirm:true, app_metadata: { force_password_change:true,
          portal:user.surface==='platform'?'platform-admin':'backoffice',
          ...(user.surface==='platform'?{platform_role:'owner'}:{}) },
        user_metadata:{full_name:user.surface==='platform'?'Staging platformbeheer':'Staging tenantbeheer'} }),
      'OWNER_CREATE_FAILED');
      requireThat(UUID.test(data?.user?.id ?? '') && data.user.email?.toLowerCase()===user.email, 'OWNER_CREATE_INVALID');
      owners[user.surface] = data.user.id;
    }
    requireThat(owners.platform !== owners.tenant, 'OWNER_IDENTITY_COLLISION');
    return owners;
  }
  async function verifyOwners() {
    requireThat(owners, 'OWNERS_NOT_CREATED');
    for (const user of config.users) {
      const sessionClient = createClient(config.origin,keys.anon,options);
      try {
        const signedIn = await checked(sessionClient.auth.signInWithPassword({ email:user.email,password:user.password }), 'OWNER_LOGIN_FAILED');
        requireThat(signedIn?.user?.id === owners[user.surface] && signedIn.session?.access_token, 'OWNER_LOGIN_IDENTITY');
        const verified = await checked(sessionClient.auth.getUser(), 'OWNER_SESSION_FAILED');
        requireThat(verified?.user?.id===owners[user.surface], 'OWNER_SESSION_IDENTITY');
        if (user.surface==='platform') {
          const rows = await checked(sessionClient.from('platform_users').select('role,status').eq('user_id',owners.platform), 'PLATFORM_ACCESS_FAILED');
          requireThat(rows?.length===1 && rows[0].role==='owner' && rows[0].status==='active', 'PLATFORM_ACCESS_INVALID');
        } else {
          const rows = await checked(sessionClient.from('tenant_users').select('tenant_id,status').eq('user_id',owners.tenant), 'TENANT_ACCESS_FAILED');
          requireThat(rows?.length===1 && rows[0].tenant_id===TENANT_ID && rows[0].status==='active', 'TENANT_ACCESS_INVALID');
        }
      } finally {
        await checked(sessionClient.auth.signOut({scope:'local'}), 'OWNER_SMOKE_LOGOUT_FAILED');
      }
    }
  }
  async function verifyStorage() {
    const bucket = `rebuild-probe-${randomUUID()}`;
    const contents = new Uint8Array(Buffer.from('Fieldgrid disposable staging storage probe\n'));
    let creationAttempted = false;
    try {
      creationAttempted = true;
      await checked(admin.storage.createBucket(bucket,{public:false,fileSizeLimit:1024,allowedMimeTypes:['text/plain']}), 'STORAGE_PROBE_CREATE_FAILED');
      await checked(admin.storage.from(bucket).upload('probe.txt',contents,{contentType:'text/plain',upsert:false}), 'STORAGE_PROBE_UPLOAD_FAILED');
      const blob = await checked(admin.storage.from(bucket).download('probe.txt'), 'STORAGE_PROBE_DOWNLOAD_FAILED');
      requireThat(Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(contents)), 'STORAGE_PROBE_BYTES_INVALID');
      await checked(admin.storage.from(bucket).remove(['probe.txt']), 'STORAGE_PROBE_DELETE_FAILED');
    } finally {
      if (creationAttempted) {
        // Only this newly generated probe bucket is touched; no broad cleanup or SQL metadata deletes.
        const listed = await checked(admin.storage.listBuckets(), 'STORAGE_PROBE_CLEANUP_FAILED');
        if (listed.some(item=>item.id===bucket)) {
          await checked(admin.storage.emptyBucket(bucket), 'STORAGE_PROBE_CLEANUP_FAILED');
          await checked(admin.storage.deleteBucket(bucket), 'STORAGE_PROBE_CLEANUP_FAILED');
        }
      }
    }
    requireThat((await client.query('SELECT count(*)::integer AS count FROM storage.objects')).rows[0]?.count===0, 'STORAGE_PROBE_RESIDUE');
  }
  return { inspect, clearStorage, clearAuth, createOwners, verifyOwners, verifyStorage };
}

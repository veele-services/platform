/** Local acceptance harness. Real PostgREST/Postgres, explicit Auth + file-storage fixture adapters.
 * Requires the task-owned PG17 snapshot at 127.0.0.1:59423 and fieldgrid_blog_isolated.
 * No remote network, existing env files, or production/staging credentials are used.
 */
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { assertBlogTestDatabase, blogTestDatabaseConfig, configureBlogTestAuthenticator } from './blog-test-database.mjs';

async function main() {
const db=new pg.Pool({...blogTestDatabaseConfig(),max:4});
await assertBlogTestDatabase(db);
const directory='/tmp/fieldgrid-blog-runtime';await mkdir(directory,{recursive:true,mode:0o700});
const secret=randomBytes(48).toString('hex');
const sign=claims=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'supabase-local-fixture',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400,...claims})).toString('base64url');return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;};
const anon=sign({role:'anon'}),service=sign({role:'service_role'}),admin=randomUUID(),session=randomUUID(),token=randomBytes(40).toString('base64url');
const adminJwt=sign({role:'authenticated',sub:admin,session_id:session,email:`blog-editor-${admin}@fieldgrid.invalid`,aud:'authenticated',aal:'aal1'});
const user={id:admin,aud:'authenticated',role:'authenticated',email:`blog-editor-${admin}@fieldgrid.invalid`,email_confirmed_at:new Date().toISOString(),confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Fieldgrid testredacteur'},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),is_anonymous:false};
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[admin,user.email]);
await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,admin]);
await db.query('insert into public.platform_admins(user_id) values($1)',[admin]);
await db.query("insert into private.fieldgrid_blog_credentials(site_id,environment,label,token_hash,scopes,expires_at) values('fieldgrid','development','Local acceptance fixture',$1,array['read','media:write','draft:write','publish'],now()+interval '1 day')",[createHash('sha256').update(token).digest('hex')]);
// Schema-only restore omitted ACLs. Reconstitute only the existing protected editor reads.
execFileSync('docker',['exec','fieldgrid-blog-isolated-db','psql','-U','supabase_admin','-d','fieldgrid_blog_isolated','-v','ON_ERROR_STOP=1','-c','grant select on public.platform_admins,public.tenant_memberships to authenticated'],{stdio:'ignore'});
const databaseHost=execFileSync('docker',['inspect','fieldgrid-blog-isolated-db','--format','{{(index .NetworkSettings.Networks "bridge").IPAddress}}'],{encoding:'utf8'}).trim();
if(!/^172\.[0-9.]+$/.test(databaseHost))throw Error('Invalid local Docker database address');
const postgrestDatabaseUrl=await configureBlogTestAuthenticator(db,databaseHost);
const restEnv=`PGRST_DB_URI=${postgrestDatabaseUrl}\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${secret}\n`;
await writeFile(`${directory}/postgrest.env`,restEnv,{mode:0o600});
try{execFileSync('docker',['rm','-f','fieldgrid-blog-test-rest'],{stdio:'ignore'});}catch{/* First run. */}
execFileSync('docker',['run','-d','--name','fieldgrid-blog-test-rest','--publish','127.0.0.1:59422:3000','--env-file',`${directory}/postgrest.env`,'public.ecr.aws/supabase/postgrest:v16.2'],{stdio:'ignore'});
const fixtureSession={access_token:adminJwt,refresh_token:randomBytes(32).toString('hex'),token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user};
const env={APP_ENV:'development',DEPLOY_TARGET:'local',APP_URL:'http://127.0.0.1:3301',HOSTNAME:'127.0.0.1',PORT:'3301',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:59421',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_URL:'http://127.0.0.1:59421',SUPABASE_SERVICE_ROLE_KEY:service,FIELDGRID_BLOG_LOCAL_ORIGIN:'http://www.localhost:3301'};
await writeFile(`${directory}/env.json`,JSON.stringify(env),{mode:0o600});
await writeFile(`${directory}/fixture.json`,JSON.stringify({siteToken:token,admin,session,sessionData:fixtureSession,publicOrigin:'http://www.localhost:3301',platformOrigin:'http://127.0.0.1:3301'}),{mode:0o600});
const storage=new Map();
function claims(request){try{const value=(request.headers.authorization??'').replace(/^Bearer /,'');const [h,p,s]=value.split('.');const expected=createHmac('sha256',secret).update(`${h}.${p}`).digest();const actual=Buffer.from(s,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;const c=JSON.parse(Buffer.from(p,'base64url'));return c.exp>Date.now()/1000?c:null;}catch{return null;}}
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const body=async request=>{const chunks=[];let bytes=0;for await(const c of request){bytes+=c.length;if(bytes>11_000_000)throw Error('Payload limit');chunks.push(c);}return Buffer.concat(chunks);};
const server=createServer(async(request,response)=>{try{
 const url=new URL(request.url,'http://127.0.0.1:59421');const claim=claims(request);
 if(url.pathname==='/health')return json(response,200,{adapter:'local-auth-storage-fixture',database:'isolated-real-postgres',rest:'real-postgrest'});
 if(url.pathname.startsWith('/rest/v1/')){
  const upstream=await fetch(`http://127.0.0.1:59422${url.pathname.slice('/rest/v1'.length)}${url.search}`,{method:request.method,headers:{...request.headers,host:'127.0.0.1:59422'},body:['GET','HEAD'].includes(request.method)?undefined:await body(request)});
  response.writeHead(upstream.status,Object.fromEntries(upstream.headers));response.end(Buffer.from(await upstream.arrayBuffer()));return;
 }
 if(url.pathname==='/auth/v1/user'){
  if(claim?.sub!==admin)return json(response,401,{message:'Invalid local fixture session'});
  // User identity fixture only: the product RPC independently verifies the real Auth session.
  return json(response,200,user);
 }
 if(url.pathname==='/auth/v1/token'&&claim?.sub===admin)return json(response,200,fixtureSession);
 if(url.pathname.startsWith('/storage/v1/object/fieldgrid-blog-media/')){
  if(claim?.role!=='service_role')return json(response,403,{statusCode:'403',error:'Permission denied'});
  const key=url.pathname.slice('/storage/v1/object/fieldgrid-blog-media/'.length);
  if(!/^fieldgrid\/development\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key))return json(response,400,{error:'Invalid path'});
  if(request.method==='POST'){
   const bytes=await body(request);if(storage.has(key))return json(response,409,{statusCode:'409',error:'Duplicate'});
   storage.set(key,{bytes,type:request.headers['content-type']??'application/octet-stream'});return json(response,200,{Key:`fieldgrid-blog-media/${key}`,Id:randomUUID()});
  }
  if(request.method==='GET'){
   const item=storage.get(key);if(!item)return json(response,404,{error:'Not found'});response.writeHead(200,{'content-type':item.type,'cache-control':'no-store'});return response.end(item.bytes);
  }
 }
 return json(response,404,{error:'Unsupported local fixture endpoint'});
 }catch{return json(response,500,{error:'Local acceptance fixture failed'});}
});
server.listen(59421,'127.0.0.1',()=>console.log('Local acceptance gateway ready at http://127.0.0.1:59421; secrets in chmod600 /tmp/fieldgrid-blog-runtime files.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();db.end().then(()=>process.exit(0));});

}
main().catch(() => { console.error('Lokale blogruntime geweigerd of mislukt. Controleer FIELDGRID_BLOG_TEST_DATABASE_URL en de taakcontainer; verbindingsgegevens worden niet gelogd.'); process.exit(1); });

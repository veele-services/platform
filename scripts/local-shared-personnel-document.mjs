import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {localWorkOrderTestConfig} from './work-order-test-target.mjs';
const local=localWorkOrderTestConfig();if(local.API_URL!=='http://127.0.0.1:60321')throw Error('Local document fixture target refused');
const scanner=process.env.FIELDGRID_LOCAL_SCANNER_SOCKET;
if(!/^\/tmp\/fieldgrid-sites-v3-scanner\.[A-Za-z0-9]+\/socket\/clamd\.sock$/.test(scanner??'')||!statSync(scanner).isSocket())throw Error('An explicit owned local scanner socket is required');
const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',NODE_OPTIONS:'--conditions=react-server',__NEXT_PROCESSED_ENV:'true',APP_ENV:'development',NODE_ENV:'test',DEPLOY_TARGET:'local',APP_URL:'http://127.0.0.1:3000',NEXT_PUBLIC_SUPABASE_URL:local.API_URL,SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,DATABASE_URL:local.DB_URL,ADMIN_API_SECRET:'fieldgrid-sites-local-fixture-worker-only-2026',ROUTING_PROVIDER:'disabled',CLAMAV_ENABLED:'true',CLAMAV_SOCKET:scanner};
const child=spawn('pnpm',['exec','tsx','scripts/fixtures/local-shared-personnel-document.ts',process.argv[2]],{env,stdio:['ignore','inherit','inherit']});child.on('exit',code=>process.exitCode=code??1);

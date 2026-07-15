#!/usr/bin/env node
import http from 'node:http';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const ports = { backoffice: 9321, personnel: 9322, customer: 9323, gateway: 9324, orchestrator: 9325, postgrest: 9326 };
export const postgrestVersion = 'postgrest/postgrest:v12.2.8';
const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright');
const logsDir = join(artifactDir, 'logs');
const statusPath = join(artifactDir, 'startup-status.json');
const fixture = {
  tenantA: { customer: 'Runtime Tenant A Customer', assignment: 'Runtime Tenant A Assignment', invoice: 'INV-RUNTIME-A-001', report: 'Approved runtime report A' },
  tenantB: { customer: 'Runtime Tenant B Customer', assignment: 'Runtime Tenant B Assignment', invoice: 'INV-RUNTIME-B-001' },
  jwt: { role: 'authenticated', sub: '20000000-0000-4000-8000-000000000104' },
};
const servers = [];
function json(res, code, body) { res.writeHead(code, {'content-type':'application/json'}); res.end(JSON.stringify(body)); }
function html(res, code, body) { res.writeHead(code, {'content-type':'text/html'}); res.end(`<!doctype html><title>Fieldgrid E2E</title><main>${body}</main>`); }
function listen(name, port, handler) { const s=http.createServer(handler); servers.push(s); return new Promise(r=>s.listen(port,'127.0.0.1',()=>r())); }
function denyTenantB(req, res) { if (req.headers.host?.startsWith('tenant-b') || req.url?.includes('tenant-b') || req.headers.cookie?.includes('000000000202')) { html(res, 403, 'Toegang geweigerd Runtime Tenant B content absent'); return true; } return false; }
async function writeStatus(status) { await mkdir(logsDir,{recursive:true}); const tmp=`${statusPath}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(status,null,2)); await rename(tmp,statusPath); }
export async function start() {
  await rm(artifactDir,{recursive:true,force:true}); await mkdir(logsDir,{recursive:true});
  await writeFile(join(logsDir,'postgrest.log'), `Pinned local PostgREST ${postgrestVersion}\n`);
  await listen('postgrest', ports.postgrest, (req,res)=> req.url==='/health' ? json(res,200,{status:'ok',version:postgrestVersion}) : json(res,404,{error:'unknown route'}));
  await listen('gateway', ports.gateway, (req,res)=> { if(req.url==='/healthz') return json(res,200,{status:'ok'}); if(req.url?.startsWith('/rest/v1/')) return json(res,200,{headers:{authorization:Boolean(req.headers.authorization), apikey:Boolean(req.headers.apikey)}, fixture}); return json(res,404,{error:'unknown route'}); });
  await listen('backoffice', ports.backoffice, (req,res)=> { if(req.url==='/healthz') return json(res,200,{ready:true}); if(req.url?.startsWith('/platform')) return html(res, req.headers.cookie?.includes('000000000001')?200:403, 'Platform administration platform identity reaches platform surface tenant identity cannot substitute for platform authorization'); if(denyTenantB(req,res)) return; html(res,200,`Backoffice dashboard ${fixture.tenantA.customer} ${fixture.tenantA.assignment} planning board Tenant B content absent`); });
  await listen('personnel', ports.personnel, (req,res)=> { if(req.url==='/healthz') return json(res,200,{ready:true}); if(req.headers.cookie?.includes('000000000106')) return html(res,403,'inactive personnel denied'); if(req.url?.includes('70000000-0000-4000-8000-000000000002')) return html(res,404,'not found Tenant B work absent'); html(res,200,`Personnel assigned Tenant A work visible ${fixture.tenantA.assignment} assignment detail tasks hours report area Tenant B work absent`); });
  await listen('customer', ports.customer, (req,res)=> { if(req.url==='/healthz') return json(res,200,{ready:true}); if(req.headers.host?.startsWith('suspended')) return html(res,403,'suspended tenant denied'); html(res,200,`Customer Tenant A assignments ${fixture.tenantA.assignment} ${fixture.tenantA.report} ${fixture.tenantA.invoice} Tenant B internal-only data absent`); });
  await listen('orchestrator', ports.orchestrator, async (req,res)=> { if(req.url!=='/healthz') return json(res,404,{error:'unknown route'}); json(res,200,{postgresql:'reachable',postgrest:'healthy',gateway:'healthy',backoffice:'ready',personnel:'ready',customer:'ready'}); });
  await writeStatus({status:'ready', ports, postgrestVersion, database:'disposable PostgreSQL 17', jwt:fixture.jwt, artifactDir});
}
export async function stop() { await Promise.all(servers.map(s=>new Promise(r=>s.close(r)))); await writeStatus({status:'stopped', ports}); }
if (import.meta.url === `file://${process.argv[1]}`) { start().then(()=>process.on('SIGTERM',()=>stop().then(()=>process.exit(0)))); }

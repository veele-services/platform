import { inflateRawSync } from 'node:zlib';
import { REPOSITORY,WORKFLOW,CONTRACT,PROJECT,requireThat,fail,sha,textHash } from './contract.mjs';

const LIMIT=4*1024*1024;
export async function boundedBytes(response,limit=LIMIT) {
  requireThat(response.ok&&Number(response.headers.get('content-length')??0)<=limit,'EVIDENCE_RESPONSE');
  const chunks=[];let size=0;
  for await(const value of response.body) {size+=value.length;if(size>limit){await response.body.cancel?.().catch(()=>{});fail('EVIDENCE_LIMIT');}chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks);
}
export function readReportZip(bytes) {
  requireThat(Buffer.isBuffer(bytes)&&bytes.length>=22&&bytes.length<=LIMIT,'ZIP_SIZE');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  requireThat(end>=0&&bytes.readUInt16LE(end+4)===0&&bytes.readUInt16LE(end+6)===0,'ZIP_FORMAT');
  const entries=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),size=bytes.readUInt32LE(end+12);
  requireThat(entries===1&&bytes.readUInt16LE(end+8)===1&&start+size<=end,'ZIP_ENTRIES');
  requireThat(start+46<=bytes.length&&bytes.readUInt32LE(start)===0x02014b50,'ZIP_DIRECTORY');
  const flags=bytes.readUInt16LE(start+8),method=bytes.readUInt16LE(start+10),compressed=bytes.readUInt32LE(start+20),uncompressed=bytes.readUInt32LE(start+24);
  const nameLength=bytes.readUInt16LE(start+28),extraLength=bytes.readUInt16LE(start+30),commentLength=bytes.readUInt16LE(start+32),offset=bytes.readUInt32LE(start+42);
  requireThat((flags&1)===0&&[0,8].includes(method)&&uncompressed<=1024*1024&&compressed<=LIMIT,'ZIP_ENCODING');
  requireThat(start+46+nameLength+extraLength+commentLength===start+size,'ZIP_DIRECTORY_SIZE');
  requireThat(bytes.subarray(start+46,start+46+nameLength).toString('utf8')==='result.json','ZIP_PATH');
  const external=bytes.readUInt32LE(start+38)>>>16;
  requireThat((external&0xf000)!==0xa000,'ZIP_SYMLINK');
  requireThat(offset+30<=start&&bytes.readUInt32LE(offset)===0x04034b50,'ZIP_LOCAL');
  const localName=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),payload=offset+30+localName+localExtra;
  requireThat(bytes.subarray(offset+30,offset+30+localName).toString('utf8')==='result.json'&&payload+compressed<=start,'ZIP_LOCAL_BOUNDS');
  const input=bytes.subarray(payload,payload+compressed);
  const output=method===0?input:inflateRawSync(input,{maxOutputLength:1024*1024});
  requireThat(output.length===uncompressed,'ZIP_OUTPUT');
  try{return JSON.parse(output.toString('utf8'));}catch{fail('EVIDENCE_JSON');}
}
export function assertRun(run,{workflow=WORKFLOW,expectedSha,id,now=Date.now()}={}) {
  const completed=Date.parse(run?.updated_at);
  requireThat(run?.id===Number(id)&&run.repository?.full_name===REPOSITORY&&run.head_repository?.full_name===REPOSITORY,'EVIDENCE_REPOSITORY');
  requireThat(run.path===workflow&&run.head_branch==='main'&&run.head_sha===expectedSha&&run.event==='workflow_dispatch','EVIDENCE_SUBJECT');
  requireThat(run.status==='completed'&&run.conclusion==='success'&&Number.isFinite(completed)&&completed<=now&&now-completed<=3600000,'EVIDENCE_FRESHNESS');
  requireThat(Number.isSafeInteger(run.run_attempt)&&run.run_attempt>0,'EVIDENCE_ATTEMPT');
}
export function assertDiagnoseReport(report,{run,expectedSha,now=Date.now()}={}) {
  requireThat(report?.contract===CONTRACT&&report.project===PROJECT&&report.environment==='staging'&&report.mode==='diagnose','REPORT_CONTRACT');
  requireThat(report.sha===expectedSha&&report.runId===run.id&&report.attempt===run.run_attempt,'REPORT_RUN_BINDING');
  requireThat(report.readyForReset===true&&Array.isArray(report.blockers)&&report.blockers.length===0,'REPORT_NOT_READY');
  const at=Date.parse(report.generatedAt);
  requireThat(Number.isFinite(at)&&at<=now&&now-at<=3600000,'REPORT_STALE');
  for(const field of ['inventoryDigest','catalogDigest','journalDigest','providerDigest','contextDigest','backupDigest']) requireThat(/^[a-f0-9]{64}$/.test(report[field]??''),'REPORT_DIGEST');
  requireThat(report.backupRestoreVerified===true&&report.resetRehearsalVerified===true,'REPORT_BACKUP_NOT_VERIFIED');
}
export function githubEvidence(token,{request=fetch}={}) {
  requireThat(typeof token==='string'&&token.length>0,'GITHUB_TOKEN_REQUIRED');
  async function api(path) {
    requireThat(path.startsWith(`/repos/${REPOSITORY}/`),'GITHUB_PATH');
    let response;
    try {response=await request(`https://api.github.com${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)});}
    catch {fail('GITHUB_UNAVAILABLE');}
    const bytes=await boundedBytes(response);
    try{return JSON.parse(bytes.toString('utf8'));}catch{fail('GITHUB_JSON');}
  }
  async function assertMain(expectedSha) {
    requireThat(sha(expectedSha),'SHA_INVALID');
    const ref=await api(`/repos/${REPOSITORY}/git/ref/heads/main`);
    requireThat(ref.object?.sha===expectedSha,'MAIN_MOVED');
  }
  async function assertValidation(expectedSha) {
    const result=await api(`/repos/${REPOSITORY}/actions/workflows/main-exact-head-validation.yml/runs?branch=main&head_sha=${expectedSha}&per_page=100`);
    requireThat(Array.isArray(result.workflow_runs)&&result.total_count<=100,'VALIDATION_RESPONSE');
    const runs=result.workflow_runs.filter(r=>r.head_sha===expectedSha&&r.head_branch==='main'&&r.path==='.github/workflows/main-exact-head-validation.yml'&&r.name==='Main Exact Head Validation'&&['push','workflow_dispatch'].includes(r.event)&&r.head_repository?.full_name===REPOSITORY).sort((a,b)=>b.id-a.id);
    requireThat(runs.length>0&&runs[0].status==='completed'&&runs[0].conclusion==='success','MAIN_CI_NOT_GREEN');
  }
  async function readDiagnose(id,expectedSha) {
    requireThat(/^[1-9][0-9]{0,19}$/.test(String(id))&&Number.isSafeInteger(Number(id)),'RUN_ID');
    const run=await api(`/repos/${REPOSITORY}/actions/runs/${id}`);assertRun(run,{id,expectedSha});
    const result=await api(`/repos/${REPOSITORY}/actions/runs/${id}/artifacts?per_page=100`);
    requireThat(Array.isArray(result.artifacts)&&result.total_count<=100,'ARTIFACT_LIST');
    const found=result.artifacts.filter(a=>a.name===`wp1-diagnose-${id}-${run.run_attempt}`);
    requireThat(found.length===1&&!found[0].expired&&found[0].size_in_bytes<=LIMIT&&/^sha256:[a-f0-9]{64}$/.test(found[0].digest??''),'ARTIFACT_IDENTITY');
    const artifact=found[0];
    const response=await request(`https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`,{headers:{Authorization:`Bearer ${token}`},redirect:'manual',signal:AbortSignal.timeout(15000)}).catch(()=>fail('ARTIFACT_DOWNLOAD'));
    let zipResponse=response;
    if([301,302,303,307,308].includes(response.status)) {
      const u=new URL(response.headers.get('location')??'');
      requireThat(u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname.endsWith('.blob.core.windows.net')||u.hostname.endsWith('.actions.githubusercontent.com')||u.hostname.endsWith('.githubusercontent.com')),'ARTIFACT_REDIRECT');
      // Never forward the GitHub credential to the signed blob URL.
      zipResponse=await request(u,{redirect:'error',signal:AbortSignal.timeout(15000)}).catch(()=>fail('ARTIFACT_DOWNLOAD'));
    }
    const bytes=await boundedBytes(zipResponse);
    requireThat(`sha256:${textHash(bytes)}`===artifact.digest,'ARTIFACT_DIGEST');
    const report=readReportZip(bytes);assertDiagnoseReport(report,{run,expectedSha});
    return report;
  }
  return {assertMain,assertValidation,readDiagnose};
}

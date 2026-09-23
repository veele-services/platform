import { REPOSITORY, VALIDATION_WORKFLOW, RebuildError, requireThat } from './contract.mjs';
const REQUIRED = ['.github/workflows/main-exact-head-validation.yml',VALIDATION_WORKFLOW];
export function classifyValidation(runs, sha) {
  let pending = false;
  for (const path of REQUIRED) {
    const candidates = runs.filter(run => run.path===path && run.event==='push' &&
      run.head_sha===sha && run.head_branch==='main').sort((a,b)=>b.run_number-a.run_number);
    const run = candidates[0];
    if (!run || run.status!=='completed') { pending=true; continue; }
    requireThat(run.conclusion==='success', 'EXACT_MAIN_VALIDATION_FAILED');
  }
  return !pending;
}
export async function waitForValidation(sha, token, { fetcher=fetch, sleep=ms=>new Promise(r=>setTimeout(r,ms)),
  now=()=>Date.now(), timeout=20*60*1000 }={}) {
  const deadline=now()+timeout;
  async function github(path) {
    const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
      redirect:'error',signal:AbortSignal.timeout(20000),
    });
    requireThat(response.ok,'CI_EVIDENCE_UNAVAILABLE');
    return response.json();
  }
  do {
    requireThat((await github('git/ref/heads/main')).object?.sha===sha,'MAIN_MOVED');
    const payload=await github(`actions/runs?head_sha=${sha}&event=push&per_page=100`);
    requireThat(Array.isArray(payload.workflow_runs) && payload.total_count<=100,'CI_EVIDENCE_INVALID');
    if(classifyValidation(payload.workflow_runs,sha)) return;
    if(now()>=deadline) throw new RebuildError('EXACT_MAIN_CI_STILL_PENDING');
    await sleep(20000);
  } while(now()<=deadline);
  throw new RebuildError('EXACT_MAIN_CI_STILL_PENDING');
}

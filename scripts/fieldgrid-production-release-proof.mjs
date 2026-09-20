#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = 'veele-services/platform';
const shaPattern = /^[a-f0-9]{40}$/u;

export function assertProductionDispatch(env) {
  if (env.GITHUB_REPOSITORY !== repo || env.GITHUB_REF !== 'refs/heads/main'
      || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || env.APP_ENV !== 'production' || env.TARGET_ENVIRONMENT !== 'production'
      || env.DEPLOY_CONFIRMATION !== 'fieldgrid-production-deploy-exact-sha'
      || !shaPattern.test(env.EXPECTED_MAIN_SHA ?? '') || env.GITHUB_SHA !== env.EXPECTED_MAIN_SHA
      || !/^[1-9][0-9]{0,19}$/u.test(env.STAGING_DEPLOY_RUN_ID ?? '')) {
    throw new Error('Production dispatch is not bound to the approved source and staging run.');
  }
}

export function assertSuccessfulStagingDeployment(run, jobs, expectedSha, now = Date.now()) {
  const updated = Date.parse(run?.updated_at);
  if (run?.repository?.full_name !== repo || run.path !== '.github/workflows/deploy.yml'
      || run.head_branch !== 'staging' || run.head_sha !== expectedSha
      || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
      || !Number.isFinite(updated) || updated > now + 60000 || now - updated > 86400000) {
    throw new Error('A fresh successful staging deployment of this exact source is required.');
  }
  const deploy = jobs?.jobs?.filter(job => job.name === 'deploy') ?? [];
  if (deploy.length !== 1 || deploy[0].conclusion !== 'success'
      || ['Activate staging release', 'Run staging deploy health gate', 'Upload staging deploy diagnostics'].some(name =>
        deploy[0].steps?.filter(step => step.name === name && step.status === 'completed' && step.conclusion === 'success').length !== 1)) {
    throw new Error('Staging activation and post-deployment health are not proven.');
  }
}

export async function verifyProductionRelease(env = process.env, { fetchApi, readActiveSha } = {}) {
  assertProductionDispatch(env);
  const get = fetchApi ?? (async route => {
    if (!env.GITHUB_TOKEN) throw new Error('GitHub source verification credential is missing.');
    const response = await fetch(`https://api.github.com/repos/${repo}${route}`, {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Release provenance lookup failed (${response.status}).`);
    return response.json();
  });
  const [main, staging, run, jobs, validations] = await Promise.all([
    get('/git/ref/heads/main'), get('/git/ref/heads/staging'),
    get(`/actions/runs/${env.STAGING_DEPLOY_RUN_ID}`),
    get(`/actions/runs/${env.STAGING_DEPLOY_RUN_ID}/jobs?per_page=100`),
    get(`/actions/workflows/main-exact-head-validation.yml/runs?head_sha=${env.EXPECTED_MAIN_SHA}&per_page=100`),
  ]);
  if (main.object?.sha !== env.EXPECTED_MAIN_SHA || staging.object?.sha !== env.EXPECTED_MAIN_SHA
      || String(run.id) !== env.STAGING_DEPLOY_RUN_ID) {
    throw new Error('Main, staging and the selected deployment must identify one exact commit.');
  }
  assertSuccessfulStagingDeployment(run, jobs, env.EXPECTED_MAIN_SHA);
  if (!validations.workflow_runs?.some(item => item.head_sha === env.EXPECTED_MAIN_SHA
      && item.head_branch === 'main' && ['push', 'workflow_dispatch', 'schedule'].includes(item.event)
      && item.repository?.full_name === repo && item.status === 'completed' && item.conclusion === 'success'
      && item.path === '.github/workflows/main-exact-head-validation.yml')) {
    throw new Error('Exact-main validation has not passed for this release.');
  }
  const active = readActiveSha ?? (() => {
    const path = realpathSync('/var/www/veele/staging/current');
    if (!/^\/var\/www\/veele\/staging\/releases\/\d{14}-[a-f0-9]{7}$/u.test(path)) {
      throw new Error('The active staging release path is invalid.');
    }
    return readFileSync(`${path}/.fieldgrid-release-sha`, 'utf8').trim();
  });
  if (active() !== env.EXPECTED_MAIN_SHA) throw new Error('Staging has rolled back or runs a different release.');
  return { environment: 'production', sourceSha: env.EXPECTED_MAIN_SHA, stagingRunId: env.STAGING_DEPLOY_RUN_ID, verified: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await verifyProductionRelease())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

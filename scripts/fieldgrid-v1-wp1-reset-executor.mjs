import { APPLICATION_TABLES, assertApplyEligible, evaluatePreflight, inventoryFingerprint, transition } from './fieldgrid-v1-wp1-reset-plan.mjs';
/** Adapter boundary: db exposes only allowlisted count/delete/bootstrap/verify methods;
 * storage/auth expose provider-supported list/remove APIs. No provider SQL is accepted. */
export async function runWp1Reset(adapter, {mode, preflight, fingerprint} = {}) {
  if (mode === 'diagnose') return evaluatePreflight(await adapter.inventory(APPLICATION_TABLES));
  if (mode === 'verify') return adapter.verify();
  if (mode !== 'apply') throw new Error('Unsupported reset mode');
  assertApplyEligible(preflight, fingerprint);
  let state={phase:'diagnose'};
  state=transition(state,'quiesce'); await adapter.quiesce(); if (!(await adapter.isQuiesced())) throw new Error('Reset blocked: writers not quiesced');
  state=transition(state,'clean'); const current=await adapter.inventory(APPLICATION_TABLES); if (inventoryFingerprint(current)!==fingerprint) throw new Error('Reset blocked: inventory changed');
  await adapter.storage.removeInventoryExactly(current.storageInventory); await adapter.auth.removeCandidatesExactly(current.authCandidates); await adapter.db.deleteAllowlisted(APPLICATION_TABLES);
  state=transition(state,'bootstrap'); await adapter.db.bootstrapCanonical();
  state=transition(state,'verify'); const verified=await adapter.verify(); if (!verified.ready) throw new Error('Reset verification failed');
  state=transition(state,'resume'); await adapter.resume(); return {state, verified};
}

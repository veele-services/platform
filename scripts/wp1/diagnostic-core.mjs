/** Collecting evidence only. This contract can never authorize a WP1 reset. */
export const DIAGNOSTIC_CONTRACT = 'fieldgrid-wp1-collecting-diagnostic-v1';
export const DIAGNOSTIC_CONFIRMATION = 'fieldgrid-wp1-collect-only-v1';
export const DIAGNOSTIC_WORKFLOW = '.github/workflows/fieldgrid-v1-wp1-diagnostic.yml';
const NAME = /^[a-z][a-z0-9_.-]{0,127}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,79}$/;

export class DiagnosticError extends Error {
  constructor(code) {
    super('Diagnostic check failed');
    this.code = CODE.test(code) ? code : 'CHECK_FAILED';
  }
}
export function check(condition, code) {
  if (condition !== true) throw new DiagnosticError(code);
}
export function safeCode(error) {
  // Never copy driver/provider errors, SQL, URLs or identifiers into evidence.
  return error instanceof DiagnosticError ? error.code : 'CHECK_FAILED';
}
export class Collector {
  constructor(identity) {
    this.identity = identity;
    this.checks = [];
    this.values = new Map();
  }
  status(id) { return this.checks.find(item => item.id === id)?.status; }
  add(id, status, code = null, counts = {}, dependencies = []) {
    check(NAME.test(id) && !this.status(id), 'CHECK_ID');
    check(['PASS', 'FAIL', 'NOT_TESTED', 'NOT_APPLICABLE'].includes(status), 'CHECK_STATUS');
    check(code === null || CODE.test(code), 'CHECK_CODE');
    check(dependencies.every(value => NAME.test(value)), 'CHECK_DEPENDENCIES');
    check(Object.entries(counts).every(([key, value]) => NAME.test(key) &&
      Number.isSafeInteger(value) && value >= 0), 'CHECK_COUNTS');
    this.checks.push({ id, status, code, counts, dependencies });
  }
  async run(id, operation, dependencies = [], fallback = 'CHECK_FAILED') {
    const missing = dependencies.filter(item => this.status(item) !== 'PASS');
    if (missing.length) {
      this.add(id, 'NOT_TESTED', 'PREREQUISITE_FAILED', {}, missing);
      return undefined;
    }
    try {
      const result = await operation();
      this.add(id, 'PASS', null, result?.counts ?? {});
      this.values.set(id, result?.value);
      return result?.value;
    } catch (error) {
      this.add(id, 'FAIL', error instanceof DiagnosticError ? safeCode(error) : fallback);
      return undefined;
    }
  }
  skip(id, dependencies, code = 'PREREQUISITE_FAILED') {
    this.add(id, 'NOT_TESTED', code, {}, dependencies);
  }
  report() {
    const failures = this.checks.filter(item => item.status === 'FAIL').length;
    const untested = this.checks.filter(item => item.status === 'NOT_TESTED').length;
    return {
      ...this.identity,
      contract: DIAGNOSTIC_CONTRACT,
      artifactKind: 'diagnostic-only',
      mode: 'collect',
      collectionFinished: true,
      diagnosticComplete: untested === 0,
      resetAuthorized: false,
      readyForReset: false,
      resetReadiness: 'NOT_EVALUATED',
      status: failures || untested ? 'findings' : 'collected',
      totals: { checks: this.checks.length, failures, untested },
      checks: this.checks,
      completedAt: new Date().toISOString(),
    };
  }
}

/** One source snapshot; every subcheck gets SQL-error recovery, never a write. */
export class ReadOnlySession {
  constructor(client) { this.client = client; this.usable = false; this.started = false; }
  async start() {
    await this.client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    this.started = true;
    await this.client.query("SET LOCAL statement_timeout='30s'");
    await this.client.query("SET LOCAL lock_timeout='5s'");
    const result = await this.client.query('SHOW transaction_read_only');
    check(result.rows[0]?.transaction_read_only === 'on', 'SOURCE_NOT_READ_ONLY');
    this.usable = true;
  }
  async read(operation) {
    check(this.usable, 'SOURCE_SESSION_UNAVAILABLE');
    const query = async (text, values) => {
      check(typeof text === 'string' && /^\s*(SELECT|SHOW|WITH)\b/i.test(text), 'SOURCE_WRITE_REJECTED');
      return this.client.query(text, values);
    };
    await this.client.query('SAVEPOINT diagnostic_read');
    try {
      const value = await operation({ query });
      await this.client.query('RELEASE SAVEPOINT diagnostic_read');
      return value;
    } catch (error) {
      try {
        await this.client.query('ROLLBACK TO SAVEPOINT diagnostic_read');
        await this.client.query('RELEASE SAVEPOINT diagnostic_read');
      } catch {
        this.usable = false;
        throw new DiagnosticError('SOURCE_SAVEPOINT_RECOVERY_FAILED');
      }
      throw error;
    }
  }
  async close() {
    this.usable = false;
    if (this.started) {
      this.started = false;
      try { await this.client.query('ROLLBACK'); }
      catch { throw new DiagnosticError('SOURCE_ROLLBACK_FAILED'); }
    }
  }
}
export function markdown(report) {
  return [
    '# Fieldgrid WP1 — collecting diagnostic',
    '',
    '**Diagnostic only. No reset is authorized, even when every check passes.**',
    '',
    `Collection finished: ${report.collectionFinished}. All checks executed: ${report.diagnosticComplete}.`,
    `Failures: ${report.totals.failures}. Not tested: ${report.totals.untested}.`,
    '', '| Check | Result | Reason / dependencies |', '| --- | --- | --- |',
    ...report.checks.map(item => `| ${item.id} | ${item.status} | ${item.code ?? ''}${item.dependencies.length ? `: ${item.dependencies.join(', ')}` : ''} |`),
    '', 'Business/provider eligibility and mechanical copy tests are separate. A dependent skip is not a pass.',
    'Auth identities, configuration and website resources are retained by the current reset policy; see scope checks.',
    '',
  ].join('\n');
}

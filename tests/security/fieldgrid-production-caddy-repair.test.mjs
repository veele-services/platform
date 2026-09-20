import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../scripts/fieldgrid-production-caddy-repair.py', import.meta.url));
const secret = randomBytes(32).toString('hex');

const fixtures = `
def fixture_text():
    return ('# private ' + secret + '\\n'
        '(private_tls) {\\n tls {\\n  dns cloudflare {env.CLOUDFLARE_API_TOKEN}\\n }\\n}\\n'
        'staging.fieldgrid.nl {\\n reverse_proxy 127.0.0.1:3301\\n}\\n'
        'admin.fieldgrid.nl {\\n import private_tls\\n handle /api/* {\\n  reverse_proxy 127.0.0.1:3304\\n }\\n handle {\\n  reverse_proxy 127.0.0.1:3301\\n }\\n}\\n'
        '*.fieldgrid.nl {\\n import private_tls\\n'
        ' handle /personeel* {\\n  reverse_proxy 127.0.0.1:3302\\n }\\n'
        ' handle /admin* {\\n  reverse_proxy 127.0.0.1:3301\\n }\\n'
        ' handle /klant* {\\n  reverse_proxy 127.0.0.1:3303\\n }\\n'
        ' handle /api/* {\\n  reverse_proxy 127.0.0.1:3304\\n }\\n'
        ' handle {\\n  reverse_proxy 127.0.0.1:3301\\n }\\n}\\n'
        'fieldgrid.nl, www.fieldgrid.nl {\\n reverse_proxy 127.0.0.1:3310\\n}\\n'
        'import /etc/caddy/fieldgrid.d/*.caddy\\n').encode()

def fixture_live():
    def route(host, dials):
        return {'match': [{'host': [host]}], 'handle': [{'handler': 'subroute', 'routes': [
            {'match': [{'path': ['/route-' + str(index)]}], 'handle': [{'handler': 'reverse_proxy',
              'upstreams': [{'dial': dial}], 'headers': {'request': {'set': {'Authorization': [secret]}}}}]}
            for index, dial in enumerate(dials)]}]}
    return {'admin': {'config': {'persist': True}}, 'apps': {'tls': {'privateToken': secret}, 'http': {'servers': {'srv0': {'routes': [
        route('admin.fieldgrid.nl', ['127.0.0.1:3304', '127.0.0.1:3301']),
        route('*.fieldgrid.nl', ['127.0.0.1:3302', '127.0.0.1:3301', '127.0.0.1:3303', '127.0.0.1:3304', '127.0.0.1:3301']),
        route('staging.fieldgrid.nl', ['127.0.0.1:3301', '127.0.0.1:3302', '127.0.0.1:3303', '127.0.0.1:3304']),
        route('*.staging.fieldgrid.nl', ['127.0.0.1:3301', '127.0.0.1:3305']),
        route('www.fieldgrid.nl', ['127.0.0.1:3310']),
    ]}}}}}
`;

function python(body) {
  const source = `import copy, importlib.util, json, os, pathlib, sys, tempfile\nfrom unittest.mock import patch\nspec=importlib.util.spec_from_file_location('repair', ${JSON.stringify(script)})\nm=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nsecret=${JSON.stringify(secret)}\n${fixtures}\n${body}\n`;
  const result = spawnSync('python3', ['-B', '-'], { input: source, encoding: 'utf8', timeout: 20000, maxBuffer: 256 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(secret));
  return JSON.parse(result.stdout);
}

test('the pinned, lexical repair changes exactly seven production dials while preserving all other bytes', () => {
  const report = python(`
original = fixture_text()
candidate = m.plan_repair(original, m.digest(original))
assert m.EXPECTED_SHA == '32144f10850a8bd60a13b4d722fd7e596d3e019c65e6547af1b11b766611c111'
assert secret.encode() in candidate
assert candidate.split(b'admin.fieldgrid.nl')[0] == original.split(b'admin.fieldgrid.nl')[0]
assert candidate.split(b'fieldgrid.nl, www.fieldgrid.nl')[1] == original.split(b'fieldgrid.nl, www.fieldgrid.nl')[1]
assert b'{env.CLOUDFLARE_API_TOKEN}' in candidate
assert len(original) == len(candidate)
assert sum(a != b for a, b in zip(original, candidate)) == 7
assert candidate.count(b'127.0.0.1:3300') == 3
assert candidate.count(b'127.0.0.1:3404') == 2
assert candidate.count(b'127.0.0.1:3402') == 1
assert candidate.count(b'127.0.0.1:3403') == 1
print(json.dumps({'changedBytes': 7, 'candidateSha256': m.digest(candidate)}))
`);
  assert.equal(report.changedBytes, 7);
  assert.match(report.candidateSha256, /^[a-f0-9]{64}$/);
});

test('source drift, duplicate/mixed production sites, extra dials and unsupported syntax fail closed', () => {
  const report = python(`
original = fixture_text()
fixtures = [
    original + b'admin.fieldgrid.nl {\\n reverse_proxy 127.0.0.1:3301\\n}\\n',
    original.replace(b'admin.fieldgrid.nl {', b'admin.fieldgrid.nl, staging.fieldgrid.nl {'),
    original.replace(b'reverse_proxy 127.0.0.1:3304', b'reverse_proxy 127.0.0.1:3304 127.0.0.1:3304', 1),
    original.replace(b'127.0.0.1:3304', b'127.0.0.1:9999', 1),
    original.replace(b'reverse_proxy 127.0.0.1:3304', b'reverse_proxy "127.0.0.1:3304"', 1),
    original + b'\\n{\\n',
    original + b'\\nlog <<HEREDOC\\nprivate\\nHEREDOC\\n',
]
for value in fixtures:
    try: m.plan_repair(value, m.digest(value)); raise AssertionError('unsafe shape accepted')
    except m.RepairError: pass
try: m.plan_repair(original); raise AssertionError('unpinned source accepted')
except m.RepairError: pass
print(json.dumps({'rejected': len(fixtures) + 1}))
`);
  assert.equal(report.rejected, 8);
});

test('comments and quoted private text cannot add proxy tokens or lose bytes', () => {
  const report = python(`
original = fixture_text().replace(b'import private_tls',
    b'import private_tls\\n # reverse_proxy 127.0.0.1:9999 { }\\n header X-Private "reverse_proxy 127.0.0.1:3304 { # literal }"')
candidate = m.plan_repair(original, m.digest(original))
assert b'"reverse_proxy 127.0.0.1:3304 { # literal }"' in candidate
assert b'# reverse_proxy 127.0.0.1:9999 { }' in candidate
assert sum(a != b for a, b in zip(original, candidate)) == 7
print(json.dumps({'preserved': True}))
`);
  assert.equal(report.preserved, true);
});

test('live readback projection changes only the seven dials and rejects unexpected production shape', () => {
  const report = python(`
original = fixture_live(); before = copy.deepcopy(original)
candidate = m.repaired_live_config(original)
assert original == before
old_routes = original['apps']['http']['servers']['srv0']['routes']
new_routes = candidate['apps']['http']['servers']['srv0']['routes']
assert new_routes[2:] == old_routes[2:]
assert candidate['apps']['tls'] == original['apps']['tls']
for route in new_routes[:2]:
    for child in route['handle'][0]['routes']:
        proxy = child['handle'][0]
        assert proxy['headers']['request']['set']['Authorization'] == [secret]
        assert proxy['upstreams'][0]['dial'] in m.DIALS.values()
for kind in ('extra-upstream', 'mixed-host'):
    bad = copy.deepcopy(original)
    proxy = bad['apps']['http']['servers']['srv0']['routes'][0]['handle'][0]['routes'][0]['handle'][0]
    if kind == 'extra-upstream': proxy['upstreams'].append({'dial': '127.0.0.1:9999'})
    else: bad['apps']['http']['servers']['srv0']['routes'][0]['match'][0]['host'].append('staging.fieldgrid.nl')
    try: m.repaired_live_config(bad); raise AssertionError('unexpected production shape accepted')
    except m.RepairError: pass
print(json.dumps({'unchangedStagingAndTls': True}))
`);
  assert.equal(report.unchangedStagingAndTls, true);
});

const transactionFixture = `
original = fixture_text(); candidate = m.plan_repair(original, m.digest(original))
live_before = fixture_live(); live_after = m.repaired_live_config(live_before)
state = {'file': original, 'live': copy.deepcopy(live_before)}
events = []
counts = {'validate': 0, 'reload': 0}
def replace(content, previous):
    assert state['file'] == previous
    events.append('replace-new' if content == candidate else 'replace-old')
    state['file'] = content
def readback(content, expected_live):
    events.append('readback')
    if state['file'] != content or state['live'] != expected_live: raise m.RepairError('test_readback_mismatch')
`;

test('successful apply retains a private backup and verifies unchanged staging after both persistent reloads', () => {
  const report = python(`${transactionFixture}
with tempfile.TemporaryDirectory(prefix='fieldgrid-caddy-transaction-') as temporary:
    backup = pathlib.Path(temporary) / 'repair-test'; backup.mkdir(mode=0o700)
    def save(content):
        target = backup / 'Caddyfile.before'; target.write_bytes(content); target.chmod(0o600)
        events.append('backup'); return str(backup)
    def control(action):
        counts[action] += 1; events.append(action)
        if action == 'reload': state['live'] = copy.deepcopy(live_after if state['file'] == candidate else live_before)
    with patch.object(m, 'verify_service', side_effect=lambda: events.append('service')), patch.object(m, 'live_config', side_effect=lambda: copy.deepcopy(state['live'])), patch.object(m, 'control', side_effect=control), patch.object(m, 'private_backup', side_effect=save), patch.object(m, 'atomic_config', side_effect=replace), patch.object(m, 'verify_state', side_effect=readback):
        result = m.apply_repair(original, candidate)
    assert state['file'] == candidate and state['live'] == live_after
    assert (backup / 'Caddyfile.before').read_bytes() == original
    assert (backup / 'Caddyfile.before').stat().st_mode & 0o777 == 0o600
    assert (backup / 'report.json').stat().st_mode & 0o777 == 0o600
    assert events == ['service', 'validate', 'backup', 'replace-new', 'validate', 'reload', 'service', 'readback', 'reload', 'service', 'readback']
    print(json.dumps(result))
`);
  assert.equal(report.status, 'pass');
  assert.equal(report.reloadsVerified, 2);
  assert.equal(report.changedProductionDials, 7);
  assert.equal(report.unchangedNonproductionConfig, true);
});

test('failed validation, reload or staging readback restores the exact file and live configuration', () => {
  const report = python(`
results = []
for failure in ('validation', 'reload', 'second-reload', 'staging-drift'):
${transactionFixture.split('\n').map(line => `    ${line}`).join('\n')}
    with tempfile.TemporaryDirectory(prefix='fieldgrid-caddy-rollback-') as temporary:
        backup = pathlib.Path(temporary) / 'repair-test'; backup.mkdir(mode=0o700)
        def save(content):
            target = backup / 'Caddyfile.before'; target.write_bytes(content); target.chmod(0o600); return str(backup)
        def control(action):
            counts[action] += 1
            if failure == 'validation' and action == 'validate' and counts[action] == 2: raise m.RepairError('test_failure')
            if failure == 'reload' and action == 'reload' and counts[action] == 1: raise m.RepairError('test_failure')
            if failure == 'second-reload' and action == 'reload' and counts[action] == 2: raise m.RepairError('test_failure')
            if action == 'reload':
                state['live'] = copy.deepcopy(live_after if state['file'] == candidate else live_before)
                if failure == 'staging-drift' and state['file'] == candidate: state['live']['apps']['tls']['privateToken'] = 'changed-private-value'
        with patch.object(m, 'verify_service'), patch.object(m, 'live_config', side_effect=lambda: copy.deepcopy(state['live'])), patch.object(m, 'control', side_effect=control), patch.object(m, 'private_backup', side_effect=save), patch.object(m, 'atomic_config', side_effect=replace), patch.object(m, 'read_root_config', side_effect=lambda: state['file']), patch.object(m, 'verify_state', side_effect=readback):
            result = m.apply_repair(original, candidate)
        assert result['status'] == 'fail' and result['rollback'] == 'pass'
        assert state['file'] == original and state['live'] == live_before
        assert (backup / 'Caddyfile.before').read_bytes() == original
        results.append(result)
print(json.dumps(results))
`);
  assert.equal(report.length, 4);
  for (const failure of report) {
    assert.equal(failure.rollback, 'pass');
    assert.equal(failure.changedProductionDials, 0);
  }
});

test('rollback failures remain explicit, retain the backup, and never overwrite an unknown concurrent file', () => {
  const report = python(`
results = []
for failure in ('concurrent-file', 'rollback-reload'):
${transactionFixture.split('\n').map(line => `    ${line}`).join('\n')}
    with tempfile.TemporaryDirectory(prefix='fieldgrid-caddy-failed-rollback-') as temporary:
        backup = pathlib.Path(temporary) / 'repair-test'; backup.mkdir(mode=0o700)
        def save(content):
            target = backup / 'Caddyfile.before'; target.write_bytes(content); target.chmod(0o600); return str(backup)
        def control(action):
            counts[action] += 1
            if action == 'reload':
                if failure == 'concurrent-file': state['file'] = b'unknown concurrent private configuration'
                raise m.RepairError(secret)
        with patch.object(m, 'verify_service'), patch.object(m, 'live_config', side_effect=lambda: copy.deepcopy(state['live'])), patch.object(m, 'control', side_effect=control), patch.object(m, 'private_backup', side_effect=save), patch.object(m, 'atomic_config', side_effect=replace), patch.object(m, 'read_root_config', side_effect=lambda: state['file']), patch.object(m, 'verify_state', side_effect=readback):
            result = m.apply_repair(original, candidate)
        assert result['status'] == 'fail' and result['rollback'] == 'failed'
        assert result['changedProductionDials'] is None
        assert (backup / 'Caddyfile.before').read_bytes() == original
        if failure == 'concurrent-file':
            assert state['file'] == b'unknown concurrent private configuration'
            assert 'replace-old' not in events
        else: assert state['file'] == original
        assert secret not in (backup / 'report.json').read_text()
        results.append(result)
print(json.dumps(results))
`);
  assert.equal(report.length, 2);
  for (const failure of report) {
    assert.equal(failure.rollback, 'failed');
    assert.equal(failure.changedProductionDials, null);
  }
});

test('configuration reads reject symlinks, hard links, unsafe metadata and concurrent changes', () => {
  const report = python(`
from types import SimpleNamespace
with tempfile.TemporaryDirectory(prefix='fieldgrid-caddy-metadata-') as temporary:
    target = pathlib.Path(temporary) / 'Caddyfile'; target.write_bytes(fixture_text()); target.chmod(0o644)
    link = pathlib.Path(temporary) / 'link'; link.symlink_to(target)
    with patch.object(m, 'CONFIG', str(link)):
        try: m.read_root_config(); raise AssertionError('symlink accepted')
        except OSError: pass
    original_stat = target.stat()
    fields = {name: getattr(original_stat, name) for name in ('st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')}
    fields.update(st_uid=0, st_gid=0)
    with patch.object(m, 'CONFIG', str(target)), patch.object(m.os, 'fstat', return_value=SimpleNamespace(**fields)):
        assert m.read_root_config() == fixture_text()
    for change in ({'st_uid': 1000}, {'st_gid': 1000}, {'st_nlink': 2}, {'st_mode': 0o100666}, {'st_size': m.inventory.FILE_LIMIT + 1}):
        invalid = SimpleNamespace(**(fields | change))
        with patch.object(m, 'CONFIG', str(target)), patch.object(m.os, 'fstat', return_value=invalid):
            try: m.read_root_config(); raise AssertionError('unsafe metadata accepted')
            except m.RepairError: pass
    later = SimpleNamespace(**(fields | {'st_ctime_ns': fields['st_ctime_ns'] + 1}))
    with patch.object(m, 'CONFIG', str(target)), patch.object(m.os, 'fstat', side_effect=[SimpleNamespace(**fields), later]):
        try: m.read_root_config(); raise AssertionError('concurrent change accepted')
        except m.RepairError: pass
print(json.dumps({'metadataFailClosed': True}))
`);
  assert.equal(report.metadataFailClosed, true);
});

test('root-only preview is deterministic and never invokes services, HTTP, backups or writes', () => {
  const report = python(`
original = fixture_text(); real_plan = m.plan_repair
with patch.object(sys, 'argv', ['repair', '--preview']), patch.object(os, 'geteuid', return_value=1001), patch.object(m, 'read_root_config', side_effect=AssertionError('nonroot read')):
    try: m.main(); raise AssertionError('nonroot preview accepted')
    except m.RepairError: pass
with patch.object(sys, 'argv', ['repair', '--preview']), patch.object(os, 'geteuid', return_value=0), patch.object(m, 'read_root_config', return_value=original), patch.object(m, 'plan_repair', side_effect=lambda content: real_plan(content, m.digest(content))), patch.object(m, 'apply_repair', side_effect=AssertionError('preview mutation')), patch.object(m, 'live_config', side_effect=AssertionError('preview HTTP')):
    first = m.main(); second = m.main()
assert first == second
print(json.dumps(first))
`);
  assert.equal(report.status, 'ready');
  assert.equal(report.mutated, false);
  assert.equal(report.plannedProductionDials, 7);
});

test('apply requires both effective service commands to load the pinned persistent file as caddy', () => {
  const report = python(`
service = ('ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile ; ignore_errors=no ; }\\n'
           'ExecReload={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force ; ignore_errors=no ; }\\n'
           'User=caddy\\nGroup=caddy\\n')
with patch.object(m.inventory, 'bounded_command', return_value=service): m.verify_service()
for invalid in (service.replace(' run --config', ' run --resume --config'),
                service.replace('/etc/caddy/Caddyfile', '/etc/caddy/other.caddy', 1),
                service.replace(' reload --config /etc/caddy/Caddyfile', ' reload --config /etc/caddy/other.caddy'),
                service.replace('User=caddy', 'User=root')):
    with patch.object(m.inventory, 'bounded_command', return_value=invalid):
        try: m.verify_service(); raise AssertionError('unsafe service configuration accepted')
        except m.RepairError: pass
print(json.dumps({'persistentContractRequired': True}))
`);
  assert.equal(report.persistentContractRequired, true);
});

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../../scripts/fieldgrid-production-proxy-inventory.py', import.meta.url));
const secret = randomBytes(32).toString('hex');

function python(body) {
  const source = `import contextlib, importlib.util, io, json, os, pathlib, sys, tempfile\nfrom unittest.mock import patch\nspec = importlib.util.spec_from_file_location('inventory', ${JSON.stringify(script)})\nm = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nsecret = ${JSON.stringify(secret)}\n${body}\n`;
  const result = spawnSync('python3', ['-B', '-'], { input: source, encoding: 'utf8', timeout: 20000, maxBuffer: 256 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(secret));
  return JSON.parse(result.stdout);
}

test('service inventory distinguishes file reload from durable autosave without emitting commands or unknown fields', () => {
  const report = python(`
raw = '\\n'.join([
    'User=caddy', 'Group=caddy', 'MainPID=4321',
    'FragmentPath=/usr/lib/systemd/system/caddy.service',
    'DropInPaths=/etc/systemd/system/caddy.service.d/fieldgrid-cloudflare-dns.conf /tmp/' + secret,
    'ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile --adapter caddyfile ; ignore_errors=no ; }',
    'ExecReload={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --force ; ignore_errors=no ; }',
    'Environment=CLOUDFLARE_API_TOKEN=' + secret,
])
file = m.service_metadata(raw)
resume = m.service_metadata(raw.replace('run --environ', 'run --resume').replace('reload --config /etc/caddy/Caddyfile --adapter caddyfile', 'reload --config ' + m.AUTOSAVE))
unknown = m.service_metadata(raw.replace('run --environ', 'run --envfile ' + secret))
print(json.dumps({'file': file, 'resume': resume, 'unknown': unknown}))
`);
  assert.equal(report.file.startPersistence, 'file');
  assert.equal(report.file.reloadPersistence, 'file');
  assert.equal(report.file.start.configPath, '/etc/caddy/Caddyfile');
  assert.equal(report.file.mainPid, 4321);
  assert.equal(report.resume.startPersistence, 'autosave');
  assert.equal(report.resume.reloadPersistence, 'autosave');
  assert.equal(report.unknown.startPersistence, 'unknown');
  assert.deepEqual(report.file.unitPaths, [
    '/usr/lib/systemd/system/caddy.service',
    '/etc/systemd/system/caddy.service.d/fieldgrid-cloudflare-dns.conf',
  ]);
});

test('secret operands, duplicate flags and unknown executables cannot produce a trusted persistence claim', () => {
  const report = python(`
fixtures = [
    '/usr/bin/caddy run --config /tmp/' + secret,
    '/usr/bin/caddy run --config /etc/caddy/Caddyfile --config /etc/caddy/other.json',
    '/tmp/' + secret + ' run --resume',
    '/usr/bin/caddy run --adapter ' + secret,
    '/usr/bin/caddy run --config /etc/caddy/../' + secret,
]
results = [m.command_metadata('{ argv[]=' + command + ' ; ignore_errors=no ; }') for command in fixtures]
assert not results[0]['configPathApproved']
assert not results[1]['recognized']
assert not results[2]['recognized']
assert not results[3]['recognized']
assert not results[4]['configPathApproved']
assert not m.command_metadata('{ path=/tmp/' + secret + ' ; argv[]=/usr/bin/caddy run --resume ; ignore_errors=no ; }')['recognized']
assert not m.command_metadata('{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy reload --config ' + m.AUTOSAVE + ' ; ignore_errors=no ; } ; { path=/usr/bin/caddy ; argv[]=/usr/bin/caddy reload --config /etc/caddy/Caddyfile ; ignore_errors=no ; }')['recognized']
print(json.dumps(results))
`);
  assert.equal(report.length, 5);
});

test('proxy metadata preserves production/staging/apex routes and only exposes whitelisted fields', () => {
  const report = python(`
def route(host, port, path=None):
    nested = {'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:' + str(port)}, {'dial': 'https://' + secret}], 'headers': {'request': {'set': {'Authorization': [secret]}}}}
    child = {'handle': [nested]}
    if path: child['match'] = [{'path': [path]}]
    return {'match': [{'host': [host]}], 'handle': [{'handler': 'subroute', 'routes': [child]}]}
routes = [
    route('fieldgrid.nl', 3310), route('www.fieldgrid.nl', 3310),
    route('admin.fieldgrid.nl', 3300, '/admin/*'), route('*.fieldgrid.nl', 3404, '/api/*'),
    route('*.staging.fieldgrid.nl', 3304, '/api/*'), route('unrelated.example', 9999),
]
config = {'admin': {'config': {'persist': False}, 'identity': secret}, 'apps': {'http': {'servers': {secret: {'routes': routes}}}, 'tls': {'automation': {'policies': [{'issuers': [{'token': secret}]}]}}}}
print(json.dumps(m.proxy_metadata(config)))
`);
  assert.equal(report.configPersist, false);
  assert.equal(report.routes.length, 5);
  assert.deepEqual(report.routes[0], { hosts: ['fieldgrid.nl'], paths: [], upstreams: ['127.0.0.1:3310'] });
  assert.deepEqual(report.routes[4], { hosts: ['*.staging.fieldgrid.nl'], paths: ['/api/*'], upstreams: ['127.0.0.1:3304'] });
  assert.equal(report.truncated, false);
});

test('imports remain bounded to Caddy config files; environment files, traversal and snippet arguments are rejected', () => {
  const report = python(`
content = ('import /etc/caddy/fieldgrid.d/*.caddy\\n'
           'import extra.caddy # permitted relative file\\n'
           'import /etc/caddy/fieldgrid-cloudflare.env\\n'
           'import ../../tmp/' + secret + '\\n'
           'import /tmp/' + secret + '\\n'
           'import /etc/caddy/extra.caddy ' + secret + '\\n'
           'tls { dns cloudflare ' + secret + ' }\\n').encode()
paths, rejected = m.import_paths(content, '/etc/caddy/Caddyfile')
reads = []
def read(path):
    reads.append(path)
    if path == '/etc/caddy/Caddyfile': return content
    return b'# no nested imports'
with patch.object(m, 'bounded_read_file', side_effect=read), patch.object(m, 'expand_import', side_effect=lambda path: ['/etc/caddy/fieldgrid.d/staging.caddy'] if '*' in path else [path]):
    files = m.config_file_metadata(['/etc/caddy/Caddyfile'])
assert '/etc/caddy/fieldgrid-cloudflare.env' not in reads
print(json.dumps({'paths': paths, 'rejected': rejected, 'files': files, 'reads': reads}))
`);
  assert.deepEqual(report.paths, ['/etc/caddy/extra.caddy', '/etc/caddy/fieldgrid.d/*.caddy']);
  assert.equal(report.rejected, true);
  assert.equal(report.files.files.length, 3);
  assert.equal(report.files.truncated, false);
  assert.match(report.files.files[0].sha256, /^[a-f0-9]{64}$/);
});

test('bounded file reads reject symlinks at every component, FIFOs, directories and oversized files', () => {
  const report = python(`
with tempfile.TemporaryDirectory(prefix='fieldgrid-proxy-') as temporary:
    root = pathlib.Path(temporary)
    target = root / 'target.caddy'; target.write_text(secret)
    direct_link = root / 'linked.caddy'; direct_link.symlink_to(target)
    parent_link = root / 'linked-directory'; parent_link.symlink_to(root, target_is_directory=True)
    fifo = root / 'named-pipe'; os.mkfifo(fifo)
    big = root / 'large.caddy'
    with big.open('wb') as stream: stream.truncate(m.FILE_LIMIT + 1)
    rejected = 0
    for path in [direct_link, parent_link / 'target.caddy', fifo, root, big]:
        try: m.bounded_read_file(str(path))
        except (OSError, ValueError): rejected += 1
    assert m.bounded_read_file(str(target)).decode() == secret
    linked = m.path_metadata(str(direct_link))
    through_link = m.path_metadata(str(parent_link / 'target.caddy'))
    print(json.dumps({'rejected': rejected, 'linkKind': linked.get('kind'), 'linkAccess': linked.get('effectiveAccess'), 'parentLinkStatus': through_link['status']}))
`);
  assert.equal(report.rejected, 5);
  assert.equal(report.linkKind, 'symlink');
  assert.equal(report.linkAccess, null);
  assert.equal(report.parentLinkStatus, 'unavailable');
});

test('file and parent access are independently reported using effective runner identity', () => {
  const report = python(`
with tempfile.TemporaryDirectory(prefix='fieldgrid-proxy-') as temporary:
    root = pathlib.Path(temporary); target = root / 'Caddyfile'
    target.write_text(secret); target.chmod(0o640); root.chmod(0o750)
    file = m.path_metadata(str(target)); parent = m.path_metadata(str(root))
    assert file['effectiveAccess']['write'] == os.access(target, os.W_OK, effective_ids=True, follow_symlinks=False)
    assert parent['effectiveAccess']['write'] == os.access(root, os.W_OK, effective_ids=True, follow_symlinks=False)
    print(json.dumps({'file': file, 'parent': parent}))
`);
  assert.equal(report.file.mode, '0640');
  assert.equal(report.parent.mode, '0750');
  assert.equal(report.file.kind, 'file');
  assert.equal(report.parent.kind, 'directory');
  assert.equal(typeof report.file.effectiveAccess.write, 'boolean');
  assert.equal(typeof report.parent.effectiveAccess.write, 'boolean');
});

test('command output and config graph are bounded and malformed metadata fails closed', () => {
  const report = python(`
assert m.bounded_command([sys.executable, '-c', 'print("x" * 70000)']) is None
assert m.bounded_command([sys.executable, '-c', 'import sys; print("private", file=sys.stderr); sys.exit(1)']) is None
assert m.bounded_command([sys.executable, '-c', 'print("ok")']) == 'ok\\n'
assert m.service_metadata(None) == {'status': 'unavailable'}
assert m.proxy_metadata({'apps': None}) == {'status': 'unavailable'}
assert m.proxy_metadata({'admin': {'config': {'persist': secret}}})['configPersist'] is None
assert m.proxy_metadata({'apps': {'http': {'servers': {'srv0': {'routes': [{}] * 101}}}}})['truncated'] is True
assert m.proxy_metadata({'apps': {'http': {'servers': {'srv0': {'routes': [{'match': [{'host': ['a' * 1000 + '.fieldgrid.nl']}], 'handle': [{'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:3300'}]}]}]}}}}})['routes'] == []
print(json.dumps({'bounded': True}))
`);
  assert.equal(report.bounded, true);
});

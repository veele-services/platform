# One-time production Caddy routing repair

The inventory for run `35517576832` proves that Caddy starts and reloads from
`/etc/caddy/Caddyfile`. The file is `root:root 0644`, its directory is
`root:root 0755`, and the GitHub runner cannot write either. Its existing sudo
permissions permit validation and reload, but do not permit installing a
configuration. This operation therefore requires an existing root session.

Run only the reviewed `scripts/fieldgrid-production-caddy-repair.py` together
with its reviewed sibling `fieldgrid-production-proxy-inventory.py`, from the
exact approved source checkout. Do not give the runner generic root write
permissions. The helper accepts no alternate destination, expected hash,
upstream, command or configuration payload.

The expected existing Caddyfile SHA-256 is:

```text
32144f10850a8bd60a13b4d722fd7e596d3e019c65e6547af1b11b766611c111
```

The repair changes exactly seven upstream tokens:

| Production site | Existing upstream | Replacement | Count |
| --- | --- | --- | --- |
| `admin.fieldgrid.nl` | `127.0.0.1:3304` | `127.0.0.1:3404` | 1 |
| `admin.fieldgrid.nl` | `127.0.0.1:3301` | `127.0.0.1:3300` | 1 |
| `*.fieldgrid.nl` | `127.0.0.1:3302` | `127.0.0.1:3402` | 1 |
| `*.fieldgrid.nl` | `127.0.0.1:3301` | `127.0.0.1:3300` | 2 |
| `*.fieldgrid.nl` | `127.0.0.1:3303` | `127.0.0.1:3403` | 1 |
| `*.fieldgrid.nl` | `127.0.0.1:3304` | `127.0.0.1:3404` | 1 |

Comments, whitespace, imports, TLS configuration, secrets, staging hosts and
the marketing site retain their original bytes. Source hash drift, an
unexpected production block, extra upstreams or unsupported lexical syntax
stops the operation. Preview emits hashes and counts, never a raw diff:

```sh
# In the reviewed checkout, as root:
python3 -B scripts/fieldgrid-production-caddy-repair.py --preview
python3 -B scripts/fieldgrid-production-caddy-repair.py --apply
```

Preview is deterministic and does not contact Caddy, invoke systemd, create
backups or write files. Apply serializes this repair with a root-owned lock,
checks Caddy's effective start/reload configuration, captures its running
configuration privately in memory and validates the existing file. It keeps
a `0600` backup in a `0700` directory below
`/var/backups/fieldgrid-production-caddy-repair`, outside all Caddy imports.
The candidate replaces the Caddyfile atomically, retaining `root:root 0644`.

The existing `fieldgrid-caddy-validate.service` validates the complete
configuration in the existing Caddy service environment. After validation,
the helper reloads Caddy twice. Each reload must read the expected persistent
file and produce precisely the previous full API configuration with only the
seven intended dials changed. This comparison also proves that staging,
marketing, TLS and all other configuration remained unchanged. The helper
never posts an API-only configuration or restarts Caddy.

A failure after replacement restores the original file, validates it,
reloads Caddy and checks both the file and previous full API configuration.
If another actor changed the file, rollback refuses to overwrite that unknown
state and reports failure. Backups are retained after success and failure;
they are never uploaded. The private directory also retains a `0600`
`report.json` containing only hashes, counts and fixed status fields.
If the process is forcibly killed or the machine loses power, the retained
backup remains available for root recovery; automatic rollback cannot run in
those cases. An already repaired or otherwise changed file fails the pinned
source-hash check on a later invocation.

A successful repair establishes durable routing, not application acceptance.
Run the normal production deployment health gate and browser acceptance
afterward. Those gates must prove the production environment and exact
release identity on all four application surfaces.

Local verification uses fixtures and mocked control/readback operations only:

```sh
node --test tests/security/fieldgrid-production-caddy-repair.test.mjs
```

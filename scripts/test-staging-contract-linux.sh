#!/usr/bin/env bash
set -euo pipefail

# Privileged operations stay inside a disposable container. Unlike the unit
# fixtures, Linux itself enforces UID, GID, traversal, read and write checks.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker run --rm --interactive --volume "$repo_root:/repo:ro" \
  debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251 \
  /bin/bash -se <<'CONTAINER'
set -euo pipefail

groupadd --gid 1801 clamav
groupadd --gid 1802 fieldgrid
groupadd --gid 1803 fieldgrid-runner
useradd --uid 1801 --gid clamav --no-create-home --shell /usr/sbin/nologin clamav
useradd --uid 1802 --gid fieldgrid --groups clamav --no-create-home --shell /usr/sbin/nologin fieldgrid
useradd --uid 1803 --gid fieldgrid-runner --no-create-home --shell /usr/sbin/nologin fieldgrid-runner

install -d -o root -g root -m 0700 /etc/fieldgrid
install -m 0600 /dev/null /etc/fieldgrid/staging-handoff.key
install -m 0644 /dev/null /etc/fieldgrid/staging-handoff.crt
printf '%s\n' '{"test":"trusted-root-fixture"}' > /etc/fieldgrid/github-attestation-trusted-root.jsonl
chown root:root /etc/fieldgrid/github-attestation-trusted-root.jsonl
chmod 0644 /etc/fieldgrid/github-attestation-trusted-root.jsonl

install -d -o root -g root -m 0711 /opt/fieldgrid/staging
install -d -o fieldgrid-runner -g fieldgrid-runner -m 0700 /opt/fieldgrid/staging/incoming
install -d -o root -g fieldgrid -m 0750 /opt/fieldgrid/staging/releases
install -d -o root -g fieldgrid -m 0750 /opt/fieldgrid/staging/shared
install -d -o root -g root -m 0700 /opt/fieldgrid/staging/backups
printf '%s\n' 'TEST_FIXTURE="not-a-secret"' > /opt/fieldgrid/staging/shared/fieldgrid.env
chown root:fieldgrid /opt/fieldgrid/staging/shared/fieldgrid.env
chmod 0640 /opt/fieldgrid/staging/shared/fieldgrid.env
install -m 0755 /repo/deploy/fieldgrid-install-staging-release /usr/local/sbin/fieldgrid-install-staging-release

install -d -o root -g root -m 0755 /fixture/bin /run/clamav
install -m 0755 /repo/scripts/check-staging-runner-contract.sh /fixture/check-staging-runner-contract.sh
/usr/bin/perl -MIO::Socket::UNIX -MSocket=SOCK_STREAM -e '
  my $socket = IO::Socket::UNIX->new(
    Type => SOCK_STREAM,
    Local => "/run/clamav/clamd.ctl",
    Listen => 1,
  ) or die "cannot bind fixture socket\n";
  sleep 300;
' &
socket_fixture_pid=$!
trap 'kill "$socket_fixture_pid" 2>/dev/null || true; wait "$socket_fixture_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  test ! -S /run/clamav/clamd.ctl || break
  sleep 0.02
done
test -S /run/clamav/clamd.ctl
chown clamav:clamav /run/clamav/clamd.ctl
chmod 0660 /run/clamav/clamd.ctl
for dependency in gh python3 node; do
  printf '#!/bin/sh\nexit 0\n' > "/fixture/bin/$dependency"
  chmod 0755 "/fixture/bin/$dependency"
done
cat > /fixture/bin/pg_restore <<'EOF'
#!/bin/sh
test "$1" = --version || exit 0
if test "${PG_RESTORE_SCENARIO:-}" = old; then echo 'pg_restore (PostgreSQL) 16.15'; else echo 'pg_restore (PostgreSQL) 17.8'; fi
EOF
cat > /fixture/bin/openssl <<'EOF'
#!/bin/sh
test "$1" = x509
test "${OPENSSL_SCENARIO:-}" != invalid
EOF
cat > /fixture/bin/systemctl <<'EOF'
#!/bin/sh
if test "$1" = is-active; then exit 0; fi
case "$*" in
  *--property=User*) echo fieldgrid;;
  *--property=Group*) echo fieldgrid;;
  *--property=EnvironmentFiles*) echo '/opt/fieldgrid/staging/shared/runtime.env (ignore_errors=no)';;
  *--property=SupplementaryGroups*) echo clamav;;
  *--property=Requires*) echo 'basic.target clamav-daemon.service';;
  *--property=WorkingDirectory*) if test "${UNIT_PREFLIGHT_SCENARIO:-}" = wrong_working_directory; then echo /tmp/untrusted-release; else echo /opt/fieldgrid/staging/current; fi;;
  *--property=ExecStartPreEx*)
    case "${UNIT_PREFLIGHT_SCENARIO:-}" in
      privileged_socket) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; flags=privileged ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; flags= ; }';;
      privileged_protocol) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; flags= ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; flags=privileged ; }';;
      *) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; flags= ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }';;
    esac;;
  *--property=ExecStartPre*)
    case "${UNIT_PREFLIGHT_SCENARIO:-}" in
      missing_socket) echo '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; }';;
      missing_protocol) echo '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }';;
      test_write) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; }' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -w /run/clamav/clamd.ctl ; ignore_errors=no ; }';;
      wrong_protocol) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node other-preflight.mjs ; ignore_errors=no ; }';;
      socket_suffix) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl.lookalike ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; }';;
      protocol_suffix) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs.lookalike ; ignore_errors=no ; }';;
      ignored_socket) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=yes ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; }';;
      ignored_protocol) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=yes ; }';;
      extra_preflight) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; }' '{ path=/usr/bin/true ; argv[]=/usr/bin/true ; ignore_errors=no ; }';;
      *) printf '%s\n' '{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }' '{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }';;
    esac;;
  *) exit 99;;
esac
EOF
cat > /fixture/bin/sudo <<'EOF'
#!/bin/sh
test "$*" = '--non-interactive --list' || exit 99
case "${SUDO_SCENARIO:-}" in
  broad) printf '%s\n' '(root) NOPASSWD: ALL';;
  password-extra) printf '%s\n' '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""' '(root) PASSWD: /bin/sh';;
  *) printf '%s\n' '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""';;
esac
EOF
chmod 0755 /fixture/bin/openssl /fixture/bin/pg_restore /fixture/bin/systemctl /fixture/bin/sudo

contract_path=/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh
runuser -u fieldgrid-runner -- /usr/bin/env -i \
  PATH="$contract_path" \
  DEPLOY_TARGET=staging \
  DEPLOY_ROOT=/opt/fieldgrid/staging \
  SERVICE_NAME=fieldgrid@staging.service \
  CLAMAV_ENABLED=true \
  CLAMAV_SOCKET=/run/clamav/clamd.ctl \
  /bin/bash /fixture/check-staging-runner-contract.sh
if runuser -u fieldgrid-runner -- /usr/bin/perl -MIO::Socket::UNIX -MSocket=SOCK_STREAM -e '
  exit(IO::Socket::UNIX->new(Type => SOCK_STREAM, Peer => "/run/clamav/clamd.ctl") ? 0 : 1)
'; then exit 1; fi

# Socket ownership, group and mode drift must fail closed.
chown root:clamav /run/clamav/clamd.ctl
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
chown clamav:clamav /run/clamav/clamd.ctl
chown clamav:fieldgrid /run/clamav/clamd.ctl
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
chown clamav:clamav /run/clamav/clamd.ctl

# Permissive socket drift both enables a real connection and fails the contract.
chmod 0666 /run/clamav/clamd.ctl
runuser -u fieldgrid-runner -- /usr/bin/perl -MIO::Socket::UNIX -MSocket=SOCK_STREAM -e '
  exit(IO::Socket::UNIX->new(Type => SOCK_STREAM, Peer => "/run/clamav/clamd.ctl") ? 0 : 1)
'
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0660 /run/clamav/clamd.ctl

# The separated runner cannot traverse protected children or read runtime data.
if runuser -u fieldgrid-runner -- stat /etc/fieldgrid/staging-handoff.crt >/dev/null 2>&1; then exit 1; fi
if runuser -u fieldgrid-runner -- head -c 1 /opt/fieldgrid/staging/shared/fieldgrid.env >/dev/null 2>&1; then exit 1; fi

# Root-only metadata drift must fail closed.
chmod 0755 /etc/fieldgrid
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0700 /etc/fieldgrid
chmod 0640 /etc/fieldgrid/github-attestation-trusted-root.jsonl
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0644 /etc/fieldgrid/github-attestation-trusted-root.jsonl
ln /etc/fieldgrid/staging-handoff.key /etc/fieldgrid/staging-handoff.key.extra-link
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
rm /etc/fieldgrid/staging-handoff.key.extra-link
if env -i PATH="$contract_path" OPENSSL_SCENARIO=invalid /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
if env -i PATH="$contract_path" PG_RESTORE_SCENARIO=old /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi

# Execute-only traversal, a runtime-group grant or broader sudo must not pass.
chmod 0711 /etc/fieldgrid
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0700 /etc/fieldgrid
usermod --append --groups fieldgrid fieldgrid-runner
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
gpasswd --delete fieldgrid-runner fieldgrid >/dev/null
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" SUDO_SCENARIO=broad DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" SUDO_SCENARIO=password-extra DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" PG_RESTORE_SCENARIO=old DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
for preflight_scenario in wrong_working_directory missing_socket missing_protocol test_write wrong_protocol socket_suffix protocol_suffix ignored_socket ignored_protocol privileged_socket privileged_protocol extra_preflight; do
  if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" UNIT_PREFLIGHT_SCENARIO="$preflight_scenario" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
done
groupadd docker
usermod --append --groups docker fieldgrid-runner
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
gpasswd --delete fieldgrid-runner docker >/dev/null
runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null

# A writable scanner directory enables pathname replacement and must fail first.
chmod 0777 /run/clamav
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
runuser -u fieldgrid-runner -- /usr/bin/unlink /run/clamav/clamd.ctl
runuser -u fieldgrid-runner -- /usr/bin/perl -MSocket -e '
  socket(my $socket, PF_UNIX, SOCK_STREAM, 0) or die "socket: $!";
  bind($socket, sockaddr_un("/run/clamav/clamd.ctl")) or die "bind: $!";
'
test -S /run/clamav/clamd.ctl
test "$(stat -c '%U' /run/clamav/clamd.ctl)" = fieldgrid-runner
chmod 0755 /run/clamav
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi

# Missing paths and regular-file substitutes must not pass as the scanner socket.
unlink /run/clamav/clamd.ctl
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
install -o clamav -g clamav -m 0660 /dev/null /run/clamav/clamd.ctl
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi

echo 'Real Linux root/runner directory and identity contracts verified.'
CONTAINER

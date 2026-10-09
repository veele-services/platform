#!/usr/bin/env bash
set -euo pipefail

# Privileged operations stay inside a disposable container. Unlike the unit
# fixtures, Linux itself enforces UID, GID, traversal, read and write checks.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker run --rm --interactive --volume "$repo_root:/repo:ro" \
  public.ecr.aws/docker/library/debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251 \
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

install -d -o root -g root -m 0755 /etc/clamav
printf '%s\n' \
  'LocalSocket /run/clamav/clamd.ctl' \
  'LocalSocketGroup clamav' \
  'LocalSocketMode 0660' \
  'EnableVersionCommand yes' \
  > /etc/clamav/clamd.conf
chown root:root /etc/clamav/clamd.conf
chmod 0644 /etc/clamav/clamd.conf

install -d -o root -g root -m 0755 /fixture/bin /run/clamav
install -m 0755 /repo/scripts/check-staging-runner-contract.sh /fixture/check-staging-runner-contract.sh
install -m 0755 /usr/bin/perl /fixture/bin/clamd
/fixture/bin/clamd -MIO::Socket::UNIX -MSocket=SOCK_STREAM -e '
  my $socket = IO::Socket::UNIX->new(
    Type => SOCK_STREAM,
    Local => "/run/clamav/clamd.ctl",
    Listen => 1,
  ) or die "cannot bind fixture socket\n";
  while (my $client = $socket->accept()) {
    my $request = "";
    while (index($request, "\0") < 0) {
      my $read = sysread($client, my $chunk, 4096);
      last unless $read;
      $request .= $chunk;
    }
    if ($request eq "zVERSION\0") {
      my $response = -e "/fixture/clamd-version-disabled"
        ? "COMMAND UNAVAILABLE\0"
        : "ClamAV 1.5.4/28141/Fri Oct 2 04:26:12 2026\0";
      syswrite($client, $response);
    }
    close $client;
  }
' &
socket_fixture_pid=$!
printf '%s\n' "$socket_fixture_pid" > /fixture/clamd-main-pid
tcp_fixture_pid=''
decoy_fixture_pid=''
trap 'for fixture_pid in "${tcp_fixture_pid:-}" "${decoy_fixture_pid:-}" "$socket_fixture_pid"; do kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; done' EXIT
for _ in $(seq 1 50); do
  test ! -S /run/clamav/clamd.ctl || break
  sleep 0.02
done
test -S /run/clamav/clamd.ctl
chown clamav:clamav /run/clamav/clamd.ctl
chmod 0660 /run/clamav/clamd.ctl
for dependency in gh node; do
  printf '#!/bin/sh\nexit 0\n' > "/fixture/bin/$dependency"
  chmod 0755 "/fixture/bin/$dependency"
done
cat > /fixture/bin/python3 <<'EOF'
#!/bin/sh
test "$1" = - || exit 99
/usr/bin/perl -MIO::Socket::UNIX -MSocket=SOCK_STREAM -e '
  my $client = IO::Socket::UNIX->new(
    Type => SOCK_STREAM,
    Peer => "/run/clamav/clamd.ctl",
  ) or exit 1;
  syswrite($client, "zVERSION\0");
  my $reply = "";
  while (index($reply, "\0") < 0 && length($reply) <= 4096) {
    my $read = sysread($client, my $chunk, 4096);
    last unless $read;
    $reply .= $chunk;
  }
  exit($reply =~ m{^ClamAV [0-9][0-9A-Za-z._-]*/[0-9]+/[^\r\n\0]{1,256}\0$} ? 0 : 1);
'
EOF
chmod 0755 /fixture/bin/python3
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
case "$*" in
  'show clamav-daemon.socket --property=LoadState --value')
    case "${SOCKET_UNIT_SCENARIO:-}" in
      not_found) echo not-found;;
      masked|masked_active) echo masked;;
      *) echo loaded;;
    esac
    exit 0
    ;;
  'show clamav-daemon.socket --property=ActiveState --value')
    case "${SOCKET_UNIT_SCENARIO:-}" in
      not_found|masked) echo inactive;;
      *) echo active;;
    esac
    exit 0
    ;;
  'show clamav-daemon.socket --property=Listen --value')
    case "${SOCKET_UNIT_SCENARIO:-}" in
      tcp) printf '%s\n' '/run/clamav/clamd.ctl (Stream)' '0.0.0.0:3310 (Stream)';;
      wrong_unix) printf '%s\n' '/tmp/clamd.ctl (Stream)';;
      datagram) printf '%s\n' '/run/clamav/clamd.ctl (Datagram)';;
      *) printf '%s\n' '/run/clamav/clamd.ctl (Stream)';;
    esac
    exit 0
    ;;
  'show clamav-daemon.service --property=MainPID --value')
    if test "${SERVICE_PID_SCENARIO:-}" = decoy; then cat /fixture/clamd-decoy-pid; else cat /fixture/clamd-main-pid; fi
    exit 0
    ;;
esac
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

# The root-only contract must reject disabled/ambiguous VERSION support and
# every configured TCP listener. The unprivileged runner never parses this
# operator-owned daemon configuration.
chmod 0664 /etc/clamav/clamd.conf
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0644 /etc/clamav/clamd.conf
chown clamav:root /etc/clamav/clamd.conf
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
chown root:root /etc/clamav/clamd.conf
ln /etc/clamav/clamd.conf /etc/clamav/clamd.conf.extra-link
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
rm /etc/clamav/clamd.conf.extra-link
sed -i 's/^EnableVersionCommand yes$/EnableVersionCommand no/' /etc/clamav/clamd.conf
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
sed -i 's/^EnableVersionCommand no$/EnableVersionCommand yes/' /etc/clamav/clamd.conf
printf '%s\n' 'EnableVersionCommand yes' >> /etc/clamav/clamd.conf
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
sed -i '$d' /etc/clamav/clamd.conf
printf '%s\n' 'TCPSocket 3310' >> /etc/clamav/clamd.conf
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
sed -i '$d' /etc/clamav/clamd.conf
env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null
touch /fixture/clamd-version-disabled
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
rm /fixture/clamd-version-disabled
env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null

# The root-only gate observes both the effective canonical socket unit and live
# clamd-owned TCP listeners. Safe file content alone must never create a false
# green result for a stale daemon instance or a TCP socket-activation drop-in.
for socket_unit_scenario in tcp wrong_unix datagram masked_active; do
  if env -i PATH="$contract_path" SOCKET_UNIT_SCENARIO="$socket_unit_scenario" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
done
env -i PATH="$contract_path" SOCKET_UNIT_SCENARIO=not_found /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null
env -i PATH="$contract_path" SOCKET_UNIT_SCENARIO=masked /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null

# A clamd-named process that systemd reports as MainPID is insufficient when a
# different process owns the canonical Unix listener.
cp /usr/bin/perl /fixture/bin/clamd-decoy
/fixture/bin/clamd-decoy -e 'sleep 300' &
decoy_fixture_pid=$!
printf '%s\n' "$decoy_fixture_pid" > /fixture/clamd-decoy-pid
if env -i PATH="$contract_path" SERVICE_PID_SCENARIO=decoy /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
kill "$decoy_fixture_pid"
wait "$decoy_fixture_pid" 2>/dev/null || true
decoy_fixture_pid=''

rm -f /fixture/clamd-tcp-ready
/fixture/bin/clamd -MIO::Socket::INET -MSocket=SOCK_STREAM -e '
  my $socket = IO::Socket::INET->new(
    LocalAddr => "127.0.0.1",
    LocalPort => 0,
    Proto => "tcp",
    Type => SOCK_STREAM,
    Listen => 1,
  ) or die "cannot bind TCP fixture\n";
  open(my $ready, ">", "/fixture/clamd-tcp-ready") or die "cannot signal TCP fixture\n";
  close($ready);
  sleep 300;
' &
tcp_fixture_pid=$!
for _ in $(seq 1 50); do
  test ! -e /fixture/clamd-tcp-ready || break
  sleep 0.02
done
test -e /fixture/clamd-tcp-ready
if env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null 2>&1; then exit 1; fi
kill "$tcp_fixture_pid"
wait "$tcp_fixture_pid" 2>/dev/null || true
tcp_fixture_pid=''
rm -f /fixture/clamd-tcp-ready
env -i PATH="$contract_path" /bin/bash /repo/scripts/check-staging-root-contract.sh >/dev/null

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

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
install -o clamav -g clamav -m 0660 /dev/null /run/clamav/clamd.ctl
for dependency in gh pg_restore python3 node; do
  printf '#!/bin/sh\nexit 0\n' > "/fixture/bin/$dependency"
  chmod 0755 "/fixture/bin/$dependency"
done
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
chmod 0755 /fixture/bin/openssl /fixture/bin/systemctl /fixture/bin/sudo

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

# Execute-only traversal, a runtime-group grant or broader sudo must not pass.
chmod 0711 /etc/fieldgrid
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
chmod 0700 /etc/fieldgrid
usermod --append --groups fieldgrid fieldgrid-runner
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
gpasswd --delete fieldgrid-runner fieldgrid >/dev/null
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" SUDO_SCENARIO=broad DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" SUDO_SCENARIO=password-extra DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi
groupadd docker
usermod --append --groups docker fieldgrid-runner
if runuser -u fieldgrid-runner -- /usr/bin/env -i PATH="$contract_path" DEPLOY_TARGET=staging DEPLOY_ROOT=/opt/fieldgrid/staging SERVICE_NAME=fieldgrid@staging.service CLAMAV_ENABLED=true CLAMAV_SOCKET=/run/clamav/clamd.ctl /bin/bash /fixture/check-staging-runner-contract.sh >/dev/null 2>&1; then exit 1; fi

echo 'Real Linux root/runner directory and identity contracts verified.'
CONTAINER

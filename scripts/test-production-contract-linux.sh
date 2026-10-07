#!/usr/bin/env bash
set -euo pipefail
# Test real UID/GID enforcement inside a disposable container, never on the VPS.
docker run --rm --interactive \
  debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251 \
  /bin/bash -se <<'CONTAINER'
set -euo pipefail
for account in fieldgrid fieldgrid-runner fieldgrid-production fieldgrid-production-runner clamav; do
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$account"
done
usermod -aG clamav fieldgrid
usermod -aG clamav fieldgrid-production
install -d -o root -g root -m 0700 /etc/fieldgrid
for environment in staging production; do
  runtime=fieldgrid
  runner=fieldgrid-runner
  if [[ "$environment" = production ]]; then runtime=fieldgrid-production; runner=fieldgrid-production-runner; fi
  root="/opt/fieldgrid/$environment"
  install -d -o root -g root -m 0711 "$root"
  install -d -o "$runner" -g "$runner" -m 0700 "$root/incoming"
  install -d -o root -g "$runtime" -m 0750 "$root/shared" "$root/releases"
  install -d -o root -g root -m 0700 "$root/backups"
  printf '%s\n' 'FICTITIOUS_RUNTIME="no-real-credentials"' > "$root/shared/runtime.env"
  chown "root:$runtime" "$root/shared/runtime.env"
  chmod 0640 "$root/shared/runtime.env"
  printf '%s\n' 'FICTITIOUS_ROOT_ONLY_KEY' > "/etc/fieldgrid/$environment-handoff.key"
  chmod 0600 "/etc/fieldgrid/$environment-handoff.key"
  runuser -u "$runtime" -- test -r "$root/shared/runtime.env"
  runuser -u "$runtime" -- test ! -w "$root/shared/runtime.env"
  runuser -u "$runner" -- /bin/sh -c 'touch "$1/probe"; rm "$1/probe"' _ "$root/incoming"
done
for account in fieldgrid fieldgrid-runner fieldgrid-production fieldgrid-production-runner; do
  for environment in staging production; do
    root="/opt/fieldgrid/$environment"
    own_runtime=fieldgrid
    own_runner=fieldgrid-runner
    if [[ "$environment" = production ]]; then own_runtime=fieldgrid-production; own_runner=fieldgrid-production-runner; fi
    if [[ "$account" != "$own_runtime" ]]; then
      for path in "$root/shared" "$root/releases"; do
        runuser -u "$account" -- test ! -x "$path"
        runuser -u "$account" -- test ! -r "$path"
        runuser -u "$account" -- test ! -w "$path"
      done
      runuser -u "$account" -- test ! -r "$root/shared/runtime.env"
    fi
    if [[ "$account" != "$own_runner" ]]; then
      runuser -u "$account" -- test ! -x "$root/incoming"
      runuser -u "$account" -- test ! -w "$root/incoming"
    fi
    runuser -u "$account" -- test ! -x "$root/backups"
    runuser -u "$account" -- test ! -r "/etc/fieldgrid/$environment-handoff.key"
  done
done
[[ "$(id -nG fieldgrid-runner)" = fieldgrid-runner ]]
[[ "$(id -nG fieldgrid-production-runner)" = fieldgrid-production-runner ]]
echo 'Linux enforces separate staging/production runtime, runner, incoming, backup and key access.'
CONTAINER

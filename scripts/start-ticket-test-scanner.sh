#!/usr/bin/env bash
set -euo pipefail
# CI/local fixture service only. Never install a daemon on staging/production.
test "${DEPLOY_TARGET:-local}" = local
ticket_scanner_image='clamav/clamav@sha256:ebec5bc138401b36ae987caa1a3fa3c3b2a21ed3d51f0bfa5852825e663e67b0'
ticket_scanner_dir="$(mktemp -d /tmp/fieldgrid-ticket-ci.XXXXXX)"
mkdir "${ticket_scanner_dir}/socket"
ticket_scanner_user="$(id -u):$(id -g)"
if [[ "$(docker info --format '{{json .SecurityOptions}}')" == *rootless* ]]; then
  ticket_scanner_user='0:0'
fi
docker pull "$ticket_scanner_image"
docker volume create fieldgrid-ticket-ci-definitions
docker run --rm --name fieldgrid-ticket-ci-update \
  --mount source=fieldgrid-ticket-ci-definitions,target=/var/lib/clamav \
  --entrypoint freshclam "$ticket_scanner_image" --stdout
docker run -d --name fieldgrid-ticket-ci-scanner \
  --user "$ticket_scanner_user" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 3g --pids-limit 64 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --mount source=fieldgrid-ticket-ci-definitions,target=/var/lib/clamav,readonly \
  --mount "type=bind,source=$(pwd)/deploy/clamd-ticket-test.conf,target=/etc/clamav/clamd.conf,readonly" \
  --mount "type=bind,source=${ticket_scanner_dir}/socket,target=/socket" \
  --entrypoint clamd "$ticket_scanner_image" --foreground --config-file=/etc/clamav/clamd.conf
export CLAMAV_ENABLED=true
export CLAMAV_SOCKET="${ticket_scanner_dir}/socket/clamd.sock"
for attempt in $(seq 1 90); do
  if test -S "$CLAMAV_SOCKET"; then break; fi
  test "$(docker inspect fieldgrid-ticket-ci-scanner --format '{{.State.Running}}')" = true
  sleep 1
done
pnpm exec tsx scripts/check-ticket-scanner.ts
if test -n "${GITHUB_ENV:-}"; then
  printf 'CLAMAV_ENABLED=true\nCLAMAV_SOCKET=%s\n' "$CLAMAV_SOCKET" >> "$GITHUB_ENV"
else
  printf 'Local test scanner ready; CLAMAV_ENABLED=true CLAMAV_SOCKET=%s\n' "$CLAMAV_SOCKET"
fi

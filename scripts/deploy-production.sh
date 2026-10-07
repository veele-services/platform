#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ROOT:?DEPLOY_ROOT ontbreekt}"
: "${RELEASE_SHA:?RELEASE_SHA ontbreekt}"
: "${SERVICE_NAME:?SERVICE_NAME ontbreekt}"
: "${HEALTHCHECK_URL:?HEALTHCHECK_URL ontbreekt}"

case "$DEPLOY_ROOT" in /|/home|/opt|/var) echo "Onveilig DEPLOY_ROOT" >&2; exit 2;; esac
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Ongeldige release-SHA" >&2; exit 2; }
[[ "$DEPLOY_TARGET" = production ]] || { echo "Deze activator is uitsluitend voor production" >&2; exit 2; }
[[ "$DEPLOY_ROOT" = /opt/fieldgrid/production && "$SERVICE_NAME" = fieldgrid@production.service && "$HEALTHCHECK_URL" = https://fieldgrid.nl/api/healthz ]] || { echo "Onjuiste productie-identiteit" >&2; exit 2; }
inbox="$DEPLOY_ROOT/incoming/$RELEASE_SHA"
artifact="${RELEASE_ARTIFACT_PATH:?RELEASE_ARTIFACT_PATH ontbreekt}"
release_bundle="${RELEASE_ATTESTATION_PATH:?RELEASE_ATTESTATION_PATH ontbreekt}"
runtime="${RUNTIME_ENVELOPE_PATH:?RUNTIME_ENVELOPE_PATH ontbreekt}"
runtime_bundle="${RUNTIME_ATTESTATION_PATH:?RUNTIME_ATTESTATION_PATH ontbreekt}"
backup="${BACKUP_ENVELOPE_PATH:?BACKUP_ENVELOPE_PATH ontbreekt}"
backup_bundle="${BACKUP_ATTESTATION_PATH:?BACKUP_ATTESTATION_PATH ontbreekt}"
for input in "$artifact" "$release_bundle" "$runtime" "$runtime_bundle" "$backup" "$backup_bundle"; do
  [[ -f "$input" && ! -L "$input" ]] || { echo "Releasehandoff is incompleet" >&2; exit 2; }
done
mkdir -p "$inbox"
chmod 0700 "$DEPLOY_ROOT/incoming" "$inbox"
install -m 0600 "$artifact" "$inbox/release.tar.gz"
install -m 0600 "$release_bundle" "$inbox/release.attestation.json"
install -m 0600 "$runtime" "$inbox/runtime.env.cms"
install -m 0600 "$runtime_bundle" "$inbox/runtime.attestation.json"
install -m 0600 "$backup" "$inbox/backup.dump.cms"
install -m 0600 "$backup_bundle" "$inbox/backup.attestation.json"
request="$DEPLOY_ROOT/incoming/request"
printf '%s\n' "$RELEASE_SHA" > "$request"
chmod 0600 "$request"
sudo --non-interactive /usr/local/sbin/fieldgrid-install-production-release

if ! node scripts/verify-production-healthcheck.mjs; then
  # Security migrations are forward-only. An older web release may no longer
  # satisfy their authorization, scanning and delivery contracts. Keep the
  # exact candidate selected for diagnosis and a forward fix; never restore a
  # known older binary automatically after the database has advanced.
  echo "Healthcheck faalde; automatische coderollback is na forward-migraties geblokkeerd" >&2
  exit 1
fi
echo "Release $RELEASE_SHA actief en gezond."

#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_SHA:?RELEASE_SHA ontbreekt}"
: "${RELEASE_ARTIFACT_PATH:?RELEASE_ARTIFACT_PATH ontbreekt}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Ongeldige release-SHA" >&2; exit 2; }
[[ -f .next/standalone/server.js ]] || { echo "Standalone build ontbreekt" >&2; exit 2; }

artifact_parent="$(dirname "$RELEASE_ARTIFACT_PATH")"
mkdir -p "$artifact_parent"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/release/.next"
rsync -aL --delete .next/standalone/ "$work/release/"
rsync -aL --delete .next/static/ "$work/release/.next/static/"
rsync -aL --delete public/ "$work/release/public/"
install -m 0440 scripts/run-worker.mjs "$work/release/worker-client.mjs"
install -m 0440 scripts/check-clamav-socket.mjs "$work/release/clamav-preflight.mjs"

# Stable metadata makes a digest comparison meaningful while the attestation
# binds the resulting bytes to the protected workflow and exact source SHA.
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --pax-option=delete=atime,delete=ctime \
  -C "$work/release" -cf - . | gzip -n > "$RELEASE_ARTIFACT_PATH"
chmod 0600 "$RELEASE_ARTIFACT_PATH"
echo "Release-artifact voor ${RELEASE_SHA:0:12} opgebouwd."

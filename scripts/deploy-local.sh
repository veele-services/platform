#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ROOT:?DEPLOY_ROOT ontbreekt}"
: "${RELEASE_SHA:?RELEASE_SHA ontbreekt}"
: "${SERVICE_NAME:?SERVICE_NAME ontbreekt}"
: "${HEALTHCHECK_URL:?HEALTHCHECK_URL ontbreekt}"

case "$DEPLOY_ROOT" in /|/home|/opt|/var) echo "Onveilig DEPLOY_ROOT" >&2; exit 2;; esac
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Ongeldige release-SHA" >&2; exit 2; }
[[ -f .next/standalone/server.js ]] || { echo "Standalone build ontbreekt" >&2; exit 2; }

release_path="$DEPLOY_ROOT/releases/$RELEASE_SHA"
previous_target=""
if [[ -L "$DEPLOY_ROOT/current" ]]; then previous_target="$(readlink "$DEPLOY_ROOT/current")"; fi
mkdir -p "$release_path/.next"
rsync -a --delete .next/standalone/ "$release_path/"
rsync -a --delete .next/static/ "$release_path/.next/static/"
rsync -a --delete public/ "$release_path/public/"
printf '%s\n' "$RELEASE_SHA" > "$release_path/.release-sha"
ln -sfn "$release_path" "$DEPLOY_ROOT/current.next"
mv -Tf "$DEPLOY_ROOT/current.next" "$DEPLOY_ROOT/current"
sudo --non-interactive systemctl restart "$SERVICE_NAME"

if ! node scripts/verify-healthcheck.mjs; then
  if [[ -n "$previous_target" && -d "$previous_target" ]]; then
    ln -sfn "$previous_target" "$DEPLOY_ROOT/current.next"
    mv -Tf "$DEPLOY_ROOT/current.next" "$DEPLOY_ROOT/current"
    sudo --non-interactive systemctl restart "$SERVICE_NAME"
  fi
  echo "Healthcheck faalde; vorige coderelease hersteld" >&2
  exit 1
fi
echo "Release $RELEASE_SHA actief en gezond."

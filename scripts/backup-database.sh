#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL ontbreekt}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT ontbreekt}"
: "${RELEASE_SHA:?RELEASE_SHA ontbreekt}"
case "$DEPLOY_ROOT" in /|/home|/opt|/var) echo "Onveilig DEPLOY_ROOT" >&2; exit 2;; esac
backup_dir="$DEPLOY_ROOT/backups"
mkdir -p "$backup_dir"
umask 077
pg_dump --dbname "$BACKUP_DATABASE_URL" --format=custom --no-owner --no-privileges --file "$backup_dir/pre-${RELEASE_SHA}.dump"
pg_restore --list "$backup_dir/pre-${RELEASE_SHA}.dump" >/dev/null
echo "Backup gemaakt en leesbaar gevalideerd."

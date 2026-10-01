#!/usr/bin/env bash
set -euo pipefail

# The adapter validates the exact staging project before any filesystem or
# network work. Credentials never appear in pg_dump command arguments/logs.
exec pnpm exec tsx scripts/backup-database.ts

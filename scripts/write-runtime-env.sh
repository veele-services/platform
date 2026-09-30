#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ROOT:?DEPLOY_ROOT ontbreekt}"
case "$DEPLOY_ROOT" in /|/home|/opt|/var) echo "Onveilig DEPLOY_ROOT" >&2; exit 2;; esac

target="$DEPLOY_ROOT/shared/fieldgrid.env"
mkdir -p "$(dirname "$target")"
temporary="$(mktemp "${target}.tmp.XXXXXX")"
chmod 600 "$temporary"
trap 'rm -f "$temporary"' EXIT

write_value() {
  local key="$1"
  local value="${!key-}"
  [[ -z "$value" ]] && return 0
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || { echo "Ongeldige regelovergang in $key" >&2; exit 2; }
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$value" >> "$temporary"
}

runtime_keys=(
  NODE_ENV APP_ENV DEPLOY_TARGET APP_URL HOSTNAME PORT LOG_LEVEL RELEASE_SHA DEPLOYMENT_VERSION
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
  EXPECTED_SUPABASE_PROJECT_REF FORBIDDEN_SUPABASE_PROJECT_REF
  MOLLIE_API_KEY MOLLIE_WEBHOOK_URL
  SENDGRID_API_KEY SENDGRID_FROM_EMAIL SENDGRID_FROM_NAME SENDGRID_API_BASE
  GOOGLE_MAPS_SERVER_API_KEY GOOGLE_ROUTES_ENABLED
  OPENROUTESERVICE_API_KEY OPENROUTESERVICE_BASE_URL ROUTING_PROVIDER ROUTING_CACHE_DAYS
  ROUTING_MATRIX_MINUTE_LIMIT ROUTING_MATRIX_DAY_LIMIT ROUTING_DIRECTIONS_MINUTE_LIMIT ROUTING_DIRECTIONS_DAY_LIMIT
  NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT
  ADMIN_API_SECRET NOTIFICATION_WORKER_LIMIT NOTIFICATION_WORKER_MAX_ATTEMPTS
  NOTIFICATION_WORKER_BASE_RETRY_SECONDS NOTIFICATION_WORKER_MAX_RETRY_SECONDS
)
for key in "${runtime_keys[@]}"; do write_value "$key"; done

mv -f "$temporary" "$target"
trap - EXIT
echo "Runtime-omgeving atomisch bijgewerkt."

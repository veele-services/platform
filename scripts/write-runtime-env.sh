#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP ontbreekt}"
: "${RUNTIME_ENV_OUTPUT_PATH:?RUNTIME_ENV_OUTPUT_PATH ontbreekt}"
runner_temp="$(realpath -m -- "$RUNNER_TEMP")"
target="$(realpath -m -- "$RUNTIME_ENV_OUTPUT_PATH")"
[[ "$runner_temp" != / && "$target" = "$runner_temp/fieldgrid-staging-runtime.env" ]] || { echo "Onveilig runtime-uitvoerpad" >&2; exit 2; }
temporary="$(mktemp "$runner_temp/fieldgrid-runtime.XXXXXX")"
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
  SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY SUPABASE_SEND_EMAIL_HOOK_SECRET MAIL_MARKETING_ENABLED
  GOOGLE_MAPS_SERVER_API_KEY GOOGLE_ROUTES_ENABLED
  OPENROUTESERVICE_API_KEY OPENROUTESERVICE_BASE_URL ROUTING_PROVIDER ROUTING_CACHE_DAYS
  ROUTING_MATRIX_MINUTE_LIMIT ROUTING_MATRIX_DAY_LIMIT ROUTING_DIRECTIONS_MINUTE_LIMIT ROUTING_DIRECTIONS_DAY_LIMIT
  NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT
  ADMIN_API_SECRET NOTIFICATION_WORKER_LIMIT NOTIFICATION_WORKER_MAX_ATTEMPTS
  NOTIFICATION_WORKER_BASE_RETRY_SECONDS NOTIFICATION_WORKER_MAX_RETRY_SECONDS
  CLAMAV_ENABLED CLAMAV_SOCKET CLAMAV_TIMEOUT_MS CLAMAV_MAX_DATABASE_AGE_HOURS
)
for key in "${runtime_keys[@]}"; do write_value "$key"; done

mv -f "$temporary" "$target"
trap - EXIT
echo "Runtime-omgeving gemaakt voor versleutelde overdracht."

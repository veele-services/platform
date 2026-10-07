#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP ontbreekt}"
: "${PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64:?PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64 ontbreekt}"
[[ "${DEPLOY_TARGET:-}" = production ]] || { echo "Handoff vereist productie" >&2; exit 2; }
[[ "$#" = 2 ]] || { echo "Gebruik: encrypt-production-handoff <bron> <doel>" >&2; exit 2; }
runner_temp="$(realpath -m -- "$RUNNER_TEMP")"
source_path="$(realpath -e -- "$1")"
target_path="$(realpath -m -- "$2")"
[[ "$runner_temp" != / && "$source_path" = "$runner_temp/"* && "$target_path" = "$runner_temp/"* ]] || { echo "Ongeldig handoffpad" >&2; exit 2; }
[[ -f "$source_path" && ! -L "$source_path" && ! -e "$target_path" ]] || { echo "Ongeldige handoffbron of bestaand doel" >&2; exit 2; }
certificate="$(mktemp "$runner_temp/fieldgrid-handoff-cert.XXXXXX.pem")"
trap 'rm -f -- "$certificate"' EXIT
printf '%s' "$PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64" | base64 --decode > "$certificate"
chmod 0600 "$certificate"
openssl x509 -in "$certificate" -noout -checkend 86400 >/dev/null
openssl cms -encrypt -binary -aes-256-cbc -in "$source_path" -outform DER -out "$target_path" "$certificate"
chmod 0600 "$target_path"
rm -f -- "$source_path"
echo "Handoff versleuteld zonder inhoud te loggen."

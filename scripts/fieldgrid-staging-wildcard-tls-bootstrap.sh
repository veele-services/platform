#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CADDY_SOURCE="$REPO_ROOT/ops/caddy/fieldgrid-website-staging.caddy"
CADDY_DROPIN_SOURCE="$REPO_ROOT/ops/systemd/caddy.service.d/fieldgrid-cloudflare-dns.conf"
CADDY_VALIDATION_SOURCE="$REPO_ROOT/ops/systemd/fieldgrid-caddy-validate.service"
SUDOERS_SOURCE="$REPO_ROOT/ops/sudoers/veele-staging-website-stack"

MODE=""
SOURCE_DIR=""
EXPECTED_SHA=""
CADDYFILE="${FIELDGRID_CADDYFILE:-/etc/caddy/Caddyfile}"
CADDY_SNIPPET="/etc/caddy/fieldgrid.d/fieldgrid-website-staging.caddy"
CADDY_DROPIN="/etc/systemd/system/caddy.service.d/fieldgrid-cloudflare-dns.conf"
CADDY_VALIDATION_UNIT="/etc/systemd/system/fieldgrid-caddy-validate.service"
CLOUDFLARE_ENV="/etc/caddy/fieldgrid-cloudflare.env"
SUDOERS_TARGET="/etc/sudoers.d/veele-staging-website-stack"
IMPORT_LINE="import /etc/caddy/fieldgrid.d/*.caddy"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --install) MODE="install"; shift ;;
    --source-dir) SOURCE_DIR="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() {
  echo "fieldgrid-staging-wildcard-tls-bootstrap: $1" >&2
  exit 1
}

for source in \
  "$CADDY_SOURCE" \
  "$CADDY_DROPIN_SOURCE" \
  "$CADDY_VALIDATION_SOURCE" \
  "$SUDOERS_SOURCE"; do
  [ -f "$source" ] || fail "required source asset is missing: $source"
  if grep -Eiq \
    '/var/www/veele/production|eedbf033ec08a12411760acf8ea7f5d5acf8cc20' \
    "$source"; then
    fail "staging bootstrap asset contains a production marker"
  fi
done

grep -Fq "*.staging.fieldgrid.nl" "$CADDY_SOURCE" ||
  fail "wildcard staging host is missing"
grep -Fq "dns cloudflare {env.CLOUDFLARE_API_TOKEN}" "$CADDY_SOURCE" ||
  fail "runtime Cloudflare token placeholder is missing"
grep -Fq "EnvironmentFile=/etc/caddy/fieldgrid-cloudflare.env" \
  "$CADDY_DROPIN_SOURCE" ||
  fail "Caddy environment drop-in is incomplete"
grep -Fq \
  "ExecStart=/usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile" \
  "$CADDY_VALIDATION_SOURCE" ||
  fail "Caddy validation unit is incomplete"
grep -Fq "/usr/bin/systemctl start fieldgrid-caddy-validate.service" \
  "$SUDOERS_SOURCE" ||
  fail "Caddy validation sudo capability is missing"
if grep -Eq \
  'CLOUDFLARE_API_TOKEN[[:space:]]*=[[:space:]]*[A-Za-z0-9_-]+' \
  "$CADDY_SOURCE" "$CADDY_DROPIN_SOURCE" "$CADDY_VALIDATION_SOURCE"; then
  fail "Cloudflare token material must not be stored in the repository"
fi

if [ "$MODE" = "check" ]; then
  echo "fieldgrid-staging-wildcard-tls-bootstrap: contract check passed"
  exit 0
fi
[ "$MODE" = "install" ] || fail "use --check or --install"
[ "$(id -u)" = "0" ] || fail "--install must run as root"
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] ||
  fail "--expected-sha must be a full lowercase commit SHA"
[ -d "$SOURCE_DIR" ] || fail "--source-dir is required"
[ "$SOURCE_DIR" = "/var/www/veele/staging/current" ] ||
  fail "source must be the active staging release"
[ -r "$SOURCE_DIR/.fieldgrid-release-sha" ] ||
  fail "active staging release marker is missing"
ACTUAL_SHA="$(tr -d '\r\n' < "$SOURCE_DIR/.fieldgrid-release-sha")"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] ||
  fail "active staging release differs from the approved SHA"

CADDY_BINARY="/usr/bin/caddy"
[ -x "$CADDY_BINARY" ] || fail "/usr/bin/caddy is unavailable"
"$CADDY_BINARY" list-modules |
  grep -Fxq "dns.providers.cloudflare" ||
  fail "Caddy Cloudflare DNS module is unavailable"

install -d -o root -g root -m 0755 /etc/caddy

CANONICAL_TOKEN=""
LEGACY_TOKEN=""
if [ -e "$CLOUDFLARE_ENV" ]; then
  if [ ! -f "$CLOUDFLARE_ENV" ] || [ -L "$CLOUDFLARE_ENV" ]; then
    fail "$CLOUDFLARE_ENV must be a regular file"
  fi
  [ "$(stat -c '%U:%G:%a' "$CLOUDFLARE_ENV")" = "root:root:600" ] ||
    fail "$CLOUDFLARE_ENV must be root:root mode 600"
  CANONICAL_TOKEN_COUNT="$(
    grep -Ec '^CLOUDFLARE_API_TOKEN=' "$CLOUDFLARE_ENV" || true
  )"
  LEGACY_TOKEN_COUNT="$(
    grep -Ec '^CF_API_TOKEN=' "$CLOUDFLARE_ENV" || true
  )"
  if [ "$CANONICAL_TOKEN_COUNT" -gt 1 ] ||
    [ "$LEGACY_TOKEN_COUNT" -gt 1 ]; then
    fail "$CLOUDFLARE_ENV contains duplicate token aliases"
  fi
  CANONICAL_TOKEN="$(
    sed -nE 's/^CLOUDFLARE_API_TOKEN=(.+)$/\1/p' "$CLOUDFLARE_ENV" |
      head -n 1
  )"
  LEGACY_TOKEN="$(
    sed -nE 's/^CF_API_TOKEN=(.+)$/\1/p' "$CLOUDFLARE_ENV" |
      head -n 1
  )"
fi
if [ -n "$CANONICAL_TOKEN" ] &&
  [ -n "$LEGACY_TOKEN" ] &&
  [ "$CANONICAL_TOKEN" != "$LEGACY_TOKEN" ]; then
  fail "$CLOUDFLARE_ENV contains conflicting token aliases"
fi
CLOUDFLARE_TOKEN="${CANONICAL_TOKEN:-$LEGACY_TOKEN}"

if [ -z "$CLOUDFLARE_TOKEN" ]; then
  RUNNING_CADDY_PID="$(systemctl show caddy -p MainPID --value)"
  if [[ "$RUNNING_CADDY_PID" =~ ^[1-9][0-9]*$ ]] &&
    [ -r "/proc/$RUNNING_CADDY_PID/environ" ]; then
    CANONICAL_TOKEN="$(
      tr '\0' '\n' < "/proc/$RUNNING_CADDY_PID/environ" |
        sed -nE 's/^CLOUDFLARE_API_TOKEN=(.+)$/\1/p' |
        head -n 1
    )"
    LEGACY_TOKEN="$(
      tr '\0' '\n' < "/proc/$RUNNING_CADDY_PID/environ" |
        sed -nE 's/^CF_API_TOKEN=(.+)$/\1/p' |
        head -n 1
    )"
    if [ -n "$CANONICAL_TOKEN" ] &&
      [ -n "$LEGACY_TOKEN" ] &&
      [ "$CANONICAL_TOKEN" != "$LEGACY_TOKEN" ]; then
      fail "running Caddy contains conflicting token aliases"
    fi
    CLOUDFLARE_TOKEN="${CANONICAL_TOKEN:-$LEGACY_TOKEN}"
  fi
  if [ -z "$CLOUDFLARE_TOKEN" ]; then
    read -r -s -p "Cloudflare API token: " CLOUDFLARE_TOKEN
    printf '\n'
  fi
fi
[[ "$CLOUDFLARE_TOKEN" =~ ^[A-Za-z0-9_-]{20,}$ ]] ||
  fail "Cloudflare API token is missing or malformed"

BACKUP_DIR="$(mktemp -d /root/fieldgrid-caddy-bootstrap.XXXXXX)"
ROLLBACK_REQUIRED="1"
TOKEN_ENV_TEMP=""

backup_target() {
  local target="$1"
  local key="$2"
  if [ -e "$target" ]; then
    cp -a "$target" "$BACKUP_DIR/$key"
    printf 'present\n' > "$BACKUP_DIR/$key.state"
  else
    printf 'missing\n' > "$BACKUP_DIR/$key.state"
  fi
}

restore_target() {
  local target="$1"
  local key="$2"
  [ -f "$BACKUP_DIR/$key.state" ] || return 0
  if [ "$(cat "$BACKUP_DIR/$key.state")" = "present" ]; then
    install -d -o root -g root -m 0755 "$(dirname "$target")"
    cp -a "$BACKUP_DIR/$key" "$target"
  else
    rm -f "$target"
  fi
}

rollback() {
  local code="$?"
  trap - ERR EXIT
  set +e
  if [ "$ROLLBACK_REQUIRED" = "1" ]; then
    restore_target "$CADDYFILE" "Caddyfile"
    restore_target "$CADDY_SNIPPET" "staging-snippet"
    restore_target "$CADDY_DROPIN" "cloudflare-dropin"
    restore_target "$CADDY_VALIDATION_UNIT" "validation-unit"
    restore_target "$SUDOERS_TARGET" "sudoers"
    restore_target "$CLOUDFLARE_ENV" "cloudflare-env"
    systemctl daemon-reload
    systemctl restart caddy
  fi
  if [ -n "$TOKEN_ENV_TEMP" ]; then
    rm -f "$TOKEN_ENV_TEMP"
  fi
  rm -rf "$BACKUP_DIR"
  exit "$code"
}
trap rollback ERR EXIT

backup_target "$CADDYFILE" "Caddyfile"
backup_target "$CADDY_SNIPPET" "staging-snippet"
backup_target "$CADDY_DROPIN" "cloudflare-dropin"
backup_target "$CADDY_VALIDATION_UNIT" "validation-unit"
backup_target "$SUDOERS_TARGET" "sudoers"
backup_target "$CLOUDFLARE_ENV" "cloudflare-env"

TOKEN_ENV_TEMP="$(mktemp /etc/caddy/.fieldgrid-cloudflare.env.XXXXXX)"
{
  printf 'CLOUDFLARE_API_TOKEN=%s\n' "$CLOUDFLARE_TOKEN"
  printf 'CF_API_TOKEN=%s\n' "$CLOUDFLARE_TOKEN"
} > "$TOKEN_ENV_TEMP"
chown root:root "$TOKEN_ENV_TEMP"
chmod 0600 "$TOKEN_ENV_TEMP"
mv -f "$TOKEN_ENV_TEMP" "$CLOUDFLARE_ENV"
TOKEN_ENV_TEMP=""
[ "$(stat -c '%U:%G:%a' "$CLOUDFLARE_ENV")" = "root:root:600" ] ||
  fail "$CLOUDFLARE_ENV must be root:root mode 600"
CANONICAL_TOKEN="$(
  sed -nE 's/^CLOUDFLARE_API_TOKEN=(.+)$/\1/p' "$CLOUDFLARE_ENV" |
    head -n 1
)"
LEGACY_TOKEN="$(
  sed -nE 's/^CF_API_TOKEN=(.+)$/\1/p' "$CLOUDFLARE_ENV" |
    head -n 1
)"
if [ "$CANONICAL_TOKEN" != "$CLOUDFLARE_TOKEN" ] ||
  [ "$LEGACY_TOKEN" != "$CLOUDFLARE_TOKEN" ]; then
  fail "$CLOUDFLARE_ENV token aliases were not normalized"
fi
unset \
  CANONICAL_TOKEN \
  CANONICAL_TOKEN_COUNT \
  LEGACY_TOKEN \
  LEGACY_TOKEN_COUNT \
  CLOUDFLARE_TOKEN

visudo -cf "$SUDOERS_SOURCE" >/dev/null
install -d -o root -g root -m 0755 \
  /etc/caddy/fieldgrid.d \
  /etc/systemd/system/caddy.service.d
install -o root -g root -m 0644 "$CADDY_SOURCE" "$CADDY_SNIPPET"
install -o root -g root -m 0644 "$CADDY_DROPIN_SOURCE" "$CADDY_DROPIN"
install -o root -g root -m 0644 \
  "$CADDY_VALIDATION_SOURCE" \
  "$CADDY_VALIDATION_UNIT"
install -o root -g root -m 0440 "$SUDOERS_SOURCE" "$SUDOERS_TARGET"
visudo -cf "$SUDOERS_TARGET" >/dev/null

if ! grep -Fxq "$IMPORT_LINE" "$CADDYFILE"; then
  printf '\n%s\n' "$IMPORT_LINE" >> "$CADDYFILE"
fi

systemctl daemon-reload
systemctl start fieldgrid-caddy-validate.service
systemctl restart caddy
systemctl is-active --quiet caddy ||
  fail "Caddy is not active after validated restart"

PROBE_HOST="unbound-${EXPECTED_SHA:0:12}.staging.fieldgrid.nl"
PROBE_STATUS=""
for _attempt in $(seq 1 18); do
  PROBE_STATUS="$(
    curl --silent --show-error \
      --output /dev/null \
      --write-out '%{http_code}' \
      --max-time 10 \
      --resolve "$PROBE_HOST:443:127.0.0.1" \
      "https://$PROBE_HOST/" ||
      true
  )"
  [ "$PROBE_STATUS" = "404" ] && break
  sleep 5
done
[ "$PROBE_STATUS" = "404" ] ||
  fail "unknown staging subdomain did not complete verified TLS with HTTP 404"

PUBLIC_PROBE_STATUS="$(
  curl --silent --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --max-time 10 \
    "https://$PROBE_HOST/"
)"
[ "$PUBLIC_PROBE_STATUS" = "404" ] ||
  fail "public wildcard DNS/TLS probe did not return HTTP 404"

ROLLBACK_REQUIRED="0"
trap - ERR EXIT
rm -rf "$BACKUP_DIR"
printf 'fieldgrid-staging-wildcard-tls-bootstrap-ok sha=%s probe=%s\n' \
  "$EXPECTED_SHA" \
  "$PROBE_HOST"

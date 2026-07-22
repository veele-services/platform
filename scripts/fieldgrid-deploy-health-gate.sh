#!/usr/bin/env bash
# shellcheck disable=SC2317
set -euo pipefail
umask 027

usage() {
  cat <<'USAGE'
Usage:
  fieldgrid-deploy-health-gate.sh --environment staging --base-dir DIR --release-path DIR --expected-sha SHA [options]

Options:
  --previous-release DIR       Previous current symlink target for rollback.
  --rollback-on-failure        Restore previous symlink, restart services, reload Caddy and verify rollback health.
  --restart-before-check       Restart services and reload Caddy before the new-release health check.
  --evidence-file PATH         Write structured JSON evidence.
  --help                       Show this help.

Configuration:
  FIELDGRID_DEPLOY_SERVICES          Space or comma separated systemd services. Defaults to deploy service env vars.
  FIELDGRID_DEPLOY_PORTS             Space or comma separated localhost ports. Defaults to deploy port env vars.
  FIELDGRID_DEPLOY_LOCAL_ENDPOINTS   Newline separated name|url|mode entries.
  FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS  Newline separated name|url|mode entries.
  FIELDGRID_DEPLOY_HEALTH_ATTEMPTS   Retry attempts per endpoint/service/port. Default: 12.
  FIELDGRID_DEPLOY_HEALTH_RETRY_SECONDS  Sleep between attempts. Default: 5.
  FIELDGRID_DEPLOY_CURL_MAX_TIME_SECONDS Curl per-request timeout. Default: 5.

Endpoint modes:
  exact-200     Only HTTP 200 is healthy.
  login         HTTP 200 and explicit login-safe redirects 301, 302, 303, 307 and 308 are healthy.
  api-root-404  Only the expected API-root HTTP 404 is healthy.
USAGE
}

ENVIRONMENT=""
BASE_DIR=""
RELEASE_PATH=""
EXPECTED_SHA=""
PREVIOUS_RELEASE=""
ROLLBACK_ON_FAILURE="0"
EVIDENCE_FILE=""
EVIDENCE_GROUP="${FIELDGRID_DEPLOY_EVIDENCE_GROUP:-}"
CHECK_EXPECTED_SHA="1"
RESTART_BEFORE_CHECK="0"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --base-dir) BASE_DIR="${2:-}"; shift 2 ;;
    --release-path) RELEASE_PATH="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --previous-release) PREVIOUS_RELEASE="${2:-}"; shift 2 ;;
    --rollback-on-failure) ROLLBACK_ON_FAILURE="1"; shift ;;
    --restart-before-check) RESTART_BEFORE_CHECK="1"; shift ;;
    --evidence-file) EVIDENCE_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
SYSTEMCTL_SUDO="${SYSTEMCTL_SUDO:-}"
SYSTEMCTL_READ_SUDO="${SYSTEMCTL_READ_SUDO:-}"
CURL_BIN="${CURL_BIN:-curl}"
SS_BIN="${SS_BIN:-ss}"
SLEEP_BIN="${SLEEP_BIN:-sleep}"
ATTEMPTS="${FIELDGRID_DEPLOY_HEALTH_ATTEMPTS:-12}"
RETRY_SECONDS="${FIELDGRID_DEPLOY_HEALTH_RETRY_SECONDS:-5}"
CURL_MAX_TIME="${FIELDGRID_DEPLOY_CURL_MAX_TIME_SECONDS:-5}"
CHECKS_FILE="$(mktemp)"
trap 'rm -f "$CHECKS_FILE"' EXIT HUP INT TERM

json_escape() {
  printf '%s' "$1" | tr '\r\n' '  ' | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

sanitize_url() {
  printf '%s' "$1" | sed -E 's#(https?://)([^/@]+@)?([^/?#]+).*#\1\3#'
}

record_check() {
  local name="$1"
  local status="$2"
  local detail="$3"
  printf '{"name":"%s","status":"%s","detail":"%s"}\n' \
    "$(json_escape "$name")" \
    "$(json_escape "$status")" \
    "$(json_escape "$detail")" >> "$CHECKS_FILE"
}

join_json_checks() {
  awk 'BEGIN { first=1 } { if (!first) printf ",\n"; first=0; printf "    %s", $0 } END { if (first) printf "" }' "$CHECKS_FILE"
}

write_evidence() {
  status="$1"
  detail="$2"
  rollback_status="${3:-not-requested}"
  if [ -z "$EVIDENCE_FILE" ]; then
    return 0
  fi

  mkdir -p "$(dirname "$EVIDENCE_FILE")"
  current_target=""
  if [ -n "$BASE_DIR" ] && [ -L "$BASE_DIR/current" ]; then
    current_target="$(readlink "$BASE_DIR/current" || true)"
  fi

  attempts_number="$(printf '%s' "$ATTEMPTS" | sed 's/[^0-9].*$//')"
  retry_number="$(printf '%s' "$RETRY_SECONDS" | sed 's/[^0-9].*$//')"
  [ -n "$attempts_number" ] || attempts_number=0
  [ -n "$retry_number" ] || retry_number=0

  evidence_temp="${EVIDENCE_FILE}.$$"
  {
    cat <<JSON
{
  "tool": "fieldgrid-deploy-health-gate",
  "environment": "$(json_escape "$ENVIRONMENT")",
  "status": "$(json_escape "$status")",
  "detail": "$(json_escape "$detail")",
  "rollbackStatus": "$(json_escape "$rollback_status")",
  "baseDir": "$(json_escape "$BASE_DIR")",
  "releasePath": "$(json_escape "$RELEASE_PATH")",
  "expectedSha": "$(json_escape "$EXPECTED_SHA")",
  "previousRelease": "$(json_escape "$PREVIOUS_RELEASE")",
  "currentTarget": "$(json_escape "$current_target")",
  "attempts": $attempts_number,
  "retrySeconds": $retry_number,
  "checks": [
JSON
    join_json_checks
    cat <<'JSON'
  ]
}
JSON
  } > "$evidence_temp"
  chmod 640 "$evidence_temp"
  if [ -n "$EVIDENCE_GROUP" ]; then
    chgrp "$EVIDENCE_GROUP" "$evidence_temp"
  fi
  mv -f "$evidence_temp" "$EVIDENCE_FILE"
}

fail_now() {
  write_evidence "fail" "$1" "${2:-not-requested}"
  echo "fieldgrid-deploy-health-gate: $1" >&2
  exit 1
}

split_words() {
  printf '%s' "$1" | tr ',\n' '  '
}

append_endpoint() {
  local name="$1"
  local url="$2"
  local mode="$3"
  if [ -n "$url" ]; then
    printf '%s|%s|%s\n' "$name" "$url" "$mode"
  fi
}

with_path() {
  local base="$1"
  local path="$2"
  local trimmed
  trimmed="$(printf '%s' "$base" | sed 's#/*$##')"
  printf '%s%s' "$trimmed" "$path"
}

default_services() {
  if [ -n "${FIELDGRID_DEPLOY_SERVICES:-}" ]; then
    split_words "$FIELDGRID_DEPLOY_SERVICES"
  else
    split_words "${BACKOFFICE_SERVICE_NAME:-${SERVICE_NAME:-}} ${PERSONEEL_SERVICE_NAME:-} ${KLANT_SERVICE_NAME:-} ${API_SERVICE_NAME:-}"
  fi
}

default_ports() {
  if [ -n "${FIELDGRID_DEPLOY_PORTS:-}" ]; then
    split_words "$FIELDGRID_DEPLOY_PORTS"
  else
    split_words "${BACKOFFICE_PORT:-${PORT:-}} ${PERSONEEL_PORT:-} ${KLANT_PORT:-} ${API_PORT:-}"
  fi
}

default_local_endpoints() {
  if [ -n "${FIELDGRID_DEPLOY_LOCAL_ENDPOINTS:-}" ]; then
    printf '%s\n' "$FIELDGRID_DEPLOY_LOCAL_ENDPOINTS"
    return 0
  fi

  if [ -n "${BACKOFFICE_PORT:-${PORT:-}}" ]; then
    append_endpoint "local-backoffice" "http://127.0.0.1:${BACKOFFICE_PORT:-$PORT}/login" "login"
  fi
  if [ -n "${PERSONEEL_PORT:-}" ]; then
    append_endpoint "local-personnel" "http://127.0.0.1:${PERSONEEL_PORT}/personeel/healthz" "exact-200"
  fi
  if [ -n "${KLANT_PORT:-}" ]; then
    append_endpoint "local-customer" "http://127.0.0.1:${KLANT_PORT}/klant/healthz" "exact-200"
  fi
  if [ -n "${API_PORT:-}" ]; then
    append_endpoint "local-api-health" "http://127.0.0.1:${API_PORT}/api/healthz" "exact-200"
  fi
}

default_api_root_endpoints() {
  if [ -n "${FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS:-}" ]; then
    printf '%s\n' "$FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS"
    return 0
  fi

  if [ -n "${API_PORT:-}" ]; then
    append_endpoint "local-api-root" "http://127.0.0.1:${API_PORT}/" "api-root-404"
  fi
  if [ -n "${API_PUBLIC_ROOT_URL:-}" ]; then
    append_endpoint "public-api-root" "$API_PUBLIC_ROOT_URL" "api-root-404"
  fi
}

default_public_endpoints() {
  if [ -n "${FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS:-}" ]; then
    printf '%s\n' "$FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS"
    return 0
  fi

  if [ -n "${BACKOFFICE_PUBLIC_LOGIN_URL:-}" ]; then
    append_endpoint "public-backoffice" "$BACKOFFICE_PUBLIC_LOGIN_URL" "login"
  elif [ -n "${BACKOFFICE_PUBLIC_URL:-${APP_URL:-}}" ]; then
    append_endpoint "public-backoffice" "$(with_path "${BACKOFFICE_PUBLIC_URL:-$APP_URL}" "/admin/login")" "login"
  fi
  if [ -n "${PERSONEEL_PUBLIC_HEALTH_URL:-}" ]; then
    append_endpoint "public-personnel" "$PERSONEEL_PUBLIC_HEALTH_URL" "exact-200"
  elif [ -n "${PERSONEEL_PUBLIC_URL:-}" ]; then
    append_endpoint "public-personnel" "$(with_path "$PERSONEEL_PUBLIC_URL" "/personeel/healthz")" "exact-200"
  fi
  if [ -n "${KLANT_PUBLIC_HEALTH_URL:-}" ]; then
    append_endpoint "public-customer" "$KLANT_PUBLIC_HEALTH_URL" "exact-200"
  elif [ -n "${KLANT_PUBLIC_URL:-}" ]; then
    append_endpoint "public-customer" "$(with_path "$KLANT_PUBLIC_URL" "/klant/healthz")" "exact-200"
  fi
  if [ -n "${API_PUBLIC_HEALTH_URL:-}" ]; then
    append_endpoint "public-api-health" "$API_PUBLIC_HEALTH_URL" "exact-200"
  elif [ -n "${API_PUBLIC_URL:-}" ]; then
    append_endpoint "public-api-health" "$(with_path "$API_PUBLIC_URL" "/api/healthz")" "exact-200"
  fi
}

retry() {
  local attempt=1
  while [ "$attempt" -le "$ATTEMPTS" ]; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -lt "$ATTEMPTS" ]; then
      "$SLEEP_BIN" "$RETRY_SECONDS"
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

run_systemctl_write() {
  if [ -n "$SYSTEMCTL_SUDO" ]; then
    "$SYSTEMCTL_SUDO" "$SYSTEMCTL_BIN" "$@"
  else
    "$SYSTEMCTL_BIN" "$@"
  fi
}

run_systemctl_read() {
  if [ -n "$SYSTEMCTL_READ_SUDO" ]; then
    "$SYSTEMCTL_READ_SUDO" "$SYSTEMCTL_BIN" "$@"
  else
    "$SYSTEMCTL_BIN" "$@"
  fi
}

service_is_active() {
  run_systemctl_read is-active --quiet "$1"
}

service_status_detail() {
  local service="$1"
  local output
  local rc
  set +e
  output="$(run_systemctl_read is-active --quiet "$service" 2>&1)"
  rc=$?
  set -e
  printf 'exit=%s stderr=%s' "$rc" "$(json_escape "$output")"
}

check_services() {
  local count=0
  local failed=0
  local service
  for service in $(default_services); do
    [ -n "$service" ] || continue
    count=$((count + 1))
    if retry service_is_active "$service"; then
      record_check "service:$service" "pass" "systemd service is active"
    else
      record_check "service:$service" "fail" "systemd service is not active; $(service_status_detail "$service")"
      failed=1
    fi
  done

  if [ "$count" -ne 4 ]; then
    record_check "services:configured-count" "fail" "expected exactly four configured services; found $count"
    failed=1
  else
    record_check "services:configured-count" "pass" "found exactly $count configured services"
  fi
  return "$failed"
}

port_is_listening() {
  local port="$1"
  "$SS_BIN" -ltn 2>/dev/null | awk -v port="$port" '
    $0 ~ ("[:.]" port "[[:space:]]") { found = 1 }
    END { exit found ? 0 : 1 }
  '
}

check_ports() {
  local count=0
  local failed=0
  local port
  for port in $(default_ports); do
    [ -n "$port" ] || continue
    count=$((count + 1))
    if retry port_is_listening "$port"; then
      record_check "port:$port" "pass" "localhost port is listening"
    else
      record_check "port:$port" "fail" "localhost port is not listening"
      failed=1
    fi
  done

  if [ "$count" -ne 4 ]; then
    record_check "ports:configured-count" "fail" "expected exactly four configured ports; found $count"
    failed=1
  else
    record_check "ports:configured-count" "pass" "found exactly $count configured ports"
  fi
  return "$failed"
}

http_status() {
  "$CURL_BIN" -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX_TIME" "$1"
}

endpoint_is_healthy() {
  local spec="$1"
  local name
  local url
  local mode
  local status
  name="$(printf '%s' "$spec" | awk -F'|' '{ print $1 }')"
  url="$(printf '%s' "$spec" | awk -F'|' '{ print $2 }')"
  mode="$(printf '%s' "$spec" | awk -F'|' '{ print $3 }')"
  status="$(http_status "$url" 2>/dev/null || printf '000')"

  if [ "$mode" = "exact-200" ] && [ "$status" = "200" ]; then
    record_check "endpoint:$name" "pass" "HTTP 200 $(sanitize_url "$url")"
    return 0
  fi

  if [ "$mode" = "login" ]; then
    case "$status" in
      200|301|302|303|307|308)
        record_check "endpoint:$name" "pass" "HTTP $status accepted for auth endpoint $(sanitize_url "$url")"
        return 0
        ;;
    esac
  fi

  if [ "$mode" = "api-root-404" ] && [ "$status" = "404" ]; then
    record_check "endpoint:$name" "pass" "HTTP 404 accepted for API root $(sanitize_url "$url")"
    return 0
  fi

  record_check "endpoint:$name" "fail" "HTTP $status $(sanitize_url "$url")"
  return 1
}

check_endpoint_group() {
  local group_name="$1"
  local specs="$2"
  local required_count="$3"
  local count_mode="${4:-minimum}"
  local failed=0
  local count
  local spec
  local name
  local url
  local mode

  while IFS= read -r spec; do
    [ -n "$spec" ] || continue
    name="$(printf '%s' "$spec" | awk -F'|' '{ print $1 }')"
    url="$(printf '%s' "$spec" | awk -F'|' '{ print $2 }')"
    mode="$(printf '%s' "$spec" | awk -F'|' '{ print $3 }')"
    if [ -z "$name" ] || [ -z "$url" ] || [ -z "$mode" ]; then
      record_check "endpoint:$group_name" "fail" "invalid endpoint spec"
      failed=1
      continue
    fi
    retry endpoint_is_healthy "$spec" || failed=1
  done <<EOF
$specs
EOF

  count="$(printf '%s\n' "$specs" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
  if [ "$count_mode" = "exact" ]; then
    if [ "$count" -ne "$required_count" ]; then
      record_check "endpoints:$group_name-count" "fail" "expected exactly $required_count endpoint(s); found $count"
      failed=1
    else
      record_check "endpoints:$group_name-count" "pass" "found exactly $count endpoint(s)"
    fi
  else
    if [ "$count" -lt "$required_count" ]; then
      record_check "endpoints:$group_name-count" "fail" "expected at least $required_count endpoint(s); found $count"
      failed=1
    else
      record_check "endpoints:$group_name-count" "pass" "found $count endpoint(s)"
    fi
  fi

  return "$failed"
}

verify_release_metadata() {
  local failed=0
  local current_target
  local sha_file
  local actual_sha

  if [ ! -L "$BASE_DIR/current" ]; then
    record_check "symlink:current" "fail" "current is not a symlink"
    failed=1
  else
    current_target="$(readlink "$BASE_DIR/current" || true)"
    if [ "$current_target" = "$RELEASE_PATH" ]; then
      record_check "symlink:current" "pass" "current points at release path"
    else
      record_check "symlink:current" "fail" "current points at $current_target"
      failed=1
    fi
  fi

  if [ ! -d "$RELEASE_PATH" ]; then
    record_check "release:path" "fail" "release path does not exist"
    failed=1
  else
    record_check "release:path" "pass" "release path exists"
  fi

  sha_file="$RELEASE_PATH/.fieldgrid-release-sha"
  if [ ! -f "$sha_file" ]; then
    record_check "release:sha" "fail" "release SHA marker is missing"
    failed=1
  else
    actual_sha="$(sed -n '1p' "$sha_file" | tr -d '[:space:]')"
    if [ "$CHECK_EXPECTED_SHA" != "1" ]; then
      record_check "release:sha" "pass" "release SHA marker exists for rollback release"
    elif [ "$actual_sha" = "$EXPECTED_SHA" ]; then
      record_check "release:sha" "pass" "release SHA marker matches expected SHA"
    else
      record_check "release:sha" "fail" "release SHA marker does not match expected SHA"
      failed=1
    fi
  fi
  return "$failed"
}

run_health_checks() {
  local failed=0
  verify_release_metadata || failed=1
  check_services || failed=1
  check_ports || failed=1
  check_endpoint_group "local" "$(default_local_endpoints)" 4 exact || failed=1
  check_endpoint_group "api-root" "$(default_api_root_endpoints)" 0 || failed=1
  check_endpoint_group "public" "$(default_public_endpoints)" 4 exact || failed=1
  return "$failed"
}

restart_services_and_reload_caddy() {
  local service
  local failed=0
  for service in $(default_services); do
    [ -n "$service" ] || continue
    run_systemctl_write restart "$service" || failed=1
  done
  run_systemctl_write reload caddy || failed=1
  return "$failed"
}

rollback() {
  local current_before_rollback
  local temp_link
  local saved_release
  if [ -z "$PREVIOUS_RELEASE" ]; then
    record_check "rollback:previous-release" "fail" "no previous release was recorded"
    write_evidence "fail" "health gate failed and no previous release was available" "unavailable"
    return 1
  fi

  if [ ! -d "$PREVIOUS_RELEASE" ]; then
    record_check "rollback:previous-release" "fail" "previous release path does not exist"
    write_evidence "fail" "health gate failed and previous release path is missing" "unavailable"
    return 1
  fi

  case "$PREVIOUS_RELEASE" in
    "$BASE_DIR"/releases/*) ;;
    *)
      record_check "rollback:previous-release" "fail" "previous release is outside the release root"
      write_evidence "fail" "health gate failed and previous release path is outside release root" "unavailable"
      return 1
      ;;
  esac

  if [ ! -f "$PREVIOUS_RELEASE/.fieldgrid-release-sha" ]; then
    record_check "rollback:previous-release" "fail" "previous release SHA marker is missing"
    write_evidence "fail" "health gate failed and previous release SHA marker is missing" "unavailable"
    return 1
  fi

  current_before_rollback=""
  if [ -L "$BASE_DIR/current" ]; then
    current_before_rollback="$(readlink "$BASE_DIR/current" || true)"
  fi
  if [ "$current_before_rollback" != "$RELEASE_PATH" ]; then
    record_check "rollback:current" "fail" "current symlink changed before rollback"
    write_evidence "fail" "health gate failed but current no longer points at the failed release" "blocked"
    return 1
  fi

  temp_link="$BASE_DIR/.current.rollback.$$"
  rm -f "$temp_link"
  if ! ln -s "$PREVIOUS_RELEASE" "$temp_link"; then
    record_check "rollback:symlink" "fail" "failed to create temporary rollback symlink"
    write_evidence "fail" "rollback symlink creation failed" "failed"
    return 1
  fi
  if ! mv -Tf "$temp_link" "$BASE_DIR/current"; then
    rm -f "$temp_link"
    record_check "rollback:symlink" "fail" "failed to atomically restore previous release"
    write_evidence "fail" "rollback symlink replacement failed" "failed"
    return 1
  fi
  record_check "rollback:symlink" "pass" "current symlink restored to previous release"

  if restart_services_and_reload_caddy; then
    record_check "rollback:restart" "pass" "services restarted and Caddy reloaded after rollback"
  else
    record_check "rollback:restart" "fail" "service restart or Caddy reload failed during rollback"
    write_evidence "fail" "rollback restart failed" "failed"
    return 1
  fi

  saved_release="$RELEASE_PATH"
  RELEASE_PATH="$PREVIOUS_RELEASE"
  CHECK_EXPECTED_SHA="0"
  if run_health_checks; then
    RELEASE_PATH="$saved_release"
    CHECK_EXPECTED_SHA="1"
    record_check "rollback:health" "pass" "rollback release passed health checks"
    write_evidence "fail" "new release failed health gate; rollback health passed" "pass"
    return 0
  fi
  RELEASE_PATH="$saved_release"
  CHECK_EXPECTED_SHA="1"
  record_check "rollback:health" "fail" "rollback release failed health checks"
  write_evidence "fail" "new release failed health gate and rollback health failed" "failed"
  return 1
}

[ -n "$ENVIRONMENT" ] || fail_now "--environment is required"
if [ "$ENVIRONMENT" != "staging" ]; then
  fail_now "only the staging environment may use the deploy health gate"
fi
[ -n "$BASE_DIR" ] || fail_now "--base-dir is required"
[ -n "$RELEASE_PATH" ] || fail_now "--release-path is required"
[ -n "$EXPECTED_SHA" ] || fail_now "--expected-sha is required"

if [ "$RESTART_BEFORE_CHECK" = "1" ]; then
  if restart_services_and_reload_caddy; then
    record_check "activation:restart" "pass" "services restarted and Caddy reloaded before health gate"
  else
    record_check "activation:restart" "fail" "service restart or Caddy reload failed before health gate"
    if [ "$ROLLBACK_ON_FAILURE" = "1" ]; then
      if rollback; then
        echo "fieldgrid-deploy-health-gate: activation restart failed; rollback succeeded" >&2
      else
        echo "fieldgrid-deploy-health-gate: activation restart failed; rollback failed or unavailable" >&2
      fi
    else
      write_evidence "fail" "activation restart failed" "not-requested"
    fi
    exit 1
  fi
fi

if run_health_checks; then
  write_evidence "pass" "release health gate passed" "not-needed"
  echo "fieldgrid-deploy-health-gate: release health gate passed"
  exit 0
fi

if [ "$ROLLBACK_ON_FAILURE" = "1" ]; then
  if rollback; then
    echo "fieldgrid-deploy-health-gate: release failed; rollback succeeded" >&2
  else
    echo "fieldgrid-deploy-health-gate: release failed; rollback failed or unavailable" >&2
  fi
else
  write_evidence "fail" "release health gate failed" "not-requested"
fi

exit 1

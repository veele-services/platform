#!/usr/bin/env bash
set -euo pipefail
umask 027

usage() {
  cat <<'USAGE'
Usage:
  fieldgrid-atomic-release-activate.sh --environment staging --base-dir DIR --release-path DIR --expected-sha SHA [options]

Options:
  --migration-status STATUS   Must be success to activate. Any other value fails before symlink changes.
  --prepared-env PATH         Release-local runtime env to publish during activation.
  --shared-env PATH           Exact shared env destination paired with --prepared-env.
  --rollback-env PATH         Persistent pre-activation env copy consumed by the health gate.
  --evidence-file PATH        Write structured JSON evidence.
  --help                      Show this help.
USAGE
}

ENVIRONMENT=""
BASE_DIR=""
RELEASE_PATH=""
EXPECTED_SHA=""
MIGRATION_STATUS="success"
EVIDENCE_FILE=""
EVIDENCE_TEMP=""
EVIDENCE_GROUP="${FIELDGRID_DEPLOY_EVIDENCE_GROUP:-}"
ENVIRONMENT_GROUP="${FIELDGRID_DEPLOY_ENV_GROUP:-$EVIDENCE_GROUP}"
PREPARED_ENV=""
SHARED_ENV=""
ROLLBACK_ENV=""
PREVIOUS_CURRENT=""
SHARED_ENV_BACKUP=""
SHARED_ENV_ABSENT_MARKER=""
SHARED_ENV_TEMP=""
SHARED_ENV_HAD_ORIGINAL="false"
ENV_PUBLISHED="false"
ACTIVATION_COMMITTED="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --base-dir) BASE_DIR="${2:-}"; shift 2 ;;
    --release-path) RELEASE_PATH="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --migration-status) MIGRATION_STATUS="${2:-}"; shift 2 ;;
    --prepared-env) PREPARED_ENV="${2:-}"; shift 2 ;;
    --shared-env) SHARED_ENV="${2:-}"; shift 2 ;;
    --rollback-env) ROLLBACK_ENV="${2:-}"; shift 2 ;;
    --evidence-file) EVIDENCE_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

json_escape() {
  printf '%s' "$1" | tr '\r\n' '  ' | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

write_evidence() {
  status="$1"
  detail="$2"
  if [ -z "$EVIDENCE_FILE" ]; then
    return 0
  fi

  mkdir -p "$(dirname "$EVIDENCE_FILE")"
  current_target=""
  if [ -n "$BASE_DIR" ] && [ -L "$BASE_DIR/current" ]; then
    current_target="$(readlink "$BASE_DIR/current" || true)"
  fi

  EVIDENCE_TEMP="${EVIDENCE_FILE}.$$"
  cat > "$EVIDENCE_TEMP" <<JSON
{
  "tool": "fieldgrid-atomic-release-activate",
  "environment": "$(json_escape "$ENVIRONMENT")",
  "status": "$(json_escape "$status")",
  "detail": "$(json_escape "$detail")",
  "baseDir": "$(json_escape "$BASE_DIR")",
  "releasePath": "$(json_escape "$RELEASE_PATH")",
  "expectedSha": "$(json_escape "$EXPECTED_SHA")",
  "previousCurrent": "$(json_escape "$PREVIOUS_CURRENT")",
  "currentTarget": "$(json_escape "$current_target")",
  "migrationStatus": "$(json_escape "$MIGRATION_STATUS")"
}
JSON
  chmod 640 "$EVIDENCE_TEMP"
  if [ -n "$EVIDENCE_GROUP" ]; then
    chgrp "$EVIDENCE_GROUP" "$EVIDENCE_TEMP"
  fi
  mv -f "$EVIDENCE_TEMP" "$EVIDENCE_FILE"
  EVIDENCE_TEMP=""
}

fail() {
  write_evidence "fail" "$1"
  echo "fieldgrid-atomic-release-activate: $1" >&2
  exit 1
}

switch_current() {
  target="$1"
  temp_link="$BASE_DIR/.current.new.$$"
  rm -f "$temp_link"
  if ! ln -s "$target" "$temp_link"; then
    return 1
  fi
  if ! mv -Tf "$temp_link" "$BASE_DIR/current"; then
    rm -f "$temp_link"
    return 1
  fi
}

restore_activation_state() {
  restore_failed="false"
  if [ "$ENV_PUBLISHED" = "true" ]; then
    if [ "$SHARED_ENV_HAD_ORIGINAL" = "true" ] && \
       [ -n "$SHARED_ENV_BACKUP" ] && [ -f "$SHARED_ENV_BACKUP" ]; then
      chmod 640 "$SHARED_ENV_BACKUP" || restore_failed="true"
      if [ "$restore_failed" = "false" ] && [ -n "$ENVIRONMENT_GROUP" ]; then
        chgrp "$ENVIRONMENT_GROUP" "$SHARED_ENV_BACKUP" || restore_failed="true"
      fi
      if [ "$restore_failed" = "false" ]; then
        mv -f "$SHARED_ENV_BACKUP" "$SHARED_ENV" || restore_failed="true"
      fi
      if [ "$restore_failed" = "false" ]; then
        chmod 640 "$SHARED_ENV" || restore_failed="true"
      fi
      if [ "$restore_failed" = "false" ] && [ -n "$ENVIRONMENT_GROUP" ]; then
        chgrp "$ENVIRONMENT_GROUP" "$SHARED_ENV" || restore_failed="true"
      fi
    else
      rm -f "$SHARED_ENV" || restore_failed="true"
    fi
    if [ "$restore_failed" = "false" ] && [ -n "$SHARED_ENV_ABSENT_MARKER" ]; then
      rm -f "$SHARED_ENV_ABSENT_MARKER" || restore_failed="true"
    fi
    if [ "$restore_failed" = "false" ]; then
      ENV_PUBLISHED="false"
    fi
  fi

  current_target=""
  if [ -L "$BASE_DIR/current" ]; then
    current_target="$(readlink "$BASE_DIR/current" || true)"
  fi
  if [ "$current_target" = "$RELEASE_PATH" ]; then
    if [ -n "$PREVIOUS_CURRENT" ]; then
      switch_current "$PREVIOUS_CURRENT" || restore_failed="true"
    else
      rm -f "$BASE_DIR/current" || restore_failed="true"
    fi
  fi
  [ "$restore_failed" = "false" ]
}

cleanup_activation() {
  status="$?"
  restore_succeeded="true"
  if [ "$status" -ne 0 ] && [ "$ACTIVATION_COMMITTED" != "true" ]; then
    if ! restore_activation_state; then
      restore_succeeded="false"
      echo "fieldgrid-atomic-release-activate: activation rollback failed; protected rollback material retained" >&2
    fi
  fi
  if [ -n "$SHARED_ENV_TEMP" ]; then
    rm -f "$SHARED_ENV_TEMP" || true
  fi
  if [ -n "$EVIDENCE_TEMP" ]; then
    rm -f "$EVIDENCE_TEMP" || true
  fi
  if [ "$ACTIVATION_COMMITTED" != "true" ] && [ "$restore_succeeded" = "true" ]; then
    if [ -n "$SHARED_ENV_BACKUP" ] && [ -f "$SHARED_ENV_BACKUP" ]; then
      rm -f "$SHARED_ENV_BACKUP" || true
    fi
    if [ -n "$SHARED_ENV_ABSENT_MARKER" ]; then
      rm -f "$SHARED_ENV_ABSENT_MARKER" || true
    fi
  fi
  exit "$status"
}

trap cleanup_activation EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

[ -n "$ENVIRONMENT" ] || fail "--environment is required"
if [ "$ENVIRONMENT" != "staging" ]; then
  fail "only the staging environment may use atomic release activation"
fi
[ -n "$BASE_DIR" ] || fail "--base-dir is required"
[ -n "$RELEASE_PATH" ] || fail "--release-path is required"
[ -n "$EXPECTED_SHA" ] || fail "--expected-sha is required"

if [ -L "$BASE_DIR/current" ]; then
  PREVIOUS_CURRENT="$(readlink "$BASE_DIR/current" || true)"
fi

if [ "$MIGRATION_STATUS" != "success" ]; then
  fail "build or migration did not complete successfully; refusing to activate"
fi

[ -d "$BASE_DIR" ] || fail "base directory does not exist"
[ -d "$RELEASE_PATH" ] || fail "release path does not exist"

if { [ -n "$PREPARED_ENV" ] && { [ -z "$SHARED_ENV" ] || [ -z "$ROLLBACK_ENV" ]; }; } || \
   { [ -z "$PREPARED_ENV" ] && { [ -n "$SHARED_ENV" ] || [ -n "$ROLLBACK_ENV" ]; }; }; then
  fail "--prepared-env, --shared-env and --rollback-env must be provided together"
fi
if [ -n "$PREPARED_ENV" ]; then
  if [ "$PREPARED_ENV" != "$RELEASE_PATH/.env" ] || \
     [ "$SHARED_ENV" != "$BASE_DIR/shared/.env" ] || \
     [ "$ROLLBACK_ENV" != "$BASE_DIR/shared/.env.rollback-$EXPECTED_SHA" ]; then
    fail "runtime environment paths do not match the release contract"
  fi
  if [ ! -f "$PREPARED_ENV" ] || [ -L "$PREPARED_ENV" ]; then
    fail "prepared runtime environment must be a regular release-local file"
  fi
  if [ -e "$SHARED_ENV" ] && { [ ! -f "$SHARED_ENV" ] || [ -L "$SHARED_ENV" ]; }; then
    fail "shared runtime environment must be a regular file"
  fi
  SHARED_ENV_BACKUP="$ROLLBACK_ENV"
  SHARED_ENV_ABSENT_MARKER="$ROLLBACK_ENV.absent"
  if [ -e "$SHARED_ENV_BACKUP" ] || [ -e "$SHARED_ENV_ABSENT_MARKER" ]; then
    fail "stale runtime environment rollback material exists"
  fi
fi

SHA_FILE="$RELEASE_PATH/.fieldgrid-release-sha"
if [ ! -f "$SHA_FILE" ]; then
  fail "release SHA marker is missing: $SHA_FILE"
fi

ACTUAL_SHA="$(sed -n '1p' "$SHA_FILE" | tr -d '[:space:]')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  fail "release SHA marker mismatch"
fi

if [ -n "$PREPARED_ENV" ]; then
  SHARED_ENV_TEMP="$BASE_DIR/shared/.env.new.$$"
  if [ -f "$SHARED_ENV" ]; then
    cp -p "$SHARED_ENV" "$SHARED_ENV_BACKUP" || \
      fail "failed to preserve the current runtime environment"
    chmod 600 "$SHARED_ENV_BACKUP" || \
      fail "failed to protect the runtime environment rollback copy"
    SHARED_ENV_HAD_ORIGINAL="true"
  else
    : > "$SHARED_ENV_ABSENT_MARKER" || \
      fail "failed to record the absent runtime environment"
    chmod 600 "$SHARED_ENV_ABSENT_MARKER" || \
      fail "failed to protect the runtime environment absence marker"
  fi
  cp "$PREPARED_ENV" "$SHARED_ENV_TEMP" || \
    fail "failed to prepare the runtime environment"
  chmod 640 "$SHARED_ENV_TEMP" || \
    fail "failed to protect the prepared runtime environment"
  if [ -n "$ENVIRONMENT_GROUP" ]; then
    chgrp "$ENVIRONMENT_GROUP" "$SHARED_ENV_TEMP" || \
      fail "failed to protect the prepared runtime environment group"
  fi
  ENV_PUBLISHED="true"
  mv -f "$SHARED_ENV_TEMP" "$SHARED_ENV" || \
    fail "failed to publish the runtime environment"
  SHARED_ENV_TEMP=""
fi

if ! switch_current "$RELEASE_PATH"; then
  restore_activation_state ||
    fail "failed to atomically activate release and restore activation state"
  fail "failed to atomically activate release"
fi

CURRENT_TARGET="$(readlink "$BASE_DIR/current" || true)"
if [ "$CURRENT_TARGET" != "$RELEASE_PATH" ]; then
  restore_activation_state ||
    fail "activated release verification and activation-state restore failed"
  fail "current symlink does not point at activated release"
fi

write_evidence "pass" "release and runtime environment activated; rollback material retained for health gate"
ACTIVATION_COMMITTED="true"
trap - EXIT HUP INT TERM
printf 'previous_current=%s\n' "$PREVIOUS_CURRENT"
printf 'current_target=%s\n' "$CURRENT_TARGET"

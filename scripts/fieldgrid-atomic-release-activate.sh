#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  fieldgrid-atomic-release-activate.sh --environment staging --base-dir DIR --release-path DIR --expected-sha SHA [options]

Options:
  --migration-status STATUS   Must be success to activate. Any other value fails before symlink changes.
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
PREVIOUS_CURRENT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --base-dir) BASE_DIR="${2:-}"; shift 2 ;;
    --release-path) RELEASE_PATH="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --migration-status) MIGRATION_STATUS="${2:-}"; shift 2 ;;
    --evidence-file) EVIDENCE_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
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

  cat > "$EVIDENCE_FILE" <<JSON
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
}

fail() {
  write_evidence "fail" "$1"
  echo "fieldgrid-atomic-release-activate: $1" >&2
  exit 1
}

[ -n "$ENVIRONMENT" ] || fail "--environment is required"
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

SHA_FILE="$RELEASE_PATH/.fieldgrid-release-sha"
if [ ! -f "$SHA_FILE" ]; then
  fail "release SHA marker is missing: $SHA_FILE"
fi

ACTUAL_SHA="$(sed -n '1p' "$SHA_FILE" | tr -d '[:space:]')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  fail "release SHA marker mismatch"
fi

ln -sfn "$RELEASE_PATH" "$BASE_DIR/current.new"
mv -Tf "$BASE_DIR/current.new" "$BASE_DIR/current"

CURRENT_TARGET="$(readlink "$BASE_DIR/current" || true)"
if [ "$CURRENT_TARGET" != "$RELEASE_PATH" ]; then
  fail "current symlink does not point at activated release"
fi

write_evidence "pass" "release activated atomically"
printf 'previous_current=%s\n' "$PREVIOUS_CURRENT"
printf 'current_target=%s\n' "$CURRENT_TARGET"

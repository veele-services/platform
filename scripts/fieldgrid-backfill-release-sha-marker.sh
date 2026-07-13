#!/usr/bin/env bash
set -euo pipefail
umask 027

usage() {
  cat <<'USAGE'
Usage:
  fieldgrid-backfill-release-sha-marker.sh --environment staging --base-dir DIR --release-path DIR --expected-sha FULL_SHA [--owner USER] [--group GROUP] [--evidence-file PATH]
USAGE
}

ENVIRONMENT=""
BASE_DIR=""
RELEASE_PATH=""
EXPECTED_SHA=""
OWNER="${FIELDGRID_BACKFILL_MARKER_OWNER:-github-runner}"
GROUP="${FIELDGRID_BACKFILL_MARKER_GROUP:-veele-deploy}"
EVIDENCE_FILE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --base-dir) BASE_DIR="${2:-}"; shift 2 ;;
    --release-path) RELEASE_PATH="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --owner) OWNER="${2:-}"; shift 2 ;;
    --group) GROUP="${2:-}"; shift 2 ;;
    --evidence-file) EVIDENCE_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

json_escape() { printf '%s' "$1" | tr '\r\n' '  ' | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'; }

write_evidence() {
  local status="$1"
  local detail="$2"
  if [ -z "$EVIDENCE_FILE" ]; then return 0; fi
  mkdir -p "$(dirname "$EVIDENCE_FILE")"
  local tmp="${EVIDENCE_FILE}.$$"
  cat > "$tmp" <<JSON
{
  "tool": "fieldgrid-backfill-release-sha-marker",
  "environment": "$(json_escape "$ENVIRONMENT")",
  "status": "$(json_escape "$status")",
  "detail": "$(json_escape "$detail")",
  "baseDir": "$(json_escape "$BASE_DIR")",
  "releasePath": "$(json_escape "$RELEASE_PATH")",
  "expectedSha": "$(json_escape "$EXPECTED_SHA")"
}
JSON
  chmod 640 "$tmp"
  mv -f "$tmp" "$EVIDENCE_FILE"
}

fail_now() { write_evidence fail "$1"; echo "fieldgrid-backfill-release-sha-marker: $1" >&2; exit 1; }

[ "$ENVIRONMENT" = "staging" ] || fail_now "only staging may be backfilled"
[ -n "$BASE_DIR" ] || fail_now "--base-dir is required"
[ -n "$RELEASE_PATH" ] || fail_now "--release-path is required"
[ -n "$EXPECTED_SHA" ] || fail_now "--expected-sha is required"
printf '%s' "$EXPECTED_SHA" | grep -Eq '^[0-9a-fA-F]{40}$' || fail_now "--expected-sha must be a full 40-character SHA"

case "$RELEASE_PATH" in
  "$BASE_DIR"/releases/*) ;;
  *) fail_now "release path must be under base-dir/releases" ;;
esac

short_sha="$(printf '%s' "$EXPECTED_SHA" | cut -c1-7)"
release_name="$(basename "$RELEASE_PATH")"
case "$release_name" in
  *"$short_sha") ;;
  *) fail_now "release basename must end with first seven SHA characters" ;;
esac

[ -d "$RELEASE_PATH" ] || fail_now "release path does not exist"
marker="$RELEASE_PATH/.fieldgrid-release-sha"
if [ -e "$marker" ]; then
  existing="$(sed -n '1p' "$marker" | tr -d '[:space:]')"
  if [ "$existing" != "$EXPECTED_SHA" ]; then
    fail_now "existing release SHA marker differs from expected SHA"
  fi
  chmod 640 "$marker"
  chown "$OWNER:$GROUP" "$marker" 2>/dev/null || true
  write_evidence pass "existing marker already matched expected SHA"
  exit 0
fi

tmp="$RELEASE_PATH/.fieldgrid-release-sha.$$"
printf '%s\n' "$EXPECTED_SHA" > "$tmp"
chmod 640 "$tmp"
chown "$OWNER:$GROUP" "$tmp" 2>/dev/null || true
mv -f "$tmp" "$marker"
write_evidence pass "release SHA marker backfilled"
echo "fieldgrid-backfill-release-sha-marker: release SHA marker backfilled"

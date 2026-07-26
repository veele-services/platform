#!/usr/bin/env bash
set -euo pipefail
umask 027

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_DIR="$REPO_ROOT/ops/systemd"
CADDY_SOURCE="$REPO_ROOT/ops/caddy/fieldgrid-website-staging.caddy"
WEBSITE_UNIT_SOURCE="$SYSTEMD_DIR/veele-staging-website.service"
MARKETING_UNIT_SOURCE="$SYSTEMD_DIR/veele-staging-marketing.service"
SUDOERS_SOURCE="$REPO_ROOT/ops/sudoers/veele-staging-website-stack"
SUDO_POLICY_CHECKER="$SCRIPT_DIR/fieldgrid-sudo-nopasswd-policy.mjs"
SERVICE_NODE_PREFLIGHT="$SCRIPT_DIR/fieldgrid-service-node-preflight.mjs"
SERVICE_NODE_PATH="/usr/bin/node"

MODE=""
SOURCE_DIR=""
EXPECTED_SHA=""
EVIDENCE_FILE=""
BASE_DIR="${WEBSITE_STACK_BASE_DIR:-/var/www/veele/website-stack-staging}"
COREPACK_HOME_PATH="$BASE_DIR/shared/corepack"
CADDYFILE="${FIELDGRID_CADDYFILE:-/etc/caddy/Caddyfile}"
CADDY_SNIPPET_DIR="${FIELDGRID_CADDY_SNIPPET_DIR:-/etc/caddy/fieldgrid.d}"
CADDY_SNIPPET="$CADDY_SNIPPET_DIR/fieldgrid-website-staging.caddy"
IMPORT_LINE="import /etc/caddy/fieldgrid.d/*.caddy"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --run) MODE="run"; shift ;;
    --source-dir) SOURCE_DIR="${2:-}"; shift 2 ;;
    --expected-sha) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --evidence-file) EVIDENCE_FILE="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() {
  echo "fieldgrid-website-staging-stack-deploy: $1" >&2
  exit 1
}

require_file_contains() {
  local file="$1"
  local value="$2"
  grep -Fq "$value" "$file" ||
    fail "$(basename "$file") is missing required contract: $value"
}

check_contract() {
  for file in \
    "$WEBSITE_UNIT_SOURCE" \
    "$MARKETING_UNIT_SOURCE" \
    "$CADDY_SOURCE" \
    "$SUDOERS_SOURCE" \
    "$SUDO_POLICY_CHECKER" \
    "$SERVICE_NODE_PREFLIGHT"; do
    [ -f "$file" ] || fail "required deployment asset is missing: $file"
    if grep -Eiq 'production|eedbf033ec08a12411760acf8ea7f5d5acf8cc20' "$file"; then
      fail "staging deployment asset contains a production marker"
    fi
  done

  require_file_contains "$WEBSITE_UNIT_SOURCE" "Environment=PORT=3305"
  require_file_contains "$WEBSITE_UNIT_SOURCE" \
    "WorkingDirectory=/var/www/veele/website-stack-staging/current/artifacts/website-runtime"
  require_file_contains "$WEBSITE_UNIT_SOURCE" \
    "Environment=NEXT_TELEMETRY_DISABLED=1"
  require_file_contains "$WEBSITE_UNIT_SOURCE" \
    "ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3305"
  require_file_contains "$WEBSITE_UNIT_SOURCE" "NoNewPrivileges=true"
  require_file_contains "$WEBSITE_UNIT_SOURCE" \
    "ReadOnlyPaths=/var/www/veele/website-stack-staging/shared/corepack"
  require_file_contains "$MARKETING_UNIT_SOURCE" "Environment=PORT=3306"
  require_file_contains "$MARKETING_UNIT_SOURCE" \
    "WorkingDirectory=/var/www/veele/website-stack-staging/current/artifacts/marketing-website"
  require_file_contains "$MARKETING_UNIT_SOURCE" \
    "Environment=NEXT_TELEMETRY_DISABLED=1"
  require_file_contains "$MARKETING_UNIT_SOURCE" \
    "ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3306"
  require_file_contains "$MARKETING_UNIT_SOURCE" "NoNewPrivileges=true"
  require_file_contains "$MARKETING_UNIT_SOURCE" \
    "ReadOnlyPaths=/var/www/veele/website-stack-staging/shared/corepack"
  if grep -Eq '^ExecStart=.*(pnpm|corepack|/usr/bin/env)' \
    "$WEBSITE_UNIT_SOURCE" "$MARKETING_UNIT_SOURCE"; then
    fail "staging website services must not use a package-manager runtime"
  fi

  for host in \
    "website-runtime.staging.fieldgrid.nl" \
    "managed.staging.fieldgrid.nl" \
    "veele.staging.fieldgrid.nl" \
    "veele-origin.staging.fieldgrid.nl"; do
    require_file_contains "$CADDY_SOURCE" "$host"
  done
  for route in "/admin /admin/*" "/personeel /personeel/*" \
    "/klant /klant/*" "/api /api/*"; do
    require_file_contains "$CADDY_SOURCE" "$route"
  done
  require_file_contains "$CADDY_SOURCE" "reverse_proxy 127.0.0.1:3305"
  require_file_contains "$CADDY_SOURCE" "reverse_proxy 127.0.0.1:3306"
  require_file_contains "$SUDOERS_SOURCE" \
    "/usr/bin/systemctl restart veele-staging-website veele-staging-marketing"
  require_file_contains "$SUDOERS_SOURCE" \
    "/usr/bin/systemctl stop veele-staging-website veele-staging-marketing"
  require_file_contains "$SUDOERS_SOURCE" "/usr/bin/systemctl reload caddy"
  require_file_contains "$SUDOERS_SOURCE" \
    "github-runner ALL=(root) NOPASSWD: FIELDGRID_WEBSITE_STACK_CONTROL"
}

check_contract
if [ "$MODE" = "check" ]; then
  echo "fieldgrid-website-staging-stack-deploy: contract check passed"
  exit 0
fi
[ "$MODE" = "run" ] || fail "use --check or --run"

BUILD_NODE_PATH="$(command -v node || true)"
[ -n "$BUILD_NODE_PATH" ] ||
  fail "root bootstrap is required: build Node is unavailable"
[ -x "$SERVICE_NODE_PATH" ] ||
  fail "root bootstrap is required: $SERVICE_NODE_PATH is unavailable"
"$SERVICE_NODE_PATH" "$SERVICE_NODE_PREFLIGHT" \
  --service-node "$SERVICE_NODE_PATH" \
  --build-node "$BUILD_NODE_PATH" \
  --package-json "$REPO_ROOT/package.json" ||
  fail "root bootstrap is required: service Node preflight failed"

required_value() {
  local name="$1"
  [ -n "${!name:-}" ] || fail "$name is required"
}

for name in APP_ENV TARGET_ENVIRONMENT WEBSITE_SERVICE_NAME WEBSITE_PORT \
  WEBSITE_PUBLIC_HEALTH_URL MARKETING_SERVICE_NAME MARKETING_PORT \
  MARKETING_PUBLIC_HEALTH_URL NEXT_PUBLIC_MARKETING_SITE_URL \
  FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON FIELDGRID_CUSTOM_ROUTE_KEY \
  FIELDGRID_CUSTOM_RELEASE_ID FIELDGRID_CUSTOM_EXPECTED_HOST DATABASE_URL; do
  required_value "$name"
done

[ "$APP_ENV" = "staging" ] || fail "APP_ENV must be staging"
[ "$TARGET_ENVIRONMENT" = "staging" ] ||
  fail "TARGET_ENVIRONMENT must be staging"
[ "$BASE_DIR" = "/var/www/veele/website-stack-staging" ] ||
  fail "website stack base directory must be the staging-only path"
[ "$WEBSITE_SERVICE_NAME" = "veele-staging-website" ] ||
  fail "WEBSITE_SERVICE_NAME does not match the reviewed unit"
[ "$MARKETING_SERVICE_NAME" = "veele-staging-marketing" ] ||
  fail "MARKETING_SERVICE_NAME does not match the reviewed unit"
[ "$WEBSITE_PORT" = "3305" ] || fail "WEBSITE_PORT must be 3305"
[ "$MARKETING_PORT" = "3306" ] || fail "MARKETING_PORT must be 3306"
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]] ||
  fail "--expected-sha must be a full lowercase commit SHA"
[ "$FIELDGRID_CUSTOM_RELEASE_ID" = "git-commit:$EXPECTED_SHA" ] ||
  fail "custom release identity must equal exact staging"
if [ -z "$SOURCE_DIR" ] || [ ! -e "$SOURCE_DIR/.git" ]; then
  fail "--source-dir must be a git checkout"
fi
[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$EXPECTED_SHA" ] ||
  fail "source checkout differs from exact staging"

"$SERVICE_NODE_PATH" - "$EXPECTED_SHA" <<'NODE'
const expectedSha = process.argv[2];
const exact = (name, expected, path) => {
  const url = new URL(process.env[name]);
  if (
    url.protocol !== "https:" ||
    url.hostname !== expected ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) throw new Error(`${name} differs from the reviewed staging URL`);
};
exact(
  "WEBSITE_PUBLIC_HEALTH_URL",
  "website-runtime.staging.fieldgrid.nl",
  "/healthz",
);
exact(
  "MARKETING_PUBLIC_HEALTH_URL",
  "veele-origin.staging.fieldgrid.nl",
  "/healthz",
);
exact(
  "NEXT_PUBLIC_MARKETING_SITE_URL",
  "veele.staging.fieldgrid.nl",
  "/",
);
if (process.env.FIELDGRID_CUSTOM_EXPECTED_HOST !== "veele.staging.fieldgrid.nl")
  throw new Error("custom expected host differs from the reviewed staging host");
const routes = JSON.parse(process.env.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON);
const route = routes.find(
  (entry) =>
    entry?.providerKey === "fieldgrid_vps" &&
    entry?.routeKey === process.env.FIELDGRID_CUSTOM_ROUTE_KEY,
);
if (
  !route ||
  route.releaseId !== `git-commit:${expectedSha}` ||
  route.status !== "routable" ||
  route.healthPath !== "/api/health" ||
  route.upstreamOrigin !== "https://veele-origin.staging.fieldgrid.nl" ||
  !route.expectedHosts?.includes("veele.staging.fieldgrid.nl")
) throw new Error("custom route registry differs from exact staging");
const formId = process.env.FIELDGRID_WEBSITE_FORM_ID ?? "";
if (formId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(formId))
  throw new Error("FIELDGRID_WEBSITE_FORM_ID must be empty or a UUID");
NODE

RUN_KEY="${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
RELEASE="$BASE_DIR/releases/$(date -u +%Y%m%d%H%M%S)-${RUN_KEY}-${EXPECTED_SHA:0:7}"
PREVIOUS_CURRENT=""
ACTIVATED="0"

require_preprovisioned_asset() {
  local source="$1"
  local target="$2"
  [ -f "$target" ] ||
    fail "root bootstrap is required: missing $target"
  cmp -s "$source" "$target" ||
    fail "root bootstrap is required: $target differs from exact staging"
}

require_preprovisioned_asset \
  "$WEBSITE_UNIT_SOURCE" \
  "/etc/systemd/system/veele-staging-website.service"
require_preprovisioned_asset \
  "$MARKETING_UNIT_SOURCE" \
  "/etc/systemd/system/veele-staging-marketing.service"
require_preprovisioned_asset "$CADDY_SOURCE" "$CADDY_SNIPPET"
grep -Fxq "$IMPORT_LINE" "$CADDYFILE" ||
  fail "root bootstrap is required: Caddy import is missing"
# The runner must not need direct read or traversal access to /etc/sudoers.d.
# Validate that every effective, exact capability runs as root without a
# password. A successful `sudo -n -l <command>` alone does not prove NOPASSWD.
require_nopasswd_control() {
  local description="$1"
  shift
  local listing
  local effective_listing
  listing="$(LC_ALL=C sudo -n -ll 2>/dev/null)" ||
    fail "root bootstrap is required: effective sudo policy is unavailable"
  effective_listing="$(LC_ALL=C sudo -n -ll "$@" 2>/dev/null)" ||
    fail "root bootstrap is required: $description permission is missing"
  {
    printf '%s' "$listing"
    printf '\0'
    printf '%s' "$effective_listing"
  } |
    "$SERVICE_NODE_PATH" "$SUDO_POLICY_CHECKER" "$@" ||
    fail "root bootstrap is required: $description must be exact root NOPASSWD"
}

require_nopasswd_control "exact website restart" \
  /usr/bin/systemctl restart \
  veele-staging-website veele-staging-marketing
require_nopasswd_control "exact website stop" \
  /usr/bin/systemctl stop \
  veele-staging-website veele-staging-marketing
require_nopasswd_control "exact Caddy reload" \
  /usr/bin/systemctl reload caddy
systemctl is-enabled --quiet "$WEBSITE_SERVICE_NAME" ||
  fail "root bootstrap is required: $WEBSITE_SERVICE_NAME is not enabled"
systemctl is-enabled --quiet "$MARKETING_SERVICE_NAME" ||
  fail "root bootstrap is required: $MARKETING_SERVICE_NAME is not enabled"
caddy adapt --config "$CADDYFILE" >/dev/null

write_evidence() {
  local status="$1"
  local rollback="$2"
  [ -n "$EVIDENCE_FILE" ] || return 0
  mkdir -p "$(dirname "$EVIDENCE_FILE")"
  cat > "$EVIDENCE_FILE" <<JSON
{
  "tool": "fieldgrid-website-staging-stack-deploy",
  "environment": "staging",
  "status": "$status",
  "exactSha": "$EXPECTED_SHA",
  "releasePath": "$RELEASE",
  "previousRelease": "$PREVIOUS_CURRENT",
  "websiteService": "veele-staging-website",
  "websitePort": 3305,
  "marketingService": "veele-staging-marketing",
  "marketingPort": 3306,
  "caddySnippet": "/etc/caddy/fieldgrid.d/fieldgrid-website-staging.caddy",
  "rollback": "$rollback",
  "productionChanged": false,
  "stagingRefChanged": false,
  "secretsRecorded": false
}
JSON
  chmod 640 "$EVIDENCE_FILE"
}

rollback() {
  local code="$?"
  trap - ERR
  set +e
  rollback_status="not-needed"
  if [ "$ACTIVATED" = "1" ]; then
    if [ -n "$PREVIOUS_CURRENT" ]; then
      ln -s "$PREVIOUS_CURRENT" "$BASE_DIR/.current.rollback.$$"
      mv -Tf "$BASE_DIR/.current.rollback.$$" "$BASE_DIR/current"
      sudo systemctl restart "$WEBSITE_SERVICE_NAME" "$MARKETING_SERVICE_NAME"
      rollback_status="${rollback_status}+release-restored"
    else
      rm -f "$BASE_DIR/current"
      sudo systemctl stop "$WEBSITE_SERVICE_NAME" "$MARKETING_SERVICE_NAME"
      rollback_status="${rollback_status}+first-release-removed"
    fi
  fi
  write_evidence "failed" "$rollback_status"
  exit "$code"
}
trap rollback ERR

mkdir -p \
  "$RELEASE" \
  "$BASE_DIR/releases" \
  "$BASE_DIR/shared" \
  "$COREPACK_HOME_PATH"
rsync -a --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude=".next" \
  --exclude=".env" \
  "$SOURCE_DIR/" "$RELEASE/"
printf '%s\n' "$EXPECTED_SHA" > "$RELEASE/.fieldgrid-release-sha"

(
  cd "$RELEASE"
  export COREPACK_HOME="$COREPACK_HOME_PATH"
  export COREPACK_DEFAULT_TO_LATEST=0
  corepack enable
  corepack install --global pnpm@11.5.2
  pnpm install --frozen-lockfile
  pnpm --filter @workspace/website-runtime run build
  pnpm --filter @workspace/marketing-website run build
)

for next_runtime in \
  "$RELEASE/artifacts/website-runtime/node_modules/next/dist/bin/next" \
  "$RELEASE/artifacts/marketing-website/node_modules/next/dist/bin/next"; do
  [ -r "$next_runtime" ] ||
    fail "built Next.js runtime is missing: $next_runtime"
done

{
  printf 'APP_ENV=staging\n'
  printf 'NODE_ENV=production\n'
  printf 'PORT=3305\n'
  printf 'NEXT_TELEMETRY_DISABLED=1\n'
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  printf "FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON='%s'\n" \
    "$FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON"
} > "$BASE_DIR/shared/website.env"
{
  printf 'APP_ENV=staging\n'
  printf 'NODE_ENV=production\n'
  printf 'PORT=3306\n'
  printf 'NEXT_TELEMETRY_DISABLED=1\n'
  printf 'NEXT_PUBLIC_MARKETING_SITE_URL=%s\n' \
    "$NEXT_PUBLIC_MARKETING_SITE_URL"
  printf 'FIELDGRID_WEBSITE_FORM_ID=%s\n' "${FIELDGRID_WEBSITE_FORM_ID:-}"
  printf 'FIELDGRID_CUSTOM_ROUTE_KEY=%s\n' "$FIELDGRID_CUSTOM_ROUTE_KEY"
  printf 'FIELDGRID_CUSTOM_RELEASE_ID=%s\n' "$FIELDGRID_CUSTOM_RELEASE_ID"
  printf 'FIELDGRID_CUSTOM_EXPECTED_HOST=%s\n' \
    "$FIELDGRID_CUSTOM_EXPECTED_HOST"
} > "$BASE_DIR/shared/marketing.env"
chmod 640 "$BASE_DIR/shared/website.env" "$BASE_DIR/shared/marketing.env"
chgrp veele-deploy "$BASE_DIR/shared/website.env" "$BASE_DIR/shared/marketing.env"
chown -R github-runner:veele-deploy "$RELEASE"
chmod -R u+rwX,g+rX,o-rwx "$RELEASE"

if [ -L "$BASE_DIR/current" ]; then
  PREVIOUS_CURRENT="$(readlink "$BASE_DIR/current")"
  case "$PREVIOUS_CURRENT" in
    "$BASE_DIR"/releases/*) ;;
    *) fail "existing website stack release is outside the release directory" ;;
  esac
fi
ln -s "$RELEASE" "$BASE_DIR/.current.new.$$"
mv -Tf "$BASE_DIR/.current.new.$$" "$BASE_DIR/current"
ACTIVATED="1"

sudo systemctl restart "$WEBSITE_SERVICE_NAME" "$MARKETING_SERVICE_NAME"

retry_curl() {
  local url="$1"
  local attempt
  for attempt in $(seq 1 12); do
    if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null; then
      return 0
    fi
    [ "$attempt" = "12" ] || sleep 5
  done
  return 1
}
retry_curl "http://127.0.0.1:3305/healthz"
retry_curl "http://127.0.0.1:3306/healthz"

sudo systemctl reload caddy

retry_curl "$WEBSITE_PUBLIC_HEALTH_URL"
retry_curl "$MARKETING_PUBLIC_HEALTH_URL"
write_evidence "passed" "not-needed"
trap - ERR

mapfile -t old_releases < <(
  printf '%s\n' "$BASE_DIR"/releases/* | sort -r | tail -n +6
)
if [ "${#old_releases[@]}" -gt 0 ]; then
  rm -rf "${old_releases[@]}"
fi
echo "fieldgrid-website-staging-stack-deploy: exact staging stack deployed"

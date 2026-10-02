#!/usr/bin/env bash
set -euo pipefail

# Unprivileged transfer-runner gate. This script must never traverse protected
# configuration directories or connect to the scanner.
[[ "$#" = 0 ]] || { echo 'Runner contract check accepts no arguments.' >&2; exit 2; }
test "${DEPLOY_TARGET:-}" = staging
test "${DEPLOY_ROOT:-}" = /opt/fieldgrid/staging
test "${SERVICE_NAME:-}" = fieldgrid@staging.service
test "${CLAMAV_ENABLED:-}" = true
test "${CLAMAV_SOCKET:-}" = /run/clamav/clamd.ctl
fail() { echo "$1" >&2; exit 1; }

[[ "$(id -u)" != 0 && "$(id -u)" != "$(id -u fieldgrid)" ]] || fail 'Runner must use a non-root UID separate from fieldgrid.'
[[ "$(id -un)" = fieldgrid-runner ]] || fail 'Runner check must run as fieldgrid-runner.'
[[ "$(id -gn)" = fieldgrid-runner ]] || fail 'fieldgrid-runner must use its own primary group.'
[[ "$(id -nG)" = fieldgrid-runner ]] || fail 'Runner must not have supplementary group memberships.'
case " $(id -nG fieldgrid) " in *' clamav '*) ;; *) fail 'Runtime user fieldgrid must belong to clamav.';; esac
[[ ! -r "$CLAMAV_SOCKET" && ! -w "$CLAMAV_SOCKET" ]] || fail 'Runner has direct scanner socket access.'

[[ "$(stat -c '%U:%G:%a' "$DEPLOY_ROOT")" = 'root:root:711' ]] || fail 'Staging root must be root:root 0711.'
incoming="$DEPLOY_ROOT/incoming"
[[ "$(stat -c '%U:%G:%a' "$incoming")" = 'fieldgrid-runner:fieldgrid-runner:700' ]] || fail 'Incoming must be runner-only 0700.'

for protected in /etc/fieldgrid "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/shared" "$DEPLOY_ROOT/backups"; do
  [[ ! -r "$protected" && ! -w "$protected" && ! -x "$protected" ]] || fail "Runner has permissions on protected path: $protected"
  if ls -A -- "$protected" >/dev/null 2>&1; then fail "Runner can list protected path: $protected"; fi
  if probe="$(mktemp -d "$protected/.fieldgrid-runner-contract.XXXXXX" 2>/dev/null)"; then
    rmdir -- "$probe" 2>/dev/null || true
    fail "Runner can write to protected path: $protected"
  fi
done

probe=''
cleanup_probe() {
  if [[ -n "$probe" && -d "$probe" ]]; then
    rm -f -- "$probe/write-check"
    rmdir -- "$probe"
  fi
}
trap cleanup_probe EXIT
probe="$(mktemp -d "$incoming/.fieldgrid-runner-contract.XXXXXX")" || fail 'Runner cannot create below incoming.'
install -m 0600 /dev/null "$probe/write-check" || fail 'Runner cannot write below incoming.'
rm -f -- "$probe/write-check"
rmdir -- "$probe" || fail 'Runner cannot remove its incoming probe.'
probe=''
trap - EXIT

broker=/usr/local/sbin/fieldgrid-install-staging-release
[[ "$(stat -c '%U:%G:%a:%h' "$broker")" = 'root:root:755:1' ]] || fail 'Combined release broker must be root-owned 0755 with one link.'
for dependency in gh openssl pg_restore python3 node sudo systemctl stat ls mktemp install awk rm rmdir; do
  command -v "$dependency" >/dev/null || fail "Missing transfer/broker dependency: $dependency"
done
pg_restore_major="$(pg_restore --version | awk '{ split($3, version, "."); print version[1] }')"
[[ "$pg_restore_major" =~ ^[0-9]+$ && "$pg_restore_major" -ge 17 ]] || fail 'PostgreSQL 17 or newer pg_restore is required for Supabase backups.'

LC_ALL=C sudo_rules="$(sudo --non-interactive --list)" || fail 'Cannot inspect runner sudo contract non-interactively.'
mapfile -t command_rules < <(printf '%s\n' "$sudo_rules" | awk '/^[[:space:]]*\([^)]*\)[[:space:]]/ { sub(/^[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print }')
[[ "${#command_rules[@]}" = 1 ]] || fail 'Runner must have exactly one passwordless sudo command.'
[[ "${command_rules[0]}" = '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""' ]] || fail 'Runner sudo must allow only the fixed no-argument release broker.'

for daemon in clamav-daemon.service clamav-freshclam.service; do
  systemctl is-active --quiet "$daemon" || fail "Required operator service is inactive: $daemon"
done
for unit in fieldgrid@staging.service fieldgrid-worker@staging.service; do
  [[ "$(systemctl show "$unit" --property=User --value)" = fieldgrid ]] || fail 'Unexpected runtime User in installed unit.'
  [[ "$(systemctl show "$unit" --property=Group --value)" = fieldgrid ]] || fail 'Unexpected runtime Group in installed unit.'
  files="$(systemctl show "$unit" --property=EnvironmentFiles --value)"
  [[ "$files" = '/opt/fieldgrid/staging/shared/runtime.env (ignore_errors=no)' ]] || fail 'Install the runtime.env unit contract before release.'
done
supplementary="$(systemctl show fieldgrid@staging.service --property=SupplementaryGroups --value)"
case " $supplementary " in *' clamav '*) ;; *) fail 'Web runtime must receive the clamav supplementary group.';; esac
required="$(systemctl show fieldgrid@staging.service --property=Requires --value)"
case " $required " in *' clamav-daemon.service '*) ;; *) fail 'Web unit must require clamav-daemon.service.';; esac

echo 'Staging transfer-runner separation, denial and public unit contract verified.'

#!/usr/bin/env bash
set -euo pipefail

# Unprivileged transfer-runner gate. This script must never traverse protected
# configuration directories or connect to the scanner.
[[ "$#" = 0 ]] || { echo 'Runner contract check accepts no arguments.' >&2; exit 2; }
test "${DEPLOY_TARGET:-}" = production
test "${DEPLOY_ROOT:-}" = /opt/fieldgrid/production
test "${SERVICE_NAME:-}" = fieldgrid@production.service
test "${CLAMAV_ENABLED:-}" = true
test "${CLAMAV_SOCKET:-}" = /run/clamav/clamd.ctl
fail() { echo "$1" >&2; exit 1; }

[[ "$(id -u)" != 0 && "$(id -u)" != "$(id -u fieldgrid-production)" ]] || fail 'Runner must use a non-root UID separate from fieldgrid.'
[[ "$(id -un)" = fieldgrid-production-runner ]] || fail 'Runner check must run as fieldgrid-production-runner.'
[[ "$(id -gn)" = fieldgrid-production-runner ]] || fail 'fieldgrid-production-runner must use its own primary group.'
[[ "$(id -nG)" = fieldgrid-production-runner ]] || fail 'Runner must not have supplementary group memberships.'
case " $(id -nG fieldgrid-production) " in *' clamav '*) ;; *) fail 'Runtime user fieldgrid-production must belong to clamav.';; esac
scanner_directory=/run/clamav
directory_contract="$(LC_ALL=C stat -c '%F:%U:%G:%a' -- "$scanner_directory")" || fail 'Cannot inspect the scanner directory contract.'
IFS=: read -r directory_type directory_owner directory_group directory_mode <<< "$directory_contract"
[[ "$directory_type" = directory ]] || fail 'Scanner directory must not be replaceable.'
case "$directory_owner" in root|clamav) ;; *) fail 'Scanner directory has an unexpected owner.';; esac
case "$directory_group" in root|clamav) ;; *) fail 'Scanner directory has an unexpected group.';; esac
[[ "$directory_mode" =~ ^[0-7]{3}$ ]] || fail 'Scanner directory mode is not canonical.'
(( (8#$directory_mode & 8#022) == 0 )) || fail 'Scanner directory must not be group- or world-writable.'
directory_permissions="$(LC_ALL=C ls -ld -- "$scanner_directory")" || fail 'Cannot inspect scanner directory access indicators.'
[[ "${directory_permissions%% *}" =~ ^d[rwx-]{9}$ ]] || fail 'Scanner directory has extended or unexpected access permissions.'
socket_contract="$(LC_ALL=C stat -c '%F:%U:%G:%a:%h' -- "$CLAMAV_SOCKET")" || fail 'Cannot inspect the scanner socket contract.'
[[ "$socket_contract" = 'socket:clamav:clamav:660:1' ]] || fail 'Scanner socket metadata does not enforce runner separation.'
socket_permissions="$(LC_ALL=C ls -ld -- "$CLAMAV_SOCKET")" || fail 'Cannot inspect scanner socket access indicators.'
[[ "${socket_permissions%% *}" = 'srw-rw----' ]] || fail 'Scanner socket has extended or unexpected access permissions.'

[[ "$(stat -c '%U:%G:%a' "$DEPLOY_ROOT")" = 'root:root:711' ]] || fail 'Productie root must be root:root 0711.'
incoming="$DEPLOY_ROOT/incoming"
[[ "$(stat -c '%U:%G:%a' "$incoming")" = 'fieldgrid-production-runner:fieldgrid-production-runner:700' ]] || fail 'Incoming must be runner-only 0700.'

for protected in /etc/fieldgrid "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/shared" "$DEPLOY_ROOT/backups" /opt/fieldgrid/staging/releases /opt/fieldgrid/staging/shared /opt/fieldgrid/staging/backups /opt/fieldgrid/staging/incoming; do
  [[ ! -r "$protected" && ! -w "$protected" && ! -x "$protected" ]] || fail "Runner has permissions on protected path: $protected"
  if ls -A -- "$protected" >/dev/null 2>&1; then fail "Runner can list protected path: $protected"; fi
  if probe="$(mktemp -d "$protected/.fieldgrid-production-runner-contract.XXXXXX" 2>/dev/null)"; then
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
probe="$(mktemp -d "$incoming/.fieldgrid-production-runner-contract.XXXXXX")" || fail 'Runner cannot create below incoming.'
install -m 0600 /dev/null "$probe/write-check" || fail 'Runner cannot write below incoming.'
rm -f -- "$probe/write-check"
rmdir -- "$probe" || fail 'Runner cannot remove its incoming probe.'
probe=''
trap - EXIT

broker=/usr/local/sbin/fieldgrid-install-production-release
[[ "$(stat -c '%U:%G:%a:%h' "$broker")" = 'root:root:755:1' ]] || fail 'Combined release broker must be root-owned 0755 with one link.'
for dependency in gh openssl pg_restore python3 node sudo systemctl stat ls mktemp install awk rm rmdir; do
  command -v "$dependency" >/dev/null || fail "Missing transfer/broker dependency: $dependency"
done
pg_restore_major="$(pg_restore --version | awk '{ split($3, version, "."); print version[1] }')"
[[ "$pg_restore_major" =~ ^[0-9]+$ && "$pg_restore_major" -ge 17 ]] || fail 'PostgreSQL 17 or newer pg_restore is required for Supabase backups.'

LC_ALL=C sudo_rules="$(sudo --non-interactive --list)" || fail 'Cannot inspect runner sudo contract non-interactively.'
mapfile -t command_rules < <(printf '%s\n' "$sudo_rules" | awk '/^[[:space:]]*\([^)]*\)[[:space:]]/ { sub(/^[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print }')
[[ "${#command_rules[@]}" = 1 ]] || fail 'Runner must have exactly one passwordless sudo command.'
[[ "${command_rules[0]}" = '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-production-release ""' ]] || fail 'Runner sudo must allow only the fixed no-argument release broker.'

for daemon in clamav-daemon.service clamav-freshclam.service; do
  systemctl is-active --quiet "$daemon" || fail "Required operator service is inactive: $daemon"
done
for unit in fieldgrid@production.service fieldgrid-worker@production.service; do
  [[ "$(systemctl show "$unit" --property=User --value)" = fieldgrid-production ]] || fail 'Unexpected runtime User in installed unit.'
  [[ "$(systemctl show "$unit" --property=Group --value)" = fieldgrid-production ]] || fail 'Unexpected runtime Group in installed unit.'
  files="$(systemctl show "$unit" --property=EnvironmentFiles --value)"
  [[ "$files" = '/opt/fieldgrid/production/shared/runtime.env (ignore_errors=no)' ]] || fail 'Install the runtime.env unit contract before release.'
done
supplementary="$(systemctl show fieldgrid@production.service --property=SupplementaryGroups --value)"
[[ "$supplementary" = clamav ]] || fail 'Web runtime must receive only the clamav supplementary group.'
required="$(systemctl show fieldgrid@production.service --property=Requires --value)"
case " $required " in *' clamav-daemon.service '*) ;; *) fail 'Web unit must require clamav-daemon.service.';; esac
working_directory="$(systemctl show fieldgrid@production.service --property=WorkingDirectory --value)"
[[ "$working_directory" = /opt/fieldgrid/production/current ]] || fail 'Web unit must use the exact attested release working directory.'
start_pre="$(systemctl show fieldgrid@production.service --property=ExecStartPre --value)"
mapfile -t start_pre_entries <<< "$start_pre"
[[ "${#start_pre_entries[@]}" = 2 && -n "${start_pre_entries[0]}" && -n "${start_pre_entries[1]}" ]] || fail 'Web unit must have exactly two scanner preflight commands.'
socket_preflight='{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; ignore_errors=no ;'
protocol_preflight='{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; ignore_errors=no ;'
[[ "${start_pre_entries[0]}" = "$socket_preflight"*' }' ]] || fail 'Web unit must fail closed on the canonical scanner socket test.'
[[ "${start_pre_entries[1]}" = "$protocol_preflight"*' }' ]] || fail 'Web unit must fail closed on the packaged ClamAV protocol preflight.'
start_pre_ex="$(systemctl show fieldgrid@production.service --property=ExecStartPreEx --value)"
mapfile -t start_pre_ex_entries <<< "$start_pre_ex"
[[ "${#start_pre_ex_entries[@]}" = 2 && -n "${start_pre_ex_entries[0]}" && -n "${start_pre_ex_entries[1]}" ]] || fail 'Web unit must expose exactly two extended scanner preflight commands.'
socket_preflight_ex='{ path=/usr/bin/test ; argv[]=/usr/bin/test -S /run/clamav/clamd.ctl ; flags= ;'
protocol_preflight_ex='{ path=/usr/bin/env ; argv[]=/usr/bin/env node clamav-preflight.mjs ; flags= ;'
[[ "${start_pre_ex_entries[0]}" = "$socket_preflight_ex"*' }' ]] || fail 'Web unit socket preflight must not use execution privilege flags.'
[[ "${start_pre_ex_entries[1]}" = "$protocol_preflight_ex"*' }' ]] || fail 'Web unit protocol preflight must not use execution privilege flags.'

echo 'Productie transfer-runner separation, denial and public unit contract verified.'

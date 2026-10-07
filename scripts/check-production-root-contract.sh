#!/usr/bin/env bash
set -euo pipefail

# Root-only host contract gate. It never prints or parses secret runtime
# values or private keys. Certificate/key comparisons use public fingerprints.
[[ "$#" = 0 ]] || { echo 'Root contract check accepts no arguments.' >&2; exit 2; }
fail() { echo "$1" >&2; exit 1; }
[[ "$(id -u)" = 0 ]] || fail 'Root contract check must run as root.'

production_root=/opt/fieldgrid/production
config_root=/etc/fieldgrid
broker=/usr/local/sbin/fieldgrid-install-production-release
trusted_root="$config_root/github-attestation-trusted-root.jsonl"
handoff_key="$config_root/production-handoff.key"
handoff_cert="$config_root/production-handoff.crt"
clamd_config=/etc/clamav/clamd.conf

directory_contract() {
  local path="$1" expected="$2" label="$3"
  [[ -d "$path" && ! -L "$path" ]] || fail "$label is missing or is not a real directory."
  [[ "$(stat -c '%U:%G:%a' "$path")" = "$expected" ]] || fail "$label has unsafe ownership or mode."
}

file_contract() {
  local path="$1" expected="$2" label="$3"
  [[ -f "$path" && ! -L "$path" ]] || fail "$label is missing or is not a regular file."
  [[ "$(stat -c '%U:%G:%a:%h' "$path")" = "$expected:1" ]] || fail "$label has unsafe ownership, mode or link count."
}

directory_contract "$config_root" 'root:root:700' '/etc/fieldgrid'
file_contract "$handoff_key" 'root:root:600' 'Root-only production handoff key'
file_contract "$handoff_cert" 'root:root:644' 'Productie handoff certificate'
file_contract "$trusted_root" 'root:root:644' 'GitHub attestation trusted root'
[[ -s "$trusted_root" ]] || fail 'GitHub attestation trusted root is empty.'
file_contract "$broker" 'root:root:755' 'Combined release broker'

[[ -f "$clamd_config" && ! -L "$clamd_config" ]] || fail 'ClamAV daemon configuration is missing or is not a regular file.'
IFS=: read -r clamd_owner clamd_mode clamd_links < <(stat -c '%U:%a:%h' "$clamd_config")
[[ "$clamd_owner" = root && "$clamd_links" = 1 && "$clamd_mode" =~ ^[0-7]{3,4}$ ]] || fail 'ClamAV daemon configuration has unsafe ownership, mode or link count.'
(( (8#$clamd_mode & 8#022) == 0 )) || fail 'ClamAV daemon configuration must not be group- or world-writable.'
clamd_permissions="$(LC_ALL=C ls -ld -- "$clamd_config")" || fail 'Cannot inspect ClamAV daemon configuration access indicators.'
[[ "${clamd_permissions%% *}" =~ ^-[rwx-]{9}$ ]] || fail 'ClamAV daemon configuration has extended or unexpected access permissions.'
awk '
  /^[[:space:]]*(#|$)/ { next }
  $1 == "EnableVersionCommand" {
    count++
    if (NF != 2 || $2 != "yes") exit 2
  }
  $1 == "TCPSocket" { exit 3 }
  END { if (count != 1) exit 1 }
' "$clamd_config" || fail 'ClamAV must expose VERSION on its Unix socket and must not configure a TCP listener.'

command -v systemctl >/dev/null || fail 'Missing root host-contract dependency: systemctl'
clamav_socket_load_state="$(systemctl show clamav-daemon.socket --property=LoadState --value)" \
  || fail 'Cannot inspect the canonical ClamAV socket unit.'
clamav_socket_active_state="$(systemctl show clamav-daemon.socket --property=ActiveState --value)" \
  || fail 'Cannot inspect the canonical ClamAV socket unit state.'
case "$clamav_socket_load_state" in
  loaded)
    mapfile -t clamav_socket_listeners < <(
      systemctl show clamav-daemon.socket --property=Listen --value
    ) || fail 'Cannot inspect the canonical ClamAV socket listeners.'
    [[ "${#clamav_socket_listeners[@]}" = 1 \
      && "${clamav_socket_listeners[0]}" = '/run/clamav/clamd.ctl (Stream)' ]] \
      || fail 'The canonical ClamAV socket unit must expose only the Unix stream socket.'
    ;;
  not-found|masked)
    [[ "$clamav_socket_active_state" = inactive ]] \
      || fail 'An absent or masked ClamAV socket unit must not remain active.'
    ;;
  *) fail 'The canonical ClamAV socket unit has an unexpected load state.' ;;
esac

clamd_main_pid="$(systemctl show clamav-daemon.service --property=MainPID --value)" \
  || fail 'Cannot inspect the running ClamAV daemon identity.'
[[ "$clamd_main_pid" =~ ^[0-9]+$ && "$clamd_main_pid" -gt 1 && -d "/proc/$clamd_main_pid" ]] \
  || fail 'The running ClamAV daemon has no valid main process.'
clamd_main_name="$(cat "/proc/$clamd_main_pid/comm" 2>/dev/null || true)"
clamd_main_executable="$(readlink "/proc/$clamd_main_pid/exe" 2>/dev/null || true)"
[[ "$clamd_main_name" = clamd* || "${clamd_main_executable##*/}" = clamd* ]] \
  || fail 'The canonical ClamAV service main process is not clamd.'

# Inspect the canonical service tree and every clamd-named process in its own
# network namespace. This catches stale/alternate daemon instances as well as
# wrappers below the canonical service without trusting one config file.
declare -A canonical_service_pids=(["$clamd_main_pid"]=1)
while :; do
  scanner_child_added=false
  for status_path in /proc/[0-9]*/status; do
    [[ -r "$status_path" ]] || continue
    process_pid="${status_path#/proc/}"
    process_pid="${process_pid%/status}"
    [[ -z "${canonical_service_pids[$process_pid]+x}" ]] || continue
    process_parent="$(awk '$1 == "PPid:" { print $2; exit }' "$status_path" 2>/dev/null || true)"
    if [[ -n "${canonical_service_pids[$process_parent]+x}" ]]; then
      canonical_service_pids["$process_pid"]=1
      scanner_child_added=true
    fi
  done
  "$scanner_child_added" || break
done
declare -A scanner_pids=()
for process_pid in "${!canonical_service_pids[@]}"; do
  scanner_pids["$process_pid"]=1
done
for process_root in /proc/[0-9]*; do
  [[ -d "$process_root" ]] || continue
  process_pid="${process_root#/proc/}"
  process_name="$(cat "$process_root/comm" 2>/dev/null || true)"
  process_executable="$(readlink "$process_root/exe" 2>/dev/null || true)"
  if [[ "$process_name" = clamd* || "${process_executable##*/}" = clamd* ]]; then
    scanner_pids["$process_pid"]=1
  fi
done

declare -A scanner_socket_inodes=()
declare -A canonical_service_socket_inodes=()
for process_pid in "${!scanner_pids[@]}"; do
  [[ -d "/proc/$process_pid" ]] || continue
  for descriptor in "/proc/$process_pid"/fd/*; do
    descriptor_target="$(readlink "$descriptor" 2>/dev/null || true)"
    if [[ "$descriptor_target" =~ ^socket:\[([0-9]+)\]$ ]]; then
      scanner_socket_inodes["${BASH_REMATCH[1]}"]=1
      if [[ -n "${canonical_service_pids[$process_pid]+x}" ]]; then
        canonical_service_socket_inodes["${BASH_REMATCH[1]}"]=1
      fi
    fi
  done
done
[[ -d "/proc/$clamd_main_pid" ]] || fail 'The ClamAV daemon changed while its listeners were inspected.'
mapfile -t canonical_unix_socket_inodes < <(
  awk '$8 == "/run/clamav/clamd.ctl" && $4 == "00010000" && $5 == "0001" { print $7 }' \
    "/proc/$clamd_main_pid/net/unix"
) || fail 'Cannot inspect the canonical ClamAV Unix socket identity.'
canonical_unix_socket_inode="${canonical_unix_socket_inodes[0]:-}"
[[ "${#canonical_unix_socket_inodes[@]}" = 1 \
  && -n "${canonical_service_socket_inodes[$canonical_unix_socket_inode]+x}" ]] \
  || fail 'The canonical ClamAV service does not own the listening Unix socket.'
for process_pid in "${!scanner_pids[@]}"; do
  [[ -d "/proc/$process_pid" ]] || continue
  for tcp_table in "/proc/$process_pid/net/tcp" "/proc/$process_pid/net/tcp6"; do
    [[ -r "$tcp_table" ]] || fail 'Cannot inspect the ClamAV daemon TCP namespace.'
    while IFS= read -r listener_inode; do
      if [[ -n "${scanner_socket_inodes[$listener_inode]+x}" ]]; then
        fail 'A running ClamAV process exposes a forbidden TCP listener.'
      fi
    done < <(awk 'NR > 1 && $4 == "0A" { print $10 }' "$tcp_table")
  done
done

python3 - <<'PY' || fail 'The running ClamAV daemon does not expose VERSION on the canonical Unix socket.'
import re
import socket

request = b"zVERSION\0"
reply = bytearray()
with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
    client.settimeout(5)
    client.connect("/run/clamav/clamd.ctl")
    client.sendall(request)
    while b"\0" not in reply:
        packet = client.recv(4096)
        if not packet:
            raise SystemExit(1)
        reply.extend(packet)
        if len(reply) > 4096:
            raise SystemExit(1)
if reply.count(0) != 1 or reply[-1] != 0:
    raise SystemExit(1)
version = bytes(reply[:-1]).decode("ascii", "strict")
if not re.fullmatch(r"ClamAV [0-9][0-9A-Za-z._-]*/[0-9]+/[^\r\n\x00]{1,256}", version):
    raise SystemExit(1)
PY

directory_contract "$production_root" 'root:root:711' 'Productie deploy root'
directory_contract "$production_root/releases" 'root:fieldgrid-production:750' 'Release directory'
directory_contract "$production_root/shared" 'root:fieldgrid-production:750' 'Shared runtime directory'
directory_contract "$production_root/backups" 'root:root:700' 'Backup directory'

runtime_count=0
for runtime_path in "$production_root/shared/runtime.env"; do
  if [[ -e "$runtime_path" || -L "$runtime_path" ]]; then
    file_contract "$runtime_path" 'root:fieldgrid-production:640' 'Protected runtime configuration'
    runtime_count=$((runtime_count + 1))
  fi
done
[[ "$runtime_count" -gt 0 ]] || fail 'No protected current or transition runtime configuration is installed.'

# Sharing a host must not share Unix identities or secret access, including ACLs.
declare -A identities=()
for account in fieldgrid fieldgrid-runner fieldgrid-production fieldgrid-production-runner; do
  account_uid="$(id -u "$account")" || fail 'Missing isolated environment account.'
  [[ "$account_uid" != 0 && -z "${identities[$account_uid]+x}" ]] || fail 'Environment accounts must use distinct non-root UIDs.'
  identities[$account_uid]=1
done
for account in fieldgrid fieldgrid-runner; do
  for protected in "$production_root/shared" "$production_root/releases" "$production_root/backups" "$production_root/incoming"; do
    runuser -u "$account" -- /usr/bin/test ! -x "$protected" || fail 'Staging account can traverse a production protected directory.'
    runuser -u "$account" -- /usr/bin/test ! -r "$protected" || fail 'Staging account can read a production protected directory.'
    runuser -u "$account" -- /usr/bin/test ! -w "$protected" || fail 'Staging account can write a production protected directory.'
  done
done
for account in fieldgrid-production fieldgrid-production-runner; do
  for protected in /opt/fieldgrid/staging/shared /opt/fieldgrid/staging/releases /opt/fieldgrid/staging/backups /opt/fieldgrid/staging/incoming; do
    runuser -u "$account" -- /usr/bin/test ! -x "$protected" || fail 'Production account can traverse a staging protected directory.'
    runuser -u "$account" -- /usr/bin/test ! -r "$protected" || fail 'Production account can read a staging protected directory.'
    runuser -u "$account" -- /usr/bin/test ! -w "$protected" || fail 'Production account can write a staging protected directory.'
  done
done

for dependency in gh openssl pg_restore python3 tar sha256sum flock systemctl; do
  command -v "$dependency" >/dev/null || fail "Missing root broker dependency: $dependency"
done
pg_restore_major="$(pg_restore --version | awk '{ split($3, version, "."); print version[1] }')"
[[ "$pg_restore_major" =~ ^[0-9]+$ && "$pg_restore_major" -ge 17 ]] || fail 'PostgreSQL 17 or newer pg_restore is required for Supabase backups.'
openssl x509 -in "$handoff_cert" -noout -checkend 86400 >/dev/null || fail 'Productie handoff certificate is invalid or expires within 24 hours.'
certificate_public="$(openssl x509 -in "$handoff_cert" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}')"
private_public="$(openssl pkey -in "$handoff_key" -pubout -outform DER | sha256sum | awk '{print $1}')"
staging_public="$(openssl x509 -in /etc/fieldgrid/staging-handoff.crt -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}')"
[[ "$certificate_public" = "$private_public" && "$certificate_public" != "$staging_public" ]] || fail 'Production needs a matching, separate handoff key and certificate.'

echo 'Root-only production key, trust, protected runtime and scanner host contract verified.'

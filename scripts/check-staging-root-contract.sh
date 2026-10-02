#!/usr/bin/env bash
set -euo pipefail

# Root-only metadata gate. It never prints or parses runtime values, keys or
# certificates beyond the public X.509 validity check.
[[ "$#" = 0 ]] || { echo 'Root contract check accepts no arguments.' >&2; exit 2; }
fail() { echo "$1" >&2; exit 1; }
[[ "$(id -u)" = 0 ]] || fail 'Root contract check must run as root.'

staging_root=/opt/fieldgrid/staging
config_root=/etc/fieldgrid
broker=/usr/local/sbin/fieldgrid-install-staging-release
trusted_root="$config_root/github-attestation-trusted-root.jsonl"
handoff_key="$config_root/staging-handoff.key"
handoff_cert="$config_root/staging-handoff.crt"

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
file_contract "$handoff_key" 'root:root:600' 'Root-only staging handoff key'
file_contract "$handoff_cert" 'root:root:644' 'Staging handoff certificate'
file_contract "$trusted_root" 'root:root:644' 'GitHub attestation trusted root'
[[ -s "$trusted_root" ]] || fail 'GitHub attestation trusted root is empty.'
file_contract "$broker" 'root:root:755' 'Combined release broker'

directory_contract "$staging_root" 'root:root:711' 'Staging deploy root'
directory_contract "$staging_root/releases" 'root:fieldgrid:750' 'Release directory'
directory_contract "$staging_root/shared" 'root:fieldgrid:750' 'Shared runtime directory'
directory_contract "$staging_root/backups" 'root:root:700' 'Backup directory'

runtime_count=0
for runtime_path in "$staging_root/shared/runtime.env" "$staging_root/shared/fieldgrid.env"; do
  if [[ -e "$runtime_path" || -L "$runtime_path" ]]; then
    file_contract "$runtime_path" 'root:fieldgrid:640' 'Protected runtime configuration'
    runtime_count=$((runtime_count + 1))
  fi
done
[[ "$runtime_count" -gt 0 ]] || fail 'No protected current or transition runtime configuration is installed.'

for dependency in gh openssl pg_restore python3 tar sha256sum flock systemctl; do
  command -v "$dependency" >/dev/null || fail "Missing root broker dependency: $dependency"
done
pg_restore_major="$(pg_restore --version | awk '{ split($3, version, "."); print version[1] }')"
[[ "$pg_restore_major" =~ ^[0-9]+$ && "$pg_restore_major" -ge 17 ]] || fail 'PostgreSQL 17 or newer pg_restore is required for Supabase backups.'
openssl x509 -in "$handoff_cert" -noout -checkend 86400 >/dev/null || fail 'Staging handoff certificate is invalid or expires within 24 hours.'

echo 'Root-only staging key, trust and protected runtime metadata verified.'

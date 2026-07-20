#!/usr/bin/env bash
set -euo pipefail

readonly POSTGRES_VERSION="17.10"
readonly POSTGRES_SERVER_PACKAGE="postgresql-17_${POSTGRES_VERSION}-1.pgdg26.04+1_amd64.deb"
readonly POSTGRES_SERVER_SHA256="5a95c6a0e04d6095ecc165fc87e3bb424866bfc8d1508faa340d333e206ada8d"
readonly POSTGRES_CLIENT_PACKAGE="postgresql-client-17_${POSTGRES_VERSION}-1.pgdg26.04+1_amd64.deb"
readonly POSTGRES_CLIENT_SHA256="b58f7c2dfcd266201b01c34668acb546f0f3b7aa317796c5b54fa9fadccc1157"
readonly POSTGRES_PACKAGE_BASE_URL="https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "PostgreSQL 17 staging preflight supports only the x86_64 deployment runner." >&2
  exit 1
fi

for command_name in curl dpkg-deb sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required PostgreSQL setup command is unavailable: $command_name" >&2
    exit 1
  fi
done

runtime_root="${RUNNER_TEMP:?RUNNER_TEMP is required}/fieldgrid-postgresql-${POSTGRES_VERSION}-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
package_root="$runtime_root/root"
bindir="$package_root/usr/lib/postgresql/17/bin"
sharedir="$package_root/usr/share/postgresql/17"

rm -rf "$runtime_root"
mkdir -p "$package_root"

download_and_extract() {
  local package_name="$1"
  local expected_sha256="$2"
  local package_path="$runtime_root/$package_name"
  curl \
    --fail \
    --location \
    --proto '=https' \
    --retry 3 \
    --show-error \
    --silent \
    --tlsv1.2 \
    --output "$package_path" \
    "$POSTGRES_PACKAGE_BASE_URL/$package_name"
  printf '%s  %s\n' "$expected_sha256" "$package_path" | sha256sum --check --status
  dpkg-deb --extract "$package_path" "$package_root"
}

download_and_extract "$POSTGRES_SERVER_PACKAGE" "$POSTGRES_SERVER_SHA256"
download_and_extract "$POSTGRES_CLIENT_PACKAGE" "$POSTGRES_CLIENT_SHA256"

for binary in createdb initdb pg_ctl pg_dump pg_restore postgres psql; do
  if [ ! -x "$bindir/$binary" ]; then
    echo "Pinned PostgreSQL package is missing $binary." >&2
    exit 1
  fi
done

if ldd "$bindir/postgres" | grep -F 'not found' >/dev/null; then
  echo "Pinned PostgreSQL 17 server has unresolved runtime libraries." >&2
  ldd "$bindir/postgres" >&2
  exit 1
fi

"$bindir/postgres" --version

printf '%s\n' "$bindir" >> "${GITHUB_PATH:?GITHUB_PATH is required}"
{
  printf 'FIELDGRID_POSTGRESQL_BINDIR=%s\n' "$bindir"
  printf 'FIELDGRID_POSTGRESQL_SHAREDIR=%s\n' "$sharedir"
  printf 'FIELDGRID_POSTGRESQL_VERSION=%s\n' "$POSTGRES_VERSION"
} >> "${GITHUB_ENV:?GITHUB_ENV is required}"

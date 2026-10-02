#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_SHA:?RELEASE_SHA ontbreekt}"
: "${RELEASE_ARTIFACT_PATH:?RELEASE_ARTIFACT_PATH ontbreekt}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Ongeldige release-SHA" >&2; exit 2; }
[[ -f .next/standalone/server.js ]] || { echo "Standalone build ontbreekt" >&2; exit 2; }

standalone_root="$(realpath -e .next/standalone)"
pnpm_hoist_root="$standalone_root/node_modules/.pnpm/node_modules"
[[ -d "$pnpm_hoist_root" && -d "$pnpm_hoist_root/@swc/helpers" ]] || {
  echo "Standalone pnpm-runtime-layout ontbreekt" >&2
  exit 2
}

# Next's standalone output contains a pnpm symlink graph. The fixed staging
# broker deliberately accepts regular files and directories only, so the
# archive materializes that graph. Refuse a build whose links escape the
# traced standalone root before following any of them.
while IFS= read -r -d '' link; do
  resolved="$(realpath -e -- "$link" 2>/dev/null || true)"
  case "$resolved" in
    "$standalone_root"/*) ;;
    *) echo "Standalone build bevat een onveilige of gebroken link" >&2; exit 2 ;;
  esac
done < <(find "$standalone_root" -type l -print0)

artifact_parent="$(dirname "$RELEASE_ARTIFACT_PATH")"
mkdir -p "$artifact_parent"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/release/.next"
rsync -aL --delete .next/standalone/ "$work/release/"
# Dereferencing the top-level `next` symlink relocates the package out of its
# pnpm store path. Materialize pnpm's traced hoisted runtime dependencies at
# the resulting top-level lookup location as well. This keeps the archive
# link-free without losing packages such as @swc/helpers at runtime.
rsync -aL "$pnpm_hoist_root/" "$work/release/node_modules/"
rsync -aL --delete .next/static/ "$work/release/.next/static/"
rsync -aL --delete public/ "$work/release/public/"
install -m 0440 scripts/run-worker.mjs "$work/release/worker-client.mjs"
install -m 0440 scripts/check-clamav-socket.mjs "$work/release/clamav-preflight.mjs"

(
  cd "$work/release"
  node -e "require('@swc/helpers/_/_interop_require_default')"
)
if IFS= read -r _ < <(find "$work/release" -type l -print -quit); then
  echo "Release-artifact mag geen links bevatten" >&2
  exit 2
fi
if IFS= read -r _ < <(find "$work/release" ! -type d ! -type f -print -quit); then
  echo "Release-artifact bevat een niet-ondersteund bestandstype" >&2
  exit 2
fi

# Stable metadata makes a digest comparison meaningful while the attestation
# binds the resulting bytes to the protected workflow and exact source SHA.
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  --pax-option=delete=atime,delete=ctime \
  -C "$work/release" -cf - . | gzip -n > "$RELEASE_ARTIFACT_PATH"
chmod 0600 "$RELEASE_ARTIFACT_PATH"
echo "Release-artifact voor ${RELEASE_SHA:0:12} opgebouwd."

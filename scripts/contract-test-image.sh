#!/usr/bin/env bash
set -euo pipefail

# Test-only transport fallback. Both public registries must serve these exact
# immutable bytes; callers cannot substitute a tag, digest or private registry.
[[ "$#" -eq 0 ]] || { echo 'Contract image accepts no overrides.' >&2; exit 1; }
digest='sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251'
for registry in public.ecr.aws/docker/library docker.io/library; do
  image="$registry/debian:bookworm-slim@$digest"
  if docker image inspect "$image" >/dev/null 2>&1; then
    printf '%s\n' "$image"
    exit 0
  fi
  # Bound each download and try each approved registry only once. A failed
  # download never turns into a skipped Linux isolation test.
  if timeout 120 docker pull --quiet "$image" >&2 &&
    docker image inspect "$image" >/dev/null 2>&1; then
    printf '%s\n' "$image"
    exit 0
  fi
done
echo 'Neither approved registry supplied the pinned Linux contract image.' >&2
exit 1

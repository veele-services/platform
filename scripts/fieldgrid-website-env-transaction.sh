#!/usr/bin/env bash

# Atomic two-file environment transaction used by the website staging stack.
# The caller owns the release symlink and service lifecycle. This library keeps
# both EnvironmentFile inputs recoverable until the caller commits after all
# health and Caddy checks.

fieldgrid_env_transaction_init() {
  local base_dir="$1"
  local release_dir="$2"
  local run_key="$3"
  local environment_group="${4:-}"

  case "$base_dir" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$release_dir" in
    "$base_dir"/releases/*) ;;
    *) return 1 ;;
  esac
  [[ "$run_key" =~ ^[A-Za-z0-9._-]+$ ]] || return 1

  FIELDGRID_ENV_RUN_KEY="$run_key"
  FIELDGRID_ENV_GROUP="$environment_group"
  FIELDGRID_ENV_SHARED_DIR="$base_dir/shared"
  FIELDGRID_ENV_WEBSITE_TARGET="$base_dir/shared/website.env"
  FIELDGRID_ENV_MARKETING_TARGET="$base_dir/shared/marketing.env"
  FIELDGRID_ENV_CANDIDATE_DIR="$release_dir/.fieldgrid-candidate-env"
  FIELDGRID_ENV_WEBSITE_CANDIDATE="$FIELDGRID_ENV_CANDIDATE_DIR/website.env"
  FIELDGRID_ENV_MARKETING_CANDIDATE="$FIELDGRID_ENV_CANDIDATE_DIR/marketing.env"
  FIELDGRID_ENV_TRANSACTION_DIR="$base_dir/shared/.env-transaction-$run_key"
  FIELDGRID_ENV_TRANSACTION_STARTED="0"
  return 0
}

fieldgrid_env_validate_regular_file() {
  local path="$1"
  [ -f "$path" ] && [ ! -L "$path" ]
}

fieldgrid_env_apply_runtime_permissions() {
  local path="$1"
  chmod 640 "$path" || return 1
  if [ -n "$FIELDGRID_ENV_GROUP" ]; then
    chgrp "$FIELDGRID_ENV_GROUP" "$path" || return 1
  fi
  return 0
}

fieldgrid_env_backup_one() {
  local target="$1"
  local key="$2"
  local backup="$FIELDGRID_ENV_TRANSACTION_DIR/$key.backup"
  local absent="$FIELDGRID_ENV_TRANSACTION_DIR/$key.absent"

  if [ -e "$target" ]; then
    fieldgrid_env_validate_regular_file "$target" || return 1
    cp -p "$target" "$backup" || return 1
    chmod 600 "$backup" || return 1
    if [ -n "$FIELDGRID_ENV_GROUP" ]; then
      chgrp "$FIELDGRID_ENV_GROUP" "$backup" || return 1
    fi
  else
    : > "$absent" || return 1
    chmod 600 "$absent" || return 1
  fi
  return 0
}

fieldgrid_env_publish_one() {
  local candidate="$1"
  local target="$2"
  local key="$3"
  local publish_temp="$FIELDGRID_ENV_SHARED_DIR/.$key.publish-$FIELDGRID_ENV_RUN_KEY.$$"

  fieldgrid_env_validate_regular_file "$candidate" || return 1
  [ "$(stat -c '%a' "$candidate")" = "600" ] || return 1
  rm -f "$publish_temp" || return 1
  cp "$candidate" "$publish_temp" || return 1
  fieldgrid_env_apply_runtime_permissions "$publish_temp" || {
    rm -f "$publish_temp"
    return 1
  }
  mv -f "$publish_temp" "$target" || {
    rm -f "$publish_temp"
    return 1
  }
  fieldgrid_env_apply_runtime_permissions "$target" || return 1
  return 0
}

fieldgrid_env_transaction_begin() {
  [ -d "$FIELDGRID_ENV_SHARED_DIR" ] || return 1
  [ ! -e "$FIELDGRID_ENV_TRANSACTION_DIR" ] || return 1
  fieldgrid_env_validate_regular_file "$FIELDGRID_ENV_WEBSITE_CANDIDATE" || return 1
  fieldgrid_env_validate_regular_file "$FIELDGRID_ENV_MARKETING_CANDIDATE" || return 1
  mkdir -m 700 "$FIELDGRID_ENV_TRANSACTION_DIR" || return 1
  fieldgrid_env_backup_one "$FIELDGRID_ENV_WEBSITE_TARGET" website || return 1
  fieldgrid_env_backup_one "$FIELDGRID_ENV_MARKETING_TARGET" marketing || return 1

  FIELDGRID_ENV_TRANSACTION_STARTED="1"
  fieldgrid_env_publish_one \
    "$FIELDGRID_ENV_WEBSITE_CANDIDATE" \
    "$FIELDGRID_ENV_WEBSITE_TARGET" \
    website || return 1
  fieldgrid_env_publish_one \
    "$FIELDGRID_ENV_MARKETING_CANDIDATE" \
    "$FIELDGRID_ENV_MARKETING_TARGET" \
    marketing || return 1
  return 0
}

fieldgrid_env_restore_one() {
  local target="$1"
  local key="$2"
  local backup="$FIELDGRID_ENV_TRANSACTION_DIR/$key.backup"
  local absent="$FIELDGRID_ENV_TRANSACTION_DIR/$key.absent"
  local restore_temp="$FIELDGRID_ENV_SHARED_DIR/.$key.restore-$FIELDGRID_ENV_RUN_KEY.$$"

  if [ -e "$backup" ]; then
    fieldgrid_env_validate_regular_file "$backup" || return 1
    [ ! -e "$absent" ] || return 1
    [ "$(stat -c '%a' "$backup")" = "600" ] || return 1
    rm -f "$restore_temp" || return 1
    cp "$backup" "$restore_temp" || return 1
    fieldgrid_env_apply_runtime_permissions "$restore_temp" || {
      rm -f "$restore_temp"
      return 1
    }
    mv -f "$restore_temp" "$target" || {
      rm -f "$restore_temp"
      return 1
    }
    fieldgrid_env_apply_runtime_permissions "$target" || return 1
    return 0
  fi

  fieldgrid_env_validate_regular_file "$absent" || return 1
  [ "$(stat -c '%a' "$absent")" = "600" ] || return 1
  rm -f "$target" || return 1
  return 0
}

fieldgrid_env_transaction_restore() {
  local failed="0"
  if [ "${FIELDGRID_ENV_TRANSACTION_STARTED:-0}" != "1" ]; then
    return 0
  fi

  fieldgrid_env_restore_one "$FIELDGRID_ENV_WEBSITE_TARGET" website || failed="1"
  fieldgrid_env_restore_one "$FIELDGRID_ENV_MARKETING_TARGET" marketing || failed="1"
  [ "$failed" = "0" ] || return 1

  rm -rf -- "$FIELDGRID_ENV_TRANSACTION_DIR" || return 1
  rm -rf -- "$FIELDGRID_ENV_CANDIDATE_DIR" || return 1
  FIELDGRID_ENV_TRANSACTION_STARTED="0"
  return 0
}

fieldgrid_env_transaction_cleanup_unpublished() {
  if [ "${FIELDGRID_ENV_TRANSACTION_STARTED:-0}" = "1" ]; then
    return 1
  fi
  if [ -n "${FIELDGRID_ENV_TRANSACTION_DIR:-}" ]; then
    rm -rf -- "$FIELDGRID_ENV_TRANSACTION_DIR" || return 1
  fi
  if [ -n "${FIELDGRID_ENV_CANDIDATE_DIR:-}" ]; then
    rm -rf -- "$FIELDGRID_ENV_CANDIDATE_DIR" || return 1
  fi
  return 0
}

fieldgrid_env_transaction_finalize() {
  [ "${FIELDGRID_ENV_TRANSACTION_STARTED:-0}" = "1" ] || return 1
  rm -rf -- "$FIELDGRID_ENV_CANDIDATE_DIR" || return 1
  rm -rf -- "$FIELDGRID_ENV_TRANSACTION_DIR" || return 1
  FIELDGRID_ENV_TRANSACTION_STARTED="0"
  return 0
}

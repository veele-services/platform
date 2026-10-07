#!/usr/bin/env bash
set -euo pipefail
# Observe the already installed timer; do not install/reload/start a host unit.
test "${DEPLOY_TARGET:-}" = production
test "${SERVICE_NAME:-}" = fieldgrid@production.service
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --installed ) ]]; then
  echo 'Unsupported worker gate mode.' >&2
  exit 1
fi
[[ "$(systemctl show fieldgrid-worker@production.timer --property=LoadState --value)" = loaded ]] || {
  echo 'The production worker timer must be installed by the operator.' >&2
  exit 1
}
[[ "$(systemctl show fieldgrid-worker@production.timer --property=Triggers --value)" = fieldgrid-worker@production.service ]] || {
  echo 'The installed production timer has an unexpected worker target.' >&2
  exit 1
}
if [[ "${1:-}" = --installed ]]; then
  echo 'The production worker timer and target are installed; final acceptance still requires a fresh successful execution.'
  exit 0
fi
release_start="$(systemctl show fieldgrid@production.service --property=ActiveEnterTimestampMonotonic --value)"
[[ "$release_start" =~ ^[0-9]+$ ]] && test "$release_start" -gt 0
# Allow a bounded batch of provider calls/scans to finish; individual calls have
# their own timeouts. During the runtime.env transition the operator may still
# need to resume the timer after the healthy web activation. Never do that here.
timer_notice=false
for attempt in $(seq 1 120); do
  if ! systemctl is-active --quiet fieldgrid-worker@production.timer; then
    if [[ "$timer_notice" = false ]]; then
      echo 'Productie worker timer is inactive. After checking the new runtime and web health, the operator must resume it; waiting up to ten minutes.' >&2
      timer_notice=true
    fi
    sleep 5
    continue
  fi
  worker_exit="$(systemctl show fieldgrid-worker@production.service --property=ExecMainExitTimestampMonotonic --value)"
  worker_start="$(systemctl show fieldgrid-worker@production.service --property=ExecMainStartTimestampMonotonic --value)"
  worker_state="$(systemctl show fieldgrid-worker@production.service --property=ActiveState --value)"
  if [[ "$worker_exit" =~ ^[0-9]+$ && "$worker_start" =~ ^[0-9]+$ ]] && test "$worker_start" -gt "$release_start" && test "$worker_exit" -gt "$worker_start" && test "$worker_state" != activating; then
    worker_result="$(systemctl show fieldgrid-worker@production.service --property=Result --value)"
    if test "$worker_result" = success; then
      echo 'A fresh production worker execution completed successfully.'
      exit 0
    fi
    echo 'A fresh production worker execution failed. Review its unit locally without logging credentials.' >&2
    exit 1
  fi
  sleep 5
done
echo 'No fresh successful worker execution observed within ten minutes. Productie acceptance is blocked.' >&2
exit 1

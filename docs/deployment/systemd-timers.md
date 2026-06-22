# Veele Systemd Timers

The API server already exposes protected admin routes for background work:

- `POST /api/admin/expired-quotes`
- `POST /api/admin/payment-reminders`
- `POST /api/admin/notification-worker`
- Legacy compatibility:
  - `POST /api/admin/email-notifications`
  - `POST /api/admin/push-notifications`

All routes require `Authorization: Bearer <ADMIN_API_SECRET>`. Configure
`ADMIN_API_SECRET` as a GitHub Environment secret so deploy writes it to the
shared runtime `.env`.

Web Push delivery also requires these environment values in the same `.env`:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The notification worker reads these optional GitHub Environment variables. The
deploy workflow writes defaults when they are not set.

- `NOTIFICATION_WORKER_LIMIT`, default `100`
- `NOTIFICATION_WORKER_EMAIL_RATE_PER_RUN`, default `50`
- `NOTIFICATION_WORKER_PUSH_RATE_PER_RUN`, default `100`
- `NOTIFICATION_WORKER_MAX_ATTEMPTS`, default `5`
- `NOTIFICATION_WORKER_LOCK_SECONDS`, default `300`
- `NOTIFICATION_WORKER_BASE_RETRY_SECONDS`, default `60`
- `NOTIFICATION_WORKER_MAX_RETRY_SECONDS`, default `3600`
- `NOTIFICATION_WORKER_SEND_DELAY_MS`, default `0`

The worker claims queue rows atomically with database locks. It can safely run
from a timer without sending the same queue item twice.

## Example Service Units

Use one-shot services that load the same shared environment file as the API
server. Adjust the environment path for staging or production:

- staging: `/var/www/veele/staging/shared/.env`
- production: `/var/www/veele/production/shared/.env`

`/etc/systemd/system/veele-expired-quotes.service`

```ini
[Unit]
Description=Veele process expired quotes
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/var/www/veele/production/shared/.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer ${ADMIN_API_SECRET}" \
  "http://127.0.0.1:${API_PORT}/api/admin/expired-quotes"
```

`/etc/systemd/system/veele-payment-reminders.service`

```ini
[Unit]
Description=Veele send payment reminders
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/var/www/veele/production/shared/.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer ${ADMIN_API_SECRET}" \
  "http://127.0.0.1:${API_PORT}/api/admin/payment-reminders"
```

`/etc/systemd/system/veele-notification-worker.service`

```ini
[Unit]
Description=Veele deliver queued e-mail and push notifications
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/var/www/veele/production/shared/.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer ${ADMIN_API_SECRET}" \
  "http://127.0.0.1:${API_PORT}/api/admin/notification-worker?limit=${NOTIFICATION_WORKER_LIMIT}"
```

## Example Timer Units

`/etc/systemd/system/veele-expired-quotes.timer`

```ini
[Unit]
Description=Run Veele expired quote processing daily

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true
Unit=veele-expired-quotes.service

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/veele-payment-reminders.timer`

```ini
[Unit]
Description=Run Veele payment reminders daily

[Timer]
OnCalendar=*-*-* 08:30:00
Persistent=true
Unit=veele-payment-reminders.service

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/veele-notification-worker.timer`

```ini
[Unit]
Description=Run Veele notification delivery worker

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true
Unit=veele-notification-worker.service

[Install]
WantedBy=timers.target
```

## Enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now veele-expired-quotes.timer
sudo systemctl enable --now veele-payment-reminders.timer
sudo systemctl enable --now veele-notification-worker.timer
systemctl list-timers 'veele-*'
```

## Manual Smoke Test

```bash
sudo systemctl start veele-expired-quotes.service
sudo systemctl start veele-payment-reminders.service
sudo systemctl start veele-notification-worker.service
journalctl -u veele-expired-quotes.service -n 100 --no-pager
journalctl -u veele-payment-reminders.service -n 100 --no-pager
journalctl -u veele-notification-worker.service -n 100 --no-pager
```

To requeue failed messages that still have attempts left:

```bash
sudo bash -lc 'set -a; source /var/www/veele/production/shared/.env; set +a; curl -fsS -X POST -H "Authorization: Bearer ${ADMIN_API_SECRET}" "http://127.0.0.1:${API_PORT}/api/admin/notification-worker/retry-failed?limit=100"'
```

Use `/var/www/veele/staging/shared/.env` for staging.

## Queue Statuses

`notification_delivery_queue` uses these worker statuses:

- `pending`: ready for the next worker run.
- `processing`: claimed by a worker; lock expires after
  `NOTIFICATION_WORKER_LOCK_SECONDS`.
- `sent`: delivery succeeded.
- `failed`: final failure or missing required delivery data.
- `retry`: failed attempt scheduled for a later retry.

Every processing attempt is logged in `notification_delivery_attempts` with the
worker id, attempt number, response payload and error text.

## Legacy Timers

Existing `veele-push-notifications` and `veele-email-notifications` timers can
continue to call their old endpoints. Those endpoints now delegate to the same
notification worker. Prefer the combined `veele-notification-worker` timer for
new staging and production installs.
```

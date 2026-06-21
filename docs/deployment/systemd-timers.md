# Veele Systemd Timers

The API server already exposes protected admin routes for background work:

- `POST /api/admin/expired-quotes`
- `POST /api/admin/payment-reminders`
- `POST /api/admin/push-notifications`

All routes require `Authorization: Bearer <ADMIN_API_SECRET>`. Configure
`ADMIN_API_SECRET` as a GitHub Environment secret so deploy writes it to the
shared runtime `.env`.

Web Push delivery also requires these environment values in the same `.env`:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

## Example Service Units

Use one-shot services that load the same shared environment file as the API
server. Adjust host/port if Caddy routes these internally by domain instead.

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

`/etc/systemd/system/veele-push-notifications.service`

```ini
[Unit]
Description=Veele deliver queued push notifications
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/var/www/veele/production/shared/.env
ExecStart=/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer ${ADMIN_API_SECRET}" \
  "http://127.0.0.1:${API_PORT}/api/admin/push-notifications?limit=100"
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

`/etc/systemd/system/veele-push-notifications.timer`

```ini
[Unit]
Description=Run Veele queued push notification delivery

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true
Unit=veele-push-notifications.service

[Install]
WantedBy=timers.target
```

## Enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now veele-expired-quotes.timer
sudo systemctl enable --now veele-payment-reminders.timer
sudo systemctl enable --now veele-push-notifications.timer
systemctl list-timers 'veele-*'
```

## Manual Smoke Test

```bash
sudo systemctl start veele-expired-quotes.service
sudo systemctl start veele-payment-reminders.service
sudo systemctl start veele-push-notifications.service
journalctl -u veele-expired-quotes.service -n 100 --no-pager
journalctl -u veele-payment-reminders.service -n 100 --no-pager
journalctl -u veele-push-notifications.service -n 100 --no-pager
```

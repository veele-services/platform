# Veele Systemd Timers

The API server already exposes protected admin routes for background work:

- `POST /api/admin/expired-quotes`
- `POST /api/admin/payment-reminders`

Both routes require `Authorization: Bearer <ADMIN_API_SECRET>`. Configure
`ADMIN_API_SECRET` as a GitHub Environment secret so deploy writes it to the
shared runtime `.env`.

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

## Enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now veele-expired-quotes.timer
sudo systemctl enable --now veele-payment-reminders.timer
systemctl list-timers 'veele-*'
```

## Manual Smoke Test

```bash
sudo systemctl start veele-expired-quotes.service
sudo systemctl start veele-payment-reminders.service
journalctl -u veele-expired-quotes.service -n 100 --no-pager
journalctl -u veele-payment-reminders.service -n 100 --no-pager
```

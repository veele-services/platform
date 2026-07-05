# Customer/personnel phase 0 QA artifacts

Generated on 2026-07-05 for `docs/fieldgrid-customer-personnel-phase-0-baseline.md`.

## Contents

- `browser-baseline.json`: browser-observed URL, title, heading, body excerpt and horizontal overflow metric for each captured page/viewport.
- `route-redirect-check.json`: unauthenticated HTTP redirect/status baseline for the customer portal and personnel app routes.
- `screenshots/*.png`: mobile, tablet and desktop screenshots for public auth screens and no-session private-home baseline.

## Local devservers used

- Customer portal: `http://127.0.0.1:4301/klant`
- Personnel app: `http://127.0.0.1:4302/personeel`

## Important limitation

This artifact set is an unauthenticated local baseline. In-app dashboards and private detail pages require `DATABASE_URL`, Supabase configuration, an authenticated user and a tenant/personnel/customer context. Those screens are intentionally deferred to the final logged-in QA gate.

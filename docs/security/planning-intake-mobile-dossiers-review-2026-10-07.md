# Planning, optional intake location and mobile dossiers

## Scope and authorization

Personnel planning initializes its date once from the tenant timezone. Assignment
updates continue through the existing authenticated realtime subscription and
server workspace projection. They do not choose another day or reset a manual
selection. Calendar labels format the already resolved tenant date without applying the timezone a second time, including UTC+14. No dispatch, personnel or object access rule changes.

A customer service request may contain `objectIds: []`. The existing RPC creates
exactly one canonical request with a NULL object, the current account's customer
and contact, all submitted wishes and frequency, and its ordinary management
owner. It creates no object, customer or contact. Nonempty selections retain the
same exact binding, customer, active-object and tenant checks. Input allowlists,
current session/contact/account checks, locking, rate limits and content-bound
command receipts remain in force. A retry returns the same receipt and never
removes a location added by management.

The private commercial scope predicate allows an objectless request only for
its original creator through a live customer account of the exact tenant and
customer. A missing or other creator returns FALSE, never SQL NULL. Therefore
quote commands that use `IF NOT scope` cannot gain access to objectless quotes.
Selected objects still require an explicit object binding. Management uses the
existing request/quote editor to add or link a definitive object; accepted quotes
and work orders retain their existing location requirements.

The public website's envelope remains version 1.0.0. Location type and city become
optional, as street and house number already were. Country metadata remains NL.
Provided addresses still validate. The summary and native request subject show
“Locatie later vaststellen” when appropriate. The existing lead/contact intake,
tenant hostname resolution, field mapping, rate limits and receipt are unchanged.
The generic `/aanvraag` form and backoffice intake already supported an unknown
location and were checked against their server schemas.

Dossier actions remain in normal document flow. Mobile tabs scroll inside their
own bounded navigation with an explicit active state and 48px targets. The active
route is revealed horizontally after navigation or resizing, without scrolling
the whole page. Customer, object and personnel headers share primary/secondary
action groups. Customer object dialog tabs and footer targets use the same mobile
spacing. Existing dialog scrolling and safe-area footer padding are retained.

## Verification

- Clean replay of all migrations in the isolated loopback Supabase project.
  Existing manifest hashes match HEAD; only migration 20261007110000 is appended.
- 94 database tests pass across customer portal, commercial workflow, account
  activity, website intake, entitlement/resource isolation and dossier alignment.
- New objectless DB regression checks complete persistence, projection/detail,
  identity/object counts, retry, cross-account denial, revoked access, boolean
  scope results, management visibility and subsequent object linking.
- 1,529 unit tests pass; request receipt regressions also pass after typechecking.
- Six focused Chromium flows pass against the built application: objectless
  customer intake with backoffice visibility; objectless public intake; Object360
  editing/uploads and mobile layout; Klant360/Personeel360 mobile layout; personnel
  planning across widths; and genuine realtime planning updates.
- Planning test places the browser in Los Angeles while the tenant is in
  Amsterdam at a date boundary. Today has no assignment; manually selecting the
  previous day reveals its order and survives the real planner's time update
  without reloading the page.
- Dossiers inspected at 320, 390, 768 and 1440px, with no document overflow,
  bounded action buttons, touch targets and visible active deep-linked tabs.
  The intentional Object360 mobile and personnel dossier header/tab visual baselines were updated.
- Twelve additional dossier/appearance/dialog browser regressions pass (the five staff dialog cases were rerun after correcting their fixture day selection).
- Lint, TypeScript and production build pass. Local file flows use the real
  isolated ClamAV fixture; scanning is not bypassed.

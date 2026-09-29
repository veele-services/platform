# Fieldgrid V1 platform backoffice

Status: canonical implementation contract

Route: `/platform`

The platform backoffice is a tenant-neutral Fieldgrid workspace. It is not a
tenant dashboard and never receives an implicit tenant context. Access requires
an authenticated row in `platform_admins`; privileged tenant reads and writes
then use the server-side service role only after that check.

## Tenant onboarding

The six-step wizard records organisation identity, the first tenant
administrator, branding, enabled V1 modules, communication settings and a final
review. Provisioning is idempotent through `tenants.onboarding_key`. A new
tenant starts without operational data and without an automatic membership for
the platform administrator. The selected tenant administrator receives a
recoverable Supabase Auth invitation and an active tenant membership.

The default Fieldgrid palette is:

- primary: `#222C35`;
- secondary: `#41AC42`.

Existing custom tenant colours are preserved. Only the exact former Fieldgrid
default pair is migrated.

The palette applies to the complete tenant workspace, including navigation,
page headers, controls, focus states and action accents. A tenant logo replaces
the textual brand lock-up; without a logo the tenant name is the fallback.
`tenant_settings.white_label_enabled` is a platform-managed entitlement. When
it is false, the sidebar retains a bottom-aligned `Powered by Fieldgrid`
attribution. Tenant roles cannot change this entitlement through the Data API.

## Module entitlements

The V1 module keys are `planning`, `personeel`, `rapportage` and `finance`.
Facturatie depends on Planning and Rapportage; Rapportage depends on Planning.
Disabling Planning or Facturatie is rejected while conflicting operational data
is active.

Entitlements are enforced in four layers: navigation, server actions,
restrictive RLS policies and table triggers. The triggers also cover
security-definer RPCs, so a disabled module cannot be re-enabled or used through
the Data API. Only the trusted service role can change `enabled_services`.

## Communication templates

Each tenant owns four templates:

| Key | Channel | Runtime use |
| --- | --- | --- |
| `invoice` | E-mail | Definitive invoice with payment link and PDF |
| `quote` | E-mail | Price quote with one-time acceptance link |
| `workorder` | Push | Newly dispatched work order |
| `schedule` | Push | Material schedule change |

Every save creates a new immutable revision and audit event. Resetting creates a
new revision based on the Fieldgrid default. The platform editor validates the
allowed variables per template and provides an inert live preview. Actual
e-mail delivery produces HTML and plain text from the same revision and stores
the rendered content plus branding snapshot with the delivery record.

The e-mail logo is served through the controlled HTTPS branding endpoint. When
a logo exists, the header contains only that logo; otherwise the tenant name is
the header fallback. The tenant website remains available as an HTTPS link in
the footer. A tenant sender is used only after its tenant domain is verified;
that sender must also be activated in SendGrid. Otherwise the configured
Fieldgrid sender remains the operational fallback.

No secret, provider key or tenant-specific brand value belongs in this
configuration contract or in repository history.

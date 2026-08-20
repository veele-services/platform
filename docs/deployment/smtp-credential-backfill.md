# Tenant SMTP credential backfill

## Contract

Tenant SMTP passwords are stored only in
`organization_settings.smtp_password_encrypted`. The value is a strict
AES-256-GCM envelope. The tenant ID is authenticated as additional data, so an
envelope copied to another tenant cannot be decrypted. The browser receives
only the boolean status `smtpPasswordConfigured`.

Migration `20260820105112_smtp_credentials_encrypted_at_rest.sql` is additive.
It creates the encrypted column and a database trigger that rejects every new
non-empty plaintext SMTP password. No encryption key appears in SQL.

## Preflight and apply

The tool never prints password or ciphertext values. Check mode outputs counts
only and exits non-zero while plaintext or conflicting rows remain:

```bash
pnpm fieldgrid:smtp-credential-backfill
```

Apply mode requires the existing Fieldgrid mail encryption key and an explicit
confirmation:

```bash
FIELDGRID_SMTP_BACKFILL_CONFIRM=smtp-encrypted-at-rest-v1 \
pnpm fieldgrid:smtp-credential-backfill --apply
```

Each tenant row is locked and migrated in its own transaction. The write stores
the encrypted envelope and clears plaintext in one statement. A second run is
idempotent. Activation is blocked until both `legacy_plaintext_count` and
`conflicting_encrypted_count` are zero.

The remediation tool refuses production targets. This sprint runs it only on a
disposable PostgreSQL 17 test database and, after main approval, on staging via
the repository release procedure.

## Rollback

The schema addition and plaintext-rejection trigger remain in place during an
application rollback. Do not roll back to a release that reads
`smtp_password`; encrypted values cannot and must not be converted back to
plaintext. Roll back to the last encryption-capable application release or
disable tenant SMTP while correcting the candidate. The central Fieldgrid
provider remains the safe fallback.

# Fieldgrid platform-admin fase 12 - Platformgebruikers en instellingen

Datum: 2026-07-05
Branch: `codex/platform-users-settings-v1`

## Scope

Fase 12 maakt `/platform/users` en `/platform/settings` bruikbaar voor het platformteam.

## Platformgebruikers

`/platform/users` ondersteunt nu:

- platformgebruikers uitnodigen via Supabase Auth invite;
- rollen `owner`, `admin` en `support`;
- rol wijzigen;
- status wijzigen naar `active`, `inactive` of `suspended`;
- last seen vanuit `platform_users.last_seen_at`;
- auth-status en laatste login uit Supabase Auth, best-effort;
- MFA-status als expliciet `Later`, zodat de kolom al in het beheerbeeld zit.

Server-side regels:

- support kan platformgebruikers niet beheren;
- admin kan geen owner aanmaken, degraderen of wijzigen;
- owner kan admins en support beheren;
- een gebruiker kan de eigen rol/status niet via deze pagina wijzigen;
- de laatste actieve owner kan niet worden gedeactiveerd of gedegradeerd.

Elke invite of wijziging schrijft een `audit_log` event op `platform_users`.

## Instellingen

`/platform/settings` toont een read-only platformconfiguratie-dashboard voor:

- platformhosts;
- support TTL default;
- custom domain DNS target;
- Caddy ask mode;
- SMTP/system mail;
- default branding;
- smoke targets.

Deze waarden komen grotendeels uit GitHub environment secrets, VPS/Caddy-configuratie of runtime-env. Daarom wijzigt het formulier ze niet direct. Het wijzigverzoek schrijft `platform_setting_change_requested` naar `audit_log`, zodat het platformteam het voorstel via PR, secret update of VPS-configuratie kan uitvoeren.

## Audit-events

Nieuwe audit-actions:

- `platform_user_invited`;
- `platform_user_created`;
- `platform_user_updated`;
- `platform_setting_change_requested`.

## Acceptatie

- Owner/admin ziet `/platform/users` en `/platform/settings`.
- Support wordt server-side geweigerd op gebruikersbeheer via `requirePlatformAdmin`.
- Admin kan owner-rollen niet aanmaken of wijzigen.
- Instellingen tonen operationele configuratie zonder secrets te lekken.
- Wijzigverzoeken zijn auditbaar en zichtbaar in security/audit.

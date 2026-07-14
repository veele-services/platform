# Auth Runtime Acceptance Matrix

Evidence classes: static, unit, DB integration, RLS, API runtime, browser E2E, provider mock, staging.

| Case | Required evidence | Required assertion |
| --- | --- | --- |
| backoffice login | static, unit, API runtime, browser E2E, staging | Host resolves to backoffice tenant context, provider credential succeeds, database profile is active, host-only cookie is issued. |
| personnel login | static, unit, DB integration, RLS, API runtime, browser E2E, staging | Personnel tenant binding is database-derived and never authorized by a `tenant_id` JWT claim. |
| customer login | static, unit, DB integration, RLS, API runtime, browser E2E, staging | Customer profile is unique and active for the resolved tenant/host before access. |
| wrong-host login | unit, API runtime, browser E2E, staging | Valid provider session on the wrong host is denied, cookies are cleared, and audit is written. |
| stale cookie | unit, API runtime, browser E2E | Expired, rotated, or revoked Fieldgrid cookie is denied before application access. |
| suspended tenant | DB integration, RLS, API runtime, browser E2E, staging | Suspended tenant denies login, refresh, challenge verification, and reset completion. |
| inactive profile | DB integration, RLS, API runtime, browser E2E | Inactive personnel/customer profile denies login and refresh even with a valid provider session. |
| reset request | static, unit, API runtime, provider mock | Fieldgrid creates and sends a challenge code without temporary passwords or canonical magic links. |
| challenge verification | unit, DB integration, API runtime, provider mock | Correct unexpired challenge creates a one-time reset grant bound to account, portal, host, and tenant context. |
| expired challenge | unit, DB integration, API runtime | Expired challenge is denied, audited, and cannot create a reset grant. |
| used challenge | unit, DB integration, API runtime | Previously used challenge is denied and cannot create another reset grant. |
| too many attempts | unit, DB integration, API runtime | Attempt limit locks or cools down verification and writes audit evidence. |
| resend cooldown | unit, API runtime, provider mock | Resend before cooldown is denied and no additional e-mail is sent. |
| password update | unit, API runtime, provider mock, browser E2E, staging | One-time reset grant updates provider password, invalidates grant, and requires session revocation. |
| session revocation | unit, API runtime, provider mock, browser E2E, staging | Fieldgrid cookies and provider refresh sessions are revoked for reset, admin reset, compromise, tenant suspension, inactive profile, wrong-host detection, and support security action. |
| admin reset step-up | static, unit, API runtime, browser E2E, staging | Admin/support reset initiation and grant issuance require recent step-up/MFA evidence. |
| multi-tenant platform account | DB integration, RLS, API runtime, browser E2E | One provider account may access multiple tenants only through explicit database memberships; effective tenant changes with host/context, not JWT tenant claims. |
| brute-force/rate limiting | unit, DB integration, API runtime, staging | Login, challenge verification, resend, and reset requests enforce Fieldgrid rate limits and audit denials. |

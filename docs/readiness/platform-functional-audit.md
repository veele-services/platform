# Platform functional audit

Date: 2026-07-12
Canonical base: `f36e84dad5d1c595e4dd349ff5ce6bd439722576`
Scope: audit-only. No runtime fixes, migrations, workflow changes, deployments, live services, or secrets were used.

## Method

The audit treats platform administration as one product surface across auth, tenant provisioning, lifecycle, domains, plans, modules, sectors, branding, email, notifications, support, tickets, knowledge base, releases, audit, and tenant isolation.

Five read-only subagents inspected bounded scopes in the isolated task worktree and verified the required worktree root before reading files. The primary agent reconciled their findings and added a source-level reproduction contract. Subagents did not edit files, create commits, open PRs, access live services, or use the bootstrap checkout.

## Flow Readiness

| Flow | Readiness | Main gaps |
| --- | --- | --- |
| create tenant | Partial | Stale create action bypasses canonical provisioning. |
| provision canonical tenant settings | Partial | Defaults and stale paths can leave missing or over-broad records. |
| create/activate first owner | Partial | Recovery/invite codes are written as temporary passwords. |
| configure domain | Partial | Root/future reserved hosts are not consistently protected. |
| configure sectors/modules/plan | Partial | Sector policy is not enforced on key writes; module overrides can outlive plans. |
| configure branding and e-mail transport | Partial | Global legacy SMTP fallback can select a tenant SMTP row. |
| activate/suspend/reactivate/archive | Partial | Archived tenants can reactivate; lifecycle audit is not transactional. |
| tenant access denial while suspended | Partial | Web checks exist, but async/worker rechecks still need proof. |
| support grant create/use/expire/revoke | Partial | App checks exist, but request audit and DB hardening are incomplete. |
| subscription/module changes reflected in backoffice and portals | Partial | Plan changes do not reconcile module overrides. |
| platform notification delivery | Not ready | Dispatch records are created without provider-backed delivery. |
| ticket and support lifecycle | Partial | Personnel message identity is not bound to current portal tenant first. |
| release/knowledgebase visibility | Partial | Visibility exists, but runtime host/lifecycle proof is missing. |
| safe deletion/offboarding readiness | Not ready | No product offboarding workflow beyond provisioning rollback. |

## Highest-Risk Findings

- Privileged platform access is role-checked but not terminally host-bound, and MFA/AAL is not enforced.
- Tenant provisioning and lifecycle can create inconsistent states through stale actions, broad defaults, and non-transactional audit.
- Tenant sector and module choices are visible in platform UI, but not consistently enforced server-side.
- Platform notification dispatch is a visible mutation with no delivery outcome.
- Support-mode and sensitive-access flows need stronger audit, grant binding, and database-layer hardening.

The machine-readable register is docs/readiness/platform-functional-gap-register.json.

## Test Coverage Added

tests/security/platform-functional-contracts.test.mjs is a static source guard / reproduction contract. It asserts that the audit artifacts cover the required flows and that current source code still exposes the recorded gaps.

It does not replace database, RLS, Storage, browser, provider, or staging evidence.

## Evidence Still Required

Future safe validation should cover database transactions and zero-row lifecycle updates, RLS or database hardening for support grants, wrong-host and suspended-tenant runtime denial, browser/E2E platform workflows, and provider-safe e-mail/notification delivery.

## Migration, Workflow, and Rollback Notes

No migrations, workflows, deployment scripts, lockfiles, or runtime code were changed. Rollback is a normal revert of the three audit-only files added by this PR.

# Phase 2.1 staging smoke runbook

Post-merge staging smoke plan only. Do not deploy from this PR. Do not update staging before merge approval.

1. Confirm exact head and generated evidence match the merged commit.
2. Run the planned-versus-actual journey: planned 11:00–12:00, start 09:22, complete 09:44.
3. Run interest select/cancel/reselect and confirm scheduled/partially staffed projections.
4. Run credential recovery activation/reset denial cases with mocked e-mail only.
5. Confirm Tenant A cannot read or mutate Tenant B.
6. Confirm no browser has a service-role credential.

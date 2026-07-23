# Phase 9 website module close-out

This checklist closes the website-module implementation in one staging sprint.
It deliberately leaves production disabled.

## Automated sequence

1. Squash-merge the reviewed completion PR to exact main.
2. Require exact-main CI with zero failed, cancelled or pending checks.
3. Run the Phase 2E preflight against exact main and current staging.
4. Fast-forward exact main to staging with the existing non-force guard.
5. Require the initial four-service staging deploy to be green.
6. Configure the staging-only website variables bound to exact staging.
7. Run **Website Staging Stack Deploy** and then rerun **Deploy VEELE** on the
   same SHA for the six-service gate.
8. Provision and activate one managed and one custom proof site.
9. Run **Website Staging Acceptance** and retain its secret-free evidence.
10. Confirm main, staging and production refs; production must be unchanged.

## Deferred high-impact decisions

The operator must decide these only after all reversible checks are green:

- which Enterprise staging tenant owns the managed proof site;
- whether the Veele custom proof reuses an existing website site or receives a
  dedicated site;
- the durable change reference and reason used for custom registration,
  approval and activation;
- whether to retain a synthetic form submission for inbox/conversion proof;
- any production capacity, host, monitoring or cutover design.

Do not guess tenant or site ownership. Do not create a synthetic submission
without explicit approval because it becomes durable tenant data.

## Completion statement

Phase 9 is complete only when exact staging evidence is green and no
critical/high blocker remains:

```text
Website module implementation complete: true
Website module staging validated: true
Production ready: false
Production changed: false
```

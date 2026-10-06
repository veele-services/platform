# Source-map dependency update — 6 October 2026

PR #565 initially stopped at the existing high/critical dependency audit.
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
affects `source-map-js` before 1.2.2; the published upstream fix is 1.2.2.

The lockfile updates only `source-map-js`, from 1.2.1 to 1.2.2, including its
registry integrity and all existing references from PostCSS and Tailwind.
No dependency range, override, audit exception or workflow gate changes.

Local validation passed with the existing `pnpm audit --audit-level high`
policy. Both Next.js and Tailwind's actual PostCSS dependency resolve the fixed
version and successfully generate a source map whose positions map back to the
original CSS. The existing reviewed braces patch/exception remains in place.
The lockfile's operational review fingerprint is updated after inspecting this
limited diff. Full GitHub CI, main CI and staging acceptance remain mandatory
before declaring the deployment successful.
